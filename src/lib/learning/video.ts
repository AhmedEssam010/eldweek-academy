import "server-only";

import { getProfileAuthState } from "@/lib/auth/profile";
import { getAuthReadiness } from "@/lib/auth/readiness";
import {
  classifyVideoSetup,
  consumeRateLimit,
  evaluateStudentPlayback,
  issuePlaybackGrant,
  privateVideoConfigured,
  type PlaybackDenialReason,
  type PlaybackEnrollmentFact,
  type VideoSetupStatus,
} from "@/lib/learning/playback-policy";
import { describeStoredVideo, issueSignedPlayback } from "@/lib/learning/mux";
import type { PlaybackAuthorization } from "@/lib/learning/types";
import { createClient } from "@/lib/supabase/server";
import type { CourseStatus, EnrollmentStatus, ProductType } from "@/types/database";

const playbackBuckets = new Map<string, number[]>();

const denialMessage: Record<PlaybackDenialReason, string> = {
  unauthenticated: "يلزم تسجيل الدخول لطلب تشغيل درس محمي.",
  inactive_account: "الحساب غير نشط.",
  staff_boundary:
    "تشغيل الطالب لا يُمنح للمالك أو المدرّس. معاينة الإعداد تتم من صفحة الدرس بدون رابط عام.",
  lesson_not_in_scope: "الدرس غير متاح ضمن الكورس والترم المطلوبين.",
  course_mismatch: "الدرس لا ينتمي إلى الكورس المطلوب.",
  semester_mismatch: "الدرس لا ينتمي إلى الترم المطلوب.",
  course_not_published: "الكورس غير منشور. لن يُعرض الفيديو.",
  lesson_not_published: "الدرس غير منشور. لن يُعرض الفيديو.",
  no_enrollment: "لا يوجد استحقاق نشط لهذا الدرس.",
  enrollment_not_started: "الاستحقاق لم يبدأ بعد.",
  enrollment_expired: "الاستحقاق منتهٍ.",
  enrollment_inactive: "الاستحقاق موقوف.",
};

function denied(
  lessonId: string,
  reason: PlaybackDenialReason,
): PlaybackAuthorization {
  const status =
    reason === "unauthenticated" ||
    reason === "inactive_account" ||
    reason === "staff_boundary"
      ? "forbidden"
      : "locked";
  return { status, lessonId, message: denialMessage[reason] };
}

type LessonScopeRow = {
  id: string;
  semester_id: string;
  is_published: boolean;
  duration_seconds: number | null;
  course_semesters:
    | {
        id: string;
        course_id: string;
        courses: { id: string; status: CourseStatus } | { id: string; status: CourseStatus }[];
      }
    | {
        id: string;
        course_id: string;
        courses: { id: string; status: CourseStatus } | { id: string; status: CourseStatus }[];
      }[];
};

type EnrollmentRow = {
  status: EnrollmentStatus;
  starts_at: string;
  expires_at: string | null;
  products:
    | {
        product_type: ProductType;
        course_id: string | null;
        semester_id: string | null;
      }
    | {
        product_type: ProductType;
        course_id: string | null;
        semester_id: string | null;
      }[]
    | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function toEnrollmentFact(row: EnrollmentRow): PlaybackEnrollmentFact {
  const product = first(row.products);
  return {
    status: row.status,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    productType: product?.product_type ?? null,
    courseId: product?.course_id ?? null,
    semesterId: product?.semester_id ?? null,
  };
}

export async function authorizeLessonPlayback(input: {
  lessonId: string;
  courseId: string;
  semesterId: string;
}): Promise<PlaybackAuthorization> {
  const { lessonId, courseId, semesterId } = input;
  const readiness = getAuthReadiness();
  if (!readiness.dbSchemaReady) {
    return {
      status: "setup_required",
      lessonId,
      message: "تشغيل الفيديو غير متاح لأن مخطط القاعدة غير جاهز بعد.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      status: "setup_required",
      lessonId,
      message: "إعدادات Supabase غير مكتملة.",
    };
  }

  const profile = await getProfileAuthState();
  if (profile.status === "unauthenticated") {
    return denied(lessonId, "unauthenticated");
  }
  if (profile.status === "setup_required") {
    return { status: "setup_required", lessonId, message: profile.reason };
  }
  if (profile.status === "unavailable") {
    return { status: "unavailable", lessonId, message: profile.reason };
  }
  if (profile.status === "inactive") {
    return denied(lessonId, "inactive_account");
  }

  if (
    !consumeRateLimit(
      playbackBuckets,
      `playback:${profile.userId}`,
      Date.now(),
    )
  ) {
    return {
      status: "unavailable",
      lessonId,
      message: "تجاوزت حد طلبات التشغيل. أعد المحاولة بعد دقيقة.",
    };
  }

  if (profile.role !== "student") {
    return denied(lessonId, "staff_boundary");
  }

  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select(
      "id, semester_id, is_published, duration_seconds, course_semesters!inner(id, course_id, courses!inner(id, status))",
    )
    .eq("id", lessonId)
    .eq("semester_id", semesterId)
    .maybeSingle();

  if (lessonError) {
    return {
      status: "unavailable",
      lessonId,
      message: "تعذر التحقق من علاقة الدرس بالكورس والترم.",
    };
  }

  const row = lesson as LessonScopeRow | null;
  const semester = first(row?.course_semesters);
  const course = first(semester?.courses);
  const decision = evaluateStudentPlayback({
    now: new Date(),
    actor: "student",
    accountActive: true,
    requestedCourseId: courseId,
    requestedSemesterId: semesterId,
    lesson: row && semester && course
      ? {
          courseId: semester.course_id,
          semesterId: row.semester_id,
          courseStatus: course.status,
          isPublished: Boolean(row.is_published),
        }
      : null,
    enrollments: [],
  });

  if (decision.outcome === "deny" && decision.reason !== "no_enrollment") {
    return denied(lessonId, decision.reason);
  }

  const { data: enrollmentRows, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("status, starts_at, expires_at, products(product_type, course_id, semester_id)")
    .eq("student_id", profile.userId);

  if (enrollmentError) {
    return {
      status: "unavailable",
      lessonId,
      message: "تعذر التحقق من الاستحقاق. لن يُعرض الفيديو.",
    };
  }

  const enrolledDecision = evaluateStudentPlayback({
    now: new Date(),
    actor: "student",
    accountActive: true,
    requestedCourseId: courseId,
    requestedSemesterId: semesterId,
    lesson: row && semester && course
      ? {
          courseId: semester.course_id,
          semesterId: row.semester_id,
          courseStatus: course.status,
          isPublished: Boolean(row.is_published),
        }
      : null,
    enrollments: ((enrollmentRows ?? []) as EnrollmentRow[]).map(toEnrollmentFact),
  });

  if (enrolledDecision.outcome === "deny") {
    return denied(lessonId, enrolledDecision.reason);
  }

  const { data: entitled, error: entitledError } = await supabase.rpc(
    "student_has_active_enrollment_for_lesson",
    { p_lesson_id: lessonId },
  );

  if (entitledError || entitled !== true) {
    return {
      status: "locked",
      lessonId,
      message: "دالة الاستحقاق في القاعدة لم تؤكد الوصول إلى هذا الدرس.",
    };
  }

  const durationSeconds =
    typeof row?.duration_seconds === "number" ? row.duration_seconds : null;
  const grant = issuePlaybackGrant();
  if (grant.playbackUrl !== null || grant.assetVerified) {
    return {
      status: "unavailable",
      lessonId,
      message: "مزوّد التشغيل أعاد استجابة غير مقبولة. أُلغي التشغيل.",
    };
  }

  // منحة القاعدة للمستحقين فقط — قد تتضمن يوتيوب بعد الهجرة.
  const { data: playbackGrantRows } = await supabase.rpc(
    "get_lesson_playback_grant",
    { p_lesson_id: lessonId },
  );
  const playbackGrant = (Array.isArray(playbackGrantRows)
    ? playbackGrantRows[0]
    : playbackGrantRows) as {
    video_source?: string | null;
    youtube_video_id?: string | null;
    has_video_asset?: boolean | null;
  } | null;

  if (
    playbackGrant?.video_source === "youtube" &&
    typeof playbackGrant.youtube_video_id === "string" &&
    /^[A-Za-z0-9_-]{11}$/.test(playbackGrant.youtube_video_id)
  ) {
    return {
      status: "authorized",
      source: "youtube",
      lessonId,
      durationSeconds,
      youtubeVideoId: playbackGrant.youtube_video_id,
      message:
        "تشغيل يوتيوب داخل المنصة للمستحقين. حماية يوتيوب أضعف من Mux الموقّع.",
    };
  }

  try {
    const signed = await issueSignedPlayback(lessonId);
    if (signed.state === "ready") {
      return {
        status: "authorized",
        source: "mux",
        lessonId,
        durationSeconds,
        playbackUrl: signed.playbackUrl,
        muxPlaybackId: signed.playbackId,
        muxPlaybackToken: signed.token,
        expiresAt: signed.expiresAt,
        message: "التشغيل موقّع ومؤقت لهذا الطالب فقط.",
      };
    }
    if (signed.state === "processing") {
      return {
        status: "processing",
        lessonId,
        message:
          "الفيديو قيد المعالجة. أعد فتح الدرس بعد اكتمال التجهيز. لن يُعرض رابط عام.",
      };
    }
    if (signed.state === "none") {
      return {
        status: "provider_unconfigured",
        lessonId,
        durationSeconds,
        message: "لا يوجد فيديو مرتبط بهذا الدرس بعد.",
      };
    }
    if (signed.state === "error") {
      return {
        status: "unavailable",
        lessonId,
        message: "تعذر إصدار تشغيل موقّع. لن يُعرض رابط عام.",
      };
    }
  } catch {
    return {
      status: "unavailable",
      lessonId,
      message: "تعذر إصدار تشغيل موقّع.",
    };
  }

  return {
    status: "provider_unconfigured",
    lessonId,
    durationSeconds,
    message:
      "الاستحقاق مؤكد، لكن مزوّد الفيديو غير مفعّل. لا يوجد رابط تشغيل ولن يُعرض الفيديو.",
  };
}

export async function inspectLessonVideoSetup(lessonId: string): Promise<{
  status: VideoSetupStatus;
  message: string;
}> {
  const profile = await getProfileAuthState();
  if (profile.status !== "authenticated") {
    return {
      status: "unavailable",
      message: "تعذر التحقق من صلاحية معاينة إعداد الفيديو.",
    };
  }
  if (profile.role !== "super_admin" && profile.role !== "teacher") {
    return {
      status: "unavailable",
      message: "معاينة إعداد الفيديو متاحة للمالك والمدرّس المعيّن فقط.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { status: "unavailable", message: "إعدادات Supabase غير مكتملة." };
  }

  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id, semester_id, course_semesters!inner(course_id)")
    .eq("id", lessonId)
    .maybeSingle();

  const semester = first(
    (lesson as { course_semesters?: { course_id: string } | { course_id: string }[] } | null)
      ?.course_semesters,
  );
  if (lessonError || !lesson || !semester) {
    return { status: "unavailable", message: "تعذر قراءة الدرس لمعاينة الفيديو." };
  }

  if (profile.role === "teacher") {
    const { data: assignment, error: assignmentError } = await supabase
      .from("course_staff_assignments")
      .select("teacher_id")
      .eq("course_id", semester.course_id)
      .eq("teacher_id", profile.userId)
      .maybeSingle();
    if (assignmentError || !assignment) {
      return {
        status: "unavailable",
        message: "ليست لديك صلاحية معاينة فيديو هذا الكورس.",
      };
    }
  }

  const phase = await describeStoredVideo(lessonId);
  if (phase === "ready") {
    return { status: "ready", message: "الفيديو جاهز. التشغيل موقّع وليس عامًا." };
  }
  if (phase === "processing") {
    return { status: "pending", message: "الفيديو قيد المعالجة عند Mux." };
  }
  if (phase === "none") {
    return { status: "not_configured", message: "لم يُضبط فيديو لهذا الدرس." };
  }
  if (phase === "error") {
    return {
      status: "unavailable",
      message: "الفيديو المربوط غير مقبول. لن يُستخدم تشغيل عام.",
    };
  }
  if (phase === "unknown") {
    return { status: "unavailable", message: "تعذر التحقق من حالة الفيديو عند Mux." };
  }

  const { data, error } = await supabase.rpc("get_lesson_playback_grant", {
    p_lesson_id: lessonId,
  });
  if (error) {
    return {
      status: classifyVideoSetup({
        known: false,
        present: false,
        verifiedByProvider: false,
      }),
      message: "تعذر التحقق من وجود أصل فيديو من مصدر موثوق.",
    };
  }

  const grant = (Array.isArray(data) ? data[0] : data) as {
    has_video_asset?: boolean | null;
  } | null;
  const present = privateVideoConfigured(grant);
  if (present === null) {
    return {
      status: "unavailable",
      message: "تعذر تأكيد إعداد الفيديو من العقد الآمن. لن يُعرض أي معرّف.",
    };
  }
  const status = classifyVideoSetup({
    known: true,
    present,
    verifiedByProvider: false,
  });

  if (status === "not_configured") {
    return { status, message: "لم يُضبط فيديو لهذا الدرس." };
  }
  return {
    status,
    message:
      "يوجد معرّف أصل خاص، لكن المزود غير مفعّل ولا يمكن تأكيد أن الفيديو جاهز. المعرّف لا يُعرض هنا.",
  };
}

export async function getStaffLessonPreview(lessonId: string): Promise<{
  playbackId: string;
  token: string;
} | null> {
  const profile = await getProfileAuthState();
  if (profile.status !== "authenticated") return null;
  if (profile.role !== "super_admin" && profile.role !== "teacher") return null;
  const supabase = await createClient();
  if (!supabase) return null;

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, course_semesters!inner(course_id)")
    .eq("id", lessonId)
    .maybeSingle();
  const semester = first(
    (lesson as { course_semesters?: { course_id: string } | { course_id: string }[] } | null)
      ?.course_semesters,
  );
  if (!lesson || !semester) return null;
  if (profile.role === "teacher") {
    const { data: assignment } = await supabase
      .from("course_staff_assignments")
      .select("can_edit_content")
      .eq("course_id", semester.course_id)
      .eq("teacher_id", profile.userId)
      .maybeSingle();
    if (!assignment?.can_edit_content) return null;
  }

  try {
    const signed = await issueSignedPlayback(lessonId);
    if (signed.state !== "ready") return null;
    return { playbackId: signed.playbackId, token: signed.token };
  } catch {
    return null;
  }
}

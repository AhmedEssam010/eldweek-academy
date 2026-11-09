"use server";

import { revalidatePath } from "next/cache";
import { getProfileAuthState } from "@/lib/auth/profile";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  isValidYoutubeVideoId,
  parseYoutubeVideoInput,
} from "@/lib/learning/youtube";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type YoutubeActionResult =
  | { ok: true; message: string; videoId?: string }
  | { ok: false; message: string };

async function requireLessonEditor(input: {
  courseId: string;
  semesterId: string;
  lessonId: string;
}) {
  if (!getAuthReadiness().dbSchemaReady) {
    return { ok: false as const, message: "قاعدة البيانات غير جاهزة بعد." };
  }
  if (
    !UUID.test(input.courseId) ||
    !UUID.test(input.semesterId) ||
    !UUID.test(input.lessonId)
  ) {
    return { ok: false as const, message: "بيانات الدرس غير صالحة." };
  }
  const profile = await getProfileAuthState();
  if (profile.status !== "authenticated") {
    return { ok: false as const, message: "يلزم تسجيل الدخول بصلاحية تعديل." };
  }
  if (profile.role !== "super_admin" && profile.role !== "teacher") {
    return {
      ok: false as const,
      message: "ربط يوتيوب متاح للمالك أو المدرّس المحرّر فقط.",
    };
  }
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false as const, message: "إعدادات Supabase غير مكتملة." };
  }

  if (profile.role === "teacher") {
    const { data: assignment, error } = await supabase
      .from("course_staff_assignments")
      .select("can_edit_content")
      .eq("course_id", input.courseId)
      .eq("teacher_id", profile.userId)
      .maybeSingle();
    if (error || !assignment?.can_edit_content) {
      return {
        ok: false as const,
        message: "ليست لديك صلاحية تعديل محتوى هذا الكورس.",
      };
    }
  }

  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id, semester_id, course_semesters!inner(course_id)")
    .eq("id", input.lessonId)
    .eq("semester_id", input.semesterId)
    .maybeSingle();
  const semester = Array.isArray(lesson?.course_semesters)
    ? lesson.course_semesters[0]
    : lesson?.course_semesters;
  if (lessonError || !lesson || semester?.course_id !== input.courseId) {
    return {
      ok: false as const,
      message: "الدرس لا ينتمي لهذا الترم والكورس.",
    };
  }
  return { ok: true as const };
}

function revalidateLesson(courseId: string, semesterId: string, lessonId: string) {
  revalidatePath(`/admin/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/teacher/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/admin/courses/${courseId}/semesters/${semesterId}`);
  revalidatePath(`/teacher/courses/${courseId}/semesters/${semesterId}`);
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/student/courses/${courseId}`);
}

/**
 * يضبط مصدر الدرس على يوتيوب دون حذف video_asset_id (أصل Mux إن وُجد يبقى محفوظًا).
 */
export async function saveLessonYoutubeAction(input: {
  courseId: string;
  semesterId: string;
  lessonId: string;
  youtubeUrl: string;
}): Promise<YoutubeActionResult> {
  const access = await requireLessonEditor(input);
  if (!access.ok) return access;

  const parsed = parseYoutubeVideoInput(input.youtubeUrl);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const service = createServiceRoleClient();
  if (!service) {
    return {
      ok: false,
      message:
        "مفتاح الخدمة غير مضبوط على الخادم. يلزم SUPABASE_SERVICE_ROLE_KEY لحفظ مصدر الفيديو.",
    };
  }

  const { error } = await service
    .from("lessons")
    .update({
      video_source: "youtube",
      youtube_video_id: parsed.videoId,
    })
    .eq("id", input.lessonId)
    .eq("semester_id", input.semesterId);

  if (error) {
    const raw = (error.message || "").toLowerCase();
    if (raw.includes("video_source") || raw.includes("youtube_video_id")) {
      return {
        ok: false,
        message:
          "أعمدة يوتيوب غير موجودة بعد. طبّق هجرة lesson_youtube_source بموافقة المالك ثم أعد المحاولة.",
      };
    }
    return { ok: false, message: "تعذر حفظ رابط يوتيوب." };
  }

  revalidateLesson(input.courseId, input.semesterId, input.lessonId);
  return {
    ok: true,
    videoId: parsed.videoId,
    message: "تم ربط فيديو يوتيوب. تذكّر: الحماية أضعف من Mux الموقّع.",
  };
}

/** يلغي مصدر يوتيوب النشط دون حذف أصل Mux إن وُجد. */
export async function clearLessonYoutubeAction(input: {
  courseId: string;
  semesterId: string;
  lessonId: string;
}): Promise<YoutubeActionResult> {
  const access = await requireLessonEditor(input);
  if (!access.ok) return access;

  const service = createServiceRoleClient();
  if (!service) {
    return { ok: false, message: "مفتاح الخدمة غير مضبوط على الخادم." };
  }

  const { data: row } = await service
    .from("lessons")
    .select("video_asset_id")
    .eq("id", input.lessonId)
    .maybeSingle();

  const hasMux =
    typeof row?.video_asset_id === "string" &&
    row.video_asset_id.trim().length > 0;

  const { error } = await service
    .from("lessons")
    .update({
      youtube_video_id: null,
      video_source: hasMux ? "mux" : null,
    })
    .eq("id", input.lessonId)
    .eq("semester_id", input.semesterId);

  if (error) {
    return { ok: false, message: "تعذر إزالة رابط يوتيوب." };
  }

  revalidateLesson(input.courseId, input.semesterId, input.lessonId);
  return {
    ok: true,
    message: hasMux
      ? "أُزيل يوتيوب. مصدر Mux المحفوظ أصبح نشطًا من جديد."
      : "أُزيل رابط يوتيوب من الدرس.",
  };
}

export async function getStaffLessonYoutubeSetup(lessonId: string): Promise<{
  source: "none" | "mux" | "youtube";
  youtubeVideoId: string | null;
  hasMuxAsset: boolean;
}> {
  const empty = {
    source: "none" as const,
    youtubeVideoId: null,
    hasMuxAsset: false,
  };

  const service = createServiceRoleClient();
  if (!service) return empty;

  const { data, error } = await service
    .from("lessons")
    .select("video_asset_id, video_source, youtube_video_id")
    .eq("id", lessonId)
    .maybeSingle();

  if (error || !data) {
    const legacy = await service
      .from("lessons")
      .select("video_asset_id")
      .eq("id", lessonId)
      .maybeSingle();
    const hasMux =
      typeof legacy.data?.video_asset_id === "string" &&
      legacy.data.video_asset_id.trim().length > 0;
    return {
      source: hasMux ? "mux" : "none",
      youtubeVideoId: null,
      hasMuxAsset: hasMux,
    };
  }

  const hasMux =
    typeof data.video_asset_id === "string" &&
    data.video_asset_id.trim().length > 0;
  const youtubeOk = isValidYoutubeVideoId(data.youtube_video_id);

  if (data.video_source === "youtube" && youtubeOk) {
    return {
      source: "youtube",
      youtubeVideoId: data.youtube_video_id,
      hasMuxAsset: hasMux,
    };
  }
  if (hasMux) {
    return {
      source: "mux",
      youtubeVideoId: youtubeOk ? data.youtube_video_id : null,
      hasMuxAsset: true,
    };
  }
  if (youtubeOk) {
    return {
      source: "youtube",
      youtubeVideoId: data.youtube_video_id,
      hasMuxAsset: false,
    };
  }
  return empty;
}

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { SITE_NAME } from "@/lib/data/navigation";
import { getSemesterDetail, listCourseSemesters } from "@/lib/learning/data";
import type {
  CourseContentItem,
  CourseExperienceSection,
  CourseExperienceView,
  LearningQueryResult,
} from "@/lib/learning/types";
import type { AcademicSemester } from "@/types/database";

function setupResult<T>(data: T): LearningQueryResult<T> {
  return {
    availability: "setup_required",
    message: "قاعدة البيانات غير جاهزة بعد.",
    data,
  };
}

function unavailableResult<T>(data: T, detail?: string): LearningQueryResult<T> {
  return {
    availability: "unavailable",
    message: detail ?? "تعذر قراءة محتوى الكورس.",
    data,
  };
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} د`;
}

function contentKindMeta(kind: CourseContentItem["kind"]): {
  kind: CourseContentItem["kind"];
  kindLabel: string;
} {
  switch (kind) {
    case "explanation_video":
      return { kind, kindLabel: "فيديو شرح" };
    case "solution_video":
      return { kind, kindLabel: "فيديو حل" };
    case "assignment":
      return { kind, kindLabel: "واجب" };
    case "exam":
      return { kind, kindLabel: "امتحان" };
    default:
      return { kind: "lesson", kindLabel: "درس" };
  }
}

function inferLessonKind(input: {
  title: string;
  hasVideoAsset: boolean;
}): CourseContentItem["kind"] {
  const title = input.title.toLowerCase();
  if (
    title.includes("واجب") ||
    title.includes("تكليف") ||
    title.includes("homework") ||
    title.includes("assignment")
  ) {
    return "assignment";
  }
  if (
    title.includes("حل") ||
    title.includes("solution") ||
    title.includes("إجابة") ||
    title.includes("اجابة")
  ) {
    return "solution_video";
  }
  if (
    input.hasVideoAsset ||
    title.includes("فيديو") ||
    title.includes("شرح") ||
    title.includes("video")
  ) {
    return "explanation_video";
  }
  return "lesson";
}

function parseAcademic(
  value: string | null | undefined,
): AcademicSemester | null {
  return value === "first" || value === "second" ? value : null;
}

async function buildSections(input: {
  courseId: string;
  hasAccess: boolean;
  mode: "student" | "admin_preview" | "public_preview";
  includeUnpublished: boolean;
}): Promise<
  LearningQueryResult<CourseExperienceSection[]>
> {
  const semestersResult = await listCourseSemesters(input.courseId);
  if (
    semestersResult.availability === "setup_required" ||
    semestersResult.availability === "unavailable"
  ) {
    return {
      availability: semestersResult.availability,
      message: semestersResult.message,
      data: [],
    };
  }

  const access = getAuthReadiness().dbSchemaReady
    ? await createClient()
    : null;
  if (!access) {
    return setupResult([]);
  }

  const sections: CourseExperienceSection[] = [];

  for (const semester of semestersResult.data) {
    const detail = await getSemesterDetail(input.courseId, semester.id);
    const lessons = (detail.data.lessons ?? [])
      .filter((lesson) =>
        input.includeUnpublished ? true : lesson.isPublished,
      )
      .map((lesson): CourseContentItem => {
        const unpublished = !lesson.isPublished;
        const locked =
          input.mode === "admin_preview" || input.mode === "public_preview"
            ? true
            : !input.hasAccess || unpublished;
        const kind = inferLessonKind({
          title: lesson.title,
          hasVideoAsset: Boolean(lesson.hasVideoAsset),
        });
        const meta = contentKindMeta(kind);
        return {
          id: lesson.id,
          kind: meta.kind,
          kindLabel: meta.kindLabel,
          title: lesson.title,
          durationLabel: formatDuration(lesson.durationSeconds),
          locked,
          lockedLabel:
            input.mode === "admin_preview"
              ? "معاينة فقط — التشغيل للطالب المشترك"
              : input.mode === "public_preview" || !input.hasAccess
                ? "مقفل — يلزم اشتراك نشط"
                : unpublished
                  ? "غير منشور"
                  : undefined,
          unpublished,
          // الفيديو يُشغَّل داخل صفحة الكورس؛ مسار الدرس المستقل يبقى متاحًا مباشرةً
          href: null,
        };
      });

    const examsQuery = access
      .from("exams")
      .select(
        "id, title, description, lesson_id, semester_id, duration_minutes, passing_score, max_attempts, is_published",
      )
      .eq("semester_id", semester.id);

    const { data: exams } = input.includeUnpublished
      ? await examsQuery
      : await examsQuery.eq("is_published", true);

    const examItems: CourseContentItem[] = (exams ?? []).map((exam) => {
      const unpublished = !exam.is_published;
      const locked =
        input.mode === "admin_preview" || input.mode === "public_preview"
          ? true
          : !input.hasAccess || unpublished;
      const meta = contentKindMeta("exam");
      return {
        id: exam.id,
        kind: meta.kind,
        kindLabel: meta.kindLabel,
        title: exam.title,
        durationLabel:
          exam.duration_minutes != null
            ? `${exam.duration_minutes} د`
            : null,
        locked,
        lockedLabel:
          input.mode === "admin_preview"
            ? "معاينة فقط — الامتحان للطالب المشترك"
            : input.mode === "public_preview" || !input.hasAccess
              ? "مقفل — يلزم اشتراك نشط"
              : unpublished
                ? "غير منشور"
                : undefined,
        unpublished,
        href:
          input.mode === "student" && !locked
            ? `/student/exams/${exam.id}`
            : null,
      };
    });

    // ترتيب الدروس كما ضبطه المالك، ثم الامتحانات المنشورة/المعروضة للقسم
    const orderedItems = [...lessons, ...examItems];

    if (
      orderedItems.length === 0 &&
      (input.mode === "student" || input.mode === "public_preview")
    ) {
      continue;
    }

    sections.push({
      id: semester.id,
      title: semester.title,
      description: semester.description,
      sortOrder: semester.sortOrder,
      items: orderedItems,
    });
  }

  return {
    availability: "ready",
    message: "تم بناء منهج الكورس.",
    data: sections,
  };
}

async function loadPublishedCourseRow(courseId: string) {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, course: null, error: true as const };

  let { data: course, error } = await supabase
    .from("courses")
    .select("id, title, description, thumbnail_path, academic_semester, status")
    .eq("id", courseId)
    .eq("status", "published")
    .maybeSingle();

  if (error && String(error.message ?? "").includes("academic_semester")) {
    const fallback = await supabase
      .from("courses")
      .select("id, title, description, thumbnail_path, status")
      .eq("id", courseId)
      .eq("status", "published")
      .maybeSingle();
    course = fallback.data
      ? ({ ...fallback.data, academic_semester: null } as typeof course)
      : null;
    error = fallback.error;
  }

  return { supabase, course, error: Boolean(error) };
}

export async function getStudentCourseExperience(
  courseId: string,
): Promise<LearningQueryResult<CourseExperienceView | null>> {
  if (!getAuthReadiness().dbSchemaReady) return setupResult(null);
  const loaded = await loadPublishedCourseRow(courseId);
  if (!loaded.supabase) return unavailableResult(null);
  if (loaded.error) return unavailableResult(null);
  if (!loaded.course) {
    return {
      availability: "empty",
      message: "الكورس غير متاحة أو غير منشورة.",
      data: null,
    };
  }

  const { data: entitled, error: entitledError } = await loaded.supabase.rpc(
    "student_has_active_enrollment_for_course",
    { p_course_id: courseId },
  );
  // الزائر غير المسجّل قد يفشل الـ RPC — نعامله كعدم استحقاق وليس كعطل
  const hasAccess = !entitledError && Boolean(entitled);
  const sectionsResult = await buildSections({
    courseId,
    hasAccess,
    mode: "student",
    includeUnpublished: false,
  });

  return {
    availability:
      sectionsResult.availability === "setup_required" ||
      sectionsResult.availability === "unavailable"
        ? sectionsResult.availability
        : "ready",
    message: hasAccess
      ? "تم جلب محتوى الكورس وفق الاستحقاق النشط."
      : sectionsResult.message ||
        "لا يوجد اشتراك نشط — المحتوى يظهر مقفلًا.",
    data: {
      courseId: loaded.course.id,
      title: loaded.course.title,
      description: loaded.course.description ?? "",
      thumbnailPath: loaded.course.thumbnail_path ?? null,
      academicSemester: parseAcademic(
        (loaded.course as { academic_semester?: string | null })
          .academic_semester,
      ),
      hasAccess,
      mode: "student",
      brandLabel: SITE_NAME,
      sections: sectionsResult.data,
    },
  };
}

export async function getPublicCourseExperience(
  courseId: string,
): Promise<LearningQueryResult<CourseExperienceView | null>> {
  const result = await getStudentCourseExperience(courseId);
  if (!result.data) return result;

  const sectionsResult = await buildSections({
    courseId,
    hasAccess: false,
    mode: "public_preview",
    includeUnpublished: false,
  });

  return {
    availability:
      sectionsResult.availability === "setup_required" ||
      sectionsResult.availability === "unavailable"
        ? sectionsResult.availability
        : "ready",
    message: "معاينة عامة للمنهج بدون تشغيل مدفوع.",
    data: {
      ...result.data,
      hasAccess: false,
      mode: "public_preview",
      sections: sectionsResult.data,
    },
  };
}

export async function studentHasCourseAccess(courseId: string): Promise<boolean> {
  if (!getAuthReadiness().dbSchemaReady) return false;
  const supabase = await createClient();
  if (!supabase) return false;
  const { data: entitled, error } = await supabase.rpc(
    "student_has_active_enrollment_for_course",
    { p_course_id: courseId },
  );
  if (error) return false;
  return Boolean(entitled);
}

export async function getAdminCoursePreviewExperience(
  courseId: string,
): Promise<LearningQueryResult<CourseExperienceView | null>> {
  if (!getAuthReadiness().dbSchemaReady) return setupResult(null);
  const supabase = await createClient();
  if (!supabase) return unavailableResult(null);

  let { data: course, error } = await supabase
    .from("courses")
    .select("id, title, description, thumbnail_path, academic_semester, status")
    .eq("id", courseId)
    .maybeSingle();

  if (error && String(error.message ?? "").includes("academic_semester")) {
    const fallback = await supabase
      .from("courses")
      .select("id, title, description, thumbnail_path, status")
      .eq("id", courseId)
      .maybeSingle();
    course = fallback.data
      ? ({ ...fallback.data, academic_semester: null } as typeof course)
      : null;
    error = fallback.error;
  }

  if (error) return unavailableResult(null);
  if (!course) {
    return { availability: "empty", message: "لم يُعثر على الكورس.", data: null };
  }

  const sectionsResult = await buildSections({
    courseId,
    hasAccess: false,
    mode: "admin_preview",
    includeUnpublished: true,
  });
  if (
    sectionsResult.availability === "setup_required" ||
    sectionsResult.availability === "unavailable"
  ) {
    return {
      availability: sectionsResult.availability,
      message: sectionsResult.message,
      data: null,
    };
  }

  return {
    availability: "ready",
    message: "معاينة الإدارة بدون تسجيل وهمي وبدون تشغيل موقّع.",
    data: {
      courseId: course.id,
      title: course.title,
      description: course.description ?? "",
      thumbnailPath: course.thumbnail_path ?? null,
      academicSemester: parseAcademic(
        (course as { academic_semester?: string | null }).academic_semester,
      ),
      hasAccess: false,
      mode: "admin_preview",
      brandLabel: SITE_NAME,
      sections: sectionsResult.data,
    },
  };
}

import "server-only";

import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthReadiness } from "@/lib/auth/readiness";
import type { CourseStatus } from "@/types/database";
import type {
  ExamAttemptSummary,
  ExamEditorView,
  ExamListItem,
  ExamAttemptStaffRow,
  ExamTakingView,
  LearningQueryResult,
  LessonDetailSafe,
  LessonListItem,
  SemesterListItem,
  StaffCourseAccess,
  StudentCourseCard,
  StudentCourseDetail,
} from "@/lib/learning/types";

function setupResult<T>(data: T, message?: string): LearningQueryResult<T> {
  return {
    availability: "setup_required",
    message:
      message ??
      "قاعدة البيانات غير جاهزة بعد. لن تُعرض كورسات أو دروس أو امتحانات مختلقة.",
    data,
  };
}

function unavailableResult<T>(data: T, detail?: string): LearningQueryResult<T> {
  return {
    availability: "unavailable",
    message:
      detail ??
      "تعذر قراءة بيانات المحتوى المحمية. تحقق من الهجرات وRLS دون تجاوز الأمان.",
    data,
  };
}

async function getClient() {
  const readiness = getAuthReadiness();
  if (!readiness.dbSchemaReady) {
    return { ready: false as const, supabase: null };
  }
  const supabase = await createClient();
  if (!supabase) {
    return { ready: false as const, supabase: null };
  }
  return { ready: true as const, supabase };
}

export async function resolveStaffCourseAccess(
  courseId: string,
  options: { userId: string; isAdmin: boolean },
): Promise<LearningQueryResult<StaffCourseAccess | null>> {
  const access = await getClient();
  if (!access.ready || !access.supabase) {
    return setupResult(null);
  }

  const { data: course, error } = await access.supabase
    .from("courses")
    .select("id, title, status")
    .eq("id", courseId)
    .maybeSingle();

  if (error) return unavailableResult(null);
  if (!course) {
    return { availability: "empty", message: "لم يُعثر على الكورس.", data: null };
  }

  if (options.isAdmin) {
    return {
      availability: "ready",
      message: "وصول المالك لكل محتوى الكورس.",
      data: {
        courseId: course.id,
        title: course.title,
        status: course.status as CourseStatus,
        canEditContent: true,
        canManageExams: true,
        canViewStudentProgress: true,
        isAdmin: true,
      },
    };
  }

  const { data: assignment, error: assignmentError } = await access.supabase
    .from("course_staff_assignments")
    .select(
      "can_edit_content, can_manage_exams, can_view_student_progress",
    )
    .eq("course_id", courseId)
    .eq("teacher_id", options.userId)
    .maybeSingle();

  if (assignmentError) return unavailableResult(null);
  if (!assignment) {
    return {
      availability: "empty",
      message: "لست معيّنًا على هذا الكورس. لا يُستنتج الوصول من إنشاء المحتوى.",
      data: null,
    };
  }

  return {
    availability: "ready",
    message: "تم التحقق من تعيين المدرّس.",
    data: {
      courseId: course.id,
      title: course.title,
      status: course.status as CourseStatus,
      canEditContent: Boolean(assignment.can_edit_content),
      canManageExams: Boolean(assignment.can_manage_exams),
      canViewStudentProgress: Boolean(assignment.can_view_student_progress),
      isAdmin: false,
    },
  };
}

export async function listCourseSemesters(
  courseId: string,
): Promise<LearningQueryResult<SemesterListItem[]>> {
  const access = await getClient();
  if (!access.ready || !access.supabase) {
    return setupResult([]);
  }

  // lessons لها SELECT عمودي فقط؛ lessons(count) عبر PostgREST غير موثوق.
  const { data, error } = await access.supabase
    .from("course_semesters")
    .select("id, course_id, title, description, sort_order")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });

  if (error) return unavailableResult([]);

  const semesterIds = (data ?? []).map((row) => row.id);
  const lessonCountBySemester = new Map<string, number>();
  if (semesterIds.length > 0) {
    // anon لا يملك SELECT على lessons — نستخدم lessons_catalog الآمن أولًا
    const { data: catalogRows, error: catalogError } = await access.supabase
      .from("lessons_catalog")
      .select("id, semester_id")
      .in("semester_id", semesterIds);

    if (!catalogError && catalogRows) {
      for (const lesson of catalogRows) {
        const key = lesson.semester_id as string;
        lessonCountBySemester.set(
          key,
          (lessonCountBySemester.get(key) ?? 0) + 1,
        );
      }
    } else {
      const { data: lessonRows } = await access.supabase
        .from("lessons")
        .select("id, semester_id")
        .in("semester_id", semesterIds);

      for (const lesson of lessonRows ?? []) {
        const key = lesson.semester_id as string;
        lessonCountBySemester.set(
          key,
          (lessonCountBySemester.get(key) ?? 0) + 1,
        );
      }
    }
  }

  const mapped: SemesterListItem[] = (data ?? []).map((row) => {
    return {
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      description: row.description ?? "",
      sortOrder: row.sort_order,
      lessonsCount: lessonCountBySemester.get(row.id) ?? 0,
      examsCount: 0,
    };
  });

  // عدّ الامتحانات إن وُجد الجدول؛ وإلا نُبقي 0 دون اختلاق
  const { data: exams, error: examsError } = await access.supabase
    .from("exams")
    .select("id, semester_id")
    .in(
      "semester_id",
      mapped.map((s) => s.id),
    );

  if (!examsError && exams) {
    const counts = new Map<string, number>();
    for (const exam of exams) {
      if (!exam.semester_id) continue;
      counts.set(exam.semester_id, (counts.get(exam.semester_id) ?? 0) + 1);
    }
    for (const item of mapped) {
      item.examsCount = counts.get(item.id) ?? 0;
    }
  }

  return {
    availability: mapped.length === 0 ? "empty" : "ready",
    message:
      mapped.length === 0
        ? "لا توجد ترمات بعد لهذا الكورس."
        : "تم جلب الترمات.",
    data: mapped,
  };
}

export async function getSemesterDetail(
  courseId: string,
  semesterId: string,
): Promise<
  LearningQueryResult<{
    semester: SemesterListItem | null;
    lessons: LessonListItem[];
  }>
> {
  const access = await getClient();
  if (!access.ready || !access.supabase) {
    return setupResult({ semester: null, lessons: [] });
  }

  const { data: semester, error } = await access.supabase
    .from("course_semesters")
    .select("id, course_id, title, description, sort_order")
    .eq("id", semesterId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (error) return unavailableResult({ semester: null, lessons: [] });
  if (!semester) {
    return {
      availability: "empty",
      message: "لم يُعثر على الترم ضمن هذا الكورس.",
      data: { semester: null, lessons: [] },
    };
  }

  // الطالب المشترك/الموظف: lessons. الزائر العام: lessons_catalog فقط (بدون video_asset_id).
  const { data: lessons, error: lessonsError } = await access.supabase
    .from("lessons")
    .select(
      "id, semester_id, title, description, duration_seconds, sort_order, is_published",
    )
    .eq("semester_id", semesterId)
    .order("sort_order", { ascending: true });

  let lessonRows = lessons ?? [];
  // anon غالبًا يحصل على [] بدون خطأ بسبب RLS — نرجع لـ lessons_catalog المنشور فقط.
  if (lessonsError || lessonRows.length === 0) {
    const { data: catalogLessons } = await access.supabase
      .from("lessons_catalog")
      .select(
        "id, semester_id, title, description, duration_seconds, sort_order, is_published",
      )
      .eq("semester_id", semesterId)
      .order("sort_order", { ascending: true });
    if (catalogLessons) {
      lessonRows = catalogLessons;
    } else if (lessonsError) {
      lessonRows = [];
    }
  }

  const lessonItems: LessonListItem[] = lessonRows.map((row) => ({
    id: row.id,
    semesterId: row.semester_id,
    title: row.title,
    description: row.description ?? "",
    sortOrder: row.sort_order,
    durationSeconds: row.duration_seconds,
    isPublished: Boolean(row.is_published),
    examCount: 0,
    hasVideoAsset: false,
  }));

  const { data: exams } = await access.supabase
    .from("exams")
    .select("id, lesson_id")
    .eq("semester_id", semesterId);

  const examCounts = new Map<string, number>();
  for (const exam of exams ?? []) {
    if (!exam.lesson_id) continue;
    examCounts.set(exam.lesson_id, (examCounts.get(exam.lesson_id) ?? 0) + 1);
  }
  for (const item of lessonItems) {
    item.examCount = examCounts.get(item.id) ?? 0;
  }

  return {
    availability: "ready",
    message: "تم جلب الترم ودروسه.",
    data: {
      semester: {
        id: semester.id,
        courseId: semester.course_id,
        title: semester.title,
        description: semester.description ?? "",
        sortOrder: semester.sort_order,
        lessonsCount: lessonItems.length,
        examsCount: 0,
      },
      lessons: lessonItems,
    },
  };
}

export async function getLessonEditorData(
  courseId: string,
  lessonId: string,
): Promise<LearningQueryResult<LessonDetailSafe | null>> {
  const access = await getClient();
  if (!access.ready || !access.supabase) {
    return setupResult(null);
  }

  const { data: lesson, error } = await access.supabase
    .from("lessons")
    .select(
      "id, semester_id, title, description, duration_seconds, sort_order, is_published, course_semesters!inner(id, course_id, title, courses!inner(id, title))",
    )
    .eq("id", lessonId)
    .maybeSingle();

  if (error) return unavailableResult(null);
  if (!lesson) {
    return { availability: "empty", message: "لم يُعثر على الدرس.", data: null };
  }

  const semesterRaw = Array.isArray(lesson.course_semesters)
    ? lesson.course_semesters[0]
    : lesson.course_semesters;
  const courseRaw = semesterRaw
    ? Array.isArray(semesterRaw.courses)
      ? semesterRaw.courses[0]
      : semesterRaw.courses
    : null;

  if (!semesterRaw || semesterRaw.course_id !== courseId) {
    return {
      availability: "empty",
      message: "الدرس لا ينتمي لهذا الكورس.",
      data: null,
    };
  }

  const [{ data: siblings }, { data: relatedExams }] = await Promise.all([
    access.supabase
      .from("lessons")
      .select("id, sort_order")
      .eq("semester_id", lesson.semester_id)
      .order("sort_order", { ascending: true }),
    access.supabase
      .from("exams")
      .select("id, title, is_published")
      .eq("lesson_id", lessonId),
  ]);

  const ordered = siblings ?? [];
  const index = ordered.findIndex((item) => item.id === lessonId);

  return {
    availability: "ready",
    message: "تم جلب بيانات الدرس بدون معرّف فيديو خام.",
    data: {
      id: lesson.id,
      semesterId: lesson.semester_id,
      courseId,
      courseTitle: courseRaw?.title ?? "",
      semesterTitle: semesterRaw.title ?? "",
      title: lesson.title,
      description: lesson.description ?? "",
      durationSeconds: lesson.duration_seconds,
      isPublished: Boolean(lesson.is_published),
      sortOrder: lesson.sort_order,
      relatedExams: (relatedExams ?? []).map((exam) => ({
        id: exam.id,
        title: exam.title,
        isPublished: Boolean(exam.is_published),
      })),
      previousLessonId: index > 0 ? ordered[index - 1]?.id ?? null : null,
      nextLessonId:
        index >= 0 && index < ordered.length - 1
          ? ordered[index + 1]?.id ?? null
          : null,
    },
  };
}

export async function listCourseExams(
  courseId: string,
): Promise<LearningQueryResult<ExamListItem[]>> {
  const access = await getClient();
  if (!access.ready || !access.supabase) {
    return setupResult([]);
  }

  const { data: semesters, error: semestersError } = await access.supabase
    .from("course_semesters")
    .select("id")
    .eq("course_id", courseId);

  if (semestersError) return unavailableResult([]);
  const semesterIds = (semesters ?? []).map((s) => s.id);
  if (semesterIds.length === 0) {
    return {
      availability: "empty",
      message: "لا توجد امتحانات (لا ترمات بعد).",
      data: [],
    };
  }

  const { data, error } = await access.supabase
    .from("exams")
    .select(
      "id, title, description, lesson_id, semester_id, duration_minutes, passing_score, max_attempts, is_published, exam_questions(count)",
    )
    .in("semester_id", semesterIds)
    .order("created_at", { ascending: false });

  if (error) {
    // الجدول قد لا يكون مطبّقًا بعد
    return unavailableResult(
      [],
      "تعذر قراءة الامتحانات. قد تكون هجرة exams غير مطبّقة بعد.",
    );
  }

  const mapped: ExamListItem[] = (data ?? []).map((row) => {
    const countRelation = Array.isArray(row.exam_questions)
      ? row.exam_questions[0]
      : row.exam_questions;
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? "",
      lessonId: row.lesson_id,
      semesterId: row.semester_id,
      durationMinutes: row.duration_minutes,
      passingScore: Number(row.passing_score ?? 50),
      maxAttempts: row.max_attempts,
      isPublished: Boolean(row.is_published),
      questionsCount:
        typeof countRelation?.count === "number" ? countRelation.count : 0,
    };
  });

  return {
    availability: mapped.length === 0 ? "empty" : "ready",
    message:
      mapped.length === 0 ? "لا توجد امتحانات بعد." : "تم جلب الامتحانات.",
    data: mapped,
  };
}

export async function getExamEditorData(
  examId: string,
): Promise<LearningQueryResult<ExamEditorView | null>> {
  const access = await getClient();
  if (!access.ready || !access.supabase) {
    return setupResult(null);
  }

  const { data: exam, error } = await access.supabase
    .from("exams")
    .select(
      "id, title, description, lesson_id, semester_id, duration_minutes, passing_score, max_attempts, is_published",
    )
    .eq("id", examId)
    .maybeSingle();

  if (error) {
    return unavailableResult(
      null,
      "تعذر قراءة الامتحان. قد تكون جداول exams غير مطبّقة.",
    );
  }
  if (!exam) {
    return { availability: "empty", message: "لم يُعثر على الامتحان.", data: null };
  }

  const { data: questions, error: questionsError } = await access.supabase
    .from("exam_questions")
    .select(
      "id, question_text, sort_order, points, exam_options(id, option_text, sort_order, is_correct)",
    )
    .eq("exam_id", examId)
    .order("sort_order", { ascending: true });

  if (questionsError) return unavailableResult(null);

  return {
    availability: "ready",
    message: "تم جلب الامتحان للتحرير المصرّح به فقط.",
    data: {
      id: exam.id,
      title: exam.title,
      description: exam.description ?? "",
      lessonId: exam.lesson_id,
      semesterId: exam.semester_id,
      durationMinutes: exam.duration_minutes,
      passingScore: Number(exam.passing_score ?? 50),
      maxAttempts: exam.max_attempts,
      isPublished: Boolean(exam.is_published),
      questionsCount: questions?.length ?? 0,
      questions: (questions ?? []).map((q) => ({
        id: q.id,
        questionText: q.question_text,
        sortOrder: q.sort_order,
        points: Number(q.points ?? 1),
        options: (Array.isArray(q.exam_options) ? q.exam_options : []).map(
          (o) => ({
            id: o.id,
            optionText: o.option_text,
            sortOrder: o.sort_order,
            isCorrect: Boolean(o.is_correct),
          }),
        ),
      })),
    },
  };
}

export async function listStudentCourses(
  studentId: string,
): Promise<LearningQueryResult<StudentCourseCard[]>> {
  const access = await getClient();
  if (!access.ready || !access.supabase) {
    return setupResult([]);
  }

  const { data, error } = await access.supabase
    .from("enrollments")
    .select(
      "id, status, expires_at, products(product_type, course_id, semester_id)",
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) {
    return unavailableResult(
      [],
      "تعذر قراءة التسجيلات. لن تُعرض مشتريات مختلقة.",
    );
  }

  const cards: StudentCourseCard[] = [];
  const seenCourses = new Set<string>();

  for (const row of data ?? []) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    if (!product) continue;

    let courseId = product.course_id as string | null;
    if (!courseId && product.semester_id) {
      const { data: semester } = await access.supabase
        .from("course_semesters")
        .select("course_id")
        .eq("id", product.semester_id)
        .maybeSingle();
      courseId = semester?.course_id ?? null;
    }

    if (!courseId || seenCourses.has(courseId)) continue;
    seenCourses.add(courseId);

    const { data: course } = await access.supabase
      .from("courses")
      .select("id, title, description, status, thumbnail_path")
      .eq("id", courseId)
      .maybeSingle();

    if (!course) continue;

    const status = row.status as StudentCourseCard["enrollmentStatus"];
    const coursePublished = course.status === "published";
    cards.push({
      courseId: course.id,
      title: course.title,
      description: course.description ?? "",
      thumbnailPath: course.thumbnail_path ?? null,
      enrollmentStatus: status,
      coursePublished,
      accessLabel: !coursePublished
        ? "الكورس غير منشورة حاليًا"
        : status === "active"
          ? "اشتراك كورس كامل"
          : status === "suspended"
            ? "موقوف"
            : "منتهٍ",
      progressPercent: null,
    });
  }

  return {
    availability: cards.length === 0 ? "empty" : "ready",
    message:
      cards.length === 0
        ? "لا توجد كورسات مشتراة مرتبطة بحسابك بعد."
        : "تم جلب الكورسات من التسجيلات الفعلية فقط.",
    data: cards,
  };
}

export async function getStudentCourseDetail(
  studentId: string,
  courseId: string,
): Promise<LearningQueryResult<StudentCourseDetail | null>> {
  const access = await getClient();
  if (!access.ready || !access.supabase) {
    return setupResult(null);
  }

  const { data: entitled, error: entitledError } = await access.supabase.rpc(
    "student_has_active_enrollment_for_course",
    { p_course_id: courseId },
  );

  if (entitledError) {
    return unavailableResult(null, "تعذر التحقق من استحقاق الكورس.");
  }

  // نعرض الهيكل فقط مع قفل الدروس إن لم يكن الاشتراك نشطًا — دون اختلاق تسجيل
  const { data: course, error: courseError } = await access.supabase
    .from("courses")
    .select("id, title, description, status, thumbnail_path")
    .eq("id", courseId)
    .eq("status", "published")
    .maybeSingle();

  if (courseError) return unavailableResult(null);
  if (!course) {
    return {
      availability: "empty",
      message: "الكورس غير متاح أو غير منشور.",
      data: null,
    };
  }

  const semestersResult = await listCourseSemesters(courseId);
  if (
    semestersResult.availability === "setup_required" ||
    semestersResult.availability === "unavailable"
  ) {
    return {
      availability: semestersResult.availability,
      message: semestersResult.message,
      data: null,
    };
  }

  const hasAccess = Boolean(entitled);
  const semesters = [];

  for (const semester of semestersResult.data) {
    const detail = await getSemesterDetail(courseId, semester.id);
    const lessons = (detail.data.lessons ?? [])
      .filter((lesson) => lesson.isPublished || hasAccess)
      .map((lesson) => ({
        ...lesson,
        locked: !hasAccess || !lesson.isPublished,
        lockedLabel: !hasAccess
          ? "مقفل — يلزم اشتراك نشط"
          : !lesson.isPublished
            ? "غير منشور بعد"
            : undefined,
      }));

    const { data: exams } = hasAccess
      ? await access.supabase
          .from("exams")
          .select(
            "id, title, description, lesson_id, semester_id, duration_minutes, passing_score, max_attempts, is_published",
          )
          .eq("semester_id", semester.id)
          .eq("is_published", true)
      : { data: [] as never[] };

    semesters.push({
      ...semester,
      lessons,
      exams: (exams ?? []).map((exam) => ({
        id: exam.id,
        title: exam.title,
        description: exam.description ?? "",
        lessonId: exam.lesson_id,
        semesterId: exam.semester_id,
        durationMinutes: exam.duration_minutes,
        passingScore: Number(exam.passing_score ?? 50),
        maxAttempts: exam.max_attempts,
        isPublished: Boolean(exam.is_published),
        questionsCount: 0,
      })),
    });
  }

  void studentId;

  return {
    availability: "ready",
    message: hasAccess
      ? "تم جلب محتوى الكورس وفق الاستحقاق النشط."
      : "لا يوجد اشتراك نشط — الدروس تظهر مقفلة دون محاكاة شراء.",
    data: {
      courseId: course.id,
      title: course.title,
      description: course.description ?? "",
      thumbnailPath: course.thumbnail_path ?? null,
      semesters,
    },
  };
}

export async function getStudentLessonPage(
  lessonId: string,
): Promise<
  LearningQueryResult<{
    lesson: LessonDetailSafe | null;
    locked: boolean;
  }>
> {
  const access = await getClient();
  if (!access.ready || !access.supabase) {
    return setupResult({ lesson: null, locked: true });
  }

  const { data: entitled, error: entitledError } = await access.supabase.rpc(
    "student_has_active_enrollment_for_lesson",
    { p_lesson_id: lessonId },
  );

  if (entitledError) {
    return unavailableResult(
      { lesson: null, locked: true },
      "تعذر التحقق من استحقاق الدرس.",
    );
  }

  const { data: lesson, error } = await access.supabase
    .from("lessons")
    .select(
      "id, semester_id, title, description, duration_seconds, sort_order, is_published, course_semesters!inner(id, course_id, title, courses!inner(id, title))",
    )
    .eq("id", lessonId)
    .maybeSingle();

  if (error) return unavailableResult({ lesson: null, locked: true });
  if (!lesson) {
    return {
      availability: "empty",
      message: "لم يُعثر على الدرس.",
      data: { lesson: null, locked: true },
    };
  }

  const semesterRaw = Array.isArray(lesson.course_semesters)
    ? lesson.course_semesters[0]
    : lesson.course_semesters;
  const courseRaw = semesterRaw
    ? Array.isArray(semesterRaw.courses)
      ? semesterRaw.courses[0]
      : semesterRaw.courses
    : null;

  const locked = !entitled || !lesson.is_published;

  const { data: siblings } = await access.supabase
    .from("lessons")
    .select("id, sort_order, is_published")
    .eq("semester_id", lesson.semester_id)
    .order("sort_order", { ascending: true });

  const ordered = (siblings ?? []).filter((s) => s.is_published);
  const index = ordered.findIndex((item) => item.id === lessonId);

  return {
    availability: "ready",
    message: locked
      ? "الدرس مقفل — لا تشغيل بدون استحقاق نشط ونشر."
      : "بيانات الدرس جاهزة لطلب تفويض التشغيل على الخادم.",
    data: {
      locked,
      lesson: {
        id: lesson.id,
        semesterId: lesson.semester_id,
        courseId: semesterRaw?.course_id ?? courseRaw?.id ?? "",
        courseTitle: courseRaw?.title ?? "",
        semesterTitle: semesterRaw?.title ?? "",
        title: lesson.title,
        description: lesson.description ?? "",
        durationSeconds: lesson.duration_seconds,
        isPublished: Boolean(lesson.is_published),
        sortOrder: lesson.sort_order,
        relatedExams: [],
        previousLessonId: index > 0 ? ordered[index - 1]?.id ?? null : null,
        nextLessonId:
          index >= 0 && index < ordered.length - 1
            ? ordered[index + 1]?.id ?? null
            : null,
      },
    },
  };
}

export async function getExamTakingData(
  examId: string,
): Promise<LearningQueryResult<ExamTakingView | null>> {
  const access = await getClient();
  if (!access.ready || !access.supabase) {
    return setupResult(null);
  }

  const { data: entitled, error: entitledError } = await access.supabase.rpc(
    "student_has_active_enrollment_for_exam",
    { p_exam_id: examId },
  );

  if (entitledError) {
    return unavailableResult(
      null,
      "تعذر التحقق من استحقاق الامتحان. قد تكون هجرة exams غير مطبّقة.",
    );
  }

  if (!entitled) {
    return {
      availability: "empty",
      message: "لا تملك استحقاقًا نشطًا لهذا الامتحان.",
      data: null,
    };
  }

  const { data: authData } = await access.supabase.auth.getUser();
  const studentId = authData.user?.id ?? null;

  const { data: openAttempt } = studentId
    ? await access.supabase
        .from("exam_attempts")
        .select("id, ends_at, status, score")
        .eq("exam_id", examId)
        .eq("student_id", studentId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: exam, error } = await access.supabase
    .from("exams")
    .select(
      "id, title, description, duration_minutes, passing_score, max_attempts, is_published",
    )
    .eq("id", examId)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !exam) {
    return {
      availability: "empty",
      message: "الامتحان غير متاح.",
      data: null,
    };
  }

  const { data: questions, error: questionsError } = await access.supabase
    .from("exam_questions")
    .select("id, question_text, sort_order, points")
    .eq("exam_id", examId)
    .order("sort_order", { ascending: true });

  if (questionsError) return unavailableResult(null);

  const questionIds = (questions ?? []).map((q) => q.id);
  const { data: options } = questionIds.length
    ? await access.supabase
        .from("exam_options_for_taking")
        .select("id, question_id, option_text, sort_order")
        .in("question_id", questionIds)
        .order("sort_order", { ascending: true })
    : { data: [] as Array<{
        id: string;
        question_id: string;
        option_text: string;
        sort_order: number;
      }> };

  await connection();

  // لا مفاتيح صحيحة في حزمة المتصفح
  return {
    availability: "ready",
    message: "واجهة الامتحان بدون مفاتيح إجابة. التصحيح يتم على الخادم.",
    data: {
      id: exam.id,
      title: exam.title,
      description: exam.description ?? "",
      durationMinutes: exam.duration_minutes,
      passingScore: Number(exam.passing_score ?? 50),
      maxAttempts: exam.max_attempts,
      attemptId: openAttempt?.status === "in_progress" ? openAttempt.id : null,
      endsAt: openAttempt?.status === "in_progress" ? openAttempt.ends_at : null,
      serverNow: new Date().toISOString(),
      attemptStatus: (openAttempt?.status as ExamTakingView["attemptStatus"]) ?? null,
      score: openAttempt?.score == null ? null : Number(openAttempt.score),
      passed:
        openAttempt?.status === "submitted" && openAttempt.score != null
          ? Number(openAttempt.score) >= Number(exam.passing_score ?? 50)
          : null,
      questions: (questions ?? []).map((q) => ({
        id: q.id,
        questionText: q.question_text,
        sortOrder: q.sort_order,
        points: Number(q.points ?? 1),
        options: (options ?? [])
          .filter((o) => o.question_id === q.id)
          .map((o) => ({
            id: o.id,
            optionText: o.option_text,
            sortOrder: o.sort_order,
          })),
      })),
    },
  };
}

export async function listExamAttempts(
  examId: string,
): Promise<LearningQueryResult<ExamAttemptStaffRow[]>> {
  const access = await getClient();
  if (!access.ready || !access.supabase) return setupResult([]);

  const { data, error } = await access.supabase
    .from("exam_attempts")
    .select("id, student_id, status, score, started_at, submitted_at")
    .eq("exam_id", examId)
    .order("started_at", { ascending: false });

  if (error) {
    return unavailableResult([], "تعذر قراءة محاولات الطلاب.");
  }

  const studentIds = [...new Set((data ?? []).map((row) => row.student_id))];
  const names = new Map<string, string>();
  if (studentIds.length > 0) {
    const { data: profiles } = await access.supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", studentIds);
    for (const profile of profiles ?? []) {
      names.set(profile.id, profile.full_name ?? "طالب");
    }
  }

  return {
    availability: (data ?? []).length === 0 ? "empty" : "ready",
    message: (data ?? []).length === 0 ? "لا توجد محاولات." : "تم جلب المحاولات.",
    data: (data ?? []).map((row) => ({
      id: row.id,
      studentName: names.get(row.student_id) ?? "طالب",
      status: row.status,
      score: row.score == null ? null : Number(row.score),
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
    })),
  };
}

export async function listStudentExamAttempts(
  studentId: string,
): Promise<LearningQueryResult<ExamAttemptSummary[]>> {
  const access = await getClient();
  if (!access.ready || !access.supabase) {
    return setupResult([]);
  }

  const { data, error } = await access.supabase
    .from("exam_attempts")
    .select(
      "id, exam_id, status, score, started_at, submitted_at, exams(title, passing_score)",
    )
    .eq("student_id", studentId)
    .order("started_at", { ascending: false });

  if (error) {
    return unavailableResult(
      [],
      "تعذر قراءة المحاولات. لن تُعرض درجات مختلقة.",
    );
  }

  const mapped: ExamAttemptSummary[] = (data ?? []).map((row) => {
    const exam = Array.isArray(row.exams) ? row.exams[0] : row.exams;
    const score = row.score === null || row.score === undefined ? null : Number(row.score);
    const passing = Number(exam?.passing_score ?? 50);
    return {
      id: row.id,
      examId: row.exam_id,
      examTitle: exam?.title ?? "امتحان",
      status: row.status as ExamAttemptSummary["status"],
      score,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      passed:
        score === null || row.status !== "submitted" ? null : score >= passing,
    };
  });

  return {
    availability: mapped.length === 0 ? "empty" : "ready",
    message:
      mapped.length === 0
        ? "لا توجد محاولات امتحان بعد."
        : "تم جلب المحاولات من الخادم فقط.",
    data: mapped,
  };
}

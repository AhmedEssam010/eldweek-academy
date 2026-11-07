import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAuthReadiness } from "@/lib/auth/readiness";
import type { CourseStatus } from "@/types/database";
import type {
  CourseDetail,
  CourseListItem,
  DashboardMetric,
  DataAvailability,
  TeacherCourseCard,
  TeacherDetail,
  TeacherListItem,
} from "@/lib/dashboard/types";

type QueryResult<T> = {
  availability: DataAvailability;
  message: string;
  data: T;
};

function setupResult<T>(data: T): QueryResult<T> {
  return {
    availability: "setup_required",
    message:
      "قاعدة البيانات غير جاهزة بعد. طبّق الهجرات وأكّد NEXT_PUBLIC_DB_SCHEMA_READY قبل عرض الإحصاءات أو تنفيذ العمليات.",
    data,
  };
}

function unavailableResult<T>(data: T, detail?: string): QueryResult<T> {
  return {
    availability: "unavailable",
    message:
      detail ??
      "تعذر قراءة البيانات المحمية. تحقق من تطبيق الهجرات وصلاحيات RLS دون تجاوز الأمان.",
    data,
  };
}

async function getAuthedServerClient() {
  const readiness = getAuthReadiness();
  if (!readiness.dbSchemaReady) {
    return { ready: false as const, supabase: null, readiness };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { ready: false as const, supabase: null, readiness };
  }

  return { ready: true as const, supabase, readiness };
}

export async function getAdminOverviewMetrics(): Promise<
  QueryResult<DashboardMetric[]>
> {
  const emptyMetrics: DashboardMetric[] = [
    {
      key: "students",
      label: "إجمالي الطلاب",
      value: null,
      hint: "حسابات بدور طالب",
    },
    {
      key: "courses",
      label: "إجمالي الكورسات",
      value: null,
      hint: "مسودة ومنشور ومؤرشف",
    },
    {
      key: "active_enrollments",
      label: "تسجيلات نشطة",
      value: null,
      hint: "اشتراكات ما زالت فعّالة",
    },
    {
      key: "pending_payments",
      label: "طلبات دفع معلّقة",
      value: null,
      hint: "بانتظار مراجعة المالك",
    },
  ];

  const access = await getAuthedServerClient();
  if (!access.ready || !access.supabase) {
    return setupResult(emptyMetrics);
  }

  const supabase = access.supabase;

  const [students, courses, enrollments, payments] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "student"),
    supabase.from("courses").select("id", { count: "exact", head: true }),
    supabase
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("payment_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  const failures = [
    { key: "profiles.student", error: students.error },
    { key: "courses", error: courses.error },
    { key: "enrollments", error: enrollments.error },
    { key: "payment_requests", error: payments.error },
  ].filter((item) => item.error);

  if (failures.length > 0) {
    const primary = failures[0]!;
    const code = primary.error?.code ?? "unknown";
    const raw = String(primary.error?.message ?? "unknown")
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, "[redacted]")
      .slice(0, 180);
    console.error("[admin-overview-read-failed]", {
      targets: failures.map((f) => ({
        key: f.key,
        code: f.error?.code,
        message: f.error?.message?.slice(0, 180),
      })),
    });
    return unavailableResult(
      emptyMetrics,
      `تعذر قراءة البيانات المحمية (المصدر: ${primary.key} · الرمز: ${code} · ${raw}).`,
    );
  }

  return {
    availability: "ready",
    message: "تم جلب الإحصاءات من قاعدة البيانات.",
    data: [
      {
        key: "students",
        label: "إجمالي الطلاب",
        value: students.count ?? 0,
        hint: "حسابات بدور طالب",
      },
      {
        key: "courses",
        label: "إجمالي الكورسات",
        value: courses.count ?? 0,
        hint: "مسودة ومنشور ومؤرشف",
      },
      {
        key: "active_enrollments",
        label: "تسجيلات نشطة",
        value: enrollments.count ?? 0,
        hint: "اشتراكات ما زالت فعّالة",
      },
      {
        key: "pending_payments",
        label: "طلبات دفع معلّقة",
        value: payments.count ?? 0,
        hint: "بانتظار مراجعة المالك",
      },
    ],
  };
}

export async function listTeachers(options?: {
  query?: string;
  active?: "all" | "active" | "inactive";
}): Promise<QueryResult<TeacherListItem[]>> {
  const access = await getAuthedServerClient();
  if (!access.ready || !access.supabase) {
    return setupResult([]);
  }

  let request = access.supabase
    .from("profiles")
    .select(
      "id, full_name, phone_number, is_active, can_create_course_drafts, created_at",
    )
    .eq("role", "teacher")
    .order("created_at", { ascending: false });

  if (options?.active === "active") {
    request = request.eq("is_active", true);
  }
  if (options?.active === "inactive") {
    request = request.eq("is_active", false);
  }

  const { data, error } = await request;
  if (error) {
    return unavailableResult([]);
  }

  const query = options?.query?.trim().toLowerCase() ?? "";
  const mapped: TeacherListItem[] = (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name ?? "",
    phoneNumber: row.phone_number,
    isActive: Boolean(row.is_active),
    canCreateCourseDrafts: Boolean(row.can_create_course_drafts),
    createdAt: row.created_at,
  }));

  const filtered = query
    ? mapped.filter(
        (item) =>
          item.fullName.toLowerCase().includes(query) ||
          (item.phoneNumber ?? "").includes(query),
      )
    : mapped;

  return {
    availability: filtered.length === 0 ? "empty" : "ready",
    message:
      filtered.length === 0
        ? "لا يوجد مدرّسون مطابقون لخيارات البحث الحالية."
        : "تم جلب قائمة المدرّسين.",
    data: filtered,
  };
}

export async function getTeacherDetail(
  teacherId: string,
): Promise<QueryResult<TeacherDetail | null>> {
  const access = await getAuthedServerClient();
  if (!access.ready || !access.supabase) {
    return setupResult(null);
  }

  const { data: profile, error: profileError } = await access.supabase
    .from("profiles")
    .select(
      "id, full_name, phone_number, is_active, can_create_course_drafts, created_at, role",
    )
    .eq("id", teacherId)
    .eq("role", "teacher")
    .maybeSingle();

  if (profileError) {
    return unavailableResult(null);
  }

  if (!profile) {
    return {
      availability: "empty",
      message: "لم يُعثر على هذا المدرّس.",
      data: null,
    };
  }

  const { data: assignments, error: assignmentsError } = await access.supabase
    .from("course_staff_assignments")
    .select(
      "id, course_id, can_edit_content, can_manage_exams, can_view_student_progress, courses(id, title, status)",
    )
    .eq("teacher_id", teacherId);

  if (assignmentsError) {
    return unavailableResult(null);
  }

  return {
    availability: "ready",
    message: "تم جلب تفاصيل المدرّس.",
    data: {
      id: profile.id,
      fullName: profile.full_name ?? "",
      phoneNumber: profile.phone_number,
      isActive: Boolean(profile.is_active),
      canCreateCourseDrafts: Boolean(profile.can_create_course_drafts),
      createdAt: profile.created_at,
      assignments: (assignments ?? []).map((row) => {
        const course = Array.isArray(row.courses) ? row.courses[0] : row.courses;
        return {
          id: row.id,
          courseId: row.course_id,
          courseTitle: course?.title ?? "كورس غير معروف",
          courseStatus: (course?.status ?? "draft") as CourseStatus,
          canEditContent: Boolean(row.can_edit_content),
          canManageExams: Boolean(row.can_manage_exams),
          canViewStudentProgress: Boolean(row.can_view_student_progress),
        };
      }),
    },
  };
}

export async function listCourses(options?: {
  query?: string;
  status?: CourseStatus | "all";
}): Promise<QueryResult<CourseListItem[]>> {
  const access = await getAuthedServerClient();
  if (!access.ready || !access.supabase) {
    return setupResult([]);
  }

  let request = access.supabase
    .from("courses")
    .select(
      "id, title, slug, description, thumbnail_path, academic_semester, status, created_at, updated_at, course_staff_assignments(count)",
    )
    .order("updated_at", { ascending: false });

  if (options?.status && options.status !== "all") {
    request = request.eq("status", options.status);
  }

  let { data, error } = await request;
  if (error && String(error.message ?? "").includes("academic_semester")) {
    const fallback = await access.supabase
      .from("courses")
      .select(
        "id, title, slug, description, thumbnail_path, status, created_at, updated_at, course_staff_assignments(count)",
      )
      .order("updated_at", { ascending: false });
    data = (fallback.data ?? []).map((row) => ({
      ...row,
      academic_semester: null,
    })) as typeof data;
    error = fallback.error;
  }
  if (error) {
    return unavailableResult(
      [],
      `تعذر قراءة قائمة الكورسات (المصدر: courses|course_staff_assignments · الرمز: ${error.code ?? "unknown"} · ${String(error.message ?? "unknown").slice(0, 160)}).`,
    );
  }

  const query = options?.query?.trim().toLowerCase() ?? "";
  const mapped: CourseListItem[] = (data ?? []).map((row) => {
    const countRelation = Array.isArray(row.course_staff_assignments)
      ? row.course_staff_assignments[0]
      : row.course_staff_assignments;
    const academic = (row as { academic_semester?: string | null }).academic_semester;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description ?? "",
      thumbnailPath: row.thumbnail_path ?? null,
      academicSemester:
        academic === "first" || academic === "second" ? academic : null,
      status: row.status as CourseStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      assignedTeachersCount:
        typeof countRelation?.count === "number" ? countRelation.count : 0,
    };
  });

  const filtered = query
    ? mapped.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.slug.toLowerCase().includes(query),
      )
    : mapped;

  return {
    availability: filtered.length === 0 ? "empty" : "ready",
    message:
      filtered.length === 0
        ? "لا توجد كورسات مطابقة."
        : "تم جلب قائمة الكورسات.",
    data: filtered,
  };
}

export async function getCourseDetail(
  courseId: string,
): Promise<QueryResult<CourseDetail | null>> {
  const access = await getAuthedServerClient();
  if (!access.ready || !access.supabase) {
    return setupResult(null);
  }

  let { data: course, error } = await access.supabase
    .from("courses")
    .select(
      "id, title, slug, description, thumbnail_path, academic_semester, status, created_at, updated_at",
    )
    .eq("id", courseId)
    .maybeSingle();

  if (error && String(error.message ?? "").includes("academic_semester")) {
    const fallback = await access.supabase
      .from("courses")
      .select(
        "id, title, slug, description, thumbnail_path, status, created_at, updated_at",
      )
      .eq("id", courseId)
      .maybeSingle();
    course = fallback.data
      ? ({ ...fallback.data, academic_semester: null } as typeof course)
      : null;
    error = fallback.error;
  }

  if (error) {
    return unavailableResult(
      null,
      `تعذر قراءة الكورس (المصدر: courses · الرمز: ${error.code ?? "unknown"} · ${String(error.message ?? "unknown").slice(0, 160)}).`,
    );
  }

  if (!course) {
    return {
      availability: "empty",
      message: "لم يُعثر على الكورس.",
      data: null,
    };
  }

  // ملاحظة أمنية/صلاحيات: lessons لديها SELECT عمودي فقط (بدون video_asset_id).
  // تضمين lessons(count) عبر PostgREST قد يفشل بـ permission denied لـ count(*).
  // لذلك نعدّ عبر select=id الصريح فقط.
  const [assignmentsResult, semestersResult] = await Promise.all([
    access.supabase
      .from("course_staff_assignments")
      .select(
        "id, course_id, teacher_id, can_edit_content, can_manage_exams, can_view_student_progress, profiles(full_name)",
      )
      .eq("course_id", courseId),
    access.supabase
      .from("course_semesters")
      .select("id")
      .eq("course_id", courseId),
  ]);

  if (assignmentsResult.error || semestersResult.error) {
    const primary = assignmentsResult.error ?? semestersResult.error;
    return unavailableResult(
      null,
      `تعذر قراءة بيانات الكورس المحمية (المصدر: ${assignmentsResult.error ? "course_staff_assignments|profiles" : "course_semesters"} · الرمز: ${primary?.code ?? "unknown"} · ${String(primary?.message ?? "unknown").slice(0, 160)}).`,
    );
  }

  const semesterIds = (semestersResult.data ?? []).map((row) => row.id);
  let lessonsCount = 0;
  if (semesterIds.length > 0) {
    const lessonsResult = await access.supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .in("semester_id", semesterIds);

    if (lessonsResult.error) {
      console.error("[admin-course-lessons-count-failed]", {
        code: lessonsResult.error.code,
        message: lessonsResult.error.message?.slice(0, 180),
      });
      return unavailableResult(
        null,
        `تعذر قراءة عدد الدروس (المصدر: lessons · الرمز: ${lessonsResult.error.code ?? "unknown"} · ${String(lessonsResult.error.message ?? "unknown").slice(0, 160)}).`,
      );
    }
    lessonsCount = lessonsResult.count ?? 0;
  }

  const academic = (course as { academic_semester?: string | null }).academic_semester;

  return {
    availability: "ready",
    message: "تم جلب تفاصيل الكورس.",
    data: {
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description ?? "",
      thumbnailPath: course.thumbnail_path ?? null,
      academicSemester:
        academic === "first" || academic === "second" ? academic : null,
      status: course.status as CourseStatus,
      createdAt: course.created_at,
      updatedAt: course.updated_at,
      assignedTeachersCount: assignmentsResult.data?.length ?? 0,
      semestersCount: semesterIds.length,
      lessonsCount,
      assignments: (assignmentsResult.data ?? []).map((row) => {
        const profile = Array.isArray(row.profiles)
          ? row.profiles[0]
          : row.profiles;
        return {
          id: row.id,
          courseId: row.course_id,
          courseTitle: course.title,
          courseStatus: course.status as CourseStatus,
          canEditContent: Boolean(row.can_edit_content),
          canManageExams: Boolean(row.can_manage_exams),
          canViewStudentProgress: Boolean(row.can_view_student_progress),
          teacherName: profile?.full_name ?? "مدرّس",
          teacherId: row.teacher_id,
        };
      }),
    },
  };
}

export async function listTeacherAssignedCourses(
  teacherUserId: string,
): Promise<QueryResult<TeacherCourseCard[]>> {
  const access = await getAuthedServerClient();
  if (!access.ready || !access.supabase) {
    return setupResult([]);
  }

  const [{ data: profile, error: profileError }, { data, error }] =
    await Promise.all([
      access.supabase
        .from("profiles")
        .select("can_create_course_drafts")
        .eq("id", teacherUserId)
        .maybeSingle(),
      access.supabase
        .from("course_staff_assignments")
        .select(
          "can_edit_content, can_manage_exams, can_view_student_progress, courses(id, title, status)",
        )
        .eq("teacher_id", teacherUserId),
    ]);

  if (profileError || error) {
    return unavailableResult([]);
  }

  const canCreateDrafts = Boolean(profile?.can_create_course_drafts);
  const mapped: TeacherCourseCard[] = (data ?? [])
    .map((row) => {
      const course = Array.isArray(row.courses) ? row.courses[0] : row.courses;
      if (!course) return null;
      return {
        courseId: course.id,
        title: course.title,
        status: course.status as CourseStatus,
        canEditContent: Boolean(row.can_edit_content),
        canManageExams: Boolean(row.can_manage_exams),
        canViewStudentProgress: Boolean(row.can_view_student_progress),
        canCreateCourseDrafts: canCreateDrafts,
      };
    })
    .filter((item): item is TeacherCourseCard => item !== null);

  return {
    availability: mapped.length === 0 ? "empty" : "ready",
    message:
      mapped.length === 0
        ? "لا توجد كورسات معيّنة لك بعد."
        : "تم جلب الكورسات المعيّنة فقط.",
    data: mapped,
  };
}

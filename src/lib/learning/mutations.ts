"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { lessonMayBePublished } from "@/lib/learning/mux";
import { createClient } from "@/lib/supabase/server";
import type { CourseFormActionResult } from "@/lib/dashboard/types";

export type LearningMutationResult = {
  ok: false;
  code: "setup_required" | "forbidden_until_ready";
  message: string;
};

/**
 * كل كتابات المحتوى/الامتحانات/التقدّم معطّلة حتى تُطبَّق الهجرات
 * وتُختبر سياسات RLS والتقويم الآمن.
 */
function blocked(actionLabel: string): LearningMutationResult {
  const readiness = getAuthReadiness();

  if (!readiness.dbSchemaReady) {
    return {
      ok: false,
      code: "setup_required",
      message: `عملية «${actionLabel}» غير متاحة لأن مخطط قاعدة البيانات غير جاهز بعد.`,
    };
  }

  return {
    ok: false,
    code: "forbidden_until_ready",
    message: `عملية «${actionLabel}» واجهة فقط. التنفيذ الفعلي مؤجّل حتى اكتمال التحقق الأمني من RLS ومسارات الكتابة الآمنة.`,
  };
}

function fail(message: string): CourseFormActionResult {
  return { ok: false, message };
}

function success(message: string, redirectTo?: string): CourseFormActionResult {
  return { ok: true, message, redirectTo };
}

async function requireSemesterEditor(courseId: string) {
  const readiness = getAuthReadiness();
  if (!readiness.dbSchemaReady) {
    return {
      ok: false as const,
      result: fail("قاعدة البيانات غير جاهزة بعد."),
    };
  }

  const user = await requireAuthenticatedUser();
  if (user.role !== "super_admin" && user.role !== "teacher") {
    return {
      ok: false as const,
      result: fail("إدارة الترمات متاحة للمالك أو المدرّس المعيّن فقط."),
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { ok: false as const, result: fail("إعدادات Supabase غير مكتملة.") };
  }

  if (user.role === "teacher") {
    const { data: assignment, error } = await supabase
      .from("course_staff_assignments")
      .select("can_edit_content")
      .eq("course_id", courseId)
      .eq("teacher_id", user.userId)
      .maybeSingle();

    if (error || !assignment?.can_edit_content) {
      return {
        ok: false as const,
        result: fail("ليست لديك صلاحية تعديل محتوى هذا الكورس."),
      };
    }
  }

  return { ok: true as const, supabase, user };
}

function revalidateSemesterPaths(courseId: string, semesterId?: string) {
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath(`/admin/courses/${courseId}/semesters`);
  revalidatePath(`/teacher/courses/${courseId}/semesters`);
  if (semesterId) {
    revalidatePath(`/admin/courses/${courseId}/semesters/${semesterId}`);
    revalidatePath(`/teacher/courses/${courseId}/semesters/${semesterId}`);
  }
}

export async function createSemesterAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const courseId = String(formData.get("course_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!courseId) return fail("معرّف الكورس مفقود.");
  if (title.length < 2) return fail("عنوان القسم مطلوب (حرفان على الأقل).");

  const access = await requireSemesterEditor(courseId);
  if (!access.ok) return access.result;

  const { data: existing, error: listError } = await access.supabase
    .from("course_semesters")
    .select("sort_order")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (listError) return fail("تعذر تحديد ترتيب القسم الجديد.");

  const nextOrder =
    existing && existing.length > 0 ? Number(existing[0]?.sort_order ?? 0) + 1 : 0;

  const { data: created, error } = await access.supabase
    .from("course_semesters")
    .insert({
      course_id: courseId,
      title,
      description,
      sort_order: nextOrder,
    })
    .select("id")
    .single();

  if (error || !created) {
    return fail("تعذر إنشاء القسم. تحقق من الصلاحيات وانتماء الكورس.");
  }

  revalidateSemesterPaths(courseId, created.id);
  const base =
    access.user.role === "super_admin"
      ? `/admin/courses/${courseId}/semesters/${created.id}`
      : `/teacher/courses/${courseId}/semesters/${created.id}`;
  return success("تم إنشاء القسم بنجاح. يمكنك تسميته كما تريد (مثل أسبوع 1 أو مراجعة).", base);
}

export async function updateSemesterAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const courseId = String(formData.get("course_id") ?? "").trim();
  const semesterId = String(formData.get("semester_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!courseId || !semesterId) return fail("بيانات القسم غير مكتملة.");
  if (title.length < 2) return fail("عنوان القسم مطلوب (حرفان على الأقل).");

  const access = await requireSemesterEditor(courseId);
  if (!access.ok) return access.result;

  const { data: current, error: loadError } = await access.supabase
    .from("course_semesters")
    .select("id, course_id")
    .eq("id", semesterId)
    .maybeSingle();

  if (loadError) return fail("تعذر قراءة القسم قبل التعديل.");
  if (!current || current.course_id !== courseId) {
    return fail("هذا القسم لا ينتمي للكورس المحدد.");
  }

  const { error } = await access.supabase
    .from("course_semesters")
    .update({ title, description })
    .eq("id", semesterId)
    .eq("course_id", courseId);

  if (error) return fail("تعذر حفظ تعديلات القسم.");

  revalidateSemesterPaths(courseId, semesterId);
  return success("تم حفظ بيانات القسم.");
}

export async function deleteSectionAction(
  courseId: string,
  sectionId: string,
): Promise<CourseFormActionResult> {
  if (!courseId || !sectionId) return fail("بيانات القسم غير مكتملة.");

  const access = await requireSemesterEditor(courseId);
  if (!access.ok) return access.result;

  const { data: current, error: loadError } = await access.supabase
    .from("course_semesters")
    .select("id, course_id")
    .eq("id", sectionId)
    .maybeSingle();

  if (loadError) return fail("تعذر قراءة القسم قبل الحذف.");
  if (!current || current.course_id !== courseId) {
    return fail("هذا القسم لا ينتمي للكورس المحدد.");
  }

  const { count, error: lessonsError } = await access.supabase
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("semester_id", sectionId);

  if (lessonsError) return fail("تعذر التحقق من دروس القسم قبل الحذف.");
  if ((count ?? 0) > 0) {
    return fail("لا يمكن حذف قسم يحتوي دروسًا. انقل الدروس أو احذفها أولًا.");
  }

  const { count: examCount, error: examsError } = await access.supabase
    .from("exams")
    .select("id", { count: "exact", head: true })
    .eq("semester_id", sectionId);

  if (examsError) {
    // جدول الامتحانات قد لا يكون موجودًا في بعض البيئات
    if (!String(examsError.message ?? "").toLowerCase().includes("does not exist")) {
      return fail("تعذر التحقق من امتحانات القسم قبل الحذف.");
    }
  } else if ((examCount ?? 0) > 0) {
    return fail("لا يمكن حذف قسم يحتوي امتحانات. انقل الامتحانات أو احذفها أولًا.");
  }

  const { error } = await access.supabase
    .from("course_semesters")
    .delete()
    .eq("id", sectionId)
    .eq("course_id", courseId);

  if (error) return fail("تعذر حذف القسم.");

  revalidateSemesterPaths(courseId);
  return success("تم حذف القسم الفارغ.");
}

export async function moveSemesterAction(
  courseId: string,
  semesterId: string,
  direction: "up" | "down",
): Promise<void> {
  const access = await requireSemesterEditor(courseId);
  if (!access.ok) return;

  const { data, error } = await access.supabase
    .from("course_semesters")
    .select("id, sort_order")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error || !data) return;

  const index = data.findIndex((row) => row.id === semesterId);
  if (index < 0) return;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= data.length) return;

  const ordered = [...data];
  const [moved] = ordered.splice(index, 1);
  if (!moved) return;
  ordered.splice(target, 0, moved);

  for (let i = 0; i < ordered.length; i += 1) {
    const row = ordered[i];
    if (!row || row.sort_order === i) continue;
    const { error: updateError } = await access.supabase
      .from("course_semesters")
      .update({ sort_order: i })
      .eq("id", row.id)
      .eq("course_id", courseId);
    if (updateError) return;
  }

  revalidateSemesterPaths(courseId, semesterId);
}

function parseDurationSeconds(raw: string): number | null | "invalid" {
  const value = raw.trim();
  if (!value) return null;
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 600) return "invalid";
  return Math.round(minutes * 60);
}

async function assertSemesterInCourse(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  courseId: string,
  semesterId: string,
) {
  const { data, error } = await supabase
    .from("course_semesters")
    .select("id, course_id")
    .eq("id", semesterId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

export async function createLessonAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const courseId = String(formData.get("course_id") ?? "").trim();
  const semesterId = String(formData.get("semester_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const duration = parseDurationSeconds(String(formData.get("duration_minutes") ?? ""));

  if (!courseId || !semesterId) return fail("بيانات الكورس أو الترم ناقصة.");
  if (formData.has("video_asset_id") || formData.has("is_published")) {
    return fail("لا يُقبل معرّف فيديو أو حالة نشر من المتصفح.");
  }
  if (title.length < 2) return fail("عنوان الدرس مطلوب (حرفان على الأقل).");
  if (duration === "invalid") return fail("المدة يجب أن تكون عدد دقائق بين 0 و 600.");

  const access = await requireSemesterEditor(courseId);
  if (!access.ok) return access.result;
  if (!(await assertSemesterInCourse(access.supabase, courseId, semesterId))) {
    return fail("الترم لا ينتمي لهذا الكورس.");
  }

  const { data: last, error: orderError } = await access.supabase
    .from("lessons")
    .select("sort_order")
    .eq("semester_id", semesterId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (orderError) return fail("تعذر تحديد ترتيب الدرس.");

  const { data: created, error } = await access.supabase
    .from("lessons")
    .insert({
      semester_id: semesterId,
      title,
      description,
      duration_seconds: duration,
      sort_order: last && last.length > 0 ? Number(last[0]?.sort_order ?? 0) + 1 : 0,
      is_published: false,
    })
    .select("id")
    .single();

  if (error || !created) return fail("تعذر إنشاء الدرس.");

  revalidatePath(`/admin/courses/${courseId}/semesters/${semesterId}`);
  revalidatePath(`/teacher/courses/${courseId}/semesters/${semesterId}`);
  const base =
    access.user.role === "super_admin"
      ? `/admin/courses/${courseId}/lessons/${created.id}`
      : `/teacher/courses/${courseId}/lessons/${created.id}`;
  return success("تم إنشاء الدرس كمسودة بدون فيديو.", base);
}

export async function updateLessonAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const courseId = String(formData.get("course_id") ?? "").trim();
  const semesterId = String(formData.get("semester_id") ?? "").trim();
  const lessonId = String(formData.get("lesson_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const duration = parseDurationSeconds(String(formData.get("duration_minutes") ?? ""));

  if (!courseId || !semesterId || !lessonId) return fail("بيانات الدرس ناقصة.");
  if (formData.has("video_asset_id") || formData.has("is_published")) {
    return fail("لا يُقبل معرّف فيديو أو حالة نشر من المتصفح.");
  }
  if (title.length < 2) return fail("عنوان الدرس مطلوب (حرفان على الأقل).");
  if (duration === "invalid") return fail("المدة يجب أن تكون عدد دقائق بين 0 و 600.");

  const access = await requireSemesterEditor(courseId);
  if (!access.ok) return access.result;

  const { data: lesson, error: loadError } = await access.supabase
    .from("lessons")
    .select("id, semester_id, course_semesters!inner(course_id)")
    .eq("id", lessonId)
    .eq("semester_id", semesterId)
    .maybeSingle();

  const semester = Array.isArray(lesson?.course_semesters)
    ? lesson.course_semesters[0]
    : lesson?.course_semesters;
  if (loadError || !lesson || semester?.course_id !== courseId) {
    return fail("الدرس لا ينتمي لهذا الترم والكورس.");
  }

  const { error } = await access.supabase
    .from("lessons")
    .update({ title, description, duration_seconds: duration })
    .eq("id", lessonId)
    .eq("semester_id", semesterId);

  if (error) return fail("تعذر حفظ الدرس.");

  revalidatePath(`/admin/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/teacher/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/admin/courses/${courseId}/semesters/${semesterId}`);
  revalidatePath(`/teacher/courses/${courseId}/semesters/${semesterId}`);
  return success("تم حفظ بيانات الدرس. النشر ومعرّف الفيديو لم يتغيرا.");
}

export async function moveLessonAction(
  courseId: string,
  semesterId: string,
  lessonId: string,
  direction: "up" | "down",
): Promise<void> {
  const access = await requireSemesterEditor(courseId);
  if (!access.ok) return;
  if (!(await assertSemesterInCourse(access.supabase, courseId, semesterId))) return;

  const { data, error } = await access.supabase
    .from("lessons")
    .select("id, sort_order")
    .eq("semester_id", semesterId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error || !data) return;

  const index = data.findIndex((row) => row.id === lessonId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= data.length) return;

  const ordered = [...data];
  const [moved] = ordered.splice(index, 1);
  if (!moved) return;
  ordered.splice(target, 0, moved);

  for (let i = 0; i < ordered.length; i += 1) {
    const row = ordered[i];
    if (!row || row.sort_order === i) continue;
    const { error: updateError } = await access.supabase
      .from("lessons")
      .update({ sort_order: i })
      .eq("id", row.id)
      .eq("semester_id", semesterId);
    if (updateError) return;
  }

  revalidatePath(`/admin/courses/${courseId}/semesters/${semesterId}`);
  revalidatePath(`/teacher/courses/${courseId}/semesters/${semesterId}`);
}

export async function setLessonPublishAction(
  courseId: string,
  semesterId: string,
  lessonId: string,
  publish: boolean,
): Promise<CourseFormActionResult> {
  if (!courseId || !semesterId || !lessonId) return fail("بيانات الدرس ناقصة.");

  const access = await requireSemesterEditor(courseId);
  if (!access.ok) return access.result;
  if (!(await assertSemesterInCourse(access.supabase, courseId, semesterId))) {
    return fail("الترم لا ينتمي لهذا الكورس.");
  }

  const { data: lesson, error: loadError } = await access.supabase
    .from("lessons")
    .select("id, is_published, semester_id")
    .eq("id", lessonId)
    .eq("semester_id", semesterId)
    .maybeSingle();

  if (loadError || !lesson) return fail("الدرس لا ينتمي لهذا الترم والكورس.");

  if (publish && !lesson.is_published) {
    const gate = await lessonMayBePublished(lessonId);
    if (!gate.ok) return fail(gate.message);
  }

  if (Boolean(lesson.is_published) === publish) {
    return success(publish ? "الدرس منشور بالفعل." : "الدرس مسودة بالفعل.");
  }

  const { error } = await access.supabase
    .from("lessons")
    .update({ is_published: publish })
    .eq("id", lessonId)
    .eq("semester_id", semesterId);

  if (error) return fail(publish ? "تعذر نشر الدرس." : "تعذر إلغاء نشر الدرس.");

  revalidatePath(`/admin/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/teacher/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/admin/courses/${courseId}/semesters/${semesterId}`);
  revalidatePath(`/teacher/courses/${courseId}/semesters/${semesterId}`);
  revalidatePath(`/student/courses/${courseId}`);
  revalidatePath(`/student/lessons/${lessonId}`);
  return success(
    publish
      ? "تم نشر الدرس. يظهر للطلاب المشتركين فقط بعد نشر الكورس."
      : "أُلغي نشر الدرس. لن يتمكن الطلاب من تشغيله.",
  );
}

export async function updateLessonProgressAction(): Promise<LearningMutationResult> {
  return blocked("حفظ تقدّم الدرس");
}

export async function markLessonCompleteAction(): Promise<LearningMutationResult> {
  return blocked("تعليم اكتمال الدرس");
}

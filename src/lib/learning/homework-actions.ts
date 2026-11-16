"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { createClient } from "@/lib/supabase/server";
import type { CourseFormActionResult } from "@/lib/dashboard/types";
import type { HomeworkFeedbackPolicy } from "@/lib/learning/types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message: string): CourseFormActionResult {
  return { ok: false, message };
}

function success(message: string, redirectTo?: string): CourseFormActionResult {
  return { ok: true, message, redirectTo };
}

function mapHwError(error: { code?: string; message?: string }, fallback: string) {
  const raw = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (raw.includes("not_authenticated")) return "يجب تسجيل الدخول.";
  if (raw.includes("homework_not_available")) return "الواجب غير منشور أو غير موجود.";
  if (raw.includes("homework_entitlement_required")) return "يلزم اشتراك نشط لهذا الكورس.";
  if (raw.includes("homework_not_yet_available")) return "الواجب لم يُتح بعد.";
  if (raw.includes("homework_closed")) return "انتهى موعد تسليم الواجب.";
  if (raw.includes("homework_max_attempts_reached")) return "استنفدت عدد محاولات الواجب.";
  if (raw.includes("attempt_already_closed")) return "هذه المحاولة أُغلقت مسبقًا.";
  if (raw.includes("attempt_not_found")) return "المحاولة غير موجودة.";
  if (raw.includes("homework_has_no_questions")) return "الواجب بلا أسئلة.";
  if (raw.includes("duplicate_question_answers")) return "تكرر سؤال في الإجابات.";
  if (raw.includes("selected_option_mismatch")) return "أحد الخيارات لا ينتمي لسؤاله.";
  if (raw.includes("answer_question_not_in_homework")) return "أحد الأسئلة لم يعد ضمن الواجب.";
  if (raw.includes("grading_forbidden")) return "ليست لديك صلاحية تصحيح هذا الواجب.";
  if (raw.includes("attempt_not_gradable")) return "هذه المحاولة غير قابلة للتصحيح الآن.";
  if (raw.includes("essays_incomplete")) return "يجب تصحيح كل المقالات قبل الاعتماد.";
  if (raw.includes("invalid_essay_points")) return "درجة المقال يجب أن تكون بين 0 والحد الأقصى.";
  if (raw.includes("essay_answer_not_found")) return "إجابة المقال غير موجودة.";
  if (raw.includes("42p01") || raw.includes("does not exist") || raw.includes("schema cache")) {
    return "جداول أو دوال الواجبات غير مطبّقة بعد. طبّق هجرات homework_system.";
  }
  console.error("[homework-action]", { code: error.code, message: error.message?.slice(0, 180) });
  return fallback;
}

async function requireHomeworkManager(courseId: string) {
  if (!getAuthReadiness().dbSchemaReady) {
    return { ok: false as const, result: fail("قاعدة البيانات غير جاهزة.") };
  }
  if (!UUID.test(courseId)) return { ok: false as const, result: fail("معرّف الكورس غير صالح.") };

  const user = await requireAuthenticatedUser();
  if (user.role !== "super_admin" && user.role !== "teacher") {
    return { ok: false as const, result: fail("إدارة الواجبات للمالك أو المدرّس المصرّح فقط.") };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false as const, result: fail("إعدادات Supabase غير مكتملة.") };

  if (user.role === "teacher") {
    const { data, error } = await supabase
      .from("course_staff_assignments")
      .select("can_manage_exams")
      .eq("course_id", courseId)
      .eq("teacher_id", user.userId)
      .maybeSingle();
    if (error || !data?.can_manage_exams) {
      return { ok: false as const, result: fail("ليست لديك صلاحية إدارة واجبات هذا الكورس.") };
    }
  }

  return { ok: true as const, supabase, user };
}

async function homeworkInCourse(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  courseId: string,
  homeworkId: string,
) {
  const { data, error } = await supabase
    .from("homeworks")
    .select("id, course_id, semester_id, is_published")
    .eq("id", homeworkId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

function revalidateHomework(courseId: string, homeworkId?: string) {
  revalidatePath(`/admin/homework`);
  revalidatePath(`/admin/courses/${courseId}/homework`);
  revalidatePath(`/admin/homework-grading`);
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/student/courses/${courseId}`);
  revalidatePath("/student/results");
  if (homeworkId) {
    revalidatePath(`/admin/courses/${courseId}/homework/${homeworkId}`);
    revalidatePath(`/student/homework/${homeworkId}`);
  }
}

function parseAttempts(raw: string): number | null | "invalid" {
  const value = raw.trim();
  if (value === "" || value === "unlimited") return null;
  const n = Number(value);
  if (![1, 2, 3].includes(n)) return "invalid";
  return n;
}

function parsePolicy(raw: string): HomeworkFeedbackPolicy | null {
  if (raw === "on_finalize" || raw === "after_due" || raw === "never") return raw;
  return null;
}

function parseOptionalIso(raw: string): string | null | "invalid" {
  const value = raw.trim();
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "invalid";
  return date.toISOString();
}

export async function createHomeworkDraftAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const courseId = String(formData.get("course_id") ?? "").trim();
  const semesterId = String(formData.get("semester_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const attempts = parseAttempts(String(formData.get("maxAttempts") ?? "1"));
  const availableFrom = parseOptionalIso(String(formData.get("availableFrom") ?? ""));
  const dueAt = parseOptionalIso(String(formData.get("dueAt") ?? ""));
  const policy = parsePolicy(String(formData.get("feedbackReleasePolicy") ?? "on_finalize"));

  if (title.length < 2) return fail("عنوان الواجب مطلوب.");
  if (!UUID.test(semesterId)) return fail("اختر قسم الكورس.");
  if (attempts === "invalid") return fail("عدد المحاولات: 1 أو 2 أو 3 أو غير محدود.");
  if (availableFrom === "invalid" || dueAt === "invalid") return fail("تاريخ غير صالح.");
  if (!policy) return fail("سياسة إظهار الإجابات غير صالحة.");

  const access = await requireHomeworkManager(courseId);
  if (!access.ok) return access.result;

  const { data: semester } = await access.supabase
    .from("course_semesters")
    .select("id")
    .eq("id", semesterId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!semester) return fail("القسم لا ينتمي لهذا الكورس.");

  const { data: created, error } = await access.supabase
    .from("homeworks")
    .insert({
      course_id: courseId,
      semester_id: semesterId,
      title,
      description,
      max_attempts: attempts,
      available_from: availableFrom,
      due_at: dueAt,
      feedback_release_policy: policy,
      is_published: false,
    })
    .select("id")
    .single();

  if (error || !created) return fail(mapHwError(error ?? {}, "تعذر إنشاء الواجب."));

  revalidateHomework(courseId, created.id);
  return success(
    "تم إنشاء الواجب كمسودة.",
    `/admin/courses/${courseId}/homework/${created.id}`,
  );
}

export async function updateHomeworkSettingsAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const courseId = String(formData.get("course_id") ?? "").trim();
  const homeworkId = String(formData.get("homework_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const attempts = parseAttempts(String(formData.get("maxAttempts") ?? "1"));
  const availableFrom = parseOptionalIso(String(formData.get("availableFrom") ?? ""));
  const dueAt = parseOptionalIso(String(formData.get("dueAt") ?? ""));
  const policy = parsePolicy(String(formData.get("feedbackReleasePolicy") ?? "on_finalize"));

  if (!UUID.test(homeworkId)) return fail("معرّف الواجب غير صالح.");
  if (title.length < 2) return fail("عنوان الواجب مطلوب.");
  if (attempts === "invalid") return fail("عدد المحاولات: 1 أو 2 أو 3 أو غير محدود.");
  if (availableFrom === "invalid" || dueAt === "invalid") return fail("تاريخ غير صالح.");
  if (!policy) return fail("سياسة إظهار الإجابات غير صالحة.");

  const access = await requireHomeworkManager(courseId);
  if (!access.ok) return access.result;
  if (!(await homeworkInCourse(access.supabase, courseId, homeworkId))) {
    return fail("الواجب لا ينتمي لهذا الكورس.");
  }

  const { error } = await access.supabase
    .from("homeworks")
    .update({
      title,
      description,
      max_attempts: attempts,
      available_from: availableFrom,
      due_at: dueAt,
      feedback_release_policy: policy,
    })
    .eq("id", homeworkId)
    .eq("course_id", courseId);

  if (error) return fail(mapHwError(error, "تعذر حفظ إعدادات الواجب."));
  revalidateHomework(courseId, homeworkId);
  return success("تم حفظ إعدادات الواجب.");
}

export async function setHomeworkPublishAction(
  courseId: string,
  homeworkId: string,
  publish: boolean,
): Promise<CourseFormActionResult> {
  if (!UUID.test(homeworkId)) return fail("معرّف الواجب غير صالح.");
  const access = await requireHomeworkManager(courseId);
  if (!access.ok) return access.result;
  if (!(await homeworkInCourse(access.supabase, courseId, homeworkId))) {
    return fail("الواجب لا ينتمي لهذا الكورس.");
  }

  if (publish) {
    const { data: questions, error } = await access.supabase
      .from("homework_questions")
      .select("id, question_type, homework_options(id, is_correct, option_text)")
      .eq("homework_id", homeworkId);
    if (error) return fail(mapHwError(error, "تعذر التحقق من أسئلة الواجب."));
    if (!questions || questions.length === 0) return fail("أضف سؤالًا واحدًا على الأقل قبل النشر.");
    for (const question of questions) {
      const type = question.question_type ?? "mcq";
      const options = Array.isArray(question.homework_options) ? question.homework_options : [];
      const filled = options.filter((option) => option.option_text.trim().length > 0);
      const correct = filled.filter((option) => option.is_correct).length;
      if (type === "essay") {
        if (filled.length > 0) return fail("الأسئلة المقالية لا يجب أن تحتوي على خيارات.");
        continue;
      }
      if (type === "true_false") {
        if (filled.length !== 2 || correct !== 1) {
          return fail("أسئلة صح/خطأ تحتاج خيارين وإجابة صحيحة واحدة.");
        }
        continue;
      }
      if (filled.length < 2 || correct !== 1) {
        return fail("أسئلة الاختيار تحتاج خيارين على الأقل وإجابة صحيحة واحدة.");
      }
    }
  }

  const { error } = await access.supabase
    .from("homeworks")
    .update({ is_published: publish })
    .eq("id", homeworkId)
    .eq("course_id", courseId);
  if (error) return fail(mapHwError(error, publish ? "تعذر نشر الواجب." : "تعذر إلغاء النشر."));
  revalidateHomework(courseId, homeworkId);
  return success(publish ? "تم نشر الواجب." : "أُلغي نشر الواجب.");
}

export async function deleteHomeworkAction(
  courseId: string,
  homeworkId: string,
): Promise<CourseFormActionResult> {
  if (!UUID.test(homeworkId)) return fail("معرّف الواجب غير صالح.");
  const access = await requireHomeworkManager(courseId);
  if (!access.ok) return access.result;

  const { count, error: countError } = await access.supabase
    .from("homework_attempts")
    .select("id", { count: "exact", head: true })
    .eq("homework_id", homeworkId);
  if (countError) return fail(mapHwError(countError, "تعذر التحقق من محاولات الواجب."));
  if ((count ?? 0) > 0) {
    return fail("لا يمكن حذف واجب لديه محاولات طلاب. ألغِ النشر بدلًا من الحذف.");
  }

  const { error } = await access.supabase
    .from("homeworks")
    .delete()
    .eq("id", homeworkId)
    .eq("course_id", courseId);
  if (error) return fail(mapHwError(error, "تعذر حذف الواجب."));
  revalidateHomework(courseId);
  return success("تم حذف الواجب.", `/admin/courses/${courseId}/homework`);
}

export async function upsertHomeworkQuestionAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const courseId = String(formData.get("course_id") ?? "").trim();
  const homeworkId = String(formData.get("homework_id") ?? "").trim();
  const questionId = String(formData.get("question_id") ?? "").trim();
  const questionText = String(formData.get("questionText") ?? "").trim();
  const points = Number(formData.get("points") ?? "1");
  const questionTypeRaw = String(formData.get("question_type") ?? "mcq").trim();
  const questionType =
    questionTypeRaw === "true_false" || questionTypeRaw === "essay" || questionTypeRaw === "mcq"
      ? questionTypeRaw
      : null;
  const modelAnswer = String(formData.get("modelAnswer") ?? "").trim();
  const optionCount = Number(formData.get("option_count") ?? "4");
  const correctIndex = Number(formData.get("correctOption"));

  if (!UUID.test(homeworkId)) return fail("معرّف الواجب غير صالح.");
  if (!questionType) return fail("نوع السؤال غير صالح.");
  if (questionText.length < 2) return fail("نص السؤال مطلوب.");
  if (!Number.isFinite(points) || points <= 0 || points > 100) {
    return fail("درجات السؤال بين 0.01 و 100.");
  }

  let options: string[] = [];
  if (questionType === "mcq") {
    const count = Number.isInteger(optionCount) ? Math.min(6, Math.max(2, optionCount)) : 4;
    options = Array.from({ length: count }, (_, index) =>
      String(formData.get(`option_${index}`) ?? "").trim(),
    );
    if (!options.every((option) => option.length > 0)) return fail("أدخل نصًا لكل خيار.");
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      return fail("اختر إجابة صحيحة واحدة.");
    }
  } else if (questionType === "true_false") {
    options = ["صح", "خطأ"];
    if (![0, 1].includes(correctIndex)) return fail("اختر صح أو خطأ كإجابة صحيحة.");
  }

  const access = await requireHomeworkManager(courseId);
  if (!access.ok) return access.result;
  if (!(await homeworkInCourse(access.supabase, courseId, homeworkId))) {
    return fail("الواجب لا ينتمي لهذا الكورس.");
  }

  let savedId = questionId;
  if (questionId) {
    if (!UUID.test(questionId)) return fail("معرّف السؤال غير صالح.");
    const { error } = await access.supabase
      .from("homework_questions")
      .update({
        question_text: questionText,
        points,
        question_type: questionType,
      })
      .eq("id", questionId)
      .eq("homework_id", homeworkId);
    if (error) return fail(mapHwError(error, "تعذر تحديث السؤال."));
    await access.supabase.from("homework_options").delete().eq("question_id", questionId);
  } else {
    const { data: last } = await access.supabase
      .from("homework_questions")
      .select("sort_order")
      .eq("homework_id", homeworkId)
      .order("sort_order", { ascending: false })
      .limit(1);
    const sortOrder = last && last.length > 0 ? Number(last[0]?.sort_order ?? 0) + 1 : 0;
    const { data: created, error } = await access.supabase
      .from("homework_questions")
      .insert({
        homework_id: homeworkId,
        question_text: questionText,
        points,
        sort_order: sortOrder,
        question_type: questionType,
      })
      .select("id")
      .single();
    if (error || !created) return fail(mapHwError(error ?? {}, "تعذر إضافة السؤال."));
    savedId = created.id;
  }

  if (questionType !== "essay") {
    const { error: optionsError } = await access.supabase.from("homework_options").insert(
      options.map((optionText, index) => ({
        question_id: savedId,
        option_text: optionText,
        is_correct: index === correctIndex,
        sort_order: index,
      })),
    );
    if (optionsError) return fail(mapHwError(optionsError, "تعذر حفظ الخيارات."));
  }

  if (questionType === "essay") {
    if (modelAnswer) {
      const { error: guideError } = await access.supabase
        .from("homework_question_guides")
        .upsert({ question_id: savedId, model_answer: modelAnswer });
      if (guideError) return fail(mapHwError(guideError, "تعذر حفظ نموذج الإجابة."));
    } else {
      await access.supabase.from("homework_question_guides").delete().eq("question_id", savedId);
    }
  } else {
    await access.supabase.from("homework_question_guides").delete().eq("question_id", savedId);
  }

  revalidateHomework(courseId, homeworkId);
  return success(questionId ? "تم حفظ السؤال." : "تمت إضافة السؤال.");
}

export async function deleteHomeworkQuestionAction(
  courseId: string,
  homeworkId: string,
  questionId: string,
): Promise<CourseFormActionResult> {
  if (!UUID.test(homeworkId) || !UUID.test(questionId)) return fail("بيانات السؤال غير صالحة.");
  const access = await requireHomeworkManager(courseId);
  if (!access.ok) return access.result;
  const { error } = await access.supabase
    .from("homework_questions")
    .delete()
    .eq("id", questionId)
    .eq("homework_id", homeworkId);
  if (error) return fail(mapHwError(error, "تعذر حذف السؤال."));
  revalidateHomework(courseId, homeworkId);
  return success("تم حذف السؤال.");
}

export async function moveHomeworkQuestionAction(
  courseId: string,
  homeworkId: string,
  questionId: string,
  direction: "up" | "down",
): Promise<CourseFormActionResult> {
  const access = await requireHomeworkManager(courseId);
  if (!access.ok) return access.result;

  const { data, error } = await access.supabase
    .from("homework_questions")
    .select("id, sort_order")
    .eq("homework_id", homeworkId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error || !data) return fail("تعذر ترتيب الأسئلة.");

  const index = data.findIndex((row) => row.id === questionId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= data.length) return success("لا تغيير في الترتيب.");

  const ordered = [...data];
  const [moved] = ordered.splice(index, 1);
  if (!moved) return fail("تعذر نقل السؤال.");
  ordered.splice(target, 0, moved);

  for (let i = 0; i < ordered.length; i += 1) {
    const row = ordered[i];
    if (!row || row.sort_order === i) continue;
    const { error: updateError } = await access.supabase
      .from("homework_questions")
      .update({ sort_order: i })
      .eq("id", row.id)
      .eq("homework_id", homeworkId);
    if (updateError) return fail(mapHwError(updateError, "تعذر حفظ الترتيب."));
  }

  revalidateHomework(courseId, homeworkId);
  return success("تم تحديث ترتيب الأسئلة.");
}

export async function startHomeworkAttemptAction(
  homeworkId: string,
): Promise<CourseFormActionResult & { attemptId?: string }> {
  if (!UUID.test(homeworkId)) return fail("معرّف الواجب غير صالح.");
  if (!getAuthReadiness().dbSchemaReady) return fail("قاعدة البيانات غير جاهزة.");
  await requireAuthenticatedUser();
  const supabase = await createClient();
  if (!supabase) return fail("إعدادات Supabase غير مكتملة.");

  const { data, error } = await supabase.rpc("start_homework_attempt", {
    p_homework_id: homeworkId,
  });
  if (error || !data) return fail(mapHwError(error ?? {}, "تعذر بدء محاولة الواجب."));
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath(`/student/homework/${homeworkId}`);
  return { ok: true, message: "تم بدء المحاولة.", attemptId: row?.attempt_id };
}

export async function submitHomeworkAttemptAction(input: {
  homeworkId: string;
  attemptId: string;
  answers: Array<{
    questionId: string;
    selectedOptionId?: string | null;
    essayText?: string | null;
  }>;
}): Promise<
  CourseFormActionResult & {
    score?: number | null;
    gradingStatus?: string | null;
  }
> {
  if (!UUID.test(input.homeworkId) || !UUID.test(input.attemptId)) {
    return fail("بيانات التسليم غير صالحة.");
  }
  if (!getAuthReadiness().dbSchemaReady) return fail("قاعدة البيانات غير جاهزة.");
  await requireAuthenticatedUser();
  const supabase = await createClient();
  if (!supabase) return fail("إعدادات Supabase غير مكتملة.");

  const payload = input.answers.map((answer) => ({
    question_id: answer.questionId,
    selected_option_id: answer.selectedOptionId ?? null,
    essay_text: answer.essayText ?? null,
  }));

  const { data, error } = await supabase.rpc("submit_homework_attempt", {
    p_attempt_id: input.attemptId,
    p_answers: payload,
  });
  if (error) return fail(mapHwError(error, "تعذر تسليم الواجب."));
  const row = Array.isArray(data) ? data[0] : data;
  const gradingStatus = row?.grading_status ?? "not_applicable";
  revalidatePath(`/student/homework/${input.homeworkId}`);
  revalidatePath("/student/results");
  revalidatePath("/admin/homework-grading");
  return {
    ok: true,
    message:
      gradingStatus === "awaiting_essay"
        ? "تم تسليم الواجب بنجاح، وجارٍ تصحيح الأسئلة المقالية."
        : "تم تسليم الواجب.",
    score: row?.score == null ? null : Number(row.score),
    gradingStatus,
  };
}

export async function saveHomeworkEssayGradesDraftAction(input: {
  attemptId: string;
  courseId: string;
  grades: Array<{
    answerId: string;
    awardedPoints: number;
    teacherFeedback: string;
  }>;
}): Promise<CourseFormActionResult> {
  if (!UUID.test(input.attemptId) || !UUID.test(input.courseId)) {
    return fail("بيانات التصحيح غير صالحة.");
  }
  const access = await requireHomeworkManager(input.courseId);
  if (!access.ok) return access.result;

  const payload = input.grades
    .filter((grade) => UUID.test(grade.answerId))
    .map((grade) => ({
      answer_id: grade.answerId,
      awarded_points: grade.awardedPoints,
      teacher_feedback: grade.teacherFeedback,
    }));
  if (payload.length === 0) return fail("لا توجد درجات لحفظها.");

  const { error } = await access.supabase.rpc("save_homework_essay_grades_draft", {
    p_attempt_id: input.attemptId,
    p_grades: payload,
  });
  if (error) return fail(mapHwError(error, "تعذر حفظ مسودة تصحيح الواجب."));
  revalidatePath("/admin/homework-grading");
  revalidatePath(`/admin/homework-grading/${input.attemptId}`);
  return success("تم حفظ مسودة تصحيح الواجب.");
}

export async function finalizeHomeworkGradingAction(
  attemptId: string,
  courseId: string,
): Promise<CourseFormActionResult> {
  if (!UUID.test(attemptId) || !UUID.test(courseId)) {
    return fail("بيانات الاعتماد غير صالحة.");
  }
  const access = await requireHomeworkManager(courseId);
  if (!access.ok) return access.result;

  const { data, error } = await access.supabase.rpc("finalize_homework_grading", {
    p_attempt_id: attemptId,
  });
  if (error) return fail(mapHwError(error, "تعذر اعتماد تصحيح الواجب."));
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/admin/homework-grading");
  revalidatePath(`/admin/homework-grading/${attemptId}`);
  revalidatePath("/student/results");
  return success(
    `تم اعتماد تصحيح الواجب. الدرجة النهائية ${row?.score ?? "—"}%.`,
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { createClient } from "@/lib/supabase/server";
import type { CourseFormActionResult } from "@/lib/dashboard/types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message: string): CourseFormActionResult {
  return { ok: false, message };
}

function success(message: string, redirectTo?: string): CourseFormActionResult {
  return { ok: true, message, redirectTo };
}

function mapExamError(error: { code?: string; message?: string }, fallback: string) {
  const raw = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (raw.includes("42p01") || raw.includes("does not exist") || raw.includes("schema cache")) {
    return "جداول الامتحانات غير مطبّقة على قاعدة البيانات بعد.";
  }
  if (raw.includes("exam_not_available")) return "الامتحان غير منشور أو غير موجود.";
  if (raw.includes("exam_entitlement_required")) return "لا يوجد اشتراك نشط يخوّلك هذا الامتحان.";
  if (raw.includes("exam_max_attempts_reached")) return "استنفدت عدد المحاولات المسموح.";
  if (raw.includes("attempt_already_closed")) return "هذه المحاولة أُغلقت مسبقًا.";
  if (raw.includes("attempt_not_found")) return "المحاولة غير موجودة أو ليست لك.";
  if (raw.includes("exam_has_no_questions")) return "الامتحان بلا أسئلة.";
  if (raw.includes("duplicate_question_answers")) return "تكرر سؤال في الإجابات.";
  if (raw.includes("selected_option_mismatch")) return "أحد الخيارات لا ينتمي لسؤاله.";
  if (raw.includes("exam_create_forbidden") || raw.includes("exam_update_forbidden") || raw.includes("exam_publish_forbidden")) {
    return "ليست لديك صلاحية إدارة امتحانات هذا الكورس.";
  }
  if (raw.includes("exam_lesson_semester_mismatch")) return "الدرس لا ينتمي للترم المختار.";
  if (raw.includes("exam_options_one_correct")) return "كل سؤال يجب أن يملك إجابة صحيحة واحدة فقط.";
  console.error("[exam-action]", { code: error.code, message: error.message?.slice(0, 180) });
  return fallback;
}

async function requireExamManager(courseId: string) {
  if (!getAuthReadiness().dbSchemaReady) {
    return { ok: false as const, result: fail("قاعدة البيانات غير جاهزة.") };
  }
  if (!UUID.test(courseId)) return { ok: false as const, result: fail("معرّف الكورس غير صالح.") };

  const user = await requireAuthenticatedUser();
  if (user.role !== "super_admin" && user.role !== "teacher") {
    return { ok: false as const, result: fail("إدارة الامتحانات للمالك أو المدرّس المصرّح فقط.") };
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
      return { ok: false as const, result: fail("ليست لديك صلاحية إدارة امتحانات هذا الكورس.") };
    }
  }

  return { ok: true as const, supabase, user };
}

async function examInCourse(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  courseId: string,
  examId: string,
) {
  const { data, error } = await supabase
    .from("exams")
    .select("id, semester_id, lesson_id, is_published, course_semesters!inner(course_id)")
    .eq("id", examId)
    .maybeSingle();
  if (error || !data) return null;
  const semester = Array.isArray(data.course_semesters)
    ? data.course_semesters[0]
    : data.course_semesters;
  if (semester?.course_id !== courseId) return null;
  return data;
}

function revalidateExam(courseId: string, examId?: string) {
  revalidatePath(`/admin/courses/${courseId}/exams`);
  revalidatePath(`/teacher/courses/${courseId}/exams`);
  revalidatePath(`/student/courses/${courseId}`);
  revalidatePath("/student/results");
  if (examId) {
    revalidatePath(`/admin/courses/${courseId}/exams/${examId}`);
    revalidatePath(`/teacher/courses/${courseId}/exams/${examId}`);
    revalidatePath(`/student/exams/${examId}`);
  }
}

export async function createExamDraftAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const courseId = String(formData.get("course_id") ?? "").trim();
  const semesterId = String(formData.get("semester_id") ?? "").trim();
  const lessonId = String(formData.get("lesson_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const durationRaw = String(formData.get("durationMinutes") ?? "").trim();
  const passingRaw = String(formData.get("passingScore") ?? "50").trim();
  const attemptsRaw = String(formData.get("maxAttempts") ?? "").trim();

  if (title.length < 2) return fail("عنوان الامتحان مطلوب.");
  if (!UUID.test(semesterId)) return fail("اختر الترم الذي ينتمي إليه الامتحان.");
  if (lessonId && !UUID.test(lessonId)) return fail("معرّف الدرس غير صالح.");

  const duration = durationRaw === "" ? null : Number(durationRaw);
  if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 600)) {
    return fail("المدة يجب أن تكون دقائق بين 1 و 600، أو تُترك فارغة.");
  }
  const passing = Number(passingRaw);
  if (!Number.isFinite(passing) || passing < 0 || passing > 100) {
    return fail("درجة النجاح نسبة بين 0 و 100.");
  }
  const maxAttempts = attemptsRaw === "" ? null : Number(attemptsRaw);
  if (maxAttempts !== null && (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20)) {
    return fail("عدد المحاولات عدد صحيح بين 1 و 20، أو فارغ لغير المحدود.");
  }

  const access = await requireExamManager(courseId);
  if (!access.ok) return access.result;

  if (lessonId) {
    const { data: lesson } = await access.supabase
      .from("lessons")
      .select("id, semester_id")
      .eq("id", lessonId)
      .eq("semester_id", semesterId)
      .maybeSingle();
    if (!lesson) return fail("الدرس لا ينتمي لهذا الترم.");
  } else {
    const { data: semester } = await access.supabase
      .from("course_semesters")
      .select("id")
      .eq("id", semesterId)
      .eq("course_id", courseId)
      .maybeSingle();
    if (!semester) return fail("الترم لا ينتمي لهذا الكورس.");
  }

  const { data: created, error } = await access.supabase
    .from("exams")
    .insert({
      title,
      description,
      semester_id: semesterId,
      lesson_id: lessonId || null,
      duration_minutes: duration,
      passing_score: passing,
      max_attempts: maxAttempts,
      is_published: false,
    })
    .select("id")
    .single();

  if (error || !created) return fail(mapExamError(error ?? {}, "تعذر إنشاء الامتحان."));

  const base =
    access.user.role === "super_admin"
      ? `/admin/courses/${courseId}/exams/${created.id}`
      : `/teacher/courses/${courseId}/exams/${created.id}`;
  revalidateExam(courseId, created.id);
  return success("تم إنشاء الامتحان كمسودة.", base);
}

export async function updateExamSettingsAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const courseId = String(formData.get("course_id") ?? "").trim();
  const examId = String(formData.get("exam_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const durationRaw = String(formData.get("durationMinutes") ?? "").trim();
  const passingRaw = String(formData.get("passingScore") ?? "").trim();
  const attemptsRaw = String(formData.get("maxAttempts") ?? "").trim();

  if (!UUID.test(examId)) return fail("معرّف الامتحان غير صالح.");
  if (title.length < 2) return fail("عنوان الامتحان مطلوب.");

  const duration = durationRaw === "" ? null : Number(durationRaw);
  if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 600)) {
    return fail("المدة يجب أن تكون دقائق بين 1 و 600، أو تُترك فارغة.");
  }
  const passing = Number(passingRaw);
  if (!Number.isFinite(passing) || passing < 0 || passing > 100) {
    return fail("درجة النجاح نسبة بين 0 و 100.");
  }
  const maxAttempts = attemptsRaw === "" ? null : Number(attemptsRaw);
  if (maxAttempts !== null && (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20)) {
    return fail("عدد المحاولات عدد صحيح بين 1 و 20، أو فارغ.");
  }

  const access = await requireExamManager(courseId);
  if (!access.ok) return access.result;
  const exam = await examInCourse(access.supabase, courseId, examId);
  if (!exam) return fail("الامتحان لا ينتمي لهذا الكورس.");

  const { error } = await access.supabase
    .from("exams")
    .update({
      title,
      description,
      duration_minutes: duration,
      passing_score: passing,
      max_attempts: maxAttempts,
    })
    .eq("id", examId);

  if (error) return fail(mapExamError(error, "تعذر حفظ إعدادات الامتحان."));
  revalidateExam(courseId, examId);
  return success("تم حفظ إعدادات الامتحان.");
}

export async function setExamPublishAction(
  courseId: string,
  examId: string,
  publish: boolean,
): Promise<CourseFormActionResult> {
  if (!UUID.test(examId)) return fail("معرّف الامتحان غير صالح.");
  const access = await requireExamManager(courseId);
  if (!access.ok) return access.result;
  const exam = await examInCourse(access.supabase, courseId, examId);
  if (!exam) return fail("الامتحان لا ينتمي لهذا الكورس.");

  if (publish) {
    const { data: questions, error } = await access.supabase
      .from("exam_questions")
      .select("id, exam_options(id, is_correct, option_text)")
      .eq("exam_id", examId);
    if (error) return fail(mapExamError(error, "تعذر التحقق من أسئلة الامتحان."));
    if (!questions || questions.length === 0) return fail("أضف سؤالًا واحدًا على الأقل قبل النشر.");
    for (const question of questions) {
      const options = Array.isArray(question.exam_options) ? question.exam_options : [];
      const filled = options.filter((option) => option.option_text.trim().length > 0);
      const correct = filled.filter((option) => option.is_correct).length;
      if (filled.length !== 4 || correct !== 1) {
        return fail("كل سؤال يجب أن يحتوي على 4 خيارات وإجابة صحيحة واحدة قبل النشر.");
      }
    }
  }

  const { error } = await access.supabase
    .from("exams")
    .update({ is_published: publish })
    .eq("id", examId);
  if (error) return fail(mapExamError(error, publish ? "تعذر نشر الامتحان." : "تعذر إلغاء النشر."));
  revalidateExam(courseId, examId);
  return success(publish ? "تم نشر الامتحان للطلاب المشتركين." : "أُلغي نشر الامتحان.");
}

export async function upsertExamQuestionAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const courseId = String(formData.get("course_id") ?? "").trim();
  const examId = String(formData.get("exam_id") ?? "").trim();
  const questionId = String(formData.get("question_id") ?? "").trim();
  const questionText = String(formData.get("questionText") ?? "").trim();
  const points = Number(formData.get("points") ?? "1");
  const correctIndex = Number(formData.get("correctOption"));
  const options = [0, 1, 2, 3].map((index) => String(formData.get(`option_${index}`) ?? "").trim());

  if (!UUID.test(examId)) return fail("معرّف الامتحان غير صالح.");
  if (questionText.length < 2) return fail("نص السؤال مطلوب.");
  if (!Number.isFinite(points) || points <= 0 || points > 100) return fail("درجات السؤال بين 0.01 و 100.");
  if (!options.every((option) => option.length > 0)) return fail("أدخل 4 خيارات غير فارغة.");
  if (![0, 1, 2, 3].includes(correctIndex)) return fail("اختر إجابة صحيحة واحدة.");

  const access = await requireExamManager(courseId);
  if (!access.ok) return access.result;
  if (!(await examInCourse(access.supabase, courseId, examId))) {
    return fail("الامتحان لا ينتمي لهذا الكورس.");
  }

  let savedId = questionId;
  if (questionId) {
    if (!UUID.test(questionId)) return fail("معرّف السؤال غير صالح.");
    const { error } = await access.supabase
      .from("exam_questions")
      .update({ question_text: questionText, points })
      .eq("id", questionId)
      .eq("exam_id", examId);
    if (error) return fail(mapExamError(error, "تعذر تحديث السؤال."));
    const { error: deleteError } = await access.supabase
      .from("exam_options")
      .delete()
      .eq("question_id", questionId);
    if (deleteError) return fail(mapExamError(deleteError, "تعذر تحديث الخيارات."));
  } else {
    const { data: last } = await access.supabase
      .from("exam_questions")
      .select("sort_order")
      .eq("exam_id", examId)
      .order("sort_order", { ascending: false })
      .limit(1);
    const sortOrder = last && last.length > 0 ? Number(last[0]?.sort_order ?? 0) + 1 : 0;
    const { data: created, error } = await access.supabase
      .from("exam_questions")
      .insert({ exam_id: examId, question_text: questionText, points, sort_order: sortOrder })
      .select("id")
      .single();
    if (error || !created) return fail(mapExamError(error ?? {}, "تعذر إضافة السؤال."));
    savedId = created.id;
  }

  const { error: optionsError } = await access.supabase.from("exam_options").insert(
    options.map((optionText, index) => ({
      question_id: savedId,
      option_text: optionText,
      is_correct: index === correctIndex,
      sort_order: index,
    })),
  );
  if (optionsError) return fail(mapExamError(optionsError, "تعذر حفظ الخيارات."));

  revalidateExam(courseId, examId);
  return success(questionId ? "تم حفظ السؤال." : "تمت إضافة السؤال.");
}

export async function deleteExamQuestionAction(
  courseId: string,
  examId: string,
  questionId: string,
): Promise<CourseFormActionResult> {
  if (!UUID.test(examId) || !UUID.test(questionId)) return fail("بيانات السؤال غير صالحة.");
  const access = await requireExamManager(courseId);
  if (!access.ok) return access.result;
  if (!(await examInCourse(access.supabase, courseId, examId))) {
    return fail("الامتحان لا ينتمي لهذا الكورس.");
  }
  const { error } = await access.supabase
    .from("exam_questions")
    .delete()
    .eq("id", questionId)
    .eq("exam_id", examId);
  if (error) return fail(mapExamError(error, "تعذر حذف السؤال."));
  revalidateExam(courseId, examId);
  return success("تم حذف السؤال.");
}

export async function moveExamQuestionAction(
  courseId: string,
  examId: string,
  questionId: string,
  direction: "up" | "down",
): Promise<CourseFormActionResult> {
  if (!UUID.test(examId) || !UUID.test(questionId)) return fail("بيانات السؤال غير صالحة.");
  const access = await requireExamManager(courseId);
  if (!access.ok) return access.result;
  if (!(await examInCourse(access.supabase, courseId, examId))) {
    return fail("الامتحان لا ينتمي لهذا الكورس.");
  }

  const { data, error } = await access.supabase
    .from("exam_questions")
    .select("id, sort_order")
    .eq("exam_id", examId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error || !data) return fail("تعذر قراءة ترتيب الأسئلة.");

  const index = data.findIndex((row) => row.id === questionId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= data.length) return success("الترتيب كما هو.");

  const current = data[index];
  const neighbor = data[target];
  if (!current || !neighbor) return fail("تعذر تحريك السؤال.");

  const { error: first } = await access.supabase
    .from("exam_questions")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", current.id);
  const { error: second } = await access.supabase
    .from("exam_questions")
    .update({ sort_order: current.sort_order })
    .eq("id", neighbor.id);
  if (first || second) return fail("تعذر حفظ الترتيب.");

  revalidateExam(courseId, examId);
  return success("تم تحديث ترتيب السؤال.");
}

export type ExamTakeResult = CourseFormActionResult & {
  attemptId?: string;
  endsAt?: string | null;
  score?: number | null;
  passed?: boolean | null;
  status?: string;
};

export async function startExamAttemptAction(examId: string): Promise<ExamTakeResult> {
  if (!getAuthReadiness().dbSchemaReady) return fail("قاعدة البيانات غير جاهزة.");
  if (!UUID.test(examId)) return fail("معرّف الامتحان غير صالح.");
  const user = await requireAuthenticatedUser();
  if (user.role !== "student") return fail("أداء الامتحان متاح للطلاب فقط.");

  const supabase = await createClient();
  if (!supabase) return fail("إعدادات Supabase غير مكتملة.");

  const { data, error } = await supabase.rpc("start_exam_attempt", { p_exam_id: examId });
  if (error || !data) return fail(mapExamError(error ?? {}, "تعذر بدء المحاولة."));

  const { data: attempt } = await supabase
    .from("exam_attempts")
    .select("id, ends_at, status")
    .eq("id", data)
    .maybeSingle();

  revalidatePath(`/student/exams/${examId}`);
  return {
    ok: true,
    message: "بدأت المحاولة. الوقت يُحسب على الخادم.",
    attemptId: data,
    endsAt: attempt?.ends_at ?? null,
    status: attempt?.status ?? "in_progress",
  };
}

export async function submitExamAttemptAction(input: {
  examId: string;
  attemptId: string;
  answers: Array<{ questionId: string; optionId: string }>;
}): Promise<ExamTakeResult> {
  if (!getAuthReadiness().dbSchemaReady) return fail("قاعدة البيانات غير جاهزة.");
  if (!UUID.test(input.examId) || !UUID.test(input.attemptId)) return fail("بيانات المحاولة غير صالحة.");
  const user = await requireAuthenticatedUser();
  if (user.role !== "student") return fail("تسليم الامتحان متاح للطلاب فقط.");

  const payload = input.answers
    .filter((answer) => UUID.test(answer.questionId) && UUID.test(answer.optionId))
    .map((answer) => ({
      question_id: answer.questionId,
      selected_option_id: answer.optionId,
    }));

  const supabase = await createClient();
  if (!supabase) return fail("إعدادات Supabase غير مكتملة.");

  const { data, error } = await supabase.rpc("submit_exam_attempt", {
    p_attempt_id: input.attemptId,
    p_answers: payload,
  });
  if (error) return fail(mapExamError(error, "تعذر تسليم الامتحان."));

  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath(`/student/exams/${input.examId}`);
  revalidatePath("/student/results");
  const status = row?.status ?? "submitted";
  const score = row?.score == null ? null : Number(row.score);
  return {
    ok: true,
    message:
      status === "expired"
        ? "انتهى وقت الامتحان على الخادم. سُجّلت المحاولة منتهية."
        : `تم التسليم. درجتك ${score ?? 0}%${row?.passed ? " — ناجح" : " — لم تبلغ درجة النجاح"}.`,
    attemptId: input.attemptId,
    score,
    passed: row?.passed ?? null,
    status,
  };
}

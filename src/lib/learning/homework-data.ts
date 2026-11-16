import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAuthReadiness } from "@/lib/auth/readiness";
import type {
  ExamQuestionEditorView,
  HomeworkAttemptSummary,
  HomeworkEditorView,
  HomeworkGradingQueueItem,
  HomeworkListItem,
  HomeworkTakingView,
  LearningQueryResult,
} from "@/lib/learning/types";

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
    message: detail ?? "تعذر قراءة بيانات الواجبات.",
    data,
  };
}

function mapPolicy(
  value: string | null | undefined,
): HomeworkListItem["feedbackReleasePolicy"] {
  if (value === "after_due" || value === "never" || value === "on_finalize") {
    return value;
  }
  return "on_finalize";
}

export async function listCourseHomeworks(
  courseId: string,
): Promise<LearningQueryResult<HomeworkListItem[]>> {
  if (!getAuthReadiness().dbSchemaReady) return setupResult([]);
  const supabase = await createClient();
  if (!supabase) return unavailableResult([]);

  const { data, error } = await supabase
    .from("homeworks")
    .select(
      "id, course_id, semester_id, title, description, max_attempts, available_from, due_at, feedback_release_policy, is_published, homework_questions(id, points)",
    )
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  if (error) {
    if (String(error.message ?? "").toLowerCase().includes("does not exist")) {
      return setupResult([]);
    }
    return unavailableResult([]);
  }

  return {
    availability: "ready",
    message: "تم جلب الواجبات.",
    data: (data ?? []).map((row) => {
      const questions = Array.isArray(row.homework_questions)
        ? row.homework_questions
        : [];
      return {
        id: row.id,
        courseId: row.course_id,
        semesterId: row.semester_id,
        title: row.title,
        description: row.description ?? "",
        maxAttempts: row.max_attempts,
        availableFrom: row.available_from,
        dueAt: row.due_at,
        feedbackReleasePolicy: mapPolicy(row.feedback_release_policy),
        isPublished: Boolean(row.is_published),
        questionsCount: questions.length,
        totalPoints: questions.reduce(
          (sum, question) => sum + Number(question.points ?? 0),
          0,
        ),
      };
    }),
  };
}

export async function getHomeworkEditorData(
  courseId: string,
  homeworkId: string,
): Promise<LearningQueryResult<HomeworkEditorView | null>> {
  if (!getAuthReadiness().dbSchemaReady) return setupResult(null);
  const supabase = await createClient();
  if (!supabase) return unavailableResult(null);

  const { data, error } = await supabase
    .from("homeworks")
    .select(
      "id, course_id, semester_id, title, description, max_attempts, available_from, due_at, feedback_release_policy, is_published, courses!inner(title), course_semesters!inner(title), homework_questions(id, question_text, question_type, sort_order, points, homework_options(id, option_text, is_correct, sort_order), homework_question_guides(model_answer))",
    )
    .eq("id", homeworkId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (error) {
    if (String(error.message ?? "").toLowerCase().includes("does not exist")) {
      return setupResult(null);
    }
    return unavailableResult(null);
  }
  if (!data) return { availability: "empty", message: "الواجب غير موجود.", data: null };

  const course = Array.isArray(data.courses) ? data.courses[0] : data.courses;
  const semester = Array.isArray(data.course_semesters)
    ? data.course_semesters[0]
    : data.course_semesters;
  const questionsRaw = Array.isArray(data.homework_questions)
    ? data.homework_questions
    : [];
  const questions: ExamQuestionEditorView[] = questionsRaw
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((question) => {
      const options = Array.isArray(question.homework_options)
        ? question.homework_options
        : [];
      const guide = Array.isArray(question.homework_question_guides)
        ? question.homework_question_guides[0]
        : question.homework_question_guides;
      return {
        id: question.id,
        questionText: question.question_text,
        sortOrder: question.sort_order,
        points: Number(question.points),
        questionType: (question.question_type ?? "mcq") as ExamQuestionEditorView["questionType"],
        modelAnswer: guide?.model_answer ?? null,
        options: options
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((option) => ({
            id: option.id,
            optionText: option.option_text,
            sortOrder: option.sort_order,
            isCorrect: Boolean(option.is_correct),
          })),
      };
    });

  const totalPoints = questions.reduce((sum, question) => sum + question.points, 0);

  return {
    availability: "ready",
    message: "تم جلب الواجب.",
    data: {
      id: data.id,
      courseId: data.course_id,
      semesterId: data.semester_id,
      title: data.title,
      description: data.description ?? "",
      maxAttempts: data.max_attempts,
      availableFrom: data.available_from,
      dueAt: data.due_at,
      feedbackReleasePolicy: mapPolicy(data.feedback_release_policy),
      isPublished: Boolean(data.is_published),
      questionsCount: questions.length,
      totalPoints,
      courseTitle: course?.title ?? "",
      semesterTitle: semester?.title ?? "",
      questions,
    },
  };
}

export async function getHomeworkTakingView(
  homeworkId: string,
  studentId: string,
): Promise<LearningQueryResult<HomeworkTakingView | null>> {
  if (!getAuthReadiness().dbSchemaReady) return setupResult(null);
  const supabase = await createClient();
  if (!supabase) return unavailableResult(null);

  const { data: homework, error } = await supabase
    .from("homeworks")
    .select(
      "id, title, description, max_attempts, available_from, due_at, is_published, homework_questions(id, question_text, question_type, sort_order, points, homework_options(id, option_text, sort_order))",
    )
    .eq("id", homeworkId)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    if (String(error.message ?? "").toLowerCase().includes("does not exist")) {
      return setupResult(null);
    }
    return unavailableResult(null);
  }
  if (!homework) {
    return { availability: "empty", message: "الواجب غير متاح.", data: null };
  }

  const { data: attempts } = await supabase
    .from("homework_attempts")
    .select("id, attempt_number, status, grading_status, score")
    .eq("homework_id", homeworkId)
    .eq("student_id", studentId)
    .order("attempt_number", { ascending: false });

  const usedAttempts = (attempts ?? []).filter((row) => row.status !== "abandoned").length;
  const open = (attempts ?? []).find((row) => row.status === "in_progress") ?? null;
  const remaining =
    homework.max_attempts == null
      ? null
      : Math.max(0, homework.max_attempts - usedAttempts);

  const questions = (Array.isArray(homework.homework_questions)
    ? homework.homework_questions
    : []
  )
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((question) => {
      const options = Array.isArray(question.homework_options)
        ? question.homework_options
        : [];
      return {
        id: question.id,
        questionText: question.question_text,
        sortOrder: question.sort_order,
        points: Number(question.points),
        questionType: (question.question_type ?? "mcq") as
          | "mcq"
          | "true_false"
          | "essay",
        options: options
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((option) => ({
            id: option.id,
            optionText: option.option_text,
            sortOrder: option.sort_order,
          })),
      };
    });

  return {
    availability: "ready",
    message: "تم جلب الواجب للطالب.",
    data: {
      id: homework.id,
      title: homework.title,
      description: homework.description ?? "",
      maxAttempts: homework.max_attempts,
      dueAt: homework.due_at,
      availableFrom: homework.available_from,
      questions,
      attemptId: open?.id ?? null,
      attemptNumber: open?.attempt_number ?? null,
      attemptStatus: (open?.status as HomeworkTakingView["attemptStatus"]) ?? null,
      gradingStatus:
        (open?.grading_status as HomeworkTakingView["gradingStatus"]) ?? null,
      score: open?.score == null ? null : Number(open.score),
      remainingAttempts: remaining,
      usedAttempts,
    },
  };
}

export async function listStudentHomeworkAttempts(
  studentId: string,
): Promise<LearningQueryResult<HomeworkAttemptSummary[]>> {
  if (!getAuthReadiness().dbSchemaReady) return setupResult([]);
  const supabase = await createClient();
  if (!supabase) return unavailableResult([]);

  const { data, error } = await supabase
    .from("homework_attempts")
    .select(
      "id, homework_id, attempt_number, status, grading_status, score, objective_earned, essay_earned, total_points, submitted_at, results_released_at, homeworks(title)",
    )
    .eq("student_id", studentId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false });

  if (error) {
    if (String(error.message ?? "").toLowerCase().includes("does not exist")) {
      return setupResult([]);
    }
    return unavailableResult([]);
  }

  const now = Date.now();
  return {
    availability: "ready",
    message: "تم جلب محاولات الواجبات.",
    data: (data ?? []).map((row) => {
      const hw = Array.isArray(row.homeworks) ? row.homeworks[0] : row.homeworks;
      const releasedAt = row.results_released_at
        ? new Date(row.results_released_at).getTime()
        : null;
      return {
        id: row.id,
        homeworkId: row.homework_id,
        homeworkTitle: hw?.title ?? "واجب",
        attemptNumber: row.attempt_number,
        status: row.status,
        gradingStatus: (row.grading_status ??
          "not_applicable") as HomeworkAttemptSummary["gradingStatus"],
        score: row.score == null ? null : Number(row.score),
        objectiveEarned:
          row.objective_earned == null ? null : Number(row.objective_earned),
        essayEarned: row.essay_earned == null ? null : Number(row.essay_earned),
        totalPoints: row.total_points == null ? null : Number(row.total_points),
        submittedAt: row.submitted_at,
        resultsReleased: releasedAt != null && releasedAt <= now,
      };
    }),
  };
}

export async function listHomeworkGradingQueue(filters?: {
  courseId?: string;
  status?: "pending" | "graded" | "all";
}): Promise<LearningQueryResult<HomeworkGradingQueueItem[]>> {
  if (!getAuthReadiness().dbSchemaReady) return setupResult([]);
  const supabase = await createClient();
  if (!supabase) return unavailableResult([]);

  let query = supabase
    .from("homework_attempts")
    .select(
      "id, homework_id, student_id, attempt_number, submitted_at, grading_status, objective_earned, total_points, homeworks!inner(id, title, course_id, courses!inner(title), course_semesters!inner(title))",
    )
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false });

  const status = filters?.status ?? "pending";
  if (status === "pending") {
    query = query.in("grading_status", ["awaiting_essay", "draft"]);
  } else if (status === "graded") {
    query = query.eq("grading_status", "finalized");
  } else {
    query = query.in("grading_status", ["awaiting_essay", "draft", "finalized"]);
  }

  const { data, error } = await query;
  if (error) {
    if (String(error.message ?? "").toLowerCase().includes("does not exist")) {
      return setupResult([]);
    }
    return unavailableResult([]);
  }

  const studentIds = Array.from(
    new Set((data ?? []).map((row) => row.student_id).filter(Boolean)),
  );
  const { data: profiles } = studentIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", studentIds)
    : { data: [] as Array<{ id: string; full_name: string }> };
  const nameById = new Map((profiles ?? []).map((row) => [row.id, row.full_name]));

  const items = (data ?? [])
    .map((row) => {
      const hw = Array.isArray(row.homeworks) ? row.homeworks[0] : row.homeworks;
      const course = hw
        ? Array.isArray(hw.courses)
          ? hw.courses[0]
          : hw.courses
        : null;
      const semester = hw
        ? Array.isArray(hw.course_semesters)
          ? hw.course_semesters[0]
          : hw.course_semesters
        : null;
      return {
        attemptId: row.id,
        homeworkId: row.homework_id,
        homeworkTitle: hw?.title ?? "واجب",
        courseId: hw?.course_id ?? "",
        courseTitle: course?.title ?? "",
        semesterTitle: semester?.title ?? "",
        studentId: row.student_id,
        studentName: nameById.get(row.student_id) ?? "طالب",
        attemptNumber: row.attempt_number,
        submittedAt: row.submitted_at,
        gradingStatus: (row.grading_status ??
          "awaiting_essay") as HomeworkGradingQueueItem["gradingStatus"],
        objectiveEarned:
          row.objective_earned == null ? null : Number(row.objective_earned),
        totalPoints: row.total_points == null ? null : Number(row.total_points),
      };
    })
    .filter((item) =>
      filters?.courseId ? item.courseId === filters.courseId : true,
    );

  return {
    availability: "ready",
    message: "تم جلب قائمة تصحيح الواجبات.",
    data: items,
  };
}

export async function getHomeworkDashboardStats(): Promise<
  LearningQueryResult<{
    totalHomework: number;
    publishedHomework: number;
    submittedAttempts: number;
    pendingEssay: number;
  }>
> {
  const empty = {
    totalHomework: 0,
    publishedHomework: 0,
    submittedAttempts: 0,
    pendingEssay: 0,
  };
  if (!getAuthReadiness().dbSchemaReady) return setupResult(empty);
  const supabase = await createClient();
  if (!supabase) return unavailableResult(empty);

  const [allHw, publishedHw, submitted, pending] = await Promise.all([
    supabase.from("homeworks").select("id", { count: "exact", head: true }),
    supabase
      .from("homeworks")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true),
    supabase
      .from("homework_attempts")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted"),
    supabase
      .from("homework_attempts")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted")
      .in("grading_status", ["awaiting_essay", "draft"]),
  ]);

  if (
    allHw.error ||
    publishedHw.error ||
    submitted.error ||
    pending.error
  ) {
    if (
      [allHw.error, publishedHw.error, submitted.error, pending.error].some(
        (error) =>
          String(error?.message ?? "")
            .toLowerCase()
            .includes("does not exist"),
      )
    ) {
      return setupResult(empty);
    }
    return unavailableResult(empty);
  }

  return {
    availability: "ready",
    message: "إحصاءات الواجبات من قاعدة البيانات.",
    data: {
      totalHomework: allHw.count ?? 0,
      publishedHomework: publishedHw.count ?? 0,
      submittedAttempts: submitted.count ?? 0,
      pendingEssay: pending.count ?? 0,
    },
  };
}

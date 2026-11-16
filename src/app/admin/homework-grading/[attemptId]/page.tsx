import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import {
  HomeworkEssayGradingForm,
  type HomeworkGradingDetail,
} from "@/components/learning/HomeworkEssayGradingForm";
import { requireAdmin } from "@/lib/auth/guards";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

type PageProps = {
  params: Promise<{ attemptId: string }>;
};

export default async function AdminHomeworkGradingDetailPage({
  params,
}: PageProps) {
  await requireAdmin();
  const { attemptId } = await params;

  if (!getAuthReadiness().dbSchemaReady) {
    return (
      <div className="space-y-6">
        <PageHeader title="تصحيح واجب" description="" />
        <SetupRequiredPanel message="قاعدة البيانات غير جاهزة." />
      </div>
    );
  }

  const supabase = await createClient();
  if (!supabase) notFound();

  const { data, error } = await supabase.rpc("get_homework_attempt_review", {
    p_attempt_id: attemptId,
  });
  if (error || !data) {
    if (String(error?.message ?? "").toLowerCase().includes("does not exist")) {
      return (
        <div className="space-y-6">
          <PageHeader title="تصحيح واجب" description="" />
          <SetupRequiredPanel message="طبّق هجرات نظام الواجبات أولًا." />
        </div>
      );
    }
    notFound();
  }

  const payload = data as Record<string, unknown>;
  const homeworkId = String(payload.homework_id ?? "");
  const { data: hw } = await supabase
    .from("homeworks")
    .select("course_id, courses(title), course_semesters(title)")
    .eq("id", homeworkId)
    .maybeSingle();
  const course = hw
    ? Array.isArray(hw.courses)
      ? hw.courses[0]
      : hw.courses
    : null;
  const { data: attemptMeta } = await supabase
    .from("homework_attempts")
    .select("student_id, profiles(full_name)")
    .eq("id", attemptId)
    .maybeSingle();
  const profile = attemptMeta
    ? Array.isArray(attemptMeta.profiles)
      ? attemptMeta.profiles[0]
      : attemptMeta.profiles
    : null;

  const answersRaw = Array.isArray(payload.answers) ? payload.answers : [];
  const detail: HomeworkGradingDetail = {
    attemptId,
    courseId: hw?.course_id ?? "",
    homeworkTitle: String(payload.homework_title ?? "واجب"),
    courseTitle: course?.title ?? "",
    studentName: profile?.full_name ?? "طالب",
    attemptNumber: Number(payload.attempt_number ?? 1),
    gradingStatus: String(payload.grading_status ?? "awaiting_essay"),
    score: payload.score == null ? null : Number(payload.score),
    objectiveEarned:
      payload.objective_earned == null ? null : Number(payload.objective_earned),
    totalPoints:
      payload.total_points == null ? null : Number(payload.total_points),
    answers: answersRaw.map((row) => {
      const answer = row as Record<string, unknown>;
      return {
        answerId: String(answer.answer_id ?? ""),
        questionType: String(answer.question_type ?? "mcq"),
        questionText: String(answer.question_text ?? ""),
        points: Number(answer.points ?? 0),
        awardedPoints:
          answer.awarded_points == null ? null : Number(answer.awarded_points),
        isCorrect:
          answer.is_correct == null ? null : Boolean(answer.is_correct),
        selectedOptionText:
          answer.selected_option_text == null
            ? null
            : String(answer.selected_option_text),
        correctOptionText:
          answer.correct_option_text == null
            ? null
            : String(answer.correct_option_text),
        essayText: answer.essay_text == null ? null : String(answer.essay_text),
        teacherFeedback:
          answer.teacher_feedback == null
            ? null
            : String(answer.teacher_feedback),
        modelAnswer:
          answer.model_answer == null ? null : String(answer.model_answer),
      };
    }),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="تصحيح واجب"
        description="راجع الإجابات الموضوعية وصحّح المقالات ثم اعتمد النتيجة."
        actions={
          <Link
            href="/admin/homework-grading"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            قائمة التصحيح
          </Link>
        }
      />
      <HomeworkEssayGradingForm detail={detail} />
    </div>
  );
}

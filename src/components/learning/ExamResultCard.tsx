import Link from "next/link";
import type { ExamAttemptSummary } from "@/lib/learning/types";

type ExamResultCardProps = {
  attempt: ExamAttemptSummary;
};

export function ExamResultCard({ attempt }: ExamResultCardProps) {
  const statusLabel =
    attempt.gradingStatus === "awaiting_essay" || attempt.gradingStatus === "draft"
      ? "بانتظار التصحيح"
      : attempt.status === "submitted"
        ? "مُسلَّم"
        : attempt.status === "expired"
          ? "انتهت المهلة"
          : attempt.status === "abandoned"
            ? "متروك"
            : "قيد التنفيذ";

  const pendingEssay =
    attempt.gradingStatus === "awaiting_essay" || attempt.gradingStatus === "draft";

  return (
    <article className="rounded-2xl border border-white/10 bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">
            {attempt.examTitle}
          </h3>
          <p className="mt-1 text-xs text-white/50">
            بدأ: {new Date(attempt.startedAt).toLocaleString("ar-EG")}
            {attempt.submittedAt
              ? ` · سُلِّم: ${new Date(attempt.submittedAt).toLocaleString("ar-EG")}`
              : ""}
          </p>
        </div>
        <span className="rounded-lg bg-white/5 px-2 py-1 text-xs text-light-purple">
          {statusLabel}
        </span>
      </div>

      {pendingEssay ? (
        <p className="mt-4 text-sm leading-7 text-amber-100">
          تم تسليم الامتحان بنجاح، وجارٍ تصحيح الأسئلة المقالية.
          {attempt.objectiveEarned != null ? (
            <span className="mt-1 block text-xs text-white/55">
              مجموع الموضوعي حتى الآن: {attempt.objectiveEarned}
              {attempt.totalPoints != null ? ` من ${attempt.totalPoints}` : ""}
            </span>
          ) : null}
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-background/40 p-3">
            <p className="text-xs text-white/50">الدرجة</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {!attempt.resultsReleased || attempt.score === null
                ? "—"
                : `${attempt.score}%`}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-background/40 p-3">
            <p className="text-xs text-white/50">النتيجة</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {attempt.passed === null
                ? "—"
                : attempt.passed
                  ? "ناجح"
                  : "غير ناجح"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-background/40 p-3">
            <p className="text-xs text-white/50">التفصيل</p>
            <p className="mt-1 text-xs text-white/70">
              {attempt.objectiveEarned != null || attempt.essayEarned != null
                ? `موضوعي ${attempt.objectiveEarned ?? 0} · مقالي ${attempt.essayEarned ?? 0}`
                : "—"}
            </p>
          </div>
        </div>
      )}

      {attempt.resultsReleased ? (
        <div className="mt-4">
          <Link
            href={`/student/results/${attempt.id}`}
            className="inline-flex rounded-xl border border-secondary/40 bg-secondary/10 px-3 py-2 text-xs font-medium text-white hover:bg-secondary/20"
          >
            مراجعة الإجابات والدرجات
          </Link>
        </div>
      ) : null}
    </article>
  );
}

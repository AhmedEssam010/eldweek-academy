import type { ExamAttemptSummary } from "@/lib/learning/types";

type ExamResultCardProps = {
  attempt: ExamAttemptSummary;
};

export function ExamResultCard({ attempt }: ExamResultCardProps) {
  const statusLabel =
    attempt.status === "submitted"
      ? "مُسلَّم"
      : attempt.status === "expired"
        ? "انتهت المهلة"
        : attempt.status === "abandoned"
          ? "متروك"
          : "قيد التنفيذ";

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

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-background/40 p-3">
          <p className="text-xs text-white/50">الدرجة</p>
          <p className="mt-1 text-lg font-semibold text-white">
            {attempt.score === null ? "—" : `${attempt.score}%`}
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
          <p className="text-xs text-white/50">المحاولة</p>
          <p className="mt-1 text-xs text-white/70">{attempt.id.slice(0, 8)}…</p>
        </div>
      </div>
    </article>
  );
}

import { EmptyState } from "@/components/dashboard/EmptyState";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { listExamAttempts } from "@/lib/learning/data";

const statusLabel: Record<string, string> = {
  in_progress: "قيد الحل",
  submitted: "مُسلَّمة",
  expired: "منتهية الوقت",
  abandoned: "متروكة",
};

export async function ExamAttemptsSection({ examId }: { examId: string }) {
  const attempts = await listExamAttempts(examId);

  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-5">
      <h3 className="text-sm font-semibold text-white">محاولات الطلاب</h3>
      {(attempts.availability === "setup_required" ||
        attempts.availability === "unavailable") && (
        <div className="mt-3">
          <SetupRequiredPanel message={attempts.message} />
        </div>
      )}
      {attempts.data.length === 0 ? (
        <EmptyState title="لا توجد محاولات" description="تظهر هنا بعد أن يبدأ الطلاب الامتحان." />
      ) : (
        <ul className="mt-4 space-y-2">
          {attempts.data.map((attempt) => (
            <li
              key={attempt.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm"
            >
              <span className="text-white">{attempt.studentName}</span>
              <span className="text-xs text-white/55">
                {statusLabel[attempt.status] ?? attempt.status}
                {attempt.score != null ? ` · ${attempt.score}%` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

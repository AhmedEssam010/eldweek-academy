import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { requireStudent } from "@/lib/auth/guards";
import { getExamAttemptReview } from "@/lib/learning/data";

export const instant = false;

export default async function StudentAttemptReviewPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  await requireStudent();
  const { attemptId } = await params;
  const review = await getExamAttemptReview(attemptId);

  if (review.availability === "empty") notFound();

  const data = review.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="مراجعة النتيجة"
        description="الدرجات والملاحظات المنشورة فقط — بدون مفاتيح غير مُصرَّح بها."
      />
      <Link href="/student/results" className="text-sm text-light-purple hover:underline">
        العودة إلى نتائجي
      </Link>

      {(review.availability === "setup_required" ||
        review.availability === "unavailable") && (
        <SetupRequiredPanel message={review.message} />
      )}

      {data && !data.released ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm leading-7 text-amber-50">
          {data.gradingStatus === "awaiting_essay" || data.gradingStatus === "draft"
            ? "تم تسليم الامتحان بنجاح، وجارٍ تصحيح الأسئلة المقالية."
            : data.message ?? "النتيجة لم تُنشر بعد."}
        </div>
      ) : null}

      {data?.released ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <h2 className="text-lg font-semibold text-white">{data.examTitle}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <Stat label="الدرجة النهائية" value={`${data.score ?? "—"}%`} />
              <Stat
                label="المجموع"
                value={
                  data.totalPoints == null
                    ? "—"
                    : `${(data.objectiveEarned ?? 0) + (data.essayEarned ?? 0)} / ${data.totalPoints}`
                }
              />
              <Stat label="موضوعي" value={String(data.objectiveEarned ?? "—")} />
              <Stat label="مقالي" value={String(data.essayEarned ?? "—")} />
            </div>
            <p className="mt-3 text-sm text-white/65">
              {data.passed == null
                ? ""
                : data.passed
                  ? "النتيجة: ناجح"
                  : "النتيجة: لم تبلغ درجة النجاح"}
            </p>
          </div>

          <ol className="space-y-3">
            {(data.answers ?? []).map((answer, index) => (
              <li
                key={answer.answerId}
                className="rounded-2xl border border-white/10 bg-surface p-4 text-sm"
              >
                <p className="font-medium text-white">
                  {index + 1}. {answer.questionText}
                  <span className="ms-2 text-xs text-white/45">
                    ({answer.awardedPoints ?? "—"}/{answer.points})
                  </span>
                </p>
                {answer.questionType === "essay" ? (
                  <>
                    <p className="mt-3 whitespace-pre-wrap text-white/75">
                      {answer.essayText?.trim() || "لم تُكتب إجابة."}
                    </p>
                    {answer.teacherFeedback ? (
                      <p className="mt-2 rounded-xl border border-white/10 bg-background/40 p-3 text-xs leading-6 text-light-purple">
                        ملاحظات المصحّح: {answer.teacherFeedback}
                      </p>
                    ) : null}
                    {answer.modelAnswer ? (
                      <p className="mt-2 rounded-xl border border-secondary/20 bg-secondary/5 p-3 text-xs leading-6 text-white/65 whitespace-pre-wrap">
                        نموذج الإجابة: {answer.modelAnswer}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-white/70">
                      إجابتك: {answer.selectedOptionText ?? "—"}
                    </p>
                    <p className="mt-1 text-white/55">
                      الصحيحة: {answer.correctOptionText ?? "—"} ·{" "}
                      {answer.isCorrect ? (
                        <span className="text-emerald-200">صحيحة</span>
                      ) : (
                        <span className="text-red-200">خاطئة</span>
                      )}
                    </p>
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-background/40 p-3">
      <p className="text-xs text-white/50">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

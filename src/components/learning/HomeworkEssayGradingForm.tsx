"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  finalizeHomeworkGradingAction,
  saveHomeworkEssayGradesDraftAction,
} from "@/lib/learning/homework-actions";

export type HomeworkGradingDetail = {
  attemptId: string;
  courseId: string;
  homeworkTitle: string;
  courseTitle: string;
  studentName: string;
  attemptNumber: number;
  gradingStatus: string;
  score: number | null;
  objectiveEarned: number | null;
  totalPoints: number | null;
  answers: Array<{
    answerId: string;
    questionType: string;
    questionText: string;
    points: number;
    awardedPoints: number | null;
    isCorrect: boolean | null;
    selectedOptionText: string | null;
    correctOptionText: string | null;
    essayText: string | null;
    teacherFeedback: string | null;
    modelAnswer: string | null;
  }>;
};

type HomeworkEssayGradingFormProps = {
  detail: HomeworkGradingDetail;
};

type EssayDraft = {
  awardedPoints: string;
  teacherFeedback: string;
};

export function HomeworkEssayGradingForm({ detail }: HomeworkEssayGradingFormProps) {
  const router = useRouter();
  const essays = useMemo(
    () => detail.answers.filter((answer) => answer.questionType === "essay"),
    [detail.answers],
  );
  const [drafts, setDrafts] = useState<Record<string, EssayDraft>>(() => {
    const initial: Record<string, EssayDraft> = {};
    for (const essay of essays) {
      initial[essay.answerId] = {
        awardedPoints:
          essay.awardedPoints == null ? "" : String(essay.awardedPoints),
        teacherFeedback: essay.teacherFeedback ?? "",
      };
    }
    return initial;
  });
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [pending, startTransition] = useTransition();
  const finalized = detail.gradingStatus === "finalized";
  const allGraded = essays.every((essay) => {
    const value = drafts[essay.answerId]?.awardedPoints ?? "";
    const points = Number(value);
    return value !== "" && Number.isFinite(points) && points >= 0 && points <= essay.points;
  });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <h2 className="text-lg font-semibold text-white">{detail.homeworkTitle}</h2>
        <p className="mt-2 text-sm text-white/60">
          {detail.courseTitle} · الطالب: {detail.studentName} · المحاولة{" "}
          {detail.attemptNumber}
        </p>
        <p className="mt-3 text-xs text-white/50">
          مجموع موضوعي: {detail.objectiveEarned ?? "—"} / {detail.totalPoints ?? "—"}
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white">الأسئلة الموضوعية</h3>
        {detail.answers
          .filter((answer) => answer.questionType !== "essay")
          .map((answer) => (
            <article
              key={answer.answerId}
              className="rounded-2xl border border-white/10 bg-surface p-4 text-sm"
            >
              <p className="font-medium text-white">{answer.questionText}</p>
              <p className="mt-2 text-white/70">
                إجابة الطالب: {answer.selectedOptionText ?? "—"}
              </p>
              <p className="mt-1 text-white/55">
                الصحيحة: {answer.correctOptionText ?? "—"} ·{" "}
                {answer.isCorrect ? "صحيحة" : "خاطئة"} ·{" "}
                {answer.awardedPoints ?? 0}/{answer.points}
              </p>
            </article>
          ))}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white">الأسئلة المقالية</h3>
        {essays.map((essay, index) => (
          <article
            key={essay.answerId}
            className="rounded-2xl border border-white/10 bg-surface p-4"
          >
            <p className="text-sm font-medium text-white">
              {index + 1}. {essay.questionText}
              <span className="ms-2 text-xs text-white/45">(حد أقصى {essay.points})</span>
            </p>
            <div className="mt-3 rounded-xl border border-white/10 bg-background/40 p-3 text-sm text-white/80 whitespace-pre-wrap">
              {essay.essayText?.trim() ? essay.essayText : "لم يكتب الطالب إجابة."}
            </div>
            {essay.modelAnswer ? (
              <div className="mt-3 rounded-xl border border-secondary/20 bg-secondary/5 p-3 text-xs leading-6 text-white/65">
                <p className="mb-1 font-medium text-light-purple">إرشاد التصحيح</p>
                <p className="whitespace-pre-wrap">{essay.modelAnswer}</p>
              </div>
            ) : null}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-white/55">
                الدرجة الممنوحة
                <input
                  type="number"
                  min={0}
                  max={essay.points}
                  step="0.01"
                  disabled={finalized || pending}
                  value={drafts[essay.answerId]?.awardedPoints ?? ""}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [essay.answerId]: {
                        awardedPoints: event.target.value,
                        teacherFeedback:
                          prev[essay.answerId]?.teacherFeedback ?? "",
                      },
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-white/15 bg-background px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-white/55 sm:col-span-2">
                ملاحظات للطالب
                <textarea
                  rows={3}
                  disabled={finalized || pending}
                  value={drafts[essay.answerId]?.teacherFeedback ?? ""}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [essay.answerId]: {
                        awardedPoints: prev[essay.answerId]?.awardedPoints ?? "",
                        teacherFeedback: event.target.value,
                      },
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-white/15 bg-background px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
          </article>
        ))}
      </section>

      {!finalized ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white disabled:opacity-60"
            onClick={() => {
              startTransition(async () => {
                const grades = essays
                  .map((essay) => {
                    const draft = drafts[essay.answerId];
                    const points = Number(draft?.awardedPoints);
                    if (
                      !draft ||
                      draft.awardedPoints === "" ||
                      !Number.isFinite(points) ||
                      points < 0 ||
                      points > essay.points
                    ) {
                      return null;
                    }
                    return {
                      answerId: essay.answerId,
                      awardedPoints: points,
                      teacherFeedback: draft.teacherFeedback,
                    };
                  })
                  .filter(Boolean) as Array<{
                  answerId: string;
                  awardedPoints: number;
                  teacherFeedback: string;
                }>;
                if (grades.length === 0) {
                  setOk(false);
                  setMessage("أدخل درجات صحيحة ضمن الحد الأقصى.");
                  return;
                }
                const result = await saveHomeworkEssayGradesDraftAction({
                  attemptId: detail.attemptId,
                  courseId: detail.courseId,
                  grades,
                });
                setOk(result.ok);
                setMessage(result.message);
                if (result.ok) router.refresh();
              });
            }}
          >
            حفظ مسودة التصحيح
          </button>
          <button
            type="button"
            disabled={pending || !allGraded}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => setConfirmFinalize(true)}
          >
            اعتماد تصحيح الواجب
          </button>
        </div>
      ) : (
        <p className="text-sm text-emerald-200">
          تم اعتماد التصحيح. الدرجة النهائية {detail.score ?? "—"}%.
        </p>
      )}

      {confirmFinalize ? (
        <div className="rounded-2xl border border-secondary/40 bg-secondary/10 p-4">
          <p className="text-sm text-white">
            سيتم اعتماد التصحيح ونشر النتيجة وفق سياسة الواجب.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              className="rounded-xl bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => {
                setConfirmFinalize(false);
                startTransition(async () => {
                  const grades = essays.map((essay) => ({
                    answerId: essay.answerId,
                    awardedPoints: Number(
                      drafts[essay.answerId]?.awardedPoints ?? 0,
                    ),
                    teacherFeedback:
                      drafts[essay.answerId]?.teacherFeedback ?? "",
                  }));
                  const draftResult = await saveHomeworkEssayGradesDraftAction({
                    attemptId: detail.attemptId,
                    courseId: detail.courseId,
                    grades,
                  });
                  if (!draftResult.ok) {
                    setOk(false);
                    setMessage(draftResult.message);
                    return;
                  }
                  const result = await finalizeHomeworkGradingAction(
                    detail.attemptId,
                    detail.courseId,
                  );
                  setOk(result.ok);
                  setMessage(result.message);
                  if (result.ok) router.refresh();
                });
              }}
            >
              تأكيد الاعتماد
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80"
              onClick={() => setConfirmFinalize(false)}
            >
              إلغاء
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={`text-sm ${ok ? "text-emerald-200" : "text-red-200"}`}>{message}</p>
      ) : null}
    </div>
  );
}

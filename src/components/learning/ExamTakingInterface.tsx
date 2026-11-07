"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExamTimer } from "@/components/learning/ExamTimer";
import {
  startExamAttemptAction,
  submitExamAttemptAction,
} from "@/lib/learning/exam-actions";
import type { ExamTakingView } from "@/lib/learning/types";

type ExamTakingInterfaceProps = {
  exam: ExamTakingView;
};

export function ExamTakingInterface({ exam }: ExamTakingInterfaceProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [attemptId, setAttemptId] = useState(exam.attemptId);
  const [endsAt, setEndsAt] = useState(exam.endsAt);
  const [closed, setClosed] = useState(
    exam.attemptStatus === "submitted" || exam.attemptStatus === "expired",
  );

  const canAnswer = Boolean(attemptId) && !closed;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <h2 className="text-xl font-bold text-white">{exam.title}</h2>
        <p className="mt-2 text-sm leading-7 text-white/65">{exam.description}</p>
        <div className="mt-4 grid gap-3 text-xs text-white/55 sm:grid-cols-3">
          <p>درجة النجاح: {exam.passingScore}%</p>
          <p>المدة: {exam.durationMinutes ? `${exam.durationMinutes} دقيقة` : "غير محددة"}</p>
          <p>المحاولات: {exam.maxAttempts ?? "غير محدودة"}</p>
        </div>
        {exam.score != null && exam.attemptStatus !== "in_progress" ? (
          <p className="mt-3 text-sm text-emerald-200">
            آخر نتيجة: {exam.score}%{exam.passed ? " — ناجح" : " — لم تبلغ درجة النجاح"}
          </p>
        ) : null}
      </div>

      <ExamTimer endsAt={endsAt} serverNow={exam.serverNow} />

      {!closed ? (
        <div className="flex flex-wrap gap-2">
          {!attemptId ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await startExamAttemptAction(exam.id);
                  setOk(result.ok);
                  setMessage(result.message);
                  if (result.ok && result.attemptId) {
                    setAttemptId(result.attemptId);
                    setEndsAt(result.endsAt ?? null);
                    router.refresh();
                  }
                });
              }}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "جارٍ البدء..." : "بدء المحاولة"}
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmOpen(true)}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              تسليم الإجابات
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-white/60">هذه المحاولة مغلقة. يمكنك مراجعة النتيجة في «نتائجي».</p>
      )}

      {confirmOpen && attemptId ? (
        <div className="rounded-2xl border border-secondary/40 bg-secondary/10 p-4">
          <p className="text-sm text-white">
            بعد التسليم لا يمكن تعديل الإجابات. الدرجة تُحسب على الخادم، وإذا انتهى الوقت تُغلق المحاولة هناك.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              className="rounded-xl bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => {
                setConfirmOpen(false);
                startTransition(async () => {
                  const result = await submitExamAttemptAction({
                    examId: exam.id,
                    attemptId,
                    answers: Object.entries(answers).map(([questionId, optionId]) => ({
                      questionId,
                      optionId,
                    })),
                  });
                  setOk(result.ok);
                  setMessage(result.message);
                  if (result.ok) {
                    setClosed(true);
                    router.refresh();
                  }
                });
              }}
            >
              تأكيد التسليم
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80"
              onClick={() => setConfirmOpen(false)}
            >
              رجوع
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p
          className={`rounded-xl border px-3 py-2 text-xs leading-6 ${
            ok
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-400/30 bg-red-500/10 text-red-200"
          }`}
        >
          {message}
        </p>
      ) : null}

      <ol className="space-y-4">
        {exam.questions.map((question, index) => (
          <li key={question.id} className="rounded-2xl border border-white/10 bg-surface p-4">
            <p className="text-sm font-medium text-white">
              {index + 1}. {question.questionText}
              <span className="ms-2 text-xs text-white/45">({question.points} درجة)</span>
            </p>
            <div className="mt-3 space-y-2">
              {question.options.map((option) => (
                <label
                  key={option.id}
                  className="flex items-start gap-2 rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-sm text-white/80"
                >
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    value={option.id}
                    disabled={!canAnswer}
                    checked={answers[question.id] === option.id}
                    onChange={() =>
                      setAnswers((prev) => ({ ...prev, [question.id]: option.id }))
                    }
                    className="mt-1 accent-secondary"
                  />
                  <span>{option.optionText}</span>
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

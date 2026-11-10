"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExamTimer } from "@/components/learning/ExamTimer";
import {
  startExamAttemptAction,
  submitExamAttemptAction,
} from "@/lib/learning/exam-actions";
import type { ExamTakingQuestion, ExamTakingView } from "@/lib/learning/types";

type ExamTakingInterfaceProps = {
  exam: ExamTakingView;
};

type AnswerState = {
  optionId?: string;
  essayText?: string;
};

const typeLabel: Record<string, string> = {
  mcq: "اختيار من متعدد",
  true_false: "صح أو خطأ",
  essay: "مقالي",
};

function isQuestionAnswered(
  question: ExamTakingQuestion,
  answer: AnswerState | undefined,
) {
  if (question.questionType === "essay") {
    return Boolean(answer?.essayText?.trim());
  }
  return Boolean(answer?.optionId);
}

export function ExamTakingInterface({ exam }: ExamTakingInterfaceProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [attemptId, setAttemptId] = useState(exam.attemptId);
  const [endsAt, setEndsAt] = useState(exam.endsAt);
  const [closed, setClosed] = useState(
    exam.attemptStatus === "submitted" || exam.attemptStatus === "expired",
  );
  const [gradingStatus, setGradingStatus] = useState(exam.gradingStatus);
  const [unansweredIds, setUnansweredIds] = useState<string[]>([]);

  const canAnswer = Boolean(attemptId) && !closed;

  function findUnanswered() {
    return exam.questions.filter(
      (question) => !isQuestionAnswered(question, answers[question.id]),
    );
  }

  function focusUnanswered(missing: ExamTakingQuestion[]) {
    if (missing.length === 0) return;
    const first = missing[0]!;
    const indexes = missing
      .map((question) => exam.questions.findIndex((entry) => entry.id === question.id) + 1)
      .filter((index) => index > 0);
    const label =
      indexes.length === 1
        ? `يجب الإجابة على السؤال رقم ${indexes[0]} قبل التسليم.`
        : `يجب الإجابة على الأسئلة رقم ${indexes.join("، ")} قبل التسليم.`;
    setUnansweredIds(missing.map((question) => question.id));
    setOk(false);
    setMessage(label);
    setConfirmOpen(false);
    requestAnimationFrame(() => {
      document
        .getElementById(`exam-q-${first.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function requestSubmit() {
    const missing = findUnanswered();
    if (missing.length > 0) {
      focusUnanswered(missing);
      return;
    }
    setUnansweredIds([]);
    setMessage(null);
    setConfirmOpen(true);
  }

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
        {gradingStatus === "awaiting_essay" || gradingStatus === "draft" ? (
          <p className="mt-3 text-sm text-amber-100">
            تم تسليم الامتحان بنجاح، وجارٍ تصحيح الأسئلة المقالية.
          </p>
        ) : exam.score != null && exam.attemptStatus !== "in_progress" ? (
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
              onClick={requestSubmit}
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
            بعد التسليم لا يمكن تعديل الإجابات. الأسئلة الموضوعية تُصحَّح على الخادم، والمقالية تبقى بانتظار المصحّح.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              className="rounded-xl bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => {
                const missing = findUnanswered();
                if (missing.length > 0) {
                  focusUnanswered(missing);
                  return;
                }
                setConfirmOpen(false);
                startTransition(async () => {
                  const result = await submitExamAttemptAction({
                    examId: exam.id,
                    attemptId,
                    answers: exam.questions.map((question) => ({
                      questionId: question.id,
                      optionId: answers[question.id]?.optionId ?? null,
                      essayText: answers[question.id]?.essayText ?? null,
                    })),
                  });
                  setOk(result.ok);
                  setMessage(result.message);
                  if (result.ok) {
                    setClosed(true);
                    setUnansweredIds([]);
                    setGradingStatus(
                      (result.gradingStatus as ExamTakingView["gradingStatus"]) ?? null,
                    );
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
        {exam.questions.map((question, index) => {
          const unanswered = unansweredIds.includes(question.id);
          return (
            <li
              key={question.id}
              id={`exam-q-${question.id}`}
              className={`rounded-2xl border bg-surface p-4 ${
                unanswered
                  ? "border-red-400/50 ring-1 ring-red-400/30"
                  : "border-white/10"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-white">
                  {index + 1}. {question.questionText}
                  <span className="ms-2 text-xs text-white/45">({question.points} درجة)</span>
                  <span className="ms-2 text-[11px] text-red-200">*</span>
                </p>
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/55">
                  {typeLabel[question.questionType] ?? question.questionType}
                </span>
              </div>

              {unanswered ? (
                <p className="mt-2 text-xs text-red-200">
                  هذا السؤال مطلوب. يجب حله قبل تسليم الامتحان.
                </p>
              ) : null}

              {question.questionType === "essay" ? (
                <textarea
                  rows={6}
                  disabled={!canAnswer}
                  value={answers[question.id]?.essayText ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAnswers((prev) => ({
                      ...prev,
                      [question.id]: { essayText: value },
                    }));
                    if (value.trim()) {
                      setUnansweredIds((prev) =>
                        prev.filter((id) => id !== question.id),
                      );
                    }
                  }}
                  placeholder="اكتب إجابتك هنا..."
                  className={`mt-3 w-full rounded-xl border bg-background px-4 py-3 text-sm text-white outline-none focus:border-secondary disabled:opacity-60 ${
                    unanswered ? "border-red-400/50" : "border-white/15"
                  }`}
                />
              ) : (
                <div className="mt-3 space-y-2">
                  {question.options.map((option) => (
                    <label
                      key={option.id}
                      className={`flex items-start gap-2 rounded-xl border bg-background/40 px-3 py-2 text-sm text-white/80 ${
                        unanswered ? "border-red-400/40" : "border-white/10"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        value={option.id}
                        disabled={!canAnswer}
                        checked={answers[question.id]?.optionId === option.id}
                        onChange={() => {
                          setAnswers((prev) => ({
                            ...prev,
                            [question.id]: { optionId: option.id },
                          }));
                          setUnansweredIds((prev) =>
                            prev.filter((id) => id !== question.id),
                          );
                        }}
                        className="mt-1 accent-secondary"
                      />
                      <span>{option.optionText}</span>
                    </label>
                  ))}
                  {question.options.length === 0 ? (
                    <p className="text-xs text-amber-100">
                      لا توجد خيارات لهذا السؤال. حدّث الصفحة أو تواصل مع المالك.
                    </p>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

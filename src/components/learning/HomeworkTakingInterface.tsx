"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  startHomeworkAttemptAction,
  submitHomeworkAttemptAction,
} from "@/lib/learning/homework-actions";
import type { ExamTakingQuestion, HomeworkTakingView } from "@/lib/learning/types";

type HomeworkTakingInterfaceProps = {
  homework: HomeworkTakingView;
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

export function HomeworkTakingInterface({ homework }: HomeworkTakingInterfaceProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [attemptId, setAttemptId] = useState(homework.attemptId);
  const [closed, setClosed] = useState(homework.attemptStatus === "submitted");
  const [gradingStatus, setGradingStatus] = useState(homework.gradingStatus);
  const [unansweredIds, setUnansweredIds] = useState<string[]>([]);

  const canAnswer = Boolean(attemptId) && !closed;

  function findUnanswered() {
    return homework.questions.filter(
      (question) => !isQuestionAnswered(question, answers[question.id]),
    );
  }

  function focusUnanswered(missing: ExamTakingQuestion[]) {
    if (missing.length === 0) return;
    const first = missing[0]!;
    const indexes = missing
      .map(
        (question) =>
          homework.questions.findIndex((entry) => entry.id === question.id) + 1,
      )
      .filter((index) => index > 0);
    setUnansweredIds(missing.map((question) => question.id));
    setOk(false);
    setMessage(
      indexes.length === 1
        ? `يجب الإجابة على السؤال رقم ${indexes[0]} قبل التسليم.`
        : `يجب الإجابة على الأسئلة رقم ${indexes.join("، ")} قبل التسليم.`,
    );
    setConfirmOpen(false);
    requestAnimationFrame(() => {
      document
        .getElementById(`hw-q-${first.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <h2 className="text-xl font-bold text-white">{homework.title}</h2>
        <p className="mt-2 text-sm leading-7 text-white/65">{homework.description}</p>
        <div className="mt-4 grid gap-3 text-xs text-white/55 sm:grid-cols-3">
          <p>
            المحاولات:{" "}
            {homework.maxAttempts == null
              ? "غير محدودة"
              : `${homework.usedAttempts}/${homework.maxAttempts}`}
          </p>
          <p>
            المتبقي:{" "}
            {homework.remainingAttempts == null
              ? "—"
              : homework.remainingAttempts}
          </p>
          <p>
            موعد التسليم:{" "}
            {homework.dueAt
              ? new Date(homework.dueAt).toLocaleString("ar-EG")
              : "غير محدد"}
          </p>
        </div>
        {gradingStatus === "awaiting_essay" || gradingStatus === "draft" ? (
          <p className="mt-3 text-sm text-amber-100">
            تم تسليم الواجب بنجاح، وجارٍ تصحيح الأسئلة المقالية.
          </p>
        ) : homework.score != null && closed ? (
          <p className="mt-3 text-sm text-emerald-200">
            تم تصحيح الواجب · الدرجة {homework.score}%
          </p>
        ) : null}
      </div>

      {!closed ? (
        <div className="flex flex-wrap gap-2">
          {!attemptId ? (
            <button
              type="button"
              disabled={pending || homework.remainingAttempts === 0}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => {
                startTransition(async () => {
                  const result = await startHomeworkAttemptAction(homework.id);
                  setOk(result.ok);
                  setMessage(result.message);
                  if (result.ok && result.attemptId) {
                    setAttemptId(result.attemptId);
                    router.refresh();
                  }
                });
              }}
            >
              بدء محاولة جديدة
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => {
                const missing = findUnanswered();
                if (missing.length > 0) {
                  focusUnanswered(missing);
                  return;
                }
                setUnansweredIds([]);
                setMessage(null);
                setConfirmOpen(true);
              }}
            >
              تسليم الواجب
            </button>
          )}
        </div>
      ) : null}

      {confirmOpen ? (
        <div className="rounded-2xl border border-secondary/40 bg-secondary/10 p-4">
          <p className="text-sm text-white">
            تأكيد التسليم النهائي؟ لا يمكن تعديل الإجابات بعد التسليم.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending || !attemptId}
              className="rounded-xl bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => {
                setConfirmOpen(false);
                if (!attemptId) return;
                startTransition(async () => {
                  const result = await submitHomeworkAttemptAction({
                    homeworkId: homework.id,
                    attemptId,
                    answers: homework.questions.map((question) => ({
                      questionId: question.id,
                      selectedOptionId: answers[question.id]?.optionId ?? null,
                      essayText: answers[question.id]?.essayText ?? null,
                    })),
                  });
                  setOk(result.ok);
                  setMessage(result.message);
                  if (result.ok) {
                    setClosed(true);
                    setGradingStatus(
                      (result.gradingStatus as HomeworkTakingView["gradingStatus"]) ??
                        null,
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
              إلغاء
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={`text-sm ${ok ? "text-emerald-200" : "text-red-200"}`}>{message}</p>
      ) : null}

      <div className="space-y-4">
        {homework.questions.map((question, index) => {
          const unanswered = unansweredIds.includes(question.id);
          return (
            <article
              key={question.id}
              id={`hw-q-${question.id}`}
              className={`rounded-2xl border p-4 ${
                unanswered
                  ? "border-red-400/50 bg-red-500/10"
                  : "border-white/10 bg-surface"
              }`}
            >
              <p className="text-sm font-medium text-white">
                {index + 1}. {question.questionText}
                <span className="ms-2 text-xs text-white/45">
                  ({typeLabel[question.questionType] ?? question.questionType} ·{" "}
                  {question.points} درجة)
                </span>
              </p>

              {question.questionType === "essay" ? (
                <textarea
                  rows={5}
                  disabled={!canAnswer || pending}
                  value={answers[question.id]?.essayText ?? ""}
                  onChange={(event) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [question.id]: { essayText: event.target.value },
                    }))
                  }
                  className="mt-3 w-full rounded-xl border border-white/15 bg-background px-3 py-2 text-sm text-white disabled:opacity-60"
                  placeholder="اكتب إجابتك هنا"
                />
              ) : (
                <div className="mt-3 space-y-2">
                  {question.options.map((option) => (
                    <label
                      key={option.id}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-sm text-white/85"
                    >
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        disabled={!canAnswer || pending}
                        checked={answers[question.id]?.optionId === option.id}
                        onChange={() =>
                          setAnswers((prev) => ({
                            ...prev,
                            [question.id]: { optionId: option.id },
                          }))
                        }
                        className="accent-secondary"
                      />
                      {option.optionText}
                    </label>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

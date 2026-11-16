"use client";

import { useMemo, useState } from "react";
import { ConfirmationDialog } from "@/components/dashboard/ConfirmationDialog";
import { MutationForm } from "@/components/dashboard/MutationForm";
import {
  deleteHomeworkQuestionAction,
  moveHomeworkQuestionAction,
  upsertHomeworkQuestionAction,
} from "@/lib/learning/homework-actions";
import type {
  ExamQuestionEditorView,
  ExamQuestionTypeView,
} from "@/lib/learning/types";

type HomeworkQuestionEditorProps = {
  courseId: string;
  homeworkId: string;
  question?: ExamQuestionEditorView;
  canManage: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
};

const typeLabels: Record<ExamQuestionTypeView, string> = {
  mcq: "اختيار من متعدد",
  true_false: "صح أو خطأ",
  essay: "سؤال مقالي",
};

export function HomeworkQuestionEditor({
  courseId,
  homeworkId,
  question,
  canManage,
  canMoveUp = false,
  canMoveDown = false,
}: HomeworkQuestionEditorProps) {
  const initialType = question?.questionType ?? "mcq";
  const [questionType, setQuestionType] = useState<ExamQuestionTypeView>(initialType);
  const initialOptionCount = Math.max(
    2,
    Math.min(6, question?.options.length || (initialType === "true_false" ? 2 : 4)),
  );
  const [optionCount, setOptionCount] = useState(initialOptionCount);

  const mcqOptions = useMemo(() => {
    return Array.from({ length: optionCount }, (_, index) => {
      const existing = question?.options[index];
      return {
        id: existing?.id ?? `new-${index}`,
        optionText: existing?.optionText ?? "",
        isCorrect: existing?.isCorrect ?? index === 0,
      };
    });
  }, [optionCount, question]);

  if (!canManage) return null;

  const trueFalseCorrect =
    question?.options.find((option) => option.isCorrect)?.optionText === "خطأ" ? "1" : "0";

  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-4">
      <MutationForm
        action={upsertHomeworkQuestionAction}
        submitLabel={question ? "حفظ السؤال" : "إضافة سؤال"}
      >
        <input type="hidden" name="course_id" value={courseId} />
        <input type="hidden" name="homework_id" value={homeworkId} />
        {question ? <input type="hidden" name="question_id" value={question.id} /> : null}
        <input type="hidden" name="question_type" value={questionType} />
        <input type="hidden" name="option_count" value={String(optionCount)} />

        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(typeLabels) as ExamQuestionTypeView[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setQuestionType(type);
                if (type === "true_false") setOptionCount(2);
                if (type === "mcq" && optionCount < 2) setOptionCount(4);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                questionType === type
                  ? "border-secondary/50 bg-secondary/20 text-white"
                  : "border-white/10 bg-white/5 text-white/65 hover:border-white/25"
              }`}
            >
              {typeLabels[type]}
            </button>
          ))}
        </div>

        <textarea
          name="questionText"
          rows={2}
          required
          minLength={2}
          defaultValue={question?.questionText ?? ""}
          placeholder="نص السؤال"
          className="w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white outline-none focus:border-secondary"
        />
        <label className="mt-3 block text-xs text-white/55">
          {questionType === "essay" ? "الدرجة القصوى" : "الدرجات"}
          <input
            name="points"
            type="number"
            min={0.01}
            max={100}
            step="0.01"
            required
            defaultValue={question?.points ?? 1}
            className="mt-1 w-28 rounded-xl border border-white/15 bg-background px-3 py-2 text-sm text-white"
          />
        </label>

        {questionType === "mcq" ? (
          <fieldset className="mt-3 space-y-2">
            <legend className="text-xs text-white/55">
              خيارات الإجابة (حد أدنى 2) — اختر إجابة صحيحة واحدة
            </legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={optionCount >= 6}
                onClick={() => setOptionCount((count) => Math.min(6, count + 1))}
                className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/70 disabled:opacity-40"
              >
                إضافة خيار
              </button>
              <button
                type="button"
                disabled={optionCount <= 2}
                onClick={() => setOptionCount((count) => Math.max(2, count - 1))}
                className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/70 disabled:opacity-40"
              >
                حذف خيار
              </button>
            </div>
            {mcqOptions.map((option, index) => (
              <div
                key={option.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-background/50 px-3 py-2"
              >
                <input
                  type="radio"
                  name="correctOption"
                  value={String(index)}
                  defaultChecked={Boolean(option.isCorrect) || (!question && index === 0)}
                  className="accent-secondary"
                  required
                />
                <input
                  name={`option_${index}`}
                  required
                  defaultValue={option.optionText}
                  placeholder={`خيار ${index + 1}`}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-sm text-white outline-none"
                />
              </div>
            ))}
          </fieldset>
        ) : null}

        {questionType === "true_false" ? (
          <fieldset className="mt-3 space-y-2">
            <legend className="text-xs text-white/55">اختر الإجابة الصحيحة</legend>
            <input type="hidden" name="option_0" value="صح" />
            <input type="hidden" name="option_1" value="خطأ" />
            {[
              { value: "0", label: "صح" },
              { value: "1", label: "خطأ" },
            ].map((choice) => (
              <label
                key={choice.value}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm text-white/80"
              >
                <input
                  type="radio"
                  name="correctOption"
                  value={choice.value}
                  defaultChecked={trueFalseCorrect === choice.value}
                  className="accent-secondary"
                  required
                />
                {choice.label}
              </label>
            ))}
          </fieldset>
        ) : null}

        {questionType === "essay" ? (
          <label className="mt-3 block text-xs text-white/55">
            نموذج إجابة / إرشاد تصحيح (للمصحّح فقط)
            <textarea
              name="modelAnswer"
              rows={4}
              defaultValue={question?.modelAnswer ?? ""}
              placeholder="اختياري — لا يظهر للطالب قبل نشر النتائج"
              className="mt-1 w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white outline-none focus:border-secondary"
            />
          </label>
        ) : null}
      </MutationForm>

      {question ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {canMoveUp ? (
            <ConfirmationDialog
              triggerLabel="تحريك لأعلى"
              title="تغيير ترتيب السؤال"
              description="سيُقدَّم هذا السؤال خطوة واحدة."
              confirmLabel="تحريك"
              onConfirm={moveHomeworkQuestionAction.bind(
                null,
                courseId,
                homeworkId,
                question.id,
                "up",
              )}
            />
          ) : null}
          {canMoveDown ? (
            <ConfirmationDialog
              triggerLabel="تحريك لأسفل"
              title="تغيير ترتيب السؤال"
              description="سيُؤخَّر هذا السؤال خطوة واحدة."
              confirmLabel="تحريك"
              onConfirm={moveHomeworkQuestionAction.bind(
                null,
                courseId,
                homeworkId,
                question.id,
                "down",
              )}
            />
          ) : null}
          <ConfirmationDialog
            triggerLabel="حذف السؤال"
            title="تأكيد حذف السؤال"
            description="سيُحذف السؤال وخياراته."
            confirmLabel="حذف"
            danger
            onConfirm={deleteHomeworkQuestionAction.bind(
              null,
              courseId,
              homeworkId,
              question.id,
            )}
          />
        </div>
      ) : null}
    </div>
  );
}

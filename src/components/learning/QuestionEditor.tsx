import { ConfirmationDialog } from "@/components/dashboard/ConfirmationDialog";
import { MutationForm } from "@/components/dashboard/MutationForm";
import {
  deleteExamQuestionAction,
  moveExamQuestionAction,
  upsertExamQuestionAction,
} from "@/lib/learning/exam-actions";
import type { ExamQuestionEditorView } from "@/lib/learning/types";

type QuestionEditorProps = {
  courseId: string;
  examId: string;
  question?: ExamQuestionEditorView;
  canManage: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
};

const emptyOptions = [
  { id: "new-a", optionText: "", sortOrder: 0, isCorrect: true },
  { id: "new-b", optionText: "", sortOrder: 1, isCorrect: false },
  { id: "new-c", optionText: "", sortOrder: 2, isCorrect: false },
  { id: "new-d", optionText: "", sortOrder: 3, isCorrect: false },
];

export function QuestionEditor({
  courseId,
  examId,
  question,
  canManage,
  canMoveUp = false,
  canMoveDown = false,
}: QuestionEditorProps) {
  if (!canManage) return null;

  const options = [0, 1, 2, 3].map((index) => question?.options[index] ?? emptyOptions[index]!);

  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-4">
      <MutationForm
        action={upsertExamQuestionAction}
        submitLabel={question ? "حفظ السؤال" : "إضافة سؤال"}
      >
        <input type="hidden" name="course_id" value={courseId} />
        <input type="hidden" name="exam_id" value={examId} />
        {question ? <input type="hidden" name="question_id" value={question.id} /> : null}
        <textarea
          name="questionText"
          rows={2}
          required
          minLength={2}
          defaultValue={question?.questionText ?? ""}
          placeholder="نص السؤال"
          className="w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white outline-none focus:border-secondary"
        />
        <label className="block text-xs text-white/55">
          الدرجات
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
        <fieldset className="space-y-2">
          <legend className="text-xs text-white/55">أربعة خيارات وإجابة صحيحة واحدة</legend>
          {options.map((option, index) => (
            <div
              key={option?.id ?? index}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-background/50 px-3 py-2"
            >
              <input
                type="radio"
                name="correctOption"
                value={String(index)}
                defaultChecked={Boolean(option?.isCorrect) || (!question && index === 0)}
                className="accent-secondary"
                required
              />
              <input
                name={`option_${index}`}
                required
                defaultValue={option?.optionText ?? ""}
                placeholder={`خيار ${index + 1}`}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-sm text-white outline-none"
              />
            </div>
          ))}
        </fieldset>
      </MutationForm>

      {question ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {canMoveUp ? (
            <ConfirmationDialog
              triggerLabel="تحريك لأعلى"
              title="تغيير ترتيب السؤال"
              description="سيُقدَّم هذا السؤال خطوة واحدة."
              confirmLabel="تحريك"
              onConfirm={moveExamQuestionAction.bind(null, courseId, examId, question.id, "up")}
            />
          ) : null}
          {canMoveDown ? (
            <ConfirmationDialog
              triggerLabel="تحريك لأسفل"
              title="تغيير ترتيب السؤال"
              description="سيُؤخَّر هذا السؤال خطوة واحدة."
              confirmLabel="تحريك"
              onConfirm={moveExamQuestionAction.bind(null, courseId, examId, question.id, "down")}
            />
          ) : null}
          <ConfirmationDialog
            triggerLabel="حذف السؤال"
            title="تأكيد حذف السؤال"
            description="سيُحذف السؤال وخياراته. لا يؤثر على محاولات سُلّمت سابقًا إلا إذا حُذف مرجعها من قاعدة البيانات."
            confirmLabel="حذف"
            danger
            onConfirm={deleteExamQuestionAction.bind(null, courseId, examId, question.id)}
          />
        </div>
      ) : null}
    </div>
  );
}

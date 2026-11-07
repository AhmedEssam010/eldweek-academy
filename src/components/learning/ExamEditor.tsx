import { ConfirmationDialog } from "@/components/dashboard/ConfirmationDialog";
import { MutationForm } from "@/components/dashboard/MutationForm";
import { QuestionEditor } from "@/components/learning/QuestionEditor";
import {
  createExamDraftAction,
  setExamPublishAction,
  updateExamSettingsAction,
} from "@/lib/learning/exam-actions";
import type { ExamEditorView, ExamScopeOption } from "@/lib/learning/types";

type ExamEditorProps = {
  exam?: ExamEditorView | null;
  canManage: boolean;
  mode?: "create" | "edit";
  courseId: string;
  semesters?: ExamScopeOption[];
  lessons?: ExamScopeOption[];
};

const fieldClass =
  "w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white outline-none focus:border-secondary";

export function ExamEditor({
  exam = null,
  canManage,
  mode = "edit",
  courseId,
  semesters = [],
  lessons = [],
}: ExamEditorProps) {
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-white/10 bg-surface p-5 text-sm text-white/65">
        إدارة الامتحانات تتطلب صلاحية إدارة الامتحانات على هذا الكورس.
      </div>
    );
  }

  if (mode === "create" || !exam) {
    return (
      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <h3 className="text-base font-semibold text-white">امتحان جديد</h3>
        <p className="mt-2 text-sm text-white/60">
          يُحفظ كمسودة. الإجابات الصحيحة تبقى على الخادم ولا تصل لصفحة الطالب.
        </p>
        <div className="mt-4">
          <MutationForm action={createExamDraftAction} submitLabel="إنشاء المسودة">
            <input type="hidden" name="course_id" value={courseId} />
            <input name="title" required minLength={2} placeholder="عنوان الامتحان" className={fieldClass} />
            <textarea name="description" rows={3} placeholder="وصف مختصر" className={fieldClass} />
            <label className="block text-xs text-white/55">
              الترم
              <select name="semester_id" required className={`mt-1 ${fieldClass}`}>
                <option value="">اختر الترم</option>
                {semesters.map((semester) => (
                  <option key={semester.id} value={semester.id}>
                    {semester.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-white/55">
              ربط بدرس (اختياري)
              <select name="lesson_id" className={`mt-1 ${fieldClass}`}>
                <option value="">امتحان الترم كله</option>
                {lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-white/55">
                المدة بالدقائق
                <input name="durationMinutes" type="number" min={1} max={600} className={`mt-1 ${fieldClass}`} />
              </label>
              <label className="text-xs text-white/55">
                درجة النجاح %
                <input name="passingScore" type="number" min={0} max={100} defaultValue={50} className={`mt-1 ${fieldClass}`} />
              </label>
              <label className="text-xs text-white/55">
                أقصى محاولات
                <input name="maxAttempts" type="number" min={1} max={20} className={`mt-1 ${fieldClass}`} />
              </label>
            </div>
          </MutationForm>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-white">{exam.title}</h3>
          <span
            className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
              exam.isPublished
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                : "border-white/15 bg-white/5 text-white/70"
            }`}
          >
            {exam.isPublished ? "منشور" : "مسودة"}
          </span>
        </div>

        <div className="mt-4">
          <MutationForm action={updateExamSettingsAction} submitLabel="حفظ الإعدادات">
            <input type="hidden" name="course_id" value={courseId} />
            <input type="hidden" name="exam_id" value={exam.id} />
            <input name="title" required minLength={2} defaultValue={exam.title} className={fieldClass} />
            <textarea name="description" rows={3} defaultValue={exam.description} className={fieldClass} />
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-white/55">
                المدة بالدقائق
                <input
                  name="durationMinutes"
                  type="number"
                  min={1}
                  max={600}
                  defaultValue={exam.durationMinutes ?? ""}
                  className={`mt-1 ${fieldClass}`}
                />
              </label>
              <label className="text-xs text-white/55">
                درجة النجاح %
                <input
                  name="passingScore"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={exam.passingScore}
                  className={`mt-1 ${fieldClass}`}
                />
              </label>
              <label className="text-xs text-white/55">
                أقصى محاولات
                <input
                  name="maxAttempts"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={exam.maxAttempts ?? ""}
                  className={`mt-1 ${fieldClass}`}
                />
              </label>
            </div>
          </MutationForm>
        </div>

        <div className="mt-4">
          <ConfirmationDialog
            triggerLabel={exam.isPublished ? "إلغاء نشر الامتحان" : "نشر الامتحان"}
            title={exam.isPublished ? "تأكيد إلغاء النشر" : "تأكيد نشر الامتحان"}
            description={
              exam.isPublished
                ? "لن يستطيع الطلاب بدء محاولات جديدة. المحاولات السابقة تبقى."
                : "سيظهر للطلاب المشتركين فقط إذا اكتملت الأسئلة: 4 خيارات وإجابة صحيحة واحدة لكل سؤال."
            }
            confirmLabel={exam.isPublished ? "تأكيد إلغاء النشر" : "تأكيد النشر"}
            danger={exam.isPublished}
            onConfirm={setExamPublishAction.bind(null, courseId, exam.id, !exam.isPublished)}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-white">الأسئلة ({exam.questions.length})</h4>
        {exam.questions.map((question, index) => (
          <QuestionEditor
            key={question.id}
            courseId={courseId}
            examId={exam.id}
            question={question}
            canManage
            canMoveUp={index > 0}
            canMoveDown={index < exam.questions.length - 1}
          />
        ))}
        <QuestionEditor courseId={courseId} examId={exam.id} canManage />
      </div>
    </div>
  );
}

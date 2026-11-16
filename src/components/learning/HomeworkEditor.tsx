import { ConfirmationDialog } from "@/components/dashboard/ConfirmationDialog";
import { MutationForm } from "@/components/dashboard/MutationForm";
import { HomeworkQuestionEditor } from "@/components/learning/HomeworkQuestionEditor";
import {
  createHomeworkDraftAction,
  deleteHomeworkAction,
  setHomeworkPublishAction,
  updateHomeworkSettingsAction,
} from "@/lib/learning/homework-actions";
import type { ExamScopeOption, HomeworkEditorView } from "@/lib/learning/types";

type HomeworkEditorProps = {
  homework?: HomeworkEditorView | null;
  canManage: boolean;
  mode?: "create" | "edit";
  courseId: string;
  semesters?: ExamScopeOption[];
};

const fieldClass =
  "w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white outline-none focus:border-secondary";

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function HomeworkEditor({
  homework = null,
  canManage,
  mode = "edit",
  courseId,
  semesters = [],
}: HomeworkEditorProps) {
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-white/10 bg-surface p-5 text-sm text-white/65">
        إدارة الواجبات تتطلب صلاحية إدارة الامتحانات/الواجبات على هذا الكورس.
      </div>
    );
  }

  if (mode === "create" || !homework) {
    return (
      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <h3 className="text-base font-semibold text-white">واجب جديد</h3>
        <p className="mt-2 text-sm text-white/60">
          بلا مؤقت زمني افتراضيًا. المحاولات والمواعيد تُضبط من الإعدادات.
        </p>
        <div className="mt-4">
          <MutationForm action={createHomeworkDraftAction} submitLabel="إنشاء المسودة">
            <input type="hidden" name="course_id" value={courseId} />
            <input name="title" required minLength={2} placeholder="عنوان الواجب" className={fieldClass} />
            <textarea
              name="description"
              rows={3}
              placeholder="تعليمات الواجب (اختياري)"
              className={fieldClass}
            />
            <label className="block text-xs text-white/55">
              القسم
              <select name="semester_id" required className={`mt-1 ${fieldClass}`}>
                <option value="">اختر القسم</option>
                {semesters.map((semester) => (
                  <option key={semester.id} value={semester.id}>
                    {semester.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-white/55">
                عدد المحاولات
                <select name="maxAttempts" defaultValue="1" className={`mt-1 ${fieldClass}`}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="unlimited">غير محدود</option>
                </select>
              </label>
              <label className="text-xs text-white/55">
                سياسة إظهار الإجابات
                <select
                  name="feedbackReleasePolicy"
                  defaultValue="on_finalize"
                  className={`mt-1 ${fieldClass}`}
                >
                  <option value="on_finalize">بعد اعتماد التصحيح</option>
                  <option value="after_due">بعد موعد التسليم</option>
                  <option value="never">عدم إظهار الإجابات الصحيحة</option>
                </select>
              </label>
              <label className="text-xs text-white/55">
                بداية الإتاحة (اختياري)
                <input name="availableFrom" type="datetime-local" className={`mt-1 ${fieldClass}`} />
              </label>
              <label className="text-xs text-white/55">
                موعد التسليم (اختياري)
                <input name="dueAt" type="datetime-local" className={`mt-1 ${fieldClass}`} />
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
          <div>
            <h3 className="text-base font-semibold text-white">{homework.title}</h3>
            <p className="mt-1 text-xs text-white/50">
              {homework.courseTitle} · {homework.semesterTitle}
            </p>
          </div>
          <span
            className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
              homework.isPublished
                ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
                : "border-white/15 bg-white/5 text-white/70"
            }`}
          >
            {homework.isPublished ? "منشور" : "مسودة"}
          </span>
        </div>

        <div className="mt-4">
          <MutationForm action={updateHomeworkSettingsAction} submitLabel="حفظ الإعدادات">
            <input type="hidden" name="course_id" value={courseId} />
            <input type="hidden" name="homework_id" value={homework.id} />
            <input
              name="title"
              required
              minLength={2}
              defaultValue={homework.title}
              className={fieldClass}
            />
            <textarea
              name="description"
              rows={3}
              defaultValue={homework.description}
              className={fieldClass}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-white/55">
                عدد المحاولات
                <select
                  name="maxAttempts"
                  defaultValue={
                    homework.maxAttempts == null
                      ? "unlimited"
                      : String(homework.maxAttempts)
                  }
                  className={`mt-1 ${fieldClass}`}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="unlimited">غير محدود</option>
                </select>
              </label>
              <label className="text-xs text-white/55">
                سياسة إظهار الإجابات
                <select
                  name="feedbackReleasePolicy"
                  defaultValue={homework.feedbackReleasePolicy}
                  className={`mt-1 ${fieldClass}`}
                >
                  <option value="on_finalize">بعد اعتماد التصحيح</option>
                  <option value="after_due">بعد موعد التسليم</option>
                  <option value="never">عدم إظهار الإجابات الصحيحة</option>
                </select>
              </label>
              <label className="text-xs text-white/55">
                بداية الإتاحة
                <input
                  name="availableFrom"
                  type="datetime-local"
                  defaultValue={toLocalInput(homework.availableFrom)}
                  className={`mt-1 ${fieldClass}`}
                />
              </label>
              <label className="text-xs text-white/55">
                موعد التسليم
                <input
                  name="dueAt"
                  type="datetime-local"
                  defaultValue={toLocalInput(homework.dueAt)}
                  className={`mt-1 ${fieldClass}`}
                />
              </label>
            </div>
          </MutationForm>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {homework.isPublished ? (
            <ConfirmationDialog
              triggerLabel="إلغاء النشر"
              title="إلغاء نشر الواجب"
              description="سيختفي الواجب من منهج الطلاب غير المكتمل، والمحاولات السابقة تبقى."
              confirmLabel="إلغاء النشر"
              onConfirm={setHomeworkPublishAction.bind(null, courseId, homework.id, false)}
            />
          ) : (
            <ConfirmationDialog
              triggerLabel="نشر الواجب"
              title="نشر الواجب للطلاب المشتركين"
              description="سيظهر في منهج الكورس للمشتركين فقط."
              confirmLabel="نشر"
              onConfirm={setHomeworkPublishAction.bind(null, courseId, homework.id, true)}
            />
          )}
          <ConfirmationDialog
            triggerLabel="حذف الواجب"
            title="حذف الواجب"
            description="يُسمح فقط إن لم توجد محاولات طلاب."
            confirmLabel="حذف"
            danger
            onConfirm={deleteHomeworkAction.bind(null, courseId, homework.id)}
          />
        </div>
        <p className="mt-3 text-xs text-white/45">
          مجموع الدرجات: {homework.totalPoints} · عدد الأسئلة: {homework.questionsCount}
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white">أسئلة الواجب</h3>
        {homework.questions.map((question, index) => (
          <HomeworkQuestionEditor
            key={question.id}
            courseId={courseId}
            homeworkId={homework.id}
            question={question}
            canManage={canManage}
            canMoveUp={index > 0}
            canMoveDown={index < homework.questions.length - 1}
          />
        ))}
        <HomeworkQuestionEditor
          courseId={courseId}
          homeworkId={homework.id}
          canManage={canManage}
        />
      </section>
    </div>
  );
}

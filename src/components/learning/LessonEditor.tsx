import { ConfirmationDialog } from "@/components/dashboard/ConfirmationDialog";
import { MutationForm } from "@/components/dashboard/MutationForm";
import { setLessonPublishAction, updateLessonAction } from "@/lib/learning/mutations";
import type { LessonDetailSafe } from "@/lib/learning/types";

type LessonEditorProps = {
  lesson: LessonDetailSafe;
  canEdit: boolean;
};

export function LessonEditor({ lesson, canEdit }: LessonEditorProps) {
  const minutes =
    lesson.durationSeconds == null
      ? ""
      : String(Math.round(lesson.durationSeconds / 60));

  if (!canEdit) {
    return (
      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <p className="text-sm text-white/65">
          تعديل المحتوى يتطلب صلاحية تعديل هذا الكورس.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border border-white/10 bg-surface p-5">
      <div>
        <h3 className="text-base font-semibold text-white">تحرير الدرس</h3>
        <p className="mt-1 text-xs leading-6 text-white/50">
          الدرس يُحفظ مسودة حتى تنشره. إذا كان فيه فيديو، لن يُنشر إلا بعد
          اكتمال معالجة Mux وبسياسة تشغيل موقّعة.
        </p>
      </div>

      <MutationForm action={updateLessonAction} submitLabel="حفظ الدرس">
        <input type="hidden" name="course_id" value={lesson.courseId} />
        <input type="hidden" name="semester_id" value={lesson.semesterId} />
        <input type="hidden" name="lesson_id" value={lesson.id} />
        <div>
          <label className="mb-1.5 block text-sm text-white" htmlFor="title">
            عنوان الدرس
          </label>
          <input
            id="title"
            name="title"
            required
            minLength={2}
            defaultValue={lesson.title}
            className="w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white outline-none focus:border-secondary"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-white" htmlFor="description">
            الوصف
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={lesson.description}
            className="w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white outline-none focus:border-secondary"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-white" htmlFor="duration_minutes">
            المدة بالدقائق (اختياري)
          </label>
          <input
            id="duration_minutes"
            name="duration_minutes"
            type="number"
            min={0}
            max={600}
            defaultValue={minutes}
            className="w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white outline-none focus:border-secondary"
          />
        </div>
      </MutationForm>

      <div className="rounded-xl border border-white/10 bg-background/40 p-3 text-sm text-white/65">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>
            الحالة:{" "}
            <span
              className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
                lesson.isPublished
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                  : "border-white/15 bg-white/5 text-white/70"
              }`}
            >
              {lesson.isPublished ? "منشور" : "مسودة"}
            </span>
          </p>
          {lesson.isPublished ? (
            <ConfirmationDialog
              triggerLabel="إلغاء نشر الدرس"
              title="تأكيد إلغاء نشر الدرس"
              description="لن يتمكن الطلاب من فتح هذا الدرس أو تشغيله. الكورس والتسجيلات لا تتغير."
              confirmLabel="تأكيد إلغاء النشر"
              danger
              onConfirm={setLessonPublishAction.bind(
                null,
                lesson.courseId,
                lesson.semesterId,
                lesson.id,
                false,
              )}
            />
          ) : (
            <ConfirmationDialog
              triggerLabel="نشر الدرس"
              title="تأكيد نشر الدرس"
              description="سيظهر الدرس للطلاب المشتركين إذا كان الكورس منشورًا. إن وُجد فيديو يجب أن يكون جاهزًا وموقّعًا."
              confirmLabel="تأكيد النشر"
              onConfirm={setLessonPublishAction.bind(
                null,
                lesson.courseId,
                lesson.semesterId,
                lesson.id,
                true,
              )}
            />
          )}
        </div>
        <p className="mt-1">الترتيب: {lesson.sortOrder}</p>
        <p className="mt-2 text-xs leading-6">
          الامتحانات المرتبطة:{" "}
          {lesson.relatedExams.length === 0
            ? "لا يوجد امتحان مرتبط. لن يُنشأ امتحان تلقائيًا."
            : lesson.relatedExams.map((exam) => exam.title).join("، ")}
        </p>
      </div>
    </div>
  );
}

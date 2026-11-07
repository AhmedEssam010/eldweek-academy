import { LessonVideoUpload } from "@/components/learning/LessonVideoUpload";
import { ProtectedMuxPlayer } from "@/components/learning/ProtectedMuxPlayer";
import { getMuxReadiness } from "@/lib/learning/mux";
import { getStaffLessonPreview, inspectLessonVideoSetup } from "@/lib/learning/video";

const title = {
  not_configured: "لم يُضبط فيديو",
  pending: "الفيديو قيد المعالجة",
  ready: "الفيديو جاهز",
  unavailable: "تعذر التحقق من الفيديو",
} as const;

export async function LessonVideoSetup({
  courseId,
  semesterId,
  lessonId,
  canEdit,
}: {
  courseId: string;
  semesterId: string;
  lessonId: string;
  canEdit: boolean;
}) {
  const setup = await inspectLessonVideoSetup(lessonId);
  const muxReady = getMuxReadiness().ready;
  const preview = canEdit && setup.status === "ready" ? await getStaffLessonPreview(lessonId) : null;

  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-5">
      <h3 className="text-base font-semibold text-white">الفيديو</h3>
      <p className="mt-2 text-sm font-medium text-light-purple">{title[setup.status]}</p>
      <p className="mt-2 text-sm leading-7 text-white/65">{setup.message}</p>
      {preview ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
          <ProtectedMuxPlayer playbackId={preview.playbackId} token={preview.token} />
        </div>
      ) : null}
      {canEdit && muxReady ? (
        <LessonVideoUpload courseId={courseId} semesterId={semesterId} lessonId={lessonId} />
      ) : (
        <p className="mt-3 text-xs leading-6 text-white/45">
          {canEdit
            ? "الرفع غير متاح حتى تُضبط مفاتيح Mux ومفتاح الخدمة على الخادم. لا يُعرض معرّف الفيديو ولا يُستخدم تشغيل عام."
            : "تعديل الفيديو يتطلب صلاحية تعديل هذا الكورس."}
        </p>
      )}
    </section>
  );
}

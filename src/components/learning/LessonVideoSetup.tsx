import { LessonVideoSourcePanel } from "@/components/learning/LessonVideoSourcePanel";
import { getMuxReadiness } from "@/lib/learning/mux";
import { getStaffLessonPreview, inspectLessonVideoSetup } from "@/lib/learning/video";
import { getStaffLessonYoutubeSetup } from "@/lib/learning/youtube-actions";

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
  const [setup, youtubeSetup] = await Promise.all([
    inspectLessonVideoSetup(lessonId),
    getStaffLessonYoutubeSetup(lessonId),
  ]);
  const muxReady = getMuxReadiness().ready;
  const muxPreview =
    canEdit && setup.status === "ready" && youtubeSetup.source !== "youtube"
      ? await getStaffLessonPreview(lessonId)
      : null;

  const statusLabel =
    youtubeSetup.source === "youtube"
      ? "مصدر يوتيوب جاهز"
      : title[setup.status];

  const message =
    youtubeSetup.source === "youtube"
      ? "الدرس مربوط بفيديو يوتيوب. التضمين يعتمد على إعدادات يوتيوب (عام/غير مدرج مع السماح بالتضمين)."
      : setup.message;

  return (
    <LessonVideoSourcePanel
      courseId={courseId}
      semesterId={semesterId}
      lessonId={lessonId}
      canEdit={canEdit}
      muxReady={muxReady}
      initialSource={youtubeSetup.source}
      youtubeVideoId={youtubeSetup.youtubeVideoId}
      hasMuxAsset={youtubeSetup.hasMuxAsset}
      muxPreview={muxPreview}
      setupStatusLabel={statusLabel}
      setupMessage={message}
    />
  );
}

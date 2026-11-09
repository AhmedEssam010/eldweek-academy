import Link from "next/link";
import { LockedLessonState } from "@/components/learning/LockedLessonState";
import { ProtectedMuxPlayer } from "@/components/learning/ProtectedMuxPlayer";
import { YoutubeEmbedPlayer } from "@/components/learning/YoutubeEmbedPlayer";
import { LearningProgress } from "@/components/learning/LearningProgress";
import type {
  LessonDetailSafe,
  PlaybackAuthorization,
} from "@/lib/learning/types";

type LessonVideoPlayerProps = {
  lesson: LessonDetailSafe;
  playback: PlaybackAuthorization;
  locked?: boolean;
  lessonBasePath?: string;
};

export function LessonVideoPlayer({
  lesson,
  playback,
  locked = false,
  lessonBasePath = "/student/lessons",
}: LessonVideoPlayerProps) {
  const showLocked =
    locked ||
    playback.status === "locked" ||
    playback.status === "forbidden";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-white/45">
          {lesson.courseTitle} · {lesson.semesterTitle}
        </p>
        <h2 className="mt-1 text-2xl font-bold text-white">{lesson.title}</h2>
        <p className="mt-2 text-sm leading-7 text-white/65">
          {lesson.description || "لا يوجد وصف لهذا الدرس."}
        </p>
      </div>

      {showLocked ? (
        <LockedLessonState
          message={
            playback.status === "locked" || playback.status === "forbidden"
              ? playback.message
              : undefined
          }
        />
      ) : playback.status === "processing" ? (
        <div className="flex aspect-video items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6 text-center">
          <div>
            <p className="text-sm font-semibold text-amber-100">الفيديو قيد المعالجة</p>
            <p className="mt-2 max-w-md text-sm leading-7 text-amber-50/80">
              {playback.message}
            </p>
          </div>
        </div>
      ) : playback.status === "setup_required" ||
        playback.status === "unavailable" ? (
        <div className="flex aspect-video items-center justify-center rounded-2xl border border-secondary/30 bg-secondary/10 p-6 text-center">
          <p className="max-w-md text-sm leading-7 text-light-purple">
            {playback.message}
          </p>
        </div>
      ) : playback.status === "authorized" ? (
        <div className="space-y-2" key={`${lesson.id}-${playback.source}`}>
          <p className="text-xs text-white/45">
            {playback.source === "youtube"
              ? "تشغيل يوتيوب داخل الصفحة (حماية أضعف من Mux)."
              : "جارٍ تجهيز التشغيل الموقّع والمؤقت."}
          </p>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
            {playback.source === "youtube" ? (
              <YoutubeEmbedPlayer
                videoId={playback.youtubeVideoId}
                title={lesson.title}
              />
            ) : (
              <ProtectedMuxPlayer
                playbackId={playback.muxPlaybackId}
                token={playback.muxPlaybackToken}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl border border-primary/30 bg-[radial-gradient(circle_at_center,_rgba(124,58,237,0.2),_#0B0913_70%)] p-6 text-center">
          <p className="text-sm font-medium text-white">منطقة التشغيل الآمنة</p>
          <p className="max-w-lg text-sm leading-7 text-white/65">
            {playback.status === "provider_unconfigured"
              ? playback.message
              : "بانتظار تفويض الخادم."}
          </p>
          <p className="text-xs text-white/40">
            لا روابط عامة · لا معرّفات تخزين في الواجهة · لا DRM مُعلَن
          </p>
        </div>
      )}

      <LearningProgress percent={null} />

      <div className="flex flex-wrap gap-2">
        {lesson.previousLessonId ? (
          <Link
            href={`${lessonBasePath}/${lesson.previousLessonId}`}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            الدرس السابق
          </Link>
        ) : null}
        {lesson.nextLessonId ? (
          <Link
            href={`${lessonBasePath}/${lesson.nextLessonId}`}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            الدرس التالي
          </Link>
        ) : null}
      </div>
    </div>
  );
}

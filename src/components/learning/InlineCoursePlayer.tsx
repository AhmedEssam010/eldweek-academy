"use client";

import { ProtectedMuxPlayer } from "@/components/learning/ProtectedMuxPlayer";
import { YoutubeEmbedPlayer } from "@/components/learning/YoutubeEmbedPlayer";
import { LockedLessonState } from "@/components/learning/LockedLessonState";
import type {
  LessonDetailSafe,
  PlaybackAuthorization,
} from "@/lib/learning/types";

type InlineCoursePlayerProps = {
  selectedLessonId: string | null;
  loading: boolean;
  lesson: LessonDetailSafe | null;
  playback: PlaybackAuthorization | null;
  errorMessage: string | null;
  previewMode?: boolean;
};

/**
 * مشغّل مضمّن — يُعرض فقط عند اختيار درس.
 * لا صورة غلاف ولا عنصر نائب فارغ في الحالة الافتراضية.
 */
export function InlineCoursePlayer({
  selectedLessonId,
  loading,
  lesson,
  playback,
  errorMessage,
  previewMode = false,
}: InlineCoursePlayerProps) {
  if (!selectedLessonId) return null;

  if (previewMode) {
    return (
      <div className="overflow-hidden rounded-3xl border border-amber-400/25 bg-surface">
        <div className="flex aspect-video items-center justify-center bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.18),#0b0913_70%)] p-6 text-center">
          <div className="max-w-md space-y-2">
            <p className="text-sm font-semibold text-amber-50">
              معاينة فقط — بدون تشغيل موقّع
            </p>
            <p className="text-sm leading-7 text-amber-50/80">
              التشغيل الآمن متاح للطالب المشترك داخل صفحة الكورس بعد اعتماد
              الاشتراك. لا يُتجاوز أمان Mux من المعاينة.
            </p>
          </div>
        </div>
        <div className="border-t border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">
            {lesson?.title ?? "درس محدد للمعاينة"}
          </h2>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-surface">
        <div className="flex aspect-video items-center justify-center bg-background/80 p-6">
          <p className="text-sm text-white/70">جارٍ تجهيز التشغيل الآمن…</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !lesson || !playback) {
    return (
      <div className="overflow-hidden rounded-3xl border border-red-400/20 bg-surface">
        <div className="flex aspect-video items-center justify-center p-6 text-center">
          <p className="max-w-md text-sm leading-7 text-red-100">
            {errorMessage ?? "تعذر تحميل الدرس المحدد."}
          </p>
        </div>
        {lesson?.title ? (
          <div className="border-t border-white/10 px-5 py-4">
            <h2 className="text-lg font-semibold text-white">{lesson.title}</h2>
          </div>
        ) : null}
      </div>
    );
  }

  const showLocked =
    playback.status === "locked" || playback.status === "forbidden";

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-surface">
      {showLocked ? (
        <LockedLessonState
          message={
            playback.status === "locked" || playback.status === "forbidden"
              ? playback.message
              : undefined
          }
        />
      ) : playback.status === "processing" ? (
        <div className="flex aspect-video items-center justify-center bg-amber-400/10 p-6 text-center">
          <div>
            <p className="text-sm font-semibold text-amber-100">
              الفيديو قيد المعالجة
            </p>
            <p className="mt-2 max-w-md text-sm leading-7 text-amber-50/80">
              {playback.message}
            </p>
          </div>
        </div>
      ) : playback.status === "setup_required" ||
        playback.status === "unavailable" ? (
        <div className="flex aspect-video items-center justify-center bg-secondary/10 p-6 text-center">
          <p className="max-w-md text-sm leading-7 text-light-purple">
            {playback.message}
          </p>
        </div>
      ) : playback.status === "authorized" ? (
        <div
          key={`${lesson.id}-${playback.source}`}
          className="overflow-hidden bg-black"
        >
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
      ) : (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_center,_rgba(124,58,237,0.2),_#0B0913_70%)] p-6 text-center">
          <p className="text-sm font-medium text-white">منطقة التشغيل الآمنة</p>
          <p className="max-w-lg text-sm leading-7 text-white/65">
            {playback.status === "provider_unconfigured"
              ? playback.message
              : "بانتظار تفويض الخادم."}
          </p>
        </div>
      )}

      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-xs text-white/45">
          {lesson.courseTitle}
          {lesson.semesterTitle ? ` · ${lesson.semesterTitle}` : ""}
        </p>
        <h2 className="mt-1 text-xl font-bold text-white sm:text-2xl">
          {lesson.title}
        </h2>
        {lesson.description ? (
          <p className="mt-2 line-clamp-3 text-sm leading-7 text-white/60">
            {lesson.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

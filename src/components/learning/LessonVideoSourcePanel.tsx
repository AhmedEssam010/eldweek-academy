"use client";

import { useState } from "react";
import { LessonVideoUpload } from "@/components/learning/LessonVideoUpload";
import { LessonYoutubeForm } from "@/components/learning/LessonYoutubeForm";
import { ProtectedMuxPlayer } from "@/components/learning/ProtectedMuxPlayer";
import { YoutubeEmbedPlayer } from "@/components/learning/YoutubeEmbedPlayer";

type LessonVideoSourcePanelProps = {
  courseId: string;
  semesterId: string;
  lessonId: string;
  canEdit: boolean;
  muxReady: boolean;
  initialSource: "none" | "mux" | "youtube";
  youtubeVideoId: string | null;
  hasMuxAsset: boolean;
  muxPreview: { playbackId: string; token: string } | null;
  setupStatusLabel: string;
  setupMessage: string;
};

export function LessonVideoSourcePanel({
  courseId,
  semesterId,
  lessonId,
  canEdit,
  muxReady,
  initialSource,
  youtubeVideoId,
  hasMuxAsset,
  muxPreview,
  setupStatusLabel,
  setupMessage,
}: LessonVideoSourcePanelProps) {
  const [mode, setMode] = useState<"mux" | "youtube">(
    initialSource === "youtube" ? "youtube" : "mux",
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-5">
      <h3 className="text-base font-semibold text-white">الفيديو</h3>
      <p className="mt-2 text-sm font-medium text-light-purple">
        {setupStatusLabel}
      </p>
      <p className="mt-2 text-sm leading-7 text-white/65">{setupMessage}</p>

      {canEdit ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("mux")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              mode === "mux"
                ? "bg-primary text-white"
                : "border border-white/15 text-white/80 hover:bg-white/5"
            }`}
          >
            رفع فيديو
          </button>
          <button
            type="button"
            onClick={() => setMode("youtube")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              mode === "youtube"
                ? "bg-primary text-white"
                : "border border-white/15 text-white/80 hover:bg-white/5"
            }`}
          >
            رابط يوتيوب
          </button>
        </div>
      ) : null}

      {mode === "youtube" ? (
        <>
          {initialSource === "youtube" && youtubeVideoId ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
              <YoutubeEmbedPlayer
                videoId={youtubeVideoId}
                title="معاينة يوتيوب المحفوظة"
              />
            </div>
          ) : null}
          {canEdit ? (
            <LessonYoutubeForm
              courseId={courseId}
              semesterId={semesterId}
              lessonId={lessonId}
              initialVideoId={youtubeVideoId}
            />
          ) : (
            <p className="mt-3 text-xs text-white/45">
              تعديل يوتيوب يتطلب صلاحية تعديل هذا الكورس.
            </p>
          )}
        </>
      ) : (
        <>
          {muxPreview ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
              <ProtectedMuxPlayer
                playbackId={muxPreview.playbackId}
                token={muxPreview.token}
              />
            </div>
          ) : null}
          {canEdit && muxReady ? (
            <LessonVideoUpload
              courseId={courseId}
              semesterId={semesterId}
              lessonId={lessonId}
            />
          ) : (
            <p className="mt-3 text-xs leading-6 text-white/45">
              {canEdit
                ? "الرفع غير متاح حتى تُضبط مفاتيح Mux ومفتاح الخدمة على الخادم."
                : "تعديل الفيديو يتطلب صلاحية تعديل هذا الكورس."}
            </p>
          )}
          {hasMuxAsset ? (
            <p className="mt-2 text-xs text-white/40">
              يوجد أصل Mux محفوظ لهذا الدرس
              {initialSource === "youtube"
                ? " (غير نشط أثناء اختيار يوتيوب)."
                : "."}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

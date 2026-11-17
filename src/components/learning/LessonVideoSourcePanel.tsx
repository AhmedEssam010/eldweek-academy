"use client";

import { useState } from "react";
import { LessonLibraryPicker } from "@/components/learning/LessonLibraryPicker";
import { LessonVideoUpload } from "@/components/learning/LessonVideoUpload";
import { LessonYoutubeForm } from "@/components/learning/LessonYoutubeForm";
import { ProtectedMuxPlayer } from "@/components/learning/ProtectedMuxPlayer";
import { YoutubeEmbedPlayer } from "@/components/learning/YoutubeEmbedPlayer";

type Mode = "upload" | "library" | "youtube";

type LessonVideoSourcePanelProps = {
  courseId: string;
  semesterId: string;
  lessonId: string;
  lessonTitle?: string;
  canEdit: boolean;
  muxReady: boolean;
  initialSource: "none" | "mux" | "youtube";
  youtubeVideoId: string | null;
  hasMuxAsset: boolean;
  muxPreview: { playbackId: string; token: string; expiresAt: string } | null;
  setupStatusLabel: string;
  setupMessage: string;
};

function initialMode(source: "none" | "mux" | "youtube"): Mode {
  if (source === "youtube") return "youtube";
  if (source === "mux") return "library";
  return "upload";
}

export function LessonVideoSourcePanel({
  courseId,
  semesterId,
  lessonId,
  lessonTitle,
  canEdit,
  muxReady,
  initialSource,
  youtubeVideoId,
  hasMuxAsset,
  muxPreview,
  setupStatusLabel,
  setupMessage,
}: LessonVideoSourcePanelProps) {
  const [mode, setMode] = useState<Mode>(initialMode(initialSource));

  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-5">
      <h3 className="text-base font-semibold text-white">مصدر الفيديو</h3>
      <p className="mt-2 text-sm font-medium text-light-purple">{setupStatusLabel}</p>
      <p className="mt-2 text-sm leading-7 text-white/65">{setupMessage}</p>
      <p className="mt-2 text-xs leading-6 text-white/45">
        مصدر نشط واحد فقط لكل درس. تغيير المصدر لا يحذف أصول Mux المحفوظة.
      </p>

      {canEdit ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              { id: "upload" as const, label: "1) رفع فيديو جديد" },
              { id: "library" as const, label: "2) من مكتبة الفيديو" },
              { id: "youtube" as const, label: "3) رابط يوتيوب" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                mode === item.id
                  ? "bg-primary text-white"
                  : "border border-white/15 text-white/80 hover:bg-white/5"
              }`}
            >
              {item.label}
            </button>
          ))}
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
      ) : null}

      {mode === "upload" ? (
        <>
          {muxPreview && initialSource === "mux" ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
              <ProtectedMuxPlayer
                playbackId={muxPreview.playbackId}
                token={muxPreview.token}
                expiresAt={muxPreview.expiresAt}
                lessonId={lessonId}
                courseId={courseId}
                semesterId={semesterId}
                audience="staff"
              />
            </div>
          ) : null}
          {canEdit && muxReady ? (
            <LessonVideoUpload
              courseId={courseId}
              semesterId={semesterId}
              lessonId={lessonId}
              lessonTitle={lessonTitle}
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
              {initialSource === "youtube" ? " (غير نشط أثناء اختيار يوتيوب)." : "."}
            </p>
          ) : null}
        </>
      ) : null}

      {mode === "library" ? (
        <>
          {muxPreview && initialSource === "mux" ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
              <ProtectedMuxPlayer
                playbackId={muxPreview.playbackId}
                token={muxPreview.token}
                expiresAt={muxPreview.expiresAt}
                lessonId={lessonId}
                courseId={courseId}
                semesterId={semesterId}
                audience="staff"
              />
            </div>
          ) : null}
          {canEdit ? (
            <LessonLibraryPicker
              courseId={courseId}
              semesterId={semesterId}
              lessonId={lessonId}
            />
          ) : (
            <p className="mt-3 text-xs text-white/45">
              اختيار من المكتبة يتطلب صلاحية تعديل هذا الكورس.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}

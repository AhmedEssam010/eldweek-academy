"use client";

import { useMemo, useState, useTransition } from "react";
import {
  clearLessonYoutubeAction,
  saveLessonYoutubeAction,
} from "@/lib/learning/youtube-actions";
import {
  parseYoutubeVideoInput,
  youtubeWatchUrl,
} from "@/lib/learning/youtube";
import { YoutubeEmbedPlayer } from "@/components/learning/YoutubeEmbedPlayer";

type LessonYoutubeFormProps = {
  courseId: string;
  semesterId: string;
  lessonId: string;
  initialVideoId: string | null;
};

export function LessonYoutubeForm({
  courseId,
  semesterId,
  lessonId,
  initialVideoId,
}: LessonYoutubeFormProps) {
  const [url, setUrl] = useState(
    initialVideoId ? youtubeWatchUrl(initialVideoId) : "",
  );
  const [savedId, setSavedId] = useState<string | null>(initialVideoId);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = useMemo(() => parseYoutubeVideoInput(url), [url]);

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-white/10 bg-background/40 p-4">
      <div>
        <label
          htmlFor="youtube_url"
          className="mb-1.5 block text-sm font-medium text-white"
        >
          رابط فيديو يوتيوب
        </label>
        <input
          id="youtube_url"
          type="url"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setMessage(null);
            setOk(null);
          }}
          placeholder="https://www.youtube.com/watch?v=…"
          className="w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white outline-none focus:border-secondary"
          dir="ltr"
        />
        <p className="mt-2 text-xs leading-6 text-white/45">
          الصيغ المدعومة: youtube.com/watch و youtu.be و shorts و embed. لا تلصق
          كود iframe. الفيديوهات الخاصة أو المعطّل تضمينها قد لا تعمل. حماية
          يوتيوب أضعف من Mux الموقّع.
        </p>
      </div>

      {preview.ok ? (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <YoutubeEmbedPlayer videoId={preview.videoId} title="معاينة يوتيوب" />
        </div>
      ) : url.trim() ? (
        <p className="text-xs text-red-200">{preview.message}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !preview.ok}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          onClick={() => {
            startTransition(async () => {
              const result = await saveLessonYoutubeAction({
                courseId,
                semesterId,
                lessonId,
                youtubeUrl: url,
              });
              setOk(result.ok);
              setMessage(result.message);
              if (result.ok && result.videoId) {
                setSavedId(result.videoId);
              }
            });
          }}
        >
          {pending ? "جارٍ الحفظ..." : "حفظ رابط يوتيوب"}
        </button>
        {savedId ? (
          <button
            type="button"
            disabled={pending}
            className="rounded-xl border border-red-400/30 px-4 py-2 text-sm text-red-100 disabled:opacity-60"
            onClick={() => {
              startTransition(async () => {
                const result = await clearLessonYoutubeAction({
                  courseId,
                  semesterId,
                  lessonId,
                });
                setOk(result.ok);
                setMessage(result.message);
                if (result.ok) {
                  setSavedId(null);
                  setUrl("");
                }
              });
            }}
          >
            إزالة يوتيوب
          </button>
        ) : null}
      </div>

      {message ? (
        <p
          className={`rounded-xl border px-3 py-2 text-xs ${
            ok
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
              : "border-red-400/30 bg-red-500/10 text-red-100"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

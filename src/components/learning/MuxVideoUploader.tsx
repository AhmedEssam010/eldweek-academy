"use client";

import { useRef, useState } from "react";
import {
  formatBytesMb,
  formatEta,
  formatSpeed,
  runMuxUpchunkUpload,
  type UploadProgressSnapshot,
} from "@/lib/learning/mux-upchunk-upload";

export type MuxUploadCreateResult =
  | { ok: true; uploadId: string; uploadUrl: string; videoLibraryId: string }
  | { ok: false; message: string };

export type MuxUploadSyncResult =
  | { ok: true; state: "waiting" | "processing" | "ready" | "error"; message: string }
  | { ok: false; message: string };

type MuxVideoUploaderProps = {
  titlePlaceholder?: string;
  requireTitle?: boolean;
  initialTitle?: string;
  disabled?: boolean;
  createUpload: (input: { title: string; file: File }) => Promise<MuxUploadCreateResult>;
  syncUpload: (input: {
    uploadId: string;
    videoLibraryId: string;
  }) => Promise<MuxUploadSyncResult>;
  onComplete?: (input: {
    videoLibraryId: string;
    state: "ready" | "processing" | "error";
    message: string;
  }) => void;
  submitLabel?: string;
};

type Phase = "idle" | "preparing" | "uploading" | "processing" | "done" | "error";

export function MuxVideoUploader({
  titlePlaceholder = "عنوان الفيديو",
  requireTitle = false,
  initialTitle = "",
  disabled = false,
  createUpload,
  syncUpload,
  onComplete,
  submitLabel = "رفع إلى Mux",
}: MuxVideoUploaderProps) {
  const [title, setTitle] = useState(initialTitle);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgressSnapshot | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{
    title: string;
    file: File;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function pollProcessing(uploadId: string, videoLibraryId: string) {
    setPhase("processing");
    setMessage("اكتمل الرفع. جارٍ معالجة الفيديو عند Mux...");
    let last = "جارٍ المعالجة...";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const synced = await syncUpload({ uploadId, videoLibraryId });
      if (!synced.ok) {
        setPhase("error");
        setMessage(synced.message);
        onComplete?.({ videoLibraryId, state: "error", message: synced.message });
        return;
      }
      last = synced.message;
      setMessage(synced.message);
      if (synced.state === "ready") {
        setPhase("done");
        onComplete?.({ videoLibraryId, state: "ready", message: synced.message });
        return;
      }
      if (synced.state === "error") {
        setPhase("error");
        onComplete?.({ videoLibraryId, state: "error", message: synced.message });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    setPhase("done");
    setMessage(`${last} — حدّث الصفحة لاحقًا أو انتظر إشعار المعالجة.`);
    onComplete?.({ videoLibraryId, state: "processing", message: last });
  }

  async function startUpload(nextTitle: string, nextFile: File) {
    if (disabled) return;
    if (requireTitle && nextTitle.trim().length < 1) {
      setPhase("error");
      setMessage("أدخل عنوانًا للفيديو.");
      return;
    }
    if (nextFile.size <= 0) {
      setPhase("error");
      setMessage("اختر ملف فيديو صالحًا.");
      return;
    }

    setLastAttempt({ title: nextTitle, file: nextFile });
    setPhase("preparing");
    setMessage("جارٍ تجهيز رابط الرفع الآمن...");
    setProgress(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const created = await createUpload({ title: nextTitle, file: nextFile });
    if (!created.ok) {
      setPhase("error");
      setMessage(created.message);
      return;
    }

    setPhase("uploading");
    setMessage("جارٍ رفع الملف مباشرة إلى Mux...");
    try {
      await runMuxUpchunkUpload({
        uploadUrl: created.uploadUrl,
        file: nextFile,
        signal: abortRef.current.signal,
        onProgress: setProgress,
      });
    } catch (error) {
      const text =
        error instanceof Error && error.message
          ? error.message === "upload_aborted"
            ? "أُلغي الرفع."
            : `تعذر رفع الملف إلى Mux: ${error.message}`
          : "تعذر رفع الملف إلى Mux. تحقق من الاتصال وأعد المحاولة.";
      setPhase("error");
      setMessage(text);
      return;
    }

    await pollProcessing(created.uploadId, created.videoLibraryId);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setPhase("error");
      setMessage("اختر ملف فيديو أولًا.");
      return;
    }
    void startUpload(title, file);
  }

  const busy = phase === "preparing" || phase === "uploading" || phase === "processing";

  return (
    <form onSubmit={onSubmit} className="w-full min-w-0 max-w-full space-y-3">
      {requireTitle || titlePlaceholder ? (
        <label className="block text-xs text-white/55">
          عنوان الفيديو
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={busy || disabled}
            placeholder={titlePlaceholder}
            className="mt-1 w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white"
          />
        </label>
      ) : null}

      <input
        type="file"
        accept="video/*"
        disabled={busy || disabled}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        className="block w-full text-sm text-white/80 file:me-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || disabled}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {phase === "uploading"
            ? "جارٍ الرفع..."
            : phase === "processing"
              ? "جارٍ المعالجة..."
              : submitLabel}
        </button>
        {phase === "error" && lastAttempt ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void startUpload(lastAttempt.title, lastAttempt.file)}
            className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/5"
          >
            إعادة المحاولة
          </button>
        ) : null}
      </div>

      {phase === "uploading" && progress ? (
        <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between text-xs text-white/70">
            <span>تقدم الرفع</span>
            <span>{progress.percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="text-xs leading-6 text-white/55">
            {formatBytesMb(progress.loadedBytes)} م.ب / {formatBytesMb(progress.totalBytes)} م.ب
            {formatSpeed(progress.speedBytesPerSec)
              ? ` · ${formatSpeed(progress.speedBytesPerSec)}`
              : ""}
            {formatEta(progress.etaSeconds)
              ? ` · متبقي تقريبًا ${formatEta(progress.etaSeconds)}`
              : ""}
          </p>
        </div>
      ) : null}

      {phase === "processing" ? (
        <p className="text-xs text-amber-200/80">
          اكتمل الرفع. المعالجة عند Mux منفصلة عن نسبة الرفع ولن يُعتبر الفيديو قابلاً للتشغيل حتى يصبح جاهزًا.
        </p>
      ) : null}

      {message ? (
        <p
          className={`text-sm leading-7 ${
            phase === "error"
              ? "text-red-300"
              : phase === "done"
                ? "text-emerald-300"
                : "text-white/70"
          }`}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}

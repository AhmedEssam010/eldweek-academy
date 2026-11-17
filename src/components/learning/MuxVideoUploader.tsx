"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatBytesMb,
  formatEta,
  formatSpeed,
  runMuxUpchunkUpload,
  type UploadProgressSnapshot,
} from "@/lib/learning/mux-upchunk-upload";
import {
  clearMuxUploadSession,
  loadMuxUploadSession,
  patchMuxUploadSessionProgress,
  saveMuxUploadSession,
} from "@/lib/learning/mux-upload-session";

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
  /**
   * مفتاح جلسة محلية لاستكمال الرفع بعد تحديث الصفحة.
   * مثال: "video-library" أو `lesson:${lessonId}`
   */
  persistenceKey?: string;
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

type ActiveUpload = {
  uploadId: string;
  uploadUrl: string;
  videoLibraryId: string;
  title: string;
  file: File;
};

export function MuxVideoUploader({
  titlePlaceholder = "عنوان الفيديو",
  requireTitle = false,
  initialTitle = "",
  disabled = false,
  persistenceKey,
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
  const [restoring, setRestoring] = useState(Boolean(persistenceKey));
  const abortRef = useRef<AbortController | null>(null);
  const resumeStartedRef = useRef(false);
  const lastPersistAtRef = useRef(0);

  async function persistProgress(
    key: string,
    snapshot: UploadProgressSnapshot,
    nextPhase: "uploading" | "processing",
  ) {
    const now = Date.now();
    if (now - lastPersistAtRef.current < 800 && snapshot.percent < 100) {
      return;
    }
    lastPersistAtRef.current = now;
    await patchMuxUploadSessionProgress(key, {
      percent: snapshot.percent,
      loadedBytes: snapshot.loadedBytes,
      phase: nextPhase,
      updatedAt: now,
    });
  }

  async function pollProcessing(uploadId: string, videoLibraryId: string) {
    setPhase("processing");
    setMessage("اكتمل الرفع. جارٍ معالجة الفيديو عند Mux...");
    if (persistenceKey) {
      await patchMuxUploadSessionProgress(persistenceKey, {
        percent: 100,
        phase: "processing",
        updatedAt: Date.now(),
      });
    }

    let last = "جارٍ المعالجة...";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const synced = await syncUpload({ uploadId, videoLibraryId });
      if (!synced.ok) {
        setPhase("error");
        setMessage(synced.message);
        if (persistenceKey) await clearMuxUploadSession(persistenceKey);
        onComplete?.({ videoLibraryId, state: "error", message: synced.message });
        return;
      }
      last = synced.message;
      setMessage(synced.message);
      if (synced.state === "ready") {
        setPhase("done");
        if (persistenceKey) await clearMuxUploadSession(persistenceKey);
        onComplete?.({ videoLibraryId, state: "ready", message: synced.message });
        return;
      }
      if (synced.state === "error") {
        setPhase("error");
        if (persistenceKey) await clearMuxUploadSession(persistenceKey);
        onComplete?.({ videoLibraryId, state: "error", message: synced.message });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    setPhase("done");
    setMessage(`${last} — حدّث الصفحة لاحقًا أو انتظر إشعار المعالجة.`);
    if (persistenceKey) await clearMuxUploadSession(persistenceKey);
    onComplete?.({ videoLibraryId, state: "processing", message: last });
  }

  async function transferFile(
    active: ActiveUpload,
    options?: { resumeFromByte?: number; resuming?: boolean },
  ) {
    setPhase("uploading");
    setMessage(
      options?.resuming
        ? "جارٍ استكمال الرفع من حيث توقّف بعد تحديث الصفحة..."
        : "جارٍ رفع الملف مباشرة إلى Mux...",
    );

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      await runMuxUpchunkUpload({
        uploadUrl: active.uploadUrl,
        file: active.file,
        signal: abortRef.current.signal,
        resumeFromByte: options?.resumeFromByte,
        onProgress: (snapshot) => {
          setProgress(snapshot);
          if (persistenceKey) {
            void persistProgress(persistenceKey, snapshot, "uploading");
          }
        },
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

    await pollProcessing(active.uploadId, active.videoLibraryId);
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

    if (persistenceKey) {
      await saveMuxUploadSession({
        meta: {
          key: persistenceKey,
          uploadUrl: created.uploadUrl,
          uploadId: created.uploadId,
          videoLibraryId: created.videoLibraryId,
          title: nextTitle,
          fileName: nextFile.name,
          fileSize: nextFile.size,
          fileType: nextFile.type || "video/mp4",
          fileLastModified: nextFile.lastModified,
          percent: 0,
          loadedBytes: 0,
          phase: "uploading",
          updatedAt: Date.now(),
        },
        file: nextFile,
      });
    }

    await transferFile(
      {
        uploadId: created.uploadId,
        uploadUrl: created.uploadUrl,
        videoLibraryId: created.videoLibraryId,
        title: nextTitle,
        file: nextFile,
      },
      { resumeFromByte: 0 },
    );
  }

  useEffect(() => {
    if (!persistenceKey || resumeStartedRef.current) {
      setRestoring(false);
      return;
    }
    resumeStartedRef.current = true;
    let cancelled = false;

    void (async () => {
      const saved = await loadMuxUploadSession(persistenceKey);
      if (cancelled) return;

      if (!saved) {
        setRestoring(false);
        return;
      }

      setTitle(saved.meta.title);
      setFile(saved.file);
      setLastAttempt({ title: saved.meta.title, file: saved.file });
      setProgress({
        percent: saved.meta.percent,
        loadedBytes: saved.meta.loadedBytes,
        totalBytes: saved.meta.fileSize,
        speedBytesPerSec: null,
        etaSeconds: null,
      });
      setRestoring(false);

      if (saved.meta.phase === "processing") {
        setMessage("اكتمل الرفع سابقًا. جارٍ متابعة معالجة Mux...");
        await pollProcessing(saved.meta.uploadId, saved.meta.videoLibraryId);
        return;
      }

      // لا نمرّر resumeFromByte حتى يُسأل خادم Mux عن الإزاحة الحقيقية بعد الريفرش
      await transferFile(
        {
          uploadId: saved.meta.uploadId,
          uploadUrl: saved.meta.uploadUrl,
          videoLibraryId: saved.meta.videoLibraryId,
          title: saved.meta.title,
          file: saved.file,
        },
        { resuming: true },
      );
    })();

    return () => {
      cancelled = true;
    };
    // يُستأنف مرة واحدة عند التركيب لمفتاح الجلسة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistenceKey]);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setPhase("error");
      setMessage("اختر ملف فيديو أولًا.");
      return;
    }
    void startUpload(title, file);
  }

  const busy =
    restoring ||
    phase === "preparing" ||
    phase === "uploading" ||
    phase === "processing";

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
          {restoring
            ? "جارٍ استعادة الرفع..."
            : phase === "uploading"
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

      {(phase === "uploading" || restoring) && progress ? (
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

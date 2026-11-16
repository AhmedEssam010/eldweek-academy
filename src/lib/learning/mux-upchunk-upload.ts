"use client";

import { createUpload } from "@mux/upchunk";

export type UploadProgressSnapshot = {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  speedBytesPerSec: number | null;
  etaSeconds: number | null;
};

export type RunMuxUpchunkUploadOptions = {
  uploadUrl: string;
  file: File;
  onProgress: (snapshot: UploadProgressSnapshot) => void;
  signal?: AbortSignal;
};

/**
 * رفع مباشر إلى Mux عبر UpChunk (بروتوكول tus/chunked المدعوم رسميًا).
 * النسب من أحداث progress الحقيقية فقط — بلا مؤقتات وهمية.
 */
export function runMuxUpchunkUpload(
  options: RunMuxUpchunkUploadOptions,
): Promise<void> {
  const { uploadUrl, file, onProgress, signal } = options;
  const totalBytes = file.size;

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let lastLoaded = 0;
    let lastAt = startedAt;

    const upload = createUpload({
      endpoint: uploadUrl,
      file,
      method: "PUT",
      // حجم شريحة متوافق مع توصية Mux (بالكيلوبايت)
      chunkSize: 5120,
      attempts: 5,
      dynamicChunkSize: true,
    });

    const onAbort = () => {
      upload.abort();
      reject(new Error("upload_aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    upload.on("progress", (event) => {
      const percentRaw = Number(event.detail);
      const percent = Number.isFinite(percentRaw)
        ? Math.max(0, Math.min(100, Math.round(percentRaw)))
        : 0;
      const loadedBytes = Math.round((percent / 100) * totalBytes);
      const now = Date.now();
      const dt = (now - lastAt) / 1000;
      let speedBytesPerSec: number | null = null;
      let etaSeconds: number | null = null;
      if (dt >= 0.4 && loadedBytes >= lastLoaded) {
        const delta = loadedBytes - lastLoaded;
        speedBytesPerSec = delta / dt;
        const remaining = Math.max(0, totalBytes - loadedBytes);
        if (speedBytesPerSec > 1024) {
          etaSeconds = remaining / speedBytesPerSec;
        }
        lastLoaded = loadedBytes;
        lastAt = now;
      }
      onProgress({
        percent,
        loadedBytes,
        totalBytes,
        speedBytesPerSec,
        etaSeconds,
      });
    });

    upload.on("success", () => {
      signal?.removeEventListener("abort", onAbort);
      onProgress({
        percent: 100,
        loadedBytes: totalBytes,
        totalBytes,
        speedBytesPerSec: null,
        etaSeconds: 0,
      });
      resolve();
    });

    upload.on("error", (event) => {
      signal?.removeEventListener("abort", onAbort);
      const detail = event.detail as { message?: string; responseCode?: number } | string;
      const message =
        typeof detail === "string"
          ? detail
          : detail?.message ||
            (detail?.responseCode
              ? `فشل الرفع (رمز ${detail.responseCode})`
              : "فشل رفع الملف إلى Mux");
      reject(new Error(message));
    });
  });
}

export function formatBytesMb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0";
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function formatEta(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 5) return "ثوانٍ";
  if (seconds < 60) return `${Math.round(seconds)} ث`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins} د ${secs} ث`;
}

export function formatSpeed(bytesPerSec: number | null): string | null {
  if (bytesPerSec == null || !Number.isFinite(bytesPerSec) || bytesPerSec < 1024) {
    return null;
  }
  const mbps = bytesPerSec / (1024 * 1024);
  if (mbps >= 0.1) return `${mbps.toFixed(1)} م.ب/ث`;
  return `${Math.round(bytesPerSec / 1024)} ك.ب/ث`;
}

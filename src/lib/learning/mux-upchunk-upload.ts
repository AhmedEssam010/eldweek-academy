"use client";

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
  /** إن وُجد يُستخدم مباشرة؛ وإلا نسأل خادم الرفع عن الإزاحة الحالية. */
  resumeFromByte?: number;
};

/** حجم الشريحة بالبايت — مضاعف 256KiB كما يتطلب بروتوكول GCS/Mux. */
const CHUNK_BYTES = 5120 * 1024;

function xhrPut(input: {
  url: string;
  body: Blob | null;
  headers: Record<string, string>;
  signal?: AbortSignal;
  onUploadProgress?: (loaded: number, total: number) => void;
}): Promise<{ status: number; rangeHeader: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", input.url, true);
    for (const [key, value] of Object.entries(input.headers)) {
      xhr.setRequestHeader(key, value);
    }

    const onAbort = () => {
      xhr.abort();
      reject(new Error("upload_aborted"));
    };
    input.signal?.addEventListener("abort", onAbort, { once: true });

    xhr.upload.onprogress = (event) => {
      if (!input.onUploadProgress) return;
      const total = event.lengthComputable ? event.total : 0;
      input.onUploadProgress(event.loaded, total);
    };

    xhr.onload = () => {
      input.signal?.removeEventListener("abort", onAbort);
      resolve({
        status: xhr.status,
        rangeHeader: xhr.getResponseHeader("Range"),
      });
    };
    xhr.onerror = () => {
      input.signal?.removeEventListener("abort", onAbort);
      reject(new Error("network_error"));
    };
    xhr.onabort = () => {
      input.signal?.removeEventListener("abort", onAbort);
      reject(new Error("upload_aborted"));
    };

    xhr.send(input.body);
  });
}

/**
 * يسأل جلسة الرفع القابلة للاستئناف عن آخر بايت مُستلم (GCS 308 + Range).
 */
export async function queryMuxUploadOffset(
  uploadUrl: string,
  totalBytes: number,
  signal?: AbortSignal,
): Promise<number> {
  try {
    const result = await xhrPut({
      url: uploadUrl,
      body: new Blob([]),
      headers: {
        "Content-Range": `bytes */${totalBytes}`,
      },
      signal,
    });

    if (result.status === 200 || result.status === 201) {
      return totalBytes;
    }

    if (result.rangeHeader) {
      const match = /bytes=0-(\d+)/i.exec(result.rangeHeader);
      if (match) {
        return Number(match[1]) + 1;
      }
    }

    // 308 بدون Range = لم يُرفع شيء بعد
    if (result.status === 308 || result.status === 503) {
      return 0;
    }

    return 0;
  } catch (error) {
    if (error instanceof Error && error.message === "upload_aborted") {
      throw error;
    }
    return 0;
  }
}

function emitProgress(
  onProgress: (snapshot: UploadProgressSnapshot) => void,
  loadedBytes: number,
  totalBytes: number,
  speedBytesPerSec: number | null,
  etaSeconds: number | null,
) {
  const percent =
    totalBytes > 0
      ? Math.max(0, Math.min(100, Math.round((loadedBytes / totalBytes) * 100)))
      : 0;
  onProgress({
    percent,
    loadedBytes,
    totalBytes,
    speedBytesPerSec,
    etaSeconds,
  });
}

/**
 * رفع مباشر إلى Mux ببروتوكول Content-Range القابل للاستئناف.
 * بعد تحديث الصفحة يُكمَل من آخر إزاحة مؤكَّدة على الخادم — بلا مؤقتات وهمية.
 */
export async function runMuxUpchunkUpload(
  options: RunMuxUpchunkUploadOptions,
): Promise<void> {
  const { uploadUrl, file, onProgress, signal } = options;
  const totalBytes = file.size;
  if (totalBytes <= 0) {
    throw new Error("empty_file");
  }

  let offset =
    typeof options.resumeFromByte === "number" && options.resumeFromByte >= 0
      ? Math.min(options.resumeFromByte, totalBytes)
      : await queryMuxUploadOffset(uploadUrl, totalBytes, signal);

  if (offset >= totalBytes) {
    emitProgress(onProgress, totalBytes, totalBytes, null, 0);
    return;
  }

  emitProgress(onProgress, offset, totalBytes, null, null);

  let lastAt = Date.now();
  let lastLoaded = offset;
  let speedBytesPerSec: number | null = null;
  let etaSeconds: number | null = null;

  while (offset < totalBytes) {
    if (signal?.aborted) {
      throw new Error("upload_aborted");
    }

    const end = Math.min(offset + CHUNK_BYTES, totalBytes);
    const chunk = file.slice(offset, end);
    const rangeStart = offset;
    const rangeEnd = end - 1;

    const result = await xhrPut({
      url: uploadUrl,
      body: chunk,
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Content-Range": `bytes ${rangeStart}-${rangeEnd}/${totalBytes}`,
      },
      signal,
      onUploadProgress: (loadedInChunk) => {
        const loadedBytes = Math.min(totalBytes, rangeStart + loadedInChunk);
        const now = Date.now();
        const dt = (now - lastAt) / 1000;
        if (dt >= 0.4 && loadedBytes >= lastLoaded) {
          const delta = loadedBytes - lastLoaded;
          speedBytesPerSec = delta / dt;
          const remaining = Math.max(0, totalBytes - loadedBytes);
          etaSeconds =
            speedBytesPerSec > 1024 ? remaining / speedBytesPerSec : null;
          lastLoaded = loadedBytes;
          lastAt = now;
        }
        emitProgress(
          onProgress,
          loadedBytes,
          totalBytes,
          speedBytesPerSec,
          etaSeconds,
        );
      },
    });

    // اكتمال الملف
    if (result.status === 200 || result.status === 201) {
      emitProgress(onProgress, totalBytes, totalBytes, null, 0);
      return;
    }

    // شريحة مقبولة جزئيًا / مكتملة ضمن الجلسة
    if (result.status === 308 || (result.status >= 200 && result.status < 300)) {
      if (result.rangeHeader) {
        const match = /bytes=0-(\d+)/i.exec(result.rangeHeader);
        if (match) {
          offset = Number(match[1]) + 1;
        } else {
          offset = end;
        }
      } else {
        offset = end;
      }
      emitProgress(onProgress, offset, totalBytes, speedBytesPerSec, etaSeconds);
      continue;
    }

    throw new Error(`فشل الرفع (رمز ${result.status})`);
  }

  emitProgress(onProgress, totalBytes, totalBytes, null, 0);
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

"use client";

const DB_NAME = "mux-upload-sessions";
const DB_VERSION = 1;
const META_STORE = "meta";
const FILE_STORE = "files";
const SESSION_TTL_MS = 55 * 60 * 1000; // أقل من مهلة Mux (3600ث)

export type PersistedMuxUploadPhase = "uploading" | "processing";

export type PersistedMuxUploadMeta = {
  key: string;
  uploadUrl: string;
  uploadId: string;
  videoLibraryId: string;
  title: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileLastModified: number;
  percent: number;
  loadedBytes: number;
  phase: PersistedMuxUploadPhase;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_request_failed"));
  });
}

export async function saveMuxUploadSession(input: {
  meta: PersistedMuxUploadMeta;
  file?: File | Blob | null;
}): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(
      input.file ? [META_STORE, FILE_STORE] : [META_STORE],
      "readwrite",
    );
    const metaStore = tx.objectStore(META_STORE);
    metaStore.put(input.meta);
    if (input.file) {
      tx.objectStore(FILE_STORE).put(input.file, input.meta.key);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb_tx_failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexeddb_tx_aborted"));
    });
    db.close();
  } catch {
    // التخزين المحلي أفضل جهد — لا نكسر الرفع إن فشل IndexedDB
  }
}

export async function loadMuxUploadSession(
  key: string,
): Promise<{ meta: PersistedMuxUploadMeta; file: File } | null> {
  try {
    const db = await openDb();
    const tx = db.transaction([META_STORE, FILE_STORE], "readonly");
    const meta = (await idbReq(
      tx.objectStore(META_STORE).get(key),
    )) as PersistedMuxUploadMeta | undefined;
    const blob = (await idbReq(tx.objectStore(FILE_STORE).get(key))) as
      | Blob
      | undefined;
    db.close();

    if (!meta || !blob) return null;
    if (Date.now() - meta.updatedAt > SESSION_TTL_MS) {
      await clearMuxUploadSession(key);
      return null;
    }
    if (blob.size !== meta.fileSize) {
      await clearMuxUploadSession(key);
      return null;
    }

    const file =
      blob instanceof File
        ? blob
        : new File([blob], meta.fileName, {
            type: meta.fileType || "video/mp4",
            lastModified: meta.fileLastModified || Date.now(),
          });

    return { meta, file };
  } catch {
    return null;
  }
}

export async function clearMuxUploadSession(key: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction([META_STORE, FILE_STORE], "readwrite");
    tx.objectStore(META_STORE).delete(key);
    tx.objectStore(FILE_STORE).delete(key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb_clear_failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexeddb_clear_aborted"));
    });
    db.close();
  } catch {
    // ignore
  }
}

export async function patchMuxUploadSessionProgress(
  key: string,
  patch: Partial<
    Pick<
      PersistedMuxUploadMeta,
      "percent" | "loadedBytes" | "phase" | "updatedAt"
    >
  >,
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(META_STORE, "readwrite");
    const store = tx.objectStore(META_STORE);
    const existing = (await idbReq(store.get(key))) as
      | PersistedMuxUploadMeta
      | undefined;
    if (!existing) {
      db.close();
      return;
    }
    store.put({
      ...existing,
      ...patch,
      updatedAt: patch.updatedAt ?? Date.now(),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb_patch_failed"));
    });
    db.close();
  } catch {
    // ignore
  }
}

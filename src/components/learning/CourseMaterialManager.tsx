"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  COURSE_MATERIAL_MAX_BYTES,
  COURSE_MATERIAL_MIME,
  formatFileSizeBytes,
  readFileMagicBytes,
  sniffPdfMagic,
} from "@/lib/learning/course-materials";
import {
  confirmCourseMaterialCreateAction,
  confirmCourseMaterialReplaceAction,
  deleteCourseMaterialAction,
  getCourseMaterialViewUrlAction,
  prepareCourseMaterialUploadAction,
  setCourseMaterialPublishAction,
  updateCourseMaterialMetaAction,
} from "@/lib/learning/material-actions";
import type { CourseMaterialListItem } from "@/lib/learning/types";

type CourseMaterialManagerProps = {
  courseId: string;
  semesterId: string;
  materials: CourseMaterialListItem[];
  canEdit: boolean;
};

async function uploadWithProgress(
  signedUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", COURSE_MATERIAL_MIME);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error(`upload_failed_${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("upload_network_error"));
    xhr.send(file);
  });
}

export function CourseMaterialManager({
  courseId,
  semesterId,
  materials,
  canEdit,
}: CourseMaterialManagerProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [publish, setPublish] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (busy) return;
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      setOk(false);
      setMessage("عنوان المادة مطلوب (حرفان على الأقل).");
      return;
    }
    if (!file) {
      setOk(false);
      setMessage("اختر ملف PDF للرفع.");
      return;
    }
    if (file.type && file.type !== COURSE_MATERIAL_MIME) {
      setOk(false);
      setMessage("يُقبل ملف PDF فقط.");
      return;
    }
    if (file.size <= 0 || file.size > COURSE_MATERIAL_MAX_BYTES) {
      setOk(false);
      setMessage("حجم الملف يجب ألا يتجاوز 50 ميجابايت.");
      return;
    }
    const magic = await readFileMagicBytes(file);
    if (!sniffPdfMagic(magic)) {
      setOk(false);
      setMessage("الملف ليس PDF صالحًا (فشل التحقق من البادئة).");
      return;
    }

    setBusy(true);
    setMessage(null);
    setProgress(0);

    try {
      const prepared = await prepareCourseMaterialUploadAction({
        courseId,
        semesterId,
      });
      if (!prepared.ok) {
        setOk(false);
        setMessage(prepared.message);
        setBusy(false);
        setProgress(null);
        return;
      }

      await uploadWithProgress(prepared.signedUrl, file, setProgress);

      const result = await confirmCourseMaterialCreateAction({
        courseId,
        semesterId,
        storagePath: prepared.path,
        title: trimmedTitle,
        description: description.trim(),
        fileSizeBytes: file.size,
        originalFilename: file.name,
        publish,
      });

      setOk(result.ok);
      setMessage(result.message);
      if (result.ok) {
        setTitle("");
        setDescription("");
        setPublish(false);
        setFile(null);
        router.refresh();
      }
    } catch {
      setOk(false);
      setMessage("تعذر رفع الملف. تحقق من الاتصال وأعد المحاولة.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">ملفات PDF</h3>
        <p className="text-xs text-white/45">عدة ملفات داخل القسم · حد 50 م.ب لكل ملف</p>
      </div>

      {canEdit ? (
        <div className="rounded-2xl border border-white/10 bg-surface p-5 space-y-3">
          <h4 className="text-sm font-semibold text-white">إضافة ملف PDF</h4>
          <label className="block text-xs text-white/55">
            العنوان المعروض
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white"
              placeholder="مثال: مذكرة المحاضرة الأولى"
            />
          </label>
          <label className="block text-xs text-white/55">
            وصف اختياري
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={busy}
              rows={2}
              className="mt-1 w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-white/55">
            ملف PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={busy}
              className="mt-1 block w-full text-sm text-white/70 file:me-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </label>
          {file ? (
            <p className="text-xs text-white/55">
              {file.name} · {formatFileSizeBytes(file.size)}
            </p>
          ) : null}
          <label className="inline-flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={publish}
              disabled={busy}
              onChange={(event) => setPublish(event.target.checked)}
            />
            نشر مباشرة بعد الرفع
          </label>
          {progress != null ? (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-white/55">تقدم الرفع: {progress}%</p>
            </div>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCreate()}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "جارٍ الرفع..." : "رفع ملف PDF"}
          </button>
          {message ? (
            <p className={`text-xs ${ok ? "text-emerald-300" : "text-red-300"}`}>
              {message}
            </p>
          ) : null}
        </div>
      ) : null}

      {materials.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-surface/60 px-5 py-8 text-center text-sm text-white/55">
          لا توجد ملفات PDF في هذا القسم بعد.
        </div>
      ) : (
        <ul className="space-y-3">
          {materials.map((material) => (
            <MaterialCard
              key={material.id}
              courseId={courseId}
              semesterId={semesterId}
              material={material}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function MaterialCard({
  courseId,
  semesterId,
  material,
  canEdit,
}: {
  courseId: string;
  semesterId: string;
  material: CourseMaterialListItem;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(material.title);
  const [description, setDescription] = useState(material.description);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  return (
    <li className="rounded-2xl border border-white/10 bg-surface p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{material.title}</p>
          <p className="mt-1 text-xs text-white/50">
            {formatFileSizeBytes(material.fileSizeBytes) ?? "—"}
            {material.originalFilename ? ` · ${material.originalFilename}` : ""}
            {" · "}
            {material.isPublished ? "منشور" : "مسودة"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || pending}
            className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/85"
            onClick={() => {
              startTransition(async () => {
                const result = await getCourseMaterialViewUrlAction(material.id);
                if (!result.ok) {
                  setOk(false);
                  setMessage(result.message);
                  return;
                }
                window.open(result.url, "_blank", "noopener,noreferrer");
              });
            }}
          >
            عرض
          </button>
          {canEdit ? (
            <>
              <button
                type="button"
                disabled={busy || pending}
                className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/85"
                onClick={() => {
                  startTransition(async () => {
                    const result = await setCourseMaterialPublishAction(
                      courseId,
                      semesterId,
                      material.id,
                      !material.isPublished,
                    );
                    setOk(result.ok);
                    setMessage(result.message);
                    if (result.ok) router.refresh();
                  });
                }}
              >
                {material.isPublished ? "إلغاء النشر" : "نشر"}
              </button>
              <button
                type="button"
                disabled={busy || pending}
                className="rounded-lg border border-red-400/30 px-2.5 py-1 text-xs text-red-200"
                onClick={() => {
                  if (
                    !window.confirm(
                      `حذف ملف «${material.title}» نهائيًا؟ لا يمكن التراجع.`,
                    )
                  ) {
                    return;
                  }
                  startTransition(async () => {
                    const result = await deleteCourseMaterialAction(
                      courseId,
                      semesterId,
                      material.id,
                    );
                    setOk(result.ok);
                    setMessage(result.message);
                    if (result.ok) router.refresh();
                  });
                }}
              >
                حذف
              </button>
            </>
          ) : null}
        </div>
      </div>

      {canEdit ? (
        <>
          <form
            className="space-y-2"
            action={(formData) => {
              startTransition(async () => {
                const result = await updateCourseMaterialMetaAction(formData);
                setOk(result.ok);
                setMessage(result.message);
                if (result.ok) router.refresh();
              });
            }}
          >
            <input type="hidden" name="course_id" value={courseId} />
            <input type="hidden" name="semester_id" value={semesterId} />
            <input type="hidden" name="material_id" value={material.id} />
            <input
              name="title"
              required
              minLength={2}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-background px-3 py-2 text-sm text-white"
            />
            <textarea
              name="description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-background px-3 py-2 text-sm text-white"
            />
            <button
              type="submit"
              disabled={pending || busy}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/85 disabled:opacity-60"
            >
              حفظ العنوان والوصف
            </button>
          </form>

          <label className="block text-xs text-white/55">
            استبدال ملف PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={busy || pending}
              className="mt-1 block w-full text-sm text-white/70 file:me-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                event.target.value = "";
                if (!next) return;
                void (async () => {
                  if (busy || pending) return;
                  if (next.size <= 0 || next.size > COURSE_MATERIAL_MAX_BYTES) {
                    setOk(false);
                    setMessage("حجم الملف يجب ألا يتجاوز 50 ميجابايت.");
                    return;
                  }
                  const magic = await readFileMagicBytes(next);
                  if (!sniffPdfMagic(magic)) {
                    setOk(false);
                    setMessage("الملف البديل ليس PDF صالحًا.");
                    return;
                  }
                  setBusy(true);
                  setProgress(0);
                  setMessage(null);
                  try {
                    const prepared = await prepareCourseMaterialUploadAction({
                      courseId,
                      semesterId,
                    });
                    if (!prepared.ok) {
                      setOk(false);
                      setMessage(prepared.message);
                      return;
                    }
                    await uploadWithProgress(prepared.signedUrl, next, setProgress);
                    const result = await confirmCourseMaterialReplaceAction({
                      courseId,
                      semesterId,
                      materialId: material.id,
                      storagePath: prepared.path,
                      fileSizeBytes: next.size,
                      originalFilename: next.name,
                    });
                    setOk(result.ok);
                    setMessage(result.message);
                    if (result.ok) router.refresh();
                  } catch {
                    setOk(false);
                    setMessage("تعذر استبدال الملف.");
                  } finally {
                    setBusy(false);
                    setProgress(null);
                  }
                })();
              }}
            />
          </label>
          {progress != null ? (
            <p className="text-xs text-white/55">تقدم الاستبدال: {progress}%</p>
          ) : null}
        </>
      ) : material.description ? (
        <p className="text-xs leading-6 text-white/55">{material.description}</p>
      ) : null}

      {message ? (
        <p className={`text-xs ${ok ? "text-emerald-300" : "text-red-300"}`}>
          {message}
        </p>
      ) : null}
    </li>
  );
}

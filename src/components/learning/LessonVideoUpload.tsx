"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createLessonVideoUpload,
  syncLessonVideoUpload,
} from "@/lib/learning/video-actions";

type LessonVideoUploadProps = {
  courseId: string;
  semesterId: string;
  lessonId: string;
};

export function LessonVideoUpload({
  courseId,
  semesterId,
  lessonId,
}: LessonVideoUploadProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(formData: FormData) {
    const file = formData.get("video");
    if (!(file instanceof File) || file.size === 0) {
      setMessage("اختر ملف فيديو أولًا.");
      return;
    }
    setBusy(true);
    setMessage("جارٍ تجهيز الرفع الآمن...");
    const created = await createLessonVideoUpload({ courseId, semesterId, lessonId });
    if (!created.ok) {
      setMessage(created.message);
      setBusy(false);
      return;
    }

    setMessage("جارٍ رفع الملف مباشرة إلى Mux...");
    const uploaded = await fetch(created.uploadUrl, { method: "PUT", body: file });
    if (!uploaded.ok) {
      setMessage("تعذر رفع الملف. لم يُحفظ رابط عام.");
      setBusy(false);
      return;
    }

    let last = "وصل الملف. جارٍ المعالجة.";
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const synced = await syncLessonVideoUpload({
        courseId,
        semesterId,
        lessonId,
        uploadId: created.uploadId,
      });
      last = synced.ok ? synced.message : synced.message;
      setMessage(last);
      if (!synced.ok || synced.state === "ready" || synced.state === "error") break;
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    router.refresh();
    setBusy(false);
  }

  return (
    <form action={onSubmit} className="mt-4 space-y-3">
      <input
        name="video"
        type="file"
        accept="video/*"
        disabled={busy}
        className="block w-full text-sm text-white/80 file:me-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "جارٍ الرفع..." : "رفع فيديو محمي"}
      </button>
      {message ? <p className="text-sm leading-7 text-white/70">{message}</p> : null}
    </form>
  );
}

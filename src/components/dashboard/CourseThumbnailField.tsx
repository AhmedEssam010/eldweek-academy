"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  COURSE_THUMBNAIL_BUCKET,
  COURSE_THUMBNAIL_MAX_BYTES,
  isAllowedThumbnailMime,
  thumbnailObjectPath,
} from "@/lib/learning/course-structure";
import { attachCourseThumbnailAction } from "@/lib/dashboard/thumbnail-actions";

type CourseThumbnailFieldProps = {
  courseId?: string;
  initialPath?: string | null;
};

export function CourseThumbnailField({
  courseId,
  initialPath = null,
}: CourseThumbnailFieldProps) {
  const router = useRouter();
  const [path, setPath] = useState(initialPath ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-2">
      <label className="mb-2 block text-sm text-white">صورة غلاف الكورس</label>
      <input type="hidden" name="thumbnail_path" value={path} />

      {courseId ? (
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="block w-full text-sm text-white/70 file:me-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          disabled={pending}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (!isAllowedThumbnailMime(file.type)) {
              setOk(false);
              setMessage("الصيغ المسموحة: JPG أو PNG أو WebP.");
              return;
            }
            if (file.size > COURSE_THUMBNAIL_MAX_BYTES) {
              setOk(false);
              setMessage("حجم الصورة يجب ألا يتجاوز 2 ميجابايت.");
              return;
            }

            setPending(true);
            setMessage(null);
            setOk(false);

            const supabase = createClient();
            if (!supabase) {
              setPending(false);
              setMessage("إعدادات Supabase غير مكتملة في المتصفح.");
              return;
            }

            const objectPath = thumbnailObjectPath(courseId, file.name);
            const { error: uploadError } = await supabase.storage
              .from(COURSE_THUMBNAIL_BUCKET)
              .upload(objectPath, file, {
                contentType: file.type,
                upsert: false,
              });

            if (uploadError) {
              setPending(false);
              setMessage(
                "تعذر رفع الصورة إلى التخزين. تأكد من تطبيق هجرة سلة course-thumbnails وأن حسابك هو المالك.",
              );
              return;
            }

            const result = await attachCourseThumbnailAction({
              courseId,
              objectPath,
            });
            setPending(false);
            setOk(result.ok);
            setMessage(result.message);
            if (result.ok && result.path) {
              setPath(result.path);
              router.refresh();
            } else {
              await supabase.storage
                .from(COURSE_THUMBNAIL_BUCKET)
                .remove([objectPath]);
            }
          }}
        />
      ) : (
        <p className="rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs leading-6 text-white/55">
          احفظ المسودة أولًا، ثم ارفع صورة الغلاف من صفحة تعديل الكورس.
        </p>
      )}

      {path ? (
        <p className="text-xs text-white/45" dir="ltr">
          {path}
        </p>
      ) : null}
      {message ? (
        <p className={`text-xs ${ok ? "text-emerald-300" : "text-red-300"}`}>
          {pending ? "جارٍ الرفع..." : message}
        </p>
      ) : pending ? (
        <p className="text-xs text-white/55">جارٍ الرفع...</p>
      ) : null}
      <p className="text-xs text-white/40">
        JPG أو PNG أو WebP · حد أقصى 2 ميجابايت · الرفع للمالك فقط مباشرة إلى
        التخزين
      </p>
    </div>
  );
}

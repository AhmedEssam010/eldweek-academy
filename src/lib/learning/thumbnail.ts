import { getSupabaseEnv } from "@/lib/supabase/env";
import { COURSE_THUMBNAIL_BUCKET } from "@/lib/learning/course-structure";

/**
 * يبني رابط عرض عام لصورة الغلاف من المسار المخزّن.
 * لا يُرجع أسرارًا. إن غاب المسار يُعاد null لاستخدام البديل.
 */
export function courseThumbnailPublicUrl(
  thumbnailPath: string | null | undefined,
): string | null {
  const path = thumbnailPath?.trim();
  if (!path) return null;

  if (/^https?:\/\//i.test(path)) return path;

  const env = getSupabaseEnv();
  if (!env) return null;

  const clean = path
    .replace(/^\/+/, "")
    .replace(new RegExp(`^${COURSE_THUMBNAIL_BUCKET}/`), "");

  return `${env.url.replace(/\/$/, "")}/storage/v1/object/public/${COURSE_THUMBNAIL_BUCKET}/${clean}`;
}

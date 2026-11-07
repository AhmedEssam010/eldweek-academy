"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { createClient } from "@/lib/supabase/server";
import { COURSE_THUMBNAIL_BUCKET } from "@/lib/learning/course-structure";

export type ThumbnailUploadResult = {
  ok: boolean;
  message: string;
  path?: string;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * يربط مسار صورة رُفعت مباشرة إلى Storage بالكورس.
 * لا يستقبل ملفًا عبر Server Action لتفادي حد حجم الجسم في Next.js.
 */
export async function attachCourseThumbnailAction(input: {
  courseId: string;
  objectPath: string;
}): Promise<ThumbnailUploadResult> {
  if (!getAuthReadiness().dbSchemaReady) {
    return { ok: false, message: "قاعدة البيانات غير جاهزة." };
  }

  await requireAdmin();
  const courseId = String(input.courseId ?? "").trim();
  const objectPath = String(input.objectPath ?? "").trim().replace(/^\/+/, "");

  if (!UUID.test(courseId)) {
    return { ok: false, message: "معرّف الكورس غير صالح." };
  }
  if (
    !objectPath ||
    objectPath.includes("..") ||
    !objectPath.startsWith(`${courseId}/`)
  ) {
    return { ok: false, message: "مسار صورة الغلاف غير صالح." };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "تعذر الاتصال بقاعدة البيانات." };

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, status, thumbnail_path")
    .eq("id", courseId)
    .maybeSingle();

  if (courseError || !course) {
    return { ok: false, message: "لم يُعثر على الكورس." };
  }
  if (course.status === "archived") {
    return { ok: false, message: "لا يمكن تحديث غلاف كورس مؤرشف." };
  }

  const fileName = objectPath.slice(courseId.length + 1);
  const { data: listed, error: listError } = await supabase.storage
    .from(COURSE_THUMBNAIL_BUCKET)
    .list(courseId);

  if (listError) {
    console.error("[thumbnail-attach-list]", {
      message: listError.message?.slice(0, 180),
    });
    return {
      ok: false,
      message:
        "تعذر التحقق من الصورة المرفوعة. تأكد من تطبيق هجرة سلة course-thumbnails.",
    };
  }

  if (!listed?.some((item) => item.name === fileName)) {
    return { ok: false, message: "لم يُعثر على الصورة في التخزين بعد الرفع." };
  }

  const { error: updateError } = await supabase
    .from("courses")
    .update({ thumbnail_path: objectPath })
    .eq("id", courseId);

  if (updateError) {
    return { ok: false, message: "رُفعت الصورة لكن تعذر حفظ مسارها في الكورس." };
  }

  if (
    course.thumbnail_path &&
    !/^https?:\/\//i.test(course.thumbnail_path) &&
    course.thumbnail_path !== objectPath
  ) {
    await supabase.storage
      .from(COURSE_THUMBNAIL_BUCKET)
      .remove([course.thumbnail_path.replace(/^course-thumbnails\//, "")]);
  }

  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/student/courses");
  revalidatePath(`/student/courses/${courseId}`);

  return {
    ok: true,
    message: "تم رفع صورة الغلاف وحفظها.",
    path: objectPath,
  };
}

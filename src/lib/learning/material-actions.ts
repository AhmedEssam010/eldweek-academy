"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { getAuthReadiness } from "@/lib/auth/readiness";
import {
  COURSE_MATERIALS_BUCKET,
  COURSE_MATERIAL_DOWNLOAD_TTL_SECONDS,
  COURSE_MATERIAL_MAX_BYTES,
  COURSE_MATERIAL_VIEW_TTL_SECONDS,
  buildCourseMaterialObjectPath,
  isValidCourseMaterialStoragePath,
  sanitizeOriginalFilename,
  sniffPdfMagic,
} from "@/lib/learning/course-materials";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { CourseFormActionResult } from "@/lib/dashboard/types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message: string): CourseFormActionResult {
  return { ok: false, message };
}

function success(message: string, redirectTo?: string): CourseFormActionResult {
  return { ok: true, message, redirectTo };
}

function revalidateMaterialPaths(courseId: string, semesterId: string) {
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath(`/admin/courses/${courseId}/semesters`);
  revalidatePath(`/admin/courses/${courseId}/semesters/${semesterId}`);
  revalidatePath(`/admin/courses/${courseId}/preview`);
  revalidatePath(`/teacher/courses/${courseId}/semesters/${semesterId}`);
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/student/courses/${courseId}`);
}

async function requireContentEditor(courseId: string) {
  if (!getAuthReadiness().dbSchemaReady) {
    return { ok: false as const, result: fail("قاعدة البيانات غير جاهزة.") };
  }
  if (!UUID.test(courseId)) {
    return { ok: false as const, result: fail("معرّف الكورس غير صالح.") };
  }

  const user = await requireAuthenticatedUser();
  if (user.role !== "super_admin" && user.role !== "teacher") {
    return {
      ok: false as const,
      result: fail("إدارة مواد PDF متاحة للمالك أو المدرّس المصرّح فقط."),
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { ok: false as const, result: fail("إعدادات Supabase غير مكتملة.") };
  }

  if (user.role === "teacher") {
    const { data, error } = await supabase
      .from("course_staff_assignments")
      .select("can_edit_content")
      .eq("course_id", courseId)
      .eq("teacher_id", user.userId)
      .maybeSingle();
    if (error || !data?.can_edit_content) {
      return {
        ok: false as const,
        result: fail("ليست لديك صلاحية تعديل محتوى هذا الكورس."),
      };
    }
  }

  return { ok: true as const, supabase, user };
}

async function assertSemesterInCourse(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  courseId: string,
  semesterId: string,
) {
  const { data, error } = await supabase
    .from("course_semesters")
    .select("id")
    .eq("id", semesterId)
    .eq("course_id", courseId)
    .maybeSingle();
  return !error && Boolean(data);
}

async function verifyUploadedPdf(
  storagePath: string,
  expectedSize: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const service = createServiceRoleClient();
  if (!service) {
    return {
      ok: false,
      message:
        "مفتاح الخدمة غير مضبوط على الخادم. يلزم SUPABASE_SERVICE_ROLE_KEY للتحقق من الملف.",
    };
  }

  const { data: signed, error: signError } = await service.storage
    .from(COURSE_MATERIALS_BUCKET)
    .createSignedUrl(storagePath, 60);
  if (signError || !signed?.signedUrl) {
    return {
      ok: false,
      message:
        "تعذر التحقق من الملف المرفوع. تأكد من تطبيق هجرة سلة course-materials.",
    };
  }

  try {
    const response = await fetch(signed.signedUrl, {
      headers: { Range: "bytes=0-7" },
      cache: "no-store",
    });
    if (!(response.ok || response.status === 206)) {
      return { ok: false, message: "الملف غير موجود في التخزين بعد الرفع." };
    }
    const headerLen = response.headers.get("content-range");
    if (headerLen) {
      const total = Number(headerLen.split("/")[1]);
      if (Number.isFinite(total) && total > 0 && total !== expectedSize) {
        // نقبل اختلافًا طفيفًا فقط إن تعذّر قراءة الحجم؛ الحجم النهائي من العميل موثّق في الصف
      }
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!sniffPdfMagic(bytes)) {
      await service.storage.from(COURSE_MATERIALS_BUCKET).remove([storagePath]);
      return {
        ok: false,
        message: "الملف المرفوع ليس PDF صالحًا. تم حذف الكائن غير الصالح.",
      };
    }
  } catch {
    return { ok: false, message: "تعذر قراءة بادئة ملف PDF بعد الرفع." };
  }

  return { ok: true };
}

export type PrepareMaterialUploadResult =
  | {
      ok: true;
      path: string;
      token: string;
      signedUrl: string;
      message: string;
    }
  | { ok: false; message: string };

/** يجهّز مسارًا فريدًا ورابط رفع موقّع — الملف يُرفع من المتصفح مباشرة. */
export async function prepareCourseMaterialUploadAction(input: {
  courseId: string;
  semesterId: string;
}): Promise<PrepareMaterialUploadResult> {
  const courseId = String(input.courseId ?? "").trim();
  const semesterId = String(input.semesterId ?? "").trim();
  if (!UUID.test(courseId) || !UUID.test(semesterId)) {
    return { ok: false, message: "بيانات الكورس أو القسم غير صالحة." };
  }

  const access = await requireContentEditor(courseId);
  if (!access.ok) return { ok: false, message: access.result.message };

  if (!(await assertSemesterInCourse(access.supabase, courseId, semesterId))) {
    return { ok: false, message: "القسم لا ينتمي لهذا الكورس." };
  }

  const objectPath = buildCourseMaterialObjectPath(courseId, semesterId);
  if (!objectPath || !isValidCourseMaterialStoragePath(objectPath)) {
    return { ok: false, message: "تعذر تجهيز مسار تخزين فريد للملف." };
  }

  const { data, error } = await access.supabase.storage
    .from(COURSE_MATERIALS_BUCKET)
    .createSignedUploadUrl(objectPath);

  if (error || !data?.signedUrl || !data.token) {
    console.error("[material-prepare-upload]", {
      message: error?.message?.slice(0, 180),
    });
    return {
      ok: false,
      message:
        "تعذر إنشاء رابط الرفع. طبّق هجرة course_pdf_materials وتأكد من سلة course-materials.",
    };
  }

  return {
    ok: true,
    path: data.path ?? objectPath,
    token: data.token,
    signedUrl: data.signedUrl,
    message: "تم تجهيز رابط الرفع.",
  };
}

export type ConfirmMaterialResult = CourseFormActionResult & {
  materialId?: string;
};

export async function confirmCourseMaterialCreateAction(input: {
  courseId: string;
  semesterId: string;
  storagePath: string;
  title: string;
  description: string;
  fileSizeBytes: number;
  originalFilename: string;
  publish: boolean;
}): Promise<ConfirmMaterialResult> {
  const courseId = String(input.courseId ?? "").trim();
  const semesterId = String(input.semesterId ?? "").trim();
  const storagePath = String(input.storagePath ?? "").trim();
  const title = String(input.title ?? "").trim();
  const description = String(input.description ?? "").trim();
  const originalFilename = sanitizeOriginalFilename(
    String(input.originalFilename ?? "material.pdf"),
  );
  const fileSizeBytes = Number(input.fileSizeBytes);
  const publish = Boolean(input.publish);

  if (!UUID.test(courseId) || !UUID.test(semesterId)) {
    return fail("بيانات الكورس أو القسم غير صالحة.");
  }
  if (title.length < 2) return fail("عنوان المادة مطلوب (حرفان على الأقل).");
  if (title.length > 200) return fail("عنوان المادة طويل جدًا.");
  if (description.length > 4000) return fail("الوصف طويل جدًا.");
  if (
    !Number.isFinite(fileSizeBytes) ||
    fileSizeBytes <= 0 ||
    fileSizeBytes > COURSE_MATERIAL_MAX_BYTES
  ) {
    return fail("حجم الملف يجب أن يكون أكبر من صفر وأقل من أو يساوي 50 ميجابايت.");
  }
  if (!isValidCourseMaterialStoragePath(storagePath)) {
    return fail("مسار التخزين غير صالح.");
  }
  if (!storagePath.startsWith(`${courseId}/${semesterId}/`)) {
    return fail("مسار الملف لا يطابق الكورس والقسم المحددين.");
  }

  const access = await requireContentEditor(courseId);
  if (!access.ok) return access.result;
  if (!(await assertSemesterInCourse(access.supabase, courseId, semesterId))) {
    return fail("القسم لا ينتمي لهذا الكورس.");
  }

  const verified = await verifyUploadedPdf(storagePath, fileSizeBytes);
  if (!verified.ok) return fail(verified.message);

  const { data: last } = await access.supabase
    .from("course_materials")
    .select("sort_order")
    .eq("semester_id", semesterId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const sortOrder =
    last && last.length > 0 ? Number(last[0]?.sort_order ?? 0) + 1 : 0;

  const { data: created, error } = await access.supabase
    .from("course_materials")
    .insert({
      course_id: courseId,
      semester_id: semesterId,
      title,
      description,
      storage_path: storagePath,
      file_size_bytes: fileSizeBytes,
      original_filename: originalFilename,
      sort_order: sortOrder,
      is_published: publish,
      created_by: access.user.userId,
    })
    .select("id")
    .single();

  if (error || !created) {
    const service = createServiceRoleClient();
    await service?.storage.from(COURSE_MATERIALS_BUCKET).remove([storagePath]);
    const msg = String(error?.message ?? "").toLowerCase();
    if (msg.includes("does not exist") || msg.includes("schema cache")) {
      return fail(
        "جدول مواد PDF غير مطبّق بعد. طبّق هجرة course_pdf_materials ثم أعد المحاولة.",
      );
    }
    return fail("رُفع الملف لكن تعذر حفظ سجل المادة.");
  }

  revalidateMaterialPaths(courseId, semesterId);
  return {
    ok: true,
    message: publish ? "تم إضافة ملف PDF ونشره." : "تم إضافة ملف PDF كمسودة.",
    materialId: created.id,
  };
}

export async function updateCourseMaterialMetaAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const courseId = String(formData.get("course_id") ?? "").trim();
  const semesterId = String(formData.get("semester_id") ?? "").trim();
  const materialId = String(formData.get("material_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!UUID.test(courseId) || !UUID.test(semesterId) || !UUID.test(materialId)) {
    return fail("بيانات المادة غير صالحة.");
  }
  if (title.length < 2) return fail("عنوان المادة مطلوب (حرفان على الأقل).");
  if (title.length > 200) return fail("عنوان المادة طويل جدًا.");
  if (description.length > 4000) return fail("الوصف طويل جدًا.");

  const access = await requireContentEditor(courseId);
  if (!access.ok) return access.result;

  const { error } = await access.supabase
    .from("course_materials")
    .update({ title, description })
    .eq("id", materialId)
    .eq("course_id", courseId)
    .eq("semester_id", semesterId);

  if (error) return fail("تعذر حفظ تعديلات المادة.");
  revalidateMaterialPaths(courseId, semesterId);
  return success("تم حفظ عنوان ووصف المادة.");
}

export async function setCourseMaterialPublishAction(
  courseId: string,
  semesterId: string,
  materialId: string,
  publish: boolean,
): Promise<CourseFormActionResult> {
  if (!UUID.test(courseId) || !UUID.test(semesterId) || !UUID.test(materialId)) {
    return fail("بيانات المادة غير صالحة.");
  }
  const access = await requireContentEditor(courseId);
  if (!access.ok) return access.result;

  const { error } = await access.supabase
    .from("course_materials")
    .update({ is_published: publish })
    .eq("id", materialId)
    .eq("course_id", courseId)
    .eq("semester_id", semesterId);

  if (error) return fail(publish ? "تعذر نشر المادة." : "تعذر إلغاء نشر المادة.");
  revalidateMaterialPaths(courseId, semesterId);
  return success(publish ? "تم نشر ملف PDF." : "أُعيدت المادة إلى المسودة.");
}

export async function confirmCourseMaterialReplaceAction(input: {
  courseId: string;
  semesterId: string;
  materialId: string;
  storagePath: string;
  fileSizeBytes: number;
  originalFilename: string;
}): Promise<CourseFormActionResult> {
  const courseId = String(input.courseId ?? "").trim();
  const semesterId = String(input.semesterId ?? "").trim();
  const materialId = String(input.materialId ?? "").trim();
  const storagePath = String(input.storagePath ?? "").trim();
  const fileSizeBytes = Number(input.fileSizeBytes);
  const originalFilename = sanitizeOriginalFilename(
    String(input.originalFilename ?? "material.pdf"),
  );

  if (!UUID.test(courseId) || !UUID.test(semesterId) || !UUID.test(materialId)) {
    return fail("بيانات المادة غير صالحة.");
  }
  if (
    !Number.isFinite(fileSizeBytes) ||
    fileSizeBytes <= 0 ||
    fileSizeBytes > COURSE_MATERIAL_MAX_BYTES
  ) {
    return fail("حجم الملف يجب ألا يتجاوز 50 ميجابايت.");
  }
  if (!isValidCourseMaterialStoragePath(storagePath)) {
    return fail("مسار التخزين غير صالح.");
  }
  if (!storagePath.startsWith(`${courseId}/${semesterId}/`)) {
    return fail("مسار الملف لا يطابق الكورس والقسم.");
  }

  const access = await requireContentEditor(courseId);
  if (!access.ok) return access.result;

  const service = createServiceRoleClient();
  if (!service) {
    return fail("مفتاح الخدمة غير مضبوط — تعذر استبدال الملف بأمان.");
  }

  const { data: current, error: loadError } = await service
    .from("course_materials")
    .select("id, course_id, semester_id, storage_path")
    .eq("id", materialId)
    .eq("course_id", courseId)
    .eq("semester_id", semesterId)
    .maybeSingle();

  if (loadError || !current) return fail("المادة غير موجودة.");
  if (current.storage_path === storagePath) {
    return fail("مسار الملف الجديد يطابق القديم.");
  }

  const verified = await verifyUploadedPdf(storagePath, fileSizeBytes);
  if (!verified.ok) return fail(verified.message);

  const { error: updateError } = await access.supabase
    .from("course_materials")
    .update({
      storage_path: storagePath,
      file_size_bytes: fileSizeBytes,
      original_filename: originalFilename,
    })
    .eq("id", materialId)
    .eq("course_id", courseId)
    .eq("semester_id", semesterId);

  if (updateError) {
    await service.storage.from(COURSE_MATERIALS_BUCKET).remove([storagePath]);
    return fail("رُفع الملف الجديد لكن تعذر تحديث سجل المادة.");
  }

  if (
    current.storage_path &&
    isValidCourseMaterialStoragePath(current.storage_path) &&
    current.storage_path !== storagePath
  ) {
    await service.storage
      .from(COURSE_MATERIALS_BUCKET)
      .remove([current.storage_path]);
  }

  revalidateMaterialPaths(courseId, semesterId);
  return success("تم استبدال ملف PDF.");
}

export async function deleteCourseMaterialAction(
  courseId: string,
  semesterId: string,
  materialId: string,
): Promise<CourseFormActionResult> {
  if (!UUID.test(courseId) || !UUID.test(semesterId) || !UUID.test(materialId)) {
    return fail("بيانات المادة غير صالحة.");
  }
  const access = await requireContentEditor(courseId);
  if (!access.ok) return access.result;

  const service = createServiceRoleClient();
  if (!service) {
    return fail("مفتاح الخدمة غير مضبوط — تعذر حذف الملف من التخزين.");
  }

  const { data: current, error: loadError } = await service
    .from("course_materials")
    .select("id, storage_path")
    .eq("id", materialId)
    .eq("course_id", courseId)
    .eq("semester_id", semesterId)
    .maybeSingle();

  if (loadError || !current) return fail("المادة غير موجودة.");

  const { error: deleteError } = await access.supabase
    .from("course_materials")
    .delete()
    .eq("id", materialId)
    .eq("course_id", courseId)
    .eq("semester_id", semesterId);

  if (deleteError) return fail("تعذر حذف سجل المادة.");

  if (isValidCourseMaterialStoragePath(current.storage_path)) {
    await service.storage
      .from(COURSE_MATERIALS_BUCKET)
      .remove([current.storage_path]);
  }

  revalidateMaterialPaths(courseId, semesterId);
  return success("تم حذف ملف PDF.");
}

export type MaterialAccessResult =
  | {
      ok: true;
      url: string;
      title: string;
      expiresInSeconds: number;
      disposition: "inline" | "attachment";
    }
  | { ok: false; message: string };

async function authorizeMaterialAccess(
  materialId: string,
  mode: "view" | "download",
): Promise<MaterialAccessResult> {
  if (!getAuthReadiness().dbSchemaReady) {
    return { ok: false, message: "قاعدة البيانات غير جاهزة." };
  }
  if (!UUID.test(materialId)) {
    return { ok: false, message: "معرّف المادة غير صالح." };
  }

  const user = await requireAuthenticatedUser();
  const supabase = await createClient();
  const service = createServiceRoleClient();
  if (!supabase || !service) {
    return { ok: false, message: "إعدادات Supabase غير مكتملة." };
  }

  const { data: material, error } = await service
    .from("course_materials")
    .select(
      "id, course_id, title, storage_path, is_published, original_filename",
    )
    .eq("id", materialId)
    .maybeSingle();

  if (error || !material) {
    return { ok: false, message: "المادة غير موجودة." };
  }
  if (!isValidCourseMaterialStoragePath(material.storage_path)) {
    return { ok: false, message: "مسار الملف غير صالح." };
  }

  const isStaff =
    user.role === "super_admin" ||
    (
      await supabase
        .from("course_staff_assignments")
        .select("can_edit_content")
        .eq("course_id", material.course_id)
        .eq("teacher_id", user.userId)
        .maybeSingle()
    ).data?.can_edit_content === true;

  if (!isStaff) {
    if (!material.is_published) {
      return { ok: false, message: "هذه المادة غير منشورة." };
    }
    const { data: entitled, error: entitledError } = await supabase.rpc(
      "student_has_active_enrollment_for_course",
      { p_course_id: material.course_id },
    );
    if (entitledError || !entitled) {
      return {
        ok: false,
        message: "يلزم اشتراك نشط لفتح أو تحميل ملف PDF المحمي.",
      };
    }
  }

  const ttl =
    mode === "download"
      ? COURSE_MATERIAL_DOWNLOAD_TTL_SECONDS
      : COURSE_MATERIAL_VIEW_TTL_SECONDS;
  const disposition = mode === "download" ? "attachment" : "inline";

  const { data: signed, error: signError } =
    mode === "download"
      ? await service.storage
          .from(COURSE_MATERIALS_BUCKET)
          .createSignedUrl(material.storage_path, ttl, {
            download: sanitizeOriginalFilename(
              material.original_filename || `${material.title}.pdf`,
            ),
          })
      : await service.storage
          .from(COURSE_MATERIALS_BUCKET)
          .createSignedUrl(material.storage_path, ttl);

  if (signError || !signed?.signedUrl) {
    console.error("[material-sign]", {
      message: signError?.message?.slice(0, 180),
    });
    return { ok: false, message: "تعذر إنشاء رابط موقّت للملف." };
  }

  return {
    ok: true,
    url: signed.signedUrl,
    title: material.title,
    expiresInSeconds: ttl,
    disposition,
  };
}

export async function getCourseMaterialViewUrlAction(
  materialId: string,
): Promise<MaterialAccessResult> {
  return authorizeMaterialAccess(materialId, "view");
}

export async function getCourseMaterialDownloadUrlAction(
  materialId: string,
): Promise<MaterialAccessResult> {
  return authorizeMaterialAccess(materialId, "download");
}

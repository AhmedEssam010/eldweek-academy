"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { createClient } from "@/lib/supabase/server";
import {
  buildCourseSlug,
  isValidCourseSlug,
} from "@/lib/dashboard/course-slug";
import { parseAcademicSemester } from "@/lib/learning/course-structure";
import { assessCourseDeletion } from "@/lib/dashboard/course-deletion";
import type { CourseFormActionResult } from "@/lib/dashboard/types";

export type MutationResult = {
  ok: false;
  code: "setup_required" | "forbidden_until_ready";
  message: string;
};

export type { CourseFormActionResult };

/**
 * عمليات غير مفعّلة في هذه المرحلة (مدرّسون / نشر عام).
 */
function blockedMutation(actionLabel: string): MutationResult {
  const readiness = getAuthReadiness();

  if (!readiness.dbSchemaReady) {
    return {
      ok: false,
      code: "setup_required",
      message: `عملية «${actionLabel}» غير متاحة لأن مخطط قاعدة البيانات غير جاهز بعد.`,
    };
  }

  return {
    ok: false,
    code: "forbidden_until_ready",
    message: `عملية «${actionLabel}» غير مفعّلة في هذه المرحلة.`,
  };
}

function fail(message: string): CourseFormActionResult {
  return { ok: false, message };
}

function ok(message: string, redirectTo?: string): CourseFormActionResult {
  return { ok: true, message, redirectTo };
}

function revalidateCourseCatalogPaths(courseId?: string) {
  revalidatePath("/");
  revalidatePath("/admin/courses");
  revalidatePath("/student/courses");
  if (courseId) {
    revalidatePath(`/admin/courses/${courseId}`);
    revalidatePath(`/student/courses/${courseId}`);
    revalidatePath(`/courses/${courseId}`);
  }
}

async function requireAdminCourseWriter() {
  const readiness = getAuthReadiness();
  if (!readiness.dbSchemaReady) {
    return {
      ok: false as const,
      result: fail(
        "قاعدة البيانات غير جاهزة بعد. أكّد NEXT_PUBLIC_DB_SCHEMA_READY بعد التحقق اليدوي.",
      ),
    };
  }

  // يتحقق من الجلسة + دور super_admin من profiles (لا من المتصفح).
  const admin = await requireAdmin();
  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false as const,
      result: fail("إعدادات Supabase غير مكتملة."),
    };
  }

  return { ok: true as const, admin, supabase };
}

export async function inviteTeacherAction(): Promise<MutationResult> {
  return blockedMutation("دعوة مدرّس");
}

export async function updateTeacherPermissionsAction(): Promise<MutationResult> {
  return blockedMutation("تحديث صلاحيات المدرّس");
}

export async function assignTeacherToCourseAction(): Promise<MutationResult> {
  return blockedMutation("تعيين مدرّس لكورس");
}

export async function revokeTeacherAssignmentAction(): Promise<MutationResult> {
  return blockedMutation("إزالة تعيين مدرّس");
}

export async function deactivateTeacherAction(): Promise<MutationResult> {
  return blockedMutation("تعطيل مدرّس");
}

export async function createCourseDraftAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const access = await requireAdminCourseWriter();
  if (!access.ok) return access.result;

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const thumbnailPath = String(formData.get("thumbnail_path") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const academicSemester = parseAcademicSemester(formData.get("academic_semester"));

  if (title.length < 3) {
    return fail("عنوان الكورس مطلوب (3 أحرف على الأقل).");
  }
  if (!academicSemester) {
    return fail("اختر الترم الدراسي: الأول أو الثاني.");
  }

  const slug = buildCourseSlug(title, slugInput);
  if (!isValidCourseSlug(slug)) {
    return fail(
      "معرّف الكورس (slug) غير صالح. استخدم أحرفًا إنجليزية صغيرة وأرقامًا وشرطات فقط، أو اتركه فارغًا للتوليد التلقائي.",
    );
  }

  const { data: courseId, error } = await access.supabase.rpc(
    "create_course_draft",
    {
      p_title: title,
      p_slug: slug,
      p_description: description,
      p_thumbnail_path: thumbnailPath.length > 0 ? thumbnailPath : null,
    },
  );

  if (error || !courseId) {
    const raw = (error?.message || "").toLowerCase();
    if (raw.includes("duplicate") || raw.includes("unique")) {
      return fail("معرّف الكورس (slug) مستخدم بالفعل. غيّره أو اتركه للتوليد التلقائي.");
    }
    if (raw.includes("not_allowed")) {
      return fail("ليست لديك صلاحية إنشاء مسودات كورسات.");
    }
    return fail("تعذر إنشاء المسودة. تحقق من الصلاحيات وقيود البيانات.");
  }

  const { error: semesterError } = await access.supabase
    .from("courses")
    .update({ academic_semester: academicSemester })
    .eq("id", courseId);

  if (semesterError) {
    console.error("[create-course-academic-semester]", {
      code: semesterError.code,
      message: semesterError.message?.slice(0, 180),
    });
    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${courseId}`);
    return ok(
      "أُنشئت الكورس، لكن حقل الترم الدراسي يحتاج تطبيق هجرة academic_semester. افتح الكورس وأعد اختيار الترم بعد الهجرة.",
      `/admin/courses/${courseId}`,
    );
  }

  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${courseId}`);
  return ok("تم إنشاء مسودة الكورس بنجاح (غير منشورة).", `/admin/courses/${courseId}`);
}

export async function updateCourseAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const access = await requireAdminCourseWriter();
  if (!access.ok) return access.result;

  const courseId = String(formData.get("course_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const thumbnailPath = String(formData.get("thumbnail_path") ?? "").trim();
  const academicSemester = parseAcademicSemester(formData.get("academic_semester"));

  if (!courseId) {
    return fail("معرّف الكورس مفقود.");
  }
  if (title.length < 3) {
    return fail("عنوان الكورس مطلوب (3 أحرف على الأقل).");
  }
  if (!academicSemester) {
    return fail("اختر الترم الدراسي: الأول أو الثاني.");
  }

  const { data: existing, error: loadError } = await access.supabase
    .from("courses")
    .select("id, status")
    .eq("id", courseId)
    .maybeSingle();

  if (loadError) {
    return fail("تعذر قراءة الكورس قبل التعديل.");
  }
  if (!existing) {
    return fail("لم يُعثر على الكورس.");
  }
  if (existing.status === "archived") {
    return fail("لا يمكن تعديل كورس مؤرشف.");
  }

  const { error } = await access.supabase
    .from("courses")
    .update({
      title,
      description,
      thumbnail_path: thumbnailPath.length > 0 ? thumbnailPath : null,
      academic_semester: academicSemester,
    })
    .eq("id", courseId)
    .neq("status", "archived");

  if (error) {
    const raw = (error.message || "").toLowerCase();
    if (raw.includes("academic_semester")) {
      return fail(
        "عمود الترم الدراسي غير موجود بعد. طبّق هجرة course_units_and_thumbnails ثم أعد المحاولة.",
      );
    }
    return fail("تعذر حفظ تعديلات الكورس.");
  }

  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/student/courses");
  revalidatePath(`/student/courses/${courseId}`);
  return ok("تم حفظ بيانات الكورس.");
}

export async function publishCourseAction(
  courseId: string,
): Promise<CourseFormActionResult> {
  const access = await requireAdminCourseWriter();
  if (!access.ok) return access.result;

  const id = String(courseId ?? "").trim();
  if (!id) return fail("معرّف الكورس مفقود.");

  const { data: existing, error: loadError } = await access.supabase
    .from("courses")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (loadError) return fail("تعذر قراءة الكورس قبل النشر.");
  if (!existing) return fail("لم يُعثر على الكورس.");
  if (existing.status === "published") return ok("الكورس منشور بالفعل.");
  if (existing.status === "archived") {
    return fail("الكورس مؤرشف. لا يمكن نشره من هذه الحالة.");
  }

  const { error } = await access.supabase.rpc("publish_course", {
    p_course_id: id,
  });

  if (error) {
    const raw = (error.message || "").toLowerCase();
    if (raw.includes("only_super_admin") || error.code === "42501") {
      return fail("النشر متاح للمالك فقط.");
    }
    if (raw.includes("course_not_found")) return fail("لم يُعثر على الكورس.");
    console.error("[publish-course]", {
      code: error.code,
      message: error.message?.slice(0, 180),
    });
    return fail("تعذر نشر الكورس. تأكد أن الحساب هو المالك وأن الكورس ليس مؤرشفًا.");
  }

  revalidateCourseCatalogPaths(id);
  return ok("تم نشر الكورس. سيظهر للطلاب في الكورسات المتاحة.");
}

export async function unpublishCourseAction(
  courseId: string,
): Promise<CourseFormActionResult> {
  const access = await requireAdminCourseWriter();
  if (!access.ok) return access.result;

  const id = String(courseId ?? "").trim();
  if (!id) return fail("معرّف الكورس مفقود.");

  const { data: existing, error: loadError } = await access.supabase
    .from("courses")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (loadError) return fail("تعذر قراءة الكورس قبل إلغاء النشر.");
  if (!existing) return fail("لم يُعثر على الكورس.");
  if (existing.status !== "published") {
    return fail("يمكن إلغاء النشر للكورسات المنشورة فقط.");
  }

  const { data: updated, error } = await access.supabase
    .from("courses")
    .update({ status: "draft" })
    .eq("id", id)
    .eq("status", "published")
    .select("id")
    .maybeSingle();

  if (error) {
    const raw = (error.message || "").toLowerCase();
    console.error("[unpublish-course]", {
      code: error.code,
      message: error.message?.slice(0, 180),
    });
    if (error.code === "42501" || raw.includes("permission") || raw.includes("policy")) {
      return fail("إلغاء النشر متاح للمالك فقط.");
    }
    return fail("تعذر إلغاء نشر الكورس.");
  }

  if (!updated) {
    return fail("تعذر إلغاء النشر. الكورس ليس منشورًا أو ليست لديك صلاحية المالك.");
  }

  revalidateCourseCatalogPaths(id);
  return ok("أُلغي نشر الكورس وعاد مسودة. التسجيلات الحالية لم تُحذف، والتشغيل متوقف.");
}

export async function archiveCourseAction(
  courseId: string,
): Promise<CourseFormActionResult> {
  const access = await requireAdminCourseWriter();
  if (!access.ok) return access.result;

  const id = String(courseId ?? "").trim();
  if (!id) {
    return fail("معرّف الكورس مفقود.");
  }

  const { data: existing, error: loadError } = await access.supabase
    .from("courses")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return fail("تعذر قراءة الكورس قبل الأرشفة.");
  }
  if (!existing) {
    return fail("لم يُعثر على الكورس.");
  }
  if (existing.status === "archived") {
    return fail("هذا الكورس مؤرشف بالفعل.");
  }

  const { error } = await access.supabase.rpc("archive_course", {
    p_course_id: id,
  });

  if (error) {
    const raw = (error.message || "").toLowerCase();
    if (raw.includes("only_super_admin")) {
      return fail("الأرشفة متاحة للمالك فقط.");
    }
    return fail("تعذر أرشفة الكورس.");
  }

  revalidateCourseCatalogPaths(id);
  return ok("تمت أرشفة الكورس بنجاح (بدون حذف نهائي).");
}

/**
 * حذف نهائي لكورس بلا سجلات مالية/تسجيلات.
 * المالك فقط (super_admin) عبر requireAdmin + سياسة RLS courses_delete_admin.
 * لا يحذف أصول Mux أو ملفات التخزين تلقائيًا.
 */
export async function deleteCourseAction(
  courseId: string,
): Promise<CourseFormActionResult> {
  const access = await requireAdminCourseWriter();
  if (!access.ok) return access.result;

  const id = String(courseId ?? "").trim();
  if (!id) {
    return fail("معرّف الكورس مفقود.");
  }

  const assessed = await assessCourseDeletion(access.supabase, id);
  if (!assessed.ok) {
    return fail(assessed.message);
  }

  if (!assessed.assessment.canPermanentlyDelete) {
    const details = assessed.assessment.blockers.join(" ");
    return fail(
      `لا يمكن الحذف النهائي لأن للكورس سجلات يجب الاحتفاظ بها. ${details} استخدم «أرشفة الكورس» لإخفائه من الكتالوج مع حفظ السجلات.`,
    );
  }

  if (assessed.productIds.length > 0) {
    const { error: productsError } = await access.supabase
      .from("products")
      .delete()
      .in("id", assessed.productIds);

    if (productsError) {
      const raw = (productsError.message || "").toLowerCase();
      if (
        productsError.code === "23503" ||
        raw.includes("foreign key") ||
        raw.includes("violates")
      ) {
        return fail(
          "تعذر حذف المنتجات المرتبطة بسبب قيود قاعدة البيانات. استخدم الأرشفة بدل الحذف النهائي.",
        );
      }
      if (productsError.code === "42501" || raw.includes("permission")) {
        return fail("حذف المنتجات متاح للمالك فقط.");
      }
      console.error("[delete-course-products]", {
        code: productsError.code,
        message: productsError.message?.slice(0, 180),
      });
      return fail("تعذر حذف منتجات الكورس قبل حذف الكورس.");
    }
  }

  const { error: deleteError } = await access.supabase
    .from("courses")
    .delete()
    .eq("id", id);

  if (deleteError) {
    const raw = (deleteError.message || "").toLowerCase();
    if (deleteError.code === "42501" || raw.includes("permission")) {
      return fail("حذف الكورس متاح للمالك فقط.");
    }
    if (
      deleteError.code === "23503" ||
      raw.includes("foreign key") ||
      raw.includes("restrict")
    ) {
      return fail(
        "لا يمكن الحذف النهائي بسبب علاقات محمية في قاعدة البيانات. استخدم «أرشفة الكورس» بدلًا من الحذف.",
      );
    }
    console.error("[delete-course]", {
      code: deleteError.code,
      message: deleteError.message?.slice(0, 180),
    });
    return fail("تعذر حذف الكورس.");
  }

  revalidateCourseCatalogPaths(id);
  return ok(
    `تم حذف الكورس «${assessed.assessment.title}» نهائيًا.`,
    "/admin/courses",
  );
}

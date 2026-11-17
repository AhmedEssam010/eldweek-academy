"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { normalizeEgyptianPhone } from "@/lib/auth/phone";
import { getAuthReadiness } from "@/lib/auth/readiness";
import type { CourseFormActionResult } from "@/lib/dashboard/types";
import { validateTeacherPassword } from "@/lib/dashboard/teacher-password";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message: string): CourseFormActionResult {
  return { ok: false, message };
}

function ok(message: string, redirectTo?: string): CourseFormActionResult {
  return { ok: true, message, redirectTo };
}

function maskId(id: string): string {
  if (id.length < 12) return "…";
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function readCheckbox(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true" || value === "1";
}

async function requireAdminWriter() {
  const readiness = getAuthReadiness();
  if (!readiness.dbSchemaReady) {
    return {
      ok: false as const,
      result: fail(
        "قاعدة البيانات غير جاهزة بعد. أكّد NEXT_PUBLIC_DB_SCHEMA_READY بعد التحقق اليدوي.",
      ),
    };
  }
  const admin = await requireAdmin();
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false as const, result: fail("إعدادات Supabase غير مكتملة.") };
  }
  return { ok: true as const, admin, supabase };
}

function revalidateTeacherPaths(teacherId?: string) {
  revalidatePath("/admin/teachers");
  if (teacherId) {
    revalidatePath(`/admin/teachers/${teacherId}`);
  }
}

/**
 * إنشاء مدرّس: Auth عبر service_role ثم ترقية الدور بجلسة المالك.
 *
 * phone_confirm: true = صلاحية تسجيل دخول GoTrue فقط (مطلوب لمنح كلمة المرور).
 * هذا ليس إثبات ملكية رقم الهاتف. لا يُضبط profiles.phone_verified_at هنا أبدًا.
 */
export async function createTeacherAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const access = await requireAdminWriter();
  if (!access.ok) return access.result;

  const fullName = String(formData.get("fullName") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const canCreateDrafts = readCheckbox(formData, "can_create_course_drafts");

  if (fullName.length < 3) {
    return fail("اسم المدرّس مطلوب (3 أحرف على الأقل).");
  }
  const phone = normalizeEgyptianPhone(phoneRaw);
  if (!phone.ok) return fail(phone.error);

  const passwordError = validateTeacherPassword(password);
  if (passwordError) return fail(passwordError);
  if (password !== confirmPassword) {
    return fail("تأكيد كلمة المرور غير متطابق.");
  }

  const service = createServiceRoleClient();
  if (!service) {
    return fail(
      "مفتاح الخدمة غير مضبوط على الخادم. يلزم SUPABASE_SERVICE_ROLE_KEY لإنشاء حساب المدرّس.",
    );
  }

  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      phone: phone.e164,
      password,
      phone_confirm: true,
      user_metadata: { full_name: fullName },
    });

  if (createError || !created.user?.id) {
    const raw = (createError?.message || "").toLowerCase();
    if (raw.includes("already") || raw.includes("exists") || raw.includes("registered")) {
      return fail("هذا الرقم مسجّل بالفعل. استخدم إعادة تعيين الدور إن كان الحساب موجودًا.");
    }
    console.error("[create-teacher-auth]", {
      status: createError?.status,
      code: createError?.code,
    });
    return fail("تعذر إنشاء حساب المصادقة للمدرّس. راجع إعدادات Auth.");
  }

  const userId = created.user.id;

  // ترقية الدور بجلسة المالك (admin_set_user_role يعتمد على auth.uid / is_super_admin)
  const { error: roleError } = await access.supabase.rpc("admin_set_user_role", {
    p_user_id: userId,
    p_role: "teacher",
    p_is_active: true,
    p_can_create_course_drafts: canCreateDrafts,
  });

  if (roleError) {
    console.error("[create-teacher-role]", {
      code: roleError.code,
      message: roleError.message?.slice(0, 180),
      user: maskId(userId),
    });
    return fail(
      `أُنشئ حساب المصادقة (${maskId(userId)}) لكن تعذّر تعيين دور المدرّس. من صفحة المدرّسين استخدم «إعادة تعيين الدور» لنفس الرقم دون إنشاء حساب جديد.`,
    );
  }

  // تحديث الاسم/الهاتف عبر الخدمة دون المساس بـ phone_verified_at
  const { error: profileError } = await service
    .from("profiles")
    .update({
      full_name: fullName,
      phone_number: phone.e164,
    })
    .eq("id", userId);

  if (profileError) {
    console.error("[create-teacher-profile]", {
      code: profileError.code,
      message: profileError.message?.slice(0, 180),
    });
  }

  revalidateTeacherPaths(userId);
  return ok("تم إنشاء حساب المدرّس وتعيين دوره بنجاح.", `/admin/teachers/${userId}`);
}

/** يعيد تعيين دور teacher لحساب Auth موجود (استرداد بعد فشل الترقية). */
export async function retrySetTeacherRoleAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const access = await requireAdminWriter();
  if (!access.ok) return access.result;

  const userId = String(formData.get("userId") ?? "").trim();
  const canCreateDrafts = readCheckbox(formData, "can_create_course_drafts");
  if (!UUID.test(userId)) return fail("معرّف المستخدم غير صالح.");

  const { error } = await access.supabase.rpc("admin_set_user_role", {
    p_user_id: userId,
    p_role: "teacher",
    p_is_active: true,
    p_can_create_course_drafts: canCreateDrafts,
  });
  if (error) {
    return fail("تعذر إعادة تعيين دور المدرّس. تحقق أن الحساب موجود وليس مالكًا.");
  }
  revalidateTeacherPaths(userId);
  return ok("تم تعيين دور المدرّس للحساب الموجود.", `/admin/teachers/${userId}`);
}

export async function updateTeacherAccountAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const access = await requireAdminWriter();
  if (!access.ok) return access.result;

  const teacherId = String(formData.get("teacherId") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const canCreateDrafts = readCheckbox(formData, "can_create_course_drafts");
  if (!UUID.test(teacherId)) return fail("معرّف المدرّس غير صالح.");
  if (fullName.length < 3) return fail("اسم المدرّس مطلوب (3 أحرف على الأقل).");

  const { data: existing } = await access.supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", teacherId)
    .eq("role", "teacher")
    .maybeSingle();
  if (!existing) return fail("لم يُعثر على هذا المدرّس.");

  const { error: roleError } = await access.supabase.rpc("admin_set_user_role", {
    p_user_id: teacherId,
    p_role: "teacher",
    p_is_active: Boolean(existing.is_active),
    p_can_create_course_drafts: canCreateDrafts,
  });
  if (roleError) return fail("تعذر تحديث صلاحية إنشاء المسودات.");

  const service = createServiceRoleClient();
  if (service) {
    await service
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", teacherId);
  } else {
    const { error } = await access.supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", teacherId);
    if (error) return fail("تعذر تحديث اسم المدرّس.");
  }

  revalidateTeacherPaths(teacherId);
  return ok("تم تحديث بيانات المدرّس.");
}

export async function deactivateTeacherAction(
  teacherId: string,
): Promise<CourseFormActionResult> {
  const access = await requireAdminWriter();
  if (!access.ok) return access.result;
  if (!UUID.test(teacherId)) return fail("معرّف المدرّس غير صالح.");

  const { data: existing } = await access.supabase
    .from("profiles")
    .select("can_create_course_drafts")
    .eq("id", teacherId)
    .eq("role", "teacher")
    .maybeSingle();
  if (!existing) return fail("لم يُعثر على هذا المدرّس.");

  const { error } = await access.supabase.rpc("admin_set_user_role", {
    p_user_id: teacherId,
    p_role: "teacher",
    p_is_active: false,
    p_can_create_course_drafts: Boolean(existing.can_create_course_drafts),
  });
  if (error) return fail("تعذر تعطيل المدرّس.");
  revalidateTeacherPaths(teacherId);
  return ok("تم تعطيل المدرّس. لن يتمكن من دخول اللوحة حتى إعادة التفعيل.");
}

export async function activateTeacherAction(
  teacherId: string,
): Promise<CourseFormActionResult> {
  const access = await requireAdminWriter();
  if (!access.ok) return access.result;
  if (!UUID.test(teacherId)) return fail("معرّف المدرّس غير صالح.");

  const { data: existing } = await access.supabase
    .from("profiles")
    .select("can_create_course_drafts")
    .eq("id", teacherId)
    .eq("role", "teacher")
    .maybeSingle();
  if (!existing) return fail("لم يُعثر على هذا المدرّس.");

  const { error } = await access.supabase.rpc("admin_set_user_role", {
    p_user_id: teacherId,
    p_role: "teacher",
    p_is_active: true,
    p_can_create_course_drafts: Boolean(existing.can_create_course_drafts),
  });
  if (error) return fail("تعذر تفعيل المدرّس.");
  revalidateTeacherPaths(teacherId);
  return ok("تم تفعيل المدرّس.");
}

export async function assignTeacherToCourseAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const access = await requireAdminWriter();
  if (!access.ok) return access.result;

  const teacherId = String(formData.get("teacherId") ?? "").trim();
  const courseId = String(formData.get("courseId") ?? "").trim();
  const canEditContent = readCheckbox(formData, "can_edit_content");
  const canManageExams = readCheckbox(formData, "can_manage_exams");
  const canViewProgress = readCheckbox(formData, "can_view_student_progress");

  if (!UUID.test(teacherId) || !UUID.test(courseId)) {
    return fail("بيانات التعيين غير صالحة.");
  }
  if (!canEditContent && !canManageExams && !canViewProgress) {
    return fail("اختر صلاحية واحدة على الأقل للتعيين.");
  }

  const { error } = await access.supabase.rpc("upsert_course_staff_assignment", {
    p_course_id: courseId,
    p_teacher_id: teacherId,
    p_can_edit_content: canEditContent,
    p_can_manage_exams: canManageExams,
    p_can_view_student_progress: canViewProgress,
  });
  if (error) {
    const raw = (error.message || "").toLowerCase();
    if (raw.includes("staff_assignment_requires_active_teacher")) {
      return fail("التعيين يتطلب مدرّسًا نشطًا بدور teacher.");
    }
    return fail("تعذر تعيين المدرّس على الكورس.");
  }

  revalidateTeacherPaths(teacherId);
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/teacher/courses");
  return ok("تم حفظ تعيين المدرّس على الكورس.");
}

export async function revokeTeacherAssignmentAction(
  courseId: string,
  teacherId: string,
): Promise<CourseFormActionResult> {
  const access = await requireAdminWriter();
  if (!access.ok) return access.result;
  if (!UUID.test(courseId) || !UUID.test(teacherId)) {
    return fail("بيانات الإزالة غير صالحة.");
  }

  const { error } = await access.supabase.rpc("revoke_course_staff_assignment", {
    p_course_id: courseId,
    p_teacher_id: teacherId,
  });
  if (error) return fail("تعذر إزالة التعيين.");

  revalidateTeacherPaths(teacherId);
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/teacher/courses");
  return ok("أُزيل تعيين المدرّس عن الكورس.");
}

export async function resetTeacherPasswordAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  const access = await requireAdminWriter();
  if (!access.ok) return access.result;

  const teacherId = String(formData.get("teacherId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (!UUID.test(teacherId)) return fail("معرّف المدرّس غير صالح.");

  const passwordError = validateTeacherPassword(password);
  if (passwordError) return fail(passwordError);
  if (password !== confirmPassword) return fail("تأكيد كلمة المرور غير متطابق.");

  const { data: existing } = await access.supabase
    .from("profiles")
    .select("id")
    .eq("id", teacherId)
    .eq("role", "teacher")
    .maybeSingle();
  if (!existing) return fail("لم يُعثر على هذا المدرّس.");

  const service = createServiceRoleClient();
  if (!service) {
    return fail("مفتاح الخدمة غير مضبوط على الخادم.");
  }
  const { error } = await service.auth.admin.updateUserById(teacherId, {
    password,
  });
  if (error) return fail("تعذر تحديث كلمة مرور المدرّس.");
  return ok("تم تحديث كلمة مرور المدرّس.");
}

/** توافق خلفي مع الاستيرادات القديمة — نفس createTeacherAction. */
export async function inviteTeacherAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  return createTeacherAction(formData);
}

export async function updateTeacherPermissionsAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  return updateTeacherAccountAction(formData);
}

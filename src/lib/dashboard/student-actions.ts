"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { getAuthReadiness } from "@/lib/auth/readiness";
import type { CourseFormActionResult } from "@/lib/dashboard/types";
import {
  isStoredReceiptImagePath,
  PAYMENT_RECEIPT_BUCKET,
} from "@/lib/learning/payment-receipts";
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

function revalidateStudentPaths(studentId?: string) {
  revalidatePath("/admin/students");
  revalidatePath("/admin/payments");
  if (studentId) {
    revalidatePath(`/admin/students/${studentId}`);
  }
}

/**
 * حذف طالب نهائيًا: يزيل التسجيلات وطلبات الدفع (RESTRICT)، ثم يحذف مستخدم Auth
 * فيتبعه profiles بـ CASCADE. متاح للمالك فقط عبر جلسة super_admin + service_role.
 */
export async function deleteStudentAction(
  studentId: string,
): Promise<CourseFormActionResult> {
  const access = await requireAdminWriter();
  if (!access.ok) return access.result;
  if (!UUID.test(studentId)) return fail("معرّف الطالب غير صالح.");

  if (studentId === access.admin.userId) {
    return fail("لا يمكن حذف حساب المالك.");
  }

  const { data: existing, error: existingError } = await access.supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", studentId)
    .maybeSingle();

  if (existingError) {
    return fail("تعذر التحقق من حساب الطالب قبل الحذف.");
  }
  if (!existing) {
    return fail("لم يُعثر على هذا الطالب.");
  }
  if (existing.role !== "student") {
    return fail("الحذف من هذه الصفحة متاح لحسابات الطلاب فقط.");
  }

  const service = createServiceRoleClient();
  if (!service) {
    return fail(
      "مفتاح الخدمة غير مضبوط على الخادم. يلزم SUPABASE_SERVICE_ROLE_KEY لحذف حساب الطالب.",
    );
  }

  const { data: paymentRows, error: paymentsReadError } = await service
    .from("payment_requests")
    .select("id, receipt_path")
    .eq("student_id", studentId);

  if (paymentsReadError) {
    console.error("[delete-student-payments-read]", {
      code: paymentsReadError.code,
      message: paymentsReadError.message?.slice(0, 180),
      user: maskId(studentId),
    });
    return fail("تعذر قراءة طلبات الدفع المرتبطة بالطالب.");
  }

  // enrollments.payment_request_id → RESTRICT؛ احذف التسجيلات أولاً ثم طلبات الدفع.
  const { error: enrollmentsError } = await service
    .from("enrollments")
    .delete()
    .eq("student_id", studentId);

  if (enrollmentsError) {
    console.error("[delete-student-enrollments]", {
      code: enrollmentsError.code,
      message: enrollmentsError.message?.slice(0, 180),
      user: maskId(studentId),
    });
    return fail("تعذر حذف تسجيلات الطالب قبل حذف الحساب.");
  }

  const { error: paymentsDeleteError } = await service
    .from("payment_requests")
    .delete()
    .eq("student_id", studentId);

  if (paymentsDeleteError) {
    console.error("[delete-student-payments]", {
      code: paymentsDeleteError.code,
      message: paymentsDeleteError.message?.slice(0, 180),
      user: maskId(studentId),
    });
    return fail("تعذر حذف طلبات الدفع المرتبطة بالطالب.");
  }

  const receiptPaths = (paymentRows ?? [])
    .map((row) => row.receipt_path)
    .filter((path): path is string => isStoredReceiptImagePath(path));

  if (receiptPaths.length > 0) {
    const { error: storageError } = await service.storage
      .from(PAYMENT_RECEIPT_BUCKET)
      .remove(receiptPaths);
    if (storageError) {
      console.error("[delete-student-receipts]", {
        message: storageError.message?.slice(0, 180),
        count: receiptPaths.length,
        user: maskId(studentId),
      });
      // لا نوقف الحذف: السجلات أُزيلت؛ تنظيف التخزين أفضل جهد.
    }
  }

  const { error: authDeleteError } = await service.auth.admin.deleteUser(
    studentId,
  );

  if (authDeleteError) {
    const raw = (authDeleteError.message || "").toLowerCase();
    console.error("[delete-student-auth]", {
      status: authDeleteError.status,
      code: authDeleteError.code,
      message: authDeleteError.message?.slice(0, 180),
      user: maskId(studentId),
    });
    if (raw.includes("foreign key") || raw.includes("restrict") || raw.includes("violates")) {
      return fail(
        "تعذر حذف الحساب بسبب سجلات مرتبطة ما زالت تمنع الحذف. راجع التسجيلات أو طلبات الدفع يدويًا.",
      );
    }
    return fail("تعذر حذف حساب المصادقة للطالب.");
  }

  revalidateStudentPaths(studentId);
  return ok(
    `تم حذف الطالب${existing.full_name ? ` «${existing.full_name}»` : ""} نهائيًا مع تسجيلاته وطلبات دفعه.`,
    "/admin/students",
  );
}

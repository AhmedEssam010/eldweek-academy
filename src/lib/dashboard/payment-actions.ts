"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { createClient } from "@/lib/supabase/server";
import type { CourseFormActionResult } from "@/lib/dashboard/types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message: string): CourseFormActionResult {
  return { ok: false, message };
}

function ok(message: string): CourseFormActionResult {
  return { ok: true, message };
}

export async function approvePaymentRequestAction(
  paymentRequestId: string,
): Promise<CourseFormActionResult> {
  if (!getAuthReadiness().dbSchemaReady) return fail("قاعدة البيانات غير جاهزة.");
  if (!UUID.test(paymentRequestId)) return fail("معرّف الطلب غير صالح.");

  await requireAdmin();
  const supabase = await createClient();
  if (!supabase) return fail("تعذر الاتصال بقاعدة البيانات.");

  const { data, error } = await supabase.rpc("approve_payment_request", {
    p_payment_request_id: paymentRequestId,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("payment_request_not_found")) return fail("طلب الدفع غير موجود.");
    if (msg.includes("payment_request_not_pending")) return fail("طلب الدفع ليس معلّقًا.");
    if (msg.includes("payment_product_unavailable")) return fail("المنتج غير متاح أو معطّل.");
    if (msg.includes("payment_amount_mismatch")) return fail("المبلغ لا يطابق سعر المنتج الحالي.");
    if (msg.includes("only_super_admin")) return fail("هذه العملية للمالك فقط.");
    console.error("[approve-payment]", { code: error.code, message: error.message?.slice(0, 200) });
    return fail("تعذر اعتماد طلب الدفع.");
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin/students");
  revalidatePath("/admin");
  return ok(`تم اعتماد الدفع وإنشاء التسجيل (${data}).`);
}

export async function rejectPaymentRequestAction(
  paymentRequestId: string,
  rejectionReason: string,
): Promise<CourseFormActionResult> {
  if (!getAuthReadiness().dbSchemaReady) return fail("قاعدة البيانات غير جاهزة.");
  if (!UUID.test(paymentRequestId)) return fail("معرّف الطلب غير صالح.");
  const trimmedReason = rejectionReason?.trim();
  if (!trimmedReason || trimmedReason.length === 0) return fail("يجب إدخال سبب الرفض.");

  await requireAdmin();
  const supabase = await createClient();
  if (!supabase) return fail("تعذر الاتصال بقاعدة البيانات.");

  const { error } = await supabase.rpc("reject_payment_request", {
    p_payment_request_id: paymentRequestId,
    p_rejection_reason: trimmedReason,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("payment_request_not_found")) return fail("طلب الدفع غير موجود.");
    if (msg.includes("payment_request_not_pending")) return fail("طلب الدفع ليس معلّقًا.");
    if (msg.includes("rejection_reason_required")) return fail("يجب إدخال سبب الرفض.");
    if (msg.includes("only_super_admin")) return fail("هذه العملية للمالك فقط.");
    console.error("[reject-payment]", { code: error.code, message: error.message?.slice(0, 200) });
    return fail("تعذر رفض طلب الدفع.");
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin/students");
  revalidatePath("/admin");
  return ok("تم رفض طلب الدفع.");
}

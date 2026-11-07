"use server";

import { revalidatePath } from "next/cache";
import { requireStudent } from "@/lib/auth/guards";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { createClient } from "@/lib/supabase/server";
import type { CourseFormActionResult } from "@/lib/dashboard/types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE_E164 = /^\+[1-9][0-9]{7,14}$/;

function fail(message: string): CourseFormActionResult {
  return { ok: false, message };
}

function ok(message: string): CourseFormActionResult {
  return { ok: true, message };
}

export async function submitPurchaseRequestAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  if (!getAuthReadiness().dbSchemaReady) return fail("قاعدة البيانات غير جاهزة.");

  const user = await requireStudent();
  const productId = String(formData.get("productId") ?? "").trim();
  const paymentMethod = String(formData.get("paymentMethod") ?? "").trim();
  const senderPhone = String(formData.get("senderPhone") ?? "").trim();
  const transactionRef = String(formData.get("transactionRef") ?? "").trim();

  if (!UUID.test(productId)) return fail("معرّف المنتج غير صالح.");
  if (paymentMethod !== "instapay" && paymentMethod !== "vodafone_cash") {
    return fail("طريقة الدفع غير صالحة. اختر فودافون كاش أو إنستاباي.");
  }
  if (!PHONE_E164.test(senderPhone)) {
    return fail("رقم هاتف المرسل غير صالح. أدخله بصيغة دولية مثل +201234567890.");
  }
  if (!transactionRef || transactionRef.length < 3) {
    return fail("أدخل مرجع التحويل (رقم العملية). 3 أحرف على الأقل.");
  }
  if (transactionRef.length > 200) {
    return fail("مرجع التحويل طويل جدًا.");
  }

  const supabase = await createClient();
  if (!supabase) return fail("تعذر الاتصال بقاعدة البيانات.");

  const { error } = await supabase.from("payment_requests").insert({
    student_id: user.userId,
    product_id: productId,
    payment_method: paymentMethod as "instapay" | "vodafone_cash",
    sender_phone: senderPhone,
    receipt_path: transactionRef,
    amount_egp: "0",
    status: "pending",
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("payment_product_not_found")) return fail("المنتج غير موجود.");
    if (msg.includes("payment_product_inactive")) return fail("المنتج غير متاح للشراء حاليًا.");
    if (msg.includes("payment_requests_one_pending_per_product")) {
      return fail("لديك طلب دفع معلّق بالفعل لهذا المنتج. انتظر المراجعة.");
    }
    if (msg.includes("payment_requests_sender_phone_chk")) {
      return fail("رقم هاتف المرسل غير صالح. أدخله بصيغة دولية مثل +201234567890.");
    }
    console.error("[submit-purchase]", { code: error.code, message: msg.slice(0, 200) });
    return fail("تعذر إرسال طلب الشراء.");
  }

  revalidatePath("/student/courses");
  revalidatePath("/student/payments");
  revalidatePath("/courses");
  return ok("تم إرسال طلب الشراء بنجاح. سيراجعه المالك ويعتمده يدويًا.");
}

"use server";

import { revalidatePath } from "next/cache";
import { requireStudent, requireAdmin } from "@/lib/auth/guards";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { normalizeEgyptianPhone } from "@/lib/auth/phone";
import { createClient } from "@/lib/supabase/server";
import type { CourseFormActionResult } from "@/lib/dashboard/types";
import {
  PAYMENT_RECEIPT_BUCKET,
  PAYMENT_RECEIPT_MAX_BYTES,
  buildPaymentReceiptObjectPath,
  isStoredReceiptImagePath,
  sniffReceiptImageMime,
} from "@/lib/learning/payment-receipts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const senderPhoneRaw = String(formData.get("senderPhone") ?? "").trim();
  const receiptFile = formData.get("receiptImage");

  if (!UUID.test(productId)) return fail("معرّف المنتج غير صالح.");
  if (paymentMethod !== "instapay" && paymentMethod !== "vodafone_cash") {
    return fail("طريقة الدفع غير صالحة. اختر فودافون كاش أو إنستاباي.");
  }

  const phone = normalizeEgyptianPhone(senderPhoneRaw);
  if (!phone.ok) return fail(phone.error);

  if (!(receiptFile instanceof File) || receiptFile.size <= 0) {
    return fail("صورة إثبات التحويل مطلوبة.");
  }
  if (receiptFile.size > PAYMENT_RECEIPT_MAX_BYTES) {
    return fail("حجم صورة التحويل يجب ألا يتجاوز 5 ميجابايت.");
  }

  const buffer = new Uint8Array(await receiptFile.arrayBuffer());
  const sniffed = sniffReceiptImageMime(buffer);
  if (!sniffed) {
    return fail("صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP.");
  }

  const objectPath = buildPaymentReceiptObjectPath(user.userId, sniffed);
  if (!objectPath) return fail("تعذر تجهيز مسار صورة التحويل.");

  const supabase = await createClient();
  if (!supabase) return fail("تعذر الاتصال بقاعدة البيانات.");

  const blob = new Blob([buffer], { type: sniffed });
  const { error: uploadError } = await supabase.storage
    .from(PAYMENT_RECEIPT_BUCKET)
    .upload(objectPath, blob, {
      contentType: sniffed,
      upsert: false,
      cacheControl: "3600",
    });

  if (uploadError) {
    console.error("[submit-purchase-upload]", {
      message: uploadError.message?.slice(0, 200),
    });
    return fail(
      "تعذر رفع صورة التحويل. تأكد من تطبيق هجرة سلة payment-receipts ثم أعد المحاولة.",
    );
  }

  const { error } = await supabase.from("payment_requests").insert({
    student_id: user.userId,
    product_id: productId,
    payment_method: paymentMethod as "instapay" | "vodafone_cash",
    sender_phone: phone.e164,
    receipt_path: objectPath,
    amount_egp: "0",
    status: "pending",
  });

  if (error) {
    await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).remove([objectPath]);
    const msg = error.message ?? "";
    if (msg.includes("payment_product_not_found")) return fail("المنتج غير موجود.");
    if (msg.includes("payment_product_inactive")) {
      return fail("المنتج غير متاح للشراء حاليًا.");
    }
    if (msg.includes("payment_requests_one_pending_per_product")) {
      return fail("لديك طلب دفع معلّق بالفعل لهذا المنتج. انتظر المراجعة.");
    }
    if (msg.includes("payment_requests_sender_phone_chk")) {
      return fail(
        "رقم الموبايل المحوّل منه غير صالح. استخدم رقمًا مصريًا يبدأ بـ 010 أو 011 أو 012 أو 015.",
      );
    }
    console.error("[submit-purchase]", { code: error.code, message: msg.slice(0, 200) });
    return fail("تعذر إرسال طلب الاشتراك.");
  }

  revalidatePath("/student/courses");
  revalidatePath("/student/payments");
  revalidatePath("/courses");
  revalidatePath("/admin/payments");
  return ok(
    "تم إرسال طلب الاشتراك بنجاح، وسيتم مراجعته بعد التأكد من التحويل.",
  );
}

export type PaymentReceiptUrlResult =
  | { ok: true; url: string; message?: string }
  | { ok: false; message: string };

/** رابط موقّع قصير العمر لعرض صورة التحويل للمالك فقط. */
export async function getPaymentReceiptSignedUrlAction(
  paymentRequestId: string,
): Promise<PaymentReceiptUrlResult> {
  if (!getAuthReadiness().dbSchemaReady) {
    return { ok: false, message: "قاعدة البيانات غير جاهزة." };
  }
  if (!UUID.test(paymentRequestId)) {
    return { ok: false, message: "معرّف الطلب غير صالح." };
  }

  await requireAdmin();
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "تعذر الاتصال بقاعدة البيانات." };

  const { data: payment, error } = await supabase
    .from("payment_requests")
    .select("id, receipt_path")
    .eq("id", paymentRequestId)
    .maybeSingle();

  if (error || !payment) {
    return { ok: false, message: "طلب الدفع غير موجود." };
  }

  if (!isStoredReceiptImagePath(payment.receipt_path)) {
    return {
      ok: false,
      message: "هذا الطلب قديم ويحتوي مرجع تحويل نصيًا وليس صورة.",
    };
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(PAYMENT_RECEIPT_BUCKET)
    .createSignedUrl(payment.receipt_path, 120);

  if (signError || !signed?.signedUrl) {
    console.error("[receipt-signed-url]", {
      message: signError?.message?.slice(0, 200),
    });
    return {
      ok: false,
      message: "تعذر فتح صورة التحويل. قد تكون غير متوفرة في التخزين.",
    };
  }

  return { ok: true, url: signed.signedUrl };
}

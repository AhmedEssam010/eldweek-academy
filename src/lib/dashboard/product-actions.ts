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

/**
 * إنشاء أو تحديث سعر منتج (كورس كامل أو ترم).
 * يبحث عن منتج موجود ويحدّثه، وإلا ينشئ جديدًا.
 */
export async function upsertProductAction(
  formData: FormData,
): Promise<CourseFormActionResult> {
  if (!getAuthReadiness().dbSchemaReady) return fail("قاعدة البيانات غير جاهزة.");
  await requireAdmin();

  const productType = String(formData.get("productType") ?? "").trim();
  const courseId = String(formData.get("courseId") ?? "").trim();
  const semesterId = String(formData.get("semesterId") ?? "").trim();
  const priceRaw = String(formData.get("priceEgp") ?? "").trim();
  const isActiveRaw = String(formData.get("isActive") ?? "true").trim();

  if (productType === "semester") {
    return fail(
      "شراء الأقسام غير مدعوم. حدّد سعر الكورس كامل فقط؛ الاشتراك يفتح كل المحتوى المنشور داخله.",
    );
  }
  if (productType !== "full_course") {
    return fail("نوع المنتج غير صالح.");
  }

  if (!UUID.test(courseId)) {
    return fail("معرّف الكورس غير صالح.");
  }
  void semesterId;

  const price = parseFloat(priceRaw);
  if (isNaN(price) || price < 0) {
    return fail("السعر يجب أن يكون رقمًا صحيحًا لا يقل عن صفر.");
  }
  if (price > 999999999) {
    return fail("السعر مرتفع جدًا.");
  }

  const isActive = isActiveRaw === "true";

  const supabase = await createClient();
  if (!supabase) return fail("تعذر الاتصال بقاعدة البيانات.");

  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("id")
    .eq("product_type", "full_course")
    .eq("course_id", courseId)
    .maybeSingle();
  if (existingError) {
    console.error("[upsert-product-check]", { code: existingError.code, message: existingError.message?.slice(0, 200) });
    return fail("تعذر التحقق من سعر الكورس الحالي.");
  }

  if (existing) {
    const { error } = await supabase
      .from("products")
      .update({ price_egp: price.toFixed(2), is_active: isActive })
      .eq("id", existing.id);
    if (error) {
      console.error("[update-product]", { code: error.code, message: error.message?.slice(0, 200) });
      return fail("تعذر تحديث السعر.");
    }
    revalidatePath(`/admin/courses/${courseId}`);
    revalidatePath(`/student/courses/${courseId}`);
    return ok(`تم تحديث سعر الكورس إلى ${price.toFixed(2)} ج.م.`);
  }

  const { error: insertError } = await supabase.from("products").insert({
    product_type: "full_course" as const,
    course_id: courseId,
    price_egp: price.toFixed(2),
    is_active: isActive,
  });
  if (insertError) {
    const msg = insertError.message ?? "";
    if (msg.includes("products_one_active_full_course_idx")) {
      return fail("يوجد سعر نشط بالفعل لهذه الكورس. عطّل الحالي أولًا.");
    }
    console.error("[insert-product]", { code: insertError.code, message: msg.slice(0, 200) });
    return fail("تعذر إنشاء سعر الكورس.");
  }

  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath(`/student/courses/${courseId}`);
  return ok(`تم ضبط سعر الكورس على ${price.toFixed(2)} ج.م.`);
}

export async function toggleProductActiveAction(
  productId: string,
  isActive: boolean,
  courseId: string,
): Promise<CourseFormActionResult> {
  if (!getAuthReadiness().dbSchemaReady) return fail("قاعدة البيانات غير جاهزة.");
  if (!UUID.test(productId)) return fail("معرّف المنتج غير صالح.");

  await requireAdmin();
  const supabase = await createClient();
  if (!supabase) return fail("تعذر الاتصال بقاعدة البيانات.");

  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", productId);

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("products_one_active_full_course_idx") || msg.includes("products_one_active_semester_idx")) {
      return fail("يوجد منتج نشط آخر بالفعل لنفس الهدف.");
    }
    console.error("[toggle-product]", { code: error.code, message: msg.slice(0, 200) });
    return fail("تعذر تغيير حالة المنتج.");
  }

  revalidatePath(`/admin/courses/${courseId}`);
  return ok(isActive ? "تم تفعيل المنتج." : "تم تعطيل المنتج.");
}

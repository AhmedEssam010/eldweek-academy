import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAuthReadiness } from "@/lib/auth/readiness";
import type { LearningQueryResult } from "@/lib/learning/types";

export type StudentPaymentRequestCard = {
  id: string;
  productType: string;
  targetTitle: string;
  paymentMethod: string;
  amountEgp: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
};

export type CourseProductInfo = {
  productId: string;
  productType: string;
  priceEgp: string;
  label: string;
};

export async function listStudentPayments(
  studentId: string,
): Promise<LearningQueryResult<StudentPaymentRequestCard[]>> {
  if (!getAuthReadiness().dbSchemaReady) {
    return { availability: "setup_required", message: "قاعدة البيانات غير جاهزة.", data: [] };
  }
  const supabase = await createClient();
  if (!supabase) {
    return { availability: "unavailable", message: "تعذر الاتصال بقاعدة البيانات.", data: [] };
  }

  const { data, error } = await supabase
    .from("payment_requests")
    .select(
      "id, payment_method, amount_egp, status, rejection_reason, created_at, products(product_type, course_id, semester_id, courses(title), course_semesters(title, courses(title)))",
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) {
    return { availability: "unavailable", message: "تعذر قراءة طلبات الدفع.", data: [] };
  }

  const cards: StudentPaymentRequestCard[] = (data ?? []).map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    let productType = "unknown";
    let targetTitle = "غير معروف";
    if (product) {
      productType = product.product_type ?? "unknown";
      if (productType === "full_course") {
        const course = Array.isArray(product.courses) ? product.courses[0] : product.courses;
        targetTitle = course?.title ?? "كورس";
      } else {
        const semester = Array.isArray(product.course_semesters) ? product.course_semesters[0] : product.course_semesters;
        const course = semester ? (Array.isArray(semester.courses) ? semester.courses[0] : semester.courses) : null;
        targetTitle = `${semester?.title ?? "ترم"} — ${course?.title ?? ""}`.trim();
      }
    }
    return {
      id: row.id,
      productType,
      targetTitle,
      paymentMethod: row.payment_method,
      amountEgp: row.amount_egp,
      status: row.status,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
    };
  });

  return {
    availability: cards.length === 0 ? "empty" : "ready",
    message: cards.length === 0 ? "لا توجد طلبات دفع بعد." : "تم جلب طلبات الدفع.",
    data: cards,
  };
}

export async function getCourseProducts(
  courseId: string,
): Promise<LearningQueryResult<CourseProductInfo[]>> {
  if (!getAuthReadiness().dbSchemaReady) {
    return { availability: "setup_required", message: "قاعدة البيانات غير جاهزة.", data: [] };
  }
  const supabase = await createClient();
  if (!supabase) {
    return { availability: "unavailable", message: "تعذر الاتصال.", data: [] };
  }

  // الشراء فقط على مستوى الكورس (full_course). الأقسام ليست منتجات.
  const { data: fullCourse } = await supabase
    .from("products")
    .select("id, product_type, price_egp")
    .eq("course_id", courseId)
    .eq("product_type", "full_course")
    .eq("is_active", true)
    .maybeSingle();

  const products: CourseProductInfo[] = [];

  if (fullCourse) {
    products.push({
      productId: fullCourse.id,
      productType: "full_course",
      priceEgp: fullCourse.price_egp,
      label: "سعر الكورس كامل",
    });
  }

  return {
    availability: products.length === 0 ? "empty" : "ready",
    message: products.length === 0 ? "لا يوجد سعر مضبوط لهذا الكورس." : "تم جلب سعر الكورس.",
    data: products,
  };
}

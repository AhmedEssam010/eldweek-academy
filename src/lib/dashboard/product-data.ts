import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAuthReadiness } from "@/lib/auth/readiness";
import type { DataAvailability } from "@/lib/dashboard/types";

export type ProductView = {
  id: string;
  productType: string;
  targetId: string;
  targetTitle: string;
  priceEgp: string;
  isActive: boolean;
  updatedAt: string;
};

type QueryResult<T> = {
  availability: DataAvailability;
  message: string;
  data: T;
};

export async function getCourseProducts(
  courseId: string,
): Promise<QueryResult<{ fullCourse: ProductView | null; semesters: ProductView[] }>> {
  if (!getAuthReadiness().dbSchemaReady) {
    return {
      availability: "setup_required",
      message: "قاعدة البيانات غير جاهزة.",
      data: { fullCourse: null, semesters: [] },
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      availability: "unavailable",
      message: "تعذر الاتصال.",
      data: { fullCourse: null, semesters: [] },
    };
  }

  const { data: fullCourseRow } = await supabase
    .from("products")
    .select("id, product_type, course_id, price_egp, is_active, updated_at")
    .eq("product_type", "full_course")
    .eq("course_id", courseId)
    .maybeSingle();

  const { data: courseSemesters } = await supabase
    .from("course_semesters")
    .select("id, title, sort_order")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });

  const semesterIds = (courseSemesters ?? []).map((s) => s.id);
  let semesterProducts: Array<{
    id: string;
    product_type: string;
    semester_id: string | null;
    price_egp: string;
    is_active: boolean;
    updated_at: string;
  }> = [];

  if (semesterIds.length > 0) {
    const { data } = await supabase
      .from("products")
      .select("id, product_type, semester_id, price_egp, is_active, updated_at")
      .eq("product_type", "semester")
      .in("semester_id", semesterIds);
    semesterProducts = data ?? [];
  }

  const fullCourse: ProductView | null = fullCourseRow
    ? {
        id: fullCourseRow.id,
        productType: "full_course",
        targetId: courseId,
        targetTitle: "الكورس الكامل",
        priceEgp: fullCourseRow.price_egp,
        isActive: Boolean(fullCourseRow.is_active),
        updatedAt: fullCourseRow.updated_at,
      }
    : null;

  const semesters: ProductView[] = (courseSemesters ?? []).map((sem) => {
    const product = semesterProducts.find((p) => p.semester_id === sem.id);
    if (!product) {
      return {
        id: "",
        productType: "semester",
        targetId: sem.id,
        targetTitle: sem.title,
        priceEgp: "",
        isActive: false,
        updatedAt: "",
      };
    }
    return {
      id: product.id,
      productType: "semester",
      targetId: sem.id,
      targetTitle: sem.title,
      priceEgp: product.price_egp,
      isActive: Boolean(product.is_active),
      updatedAt: product.updated_at,
    };
  });

  return {
    availability: "ready",
    message: "تم جلب المنتجات.",
    data: { fullCourse, semesters },
  };
}

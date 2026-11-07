import "server-only";

import type { createClient } from "@/lib/supabase/server";

export type CourseDeletionAssessment = {
  courseId: string;
  title: string;
  canPermanentlyDelete: boolean;
  blockers: string[];
  productCount: number;
  paymentRequestCount: number;
  enrollmentCount: number;
};

type DbClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

/**
 * يجمع منتجات الكورس الكامل + منتجات الأقسام التابعة له.
 * الحذف النهائي ممنوع إن وُجدت طلبات دفع أو تسجيلات مرتبطة بهذه المنتجات.
 */
export async function assessCourseDeletion(
  supabase: DbClient,
  courseId: string,
): Promise<
  | { ok: true; assessment: CourseDeletionAssessment; productIds: string[] }
  | { ok: false; message: string }
> {
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, title")
    .eq("id", courseId)
    .maybeSingle();

  if (courseError) {
    return { ok: false, message: "تعذر قراءة الكورس قبل فحص الحذف." };
  }
  if (!course) {
    return { ok: false, message: "لم يُعثر على الكورس." };
  }

  const { data: semesters, error: semestersError } = await supabase
    .from("course_semesters")
    .select("id")
    .eq("course_id", courseId);

  if (semestersError) {
    return { ok: false, message: "تعذر قراءة أقسام الكورس قبل فحص الحذف." };
  }

  const semesterIds = (semesters ?? []).map((row) => row.id);

  const productIds = new Set<string>();

  const { data: courseProducts, error: courseProductsError } = await supabase
    .from("products")
    .select("id")
    .eq("course_id", courseId);

  if (courseProductsError) {
    return { ok: false, message: "تعذر قراءة منتجات الكورس قبل فحص الحذف." };
  }
  for (const row of courseProducts ?? []) {
    productIds.add(row.id);
  }

  if (semesterIds.length > 0) {
    const { data: semesterProducts, error: semesterProductsError } =
      await supabase.from("products").select("id").in("semester_id", semesterIds);

    if (semesterProductsError) {
      return {
        ok: false,
        message: "تعذر قراءة منتجات الأقسام قبل فحص الحذف.",
      };
    }
    for (const row of semesterProducts ?? []) {
      productIds.add(row.id);
    }
  }

  const ids = [...productIds];
  let paymentRequestCount = 0;
  let enrollmentCount = 0;

  if (ids.length > 0) {
    const [paymentsResult, enrollmentsResult] = await Promise.all([
      supabase
        .from("payment_requests")
        .select("id", { count: "exact", head: true })
        .in("product_id", ids),
      supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .in("product_id", ids),
    ]);

    if (paymentsResult.error) {
      return { ok: false, message: "تعذر فحص سجل طلبات الدفع المرتبطة." };
    }
    if (enrollmentsResult.error) {
      return { ok: false, message: "تعذر فحص سجل التسجيلات المرتبطة." };
    }

    paymentRequestCount = paymentsResult.count ?? 0;
    enrollmentCount = enrollmentsResult.count ?? 0;
  }

  const blockers: string[] = [];
  if (paymentRequestCount > 0) {
    blockers.push(
      `يوجد ${paymentRequestCount} طلب دفع مرتبط بمنتجات هذا الكورس.`,
    );
  }
  if (enrollmentCount > 0) {
    blockers.push(
      `يوجد ${enrollmentCount} تسجيل طالب مرتبط بمنتجات هذا الكورس.`,
    );
  }

  return {
    ok: true,
    productIds: ids,
    assessment: {
      courseId: course.id,
      title: course.title,
      canPermanentlyDelete: blockers.length === 0,
      blockers,
      productCount: ids.length,
      paymentRequestCount,
      enrollmentCount,
    },
  };
}

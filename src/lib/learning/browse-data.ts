import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAuthReadiness } from "@/lib/auth/readiness";
import type { LearningQueryResult } from "@/lib/learning/types";

import type { AcademicSemester } from "@/types/database";

export type PublishedCourseCard = {
  courseId: string;
  title: string;
  description: string;
  thumbnailPath: string | null;
  academicSemester: AcademicSemester | null;
  priceEgp: string | null;
  sectionsCount: number;
  hasActiveProduct: boolean;
};

export async function listPublishedCourses(): Promise<
  LearningQueryResult<PublishedCourseCard[]>
> {
  if (!getAuthReadiness().dbSchemaReady) {
    return {
      availability: "setup_required",
      message: "قاعدة البيانات غير جاهزة.",
      data: [],
    };
  }
  const supabase = await createClient();
  if (!supabase) {
    return { availability: "unavailable", message: "تعذر الاتصال.", data: [] };
  }

  let { data, error } = await supabase
    .from("courses")
    .select("id, title, description, thumbnail_path, academic_semester, status")
    .eq("status", "published")
    .order("updated_at", { ascending: false });

  if (error && String(error.message ?? "").includes("academic_semester")) {
    const fallback = await supabase
      .from("courses")
      .select("id, title, description, thumbnail_path, status")
      .eq("status", "published")
      .order("updated_at", { ascending: false });
    data = (fallback.data ?? []).map((row) => ({
      ...row,
      academic_semester: null,
    })) as typeof data;
    error = fallback.error;
  }

  if (error) {
    return { availability: "unavailable", message: "تعذر قراءة الكورسات.", data: [] };
  }

  const courseIds = (data ?? []).map((c) => c.id);
  if (courseIds.length === 0) {
    return { availability: "empty", message: "لا توجد كورسات منشورة.", data: [] };
  }

  const [semestersResult, productsResult] = await Promise.all([
    supabase
      .from("course_semesters")
      .select("id, course_id")
      .in("course_id", courseIds),
    supabase
      .from("products")
      .select("id, course_id, price_egp")
      .in("course_id", courseIds)
      .eq("is_active", true)
      .eq("product_type", "full_course"),
  ]);

  const sectionCounts = new Map<string, number>();
  for (const s of semestersResult.data ?? []) {
    sectionCounts.set(s.course_id, (sectionCounts.get(s.course_id) ?? 0) + 1);
  }

  const productByCourse = new Map<string, string>();
  for (const p of productsResult.data ?? []) {
    if (p.course_id) productByCourse.set(p.course_id, p.price_egp);
  }

  const cards: PublishedCourseCard[] = (data ?? []).map((course) => {
    const academic = (course as { academic_semester?: string | null }).academic_semester;
    return {
      courseId: course.id,
      title: course.title,
      description: course.description ?? "",
      thumbnailPath: course.thumbnail_path ?? null,
      academicSemester:
        academic === "first" || academic === "second" ? academic : null,
      priceEgp: productByCourse.get(course.id) ?? null,
      sectionsCount: sectionCounts.get(course.id) ?? 0,
      hasActiveProduct: productByCourse.has(course.id),
    };
  });

  return {
    availability: "ready",
    message: "تم جلب الكورسات المنشورة.",
    data: cards,
  };
}

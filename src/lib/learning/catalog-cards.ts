import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { getProfileAuthState } from "@/lib/auth/profile";
import { listPublishedCourses } from "@/lib/learning/browse-data";
import type {
  CourseSubscribeState,
  LearningQueryResult,
} from "@/lib/learning/types";
import type { AcademicSemester } from "@/types/database";

export type { CourseSubscribeState };

export type CatalogCourseCard = {
  courseId: string;
  title: string;
  description: string;
  thumbnailPath: string | null;
  academicSemester: AcademicSemester | null;
  priceEgp: string | null;
  sectionsCount: number;
  hasActiveProduct: boolean;
  isFree: boolean;
  subscribeState: CourseSubscribeState;
};

function isFreePrice(priceEgp: string | null): boolean {
  if (priceEgp == null) return false;
  const n = Number(priceEgp);
  return Number.isFinite(n) && n === 0;
}

export async function listCatalogCourseCards(): Promise<
  LearningQueryResult<CatalogCourseCard[]>
> {
  const published = await listPublishedCourses();
  if (
    published.availability === "setup_required" ||
    published.availability === "unavailable"
  ) {
    return {
      availability: published.availability,
      message: published.message,
      data: [],
    };
  }

  const profile = await getProfileAuthState();
  const isStudent =
    profile.status === "authenticated" &&
    profile.role === "student" &&
    profile.isActive;

  const enrolled = new Set<string>();
  const pending = new Set<string>();

  if (isStudent && getAuthReadiness().dbSchemaReady) {
    const supabase = await createClient();
    if (supabase) {
      const courseIds = published.data.map((c) => c.courseId);

      const { data: enrollmentRows } = await supabase
        .from("enrollments")
        .select("status, products!inner(product_type, course_id)")
        .eq("student_id", profile.userId)
        .eq("status", "active");

      for (const row of enrollmentRows ?? []) {
        const product = Array.isArray(row.products)
          ? row.products[0]
          : row.products;
        if (
          product?.product_type === "full_course" &&
          product.course_id &&
          courseIds.includes(product.course_id)
        ) {
          enrolled.add(product.course_id);
        }
      }

      const { data: pendingRows } = await supabase
        .from("payment_requests")
        .select("status, products!inner(product_type, course_id)")
        .eq("student_id", profile.userId)
        .eq("status", "pending");

      for (const row of pendingRows ?? []) {
        const product = Array.isArray(row.products)
          ? row.products[0]
          : row.products;
        if (
          product?.product_type === "full_course" &&
          product.course_id &&
          courseIds.includes(product.course_id)
        ) {
          pending.add(product.course_id);
        }
      }
    }
  }

  const cards: CatalogCourseCard[] = published.data.map((course) => {
    let subscribeState: CourseSubscribeState;
    if (enrolled.has(course.courseId)) {
      subscribeState = "enrolled";
    } else if (pending.has(course.courseId)) {
      subscribeState = "pending";
    } else if (!course.hasActiveProduct) {
      subscribeState = "unavailable";
    } else if (!isStudent) {
      subscribeState = "login_required";
    } else {
      subscribeState = "available";
    }

    return {
      ...course,
      isFree: isFreePrice(course.priceEgp),
      subscribeState,
    };
  });

  return {
    availability: cards.length === 0 ? "empty" : "ready",
    message:
      cards.length === 0
        ? "لا توجد كورسات منشورة للعرض."
        : "تم جلب بطاقات الكورسات.",
    data: cards,
  };
}

export async function getCourseSubscribeState(
  courseId: string,
): Promise<{
  subscribeState: CourseSubscribeState;
  priceEgp: string | null;
  hasActiveProduct: boolean;
}> {
  const catalog = await listCatalogCourseCards();
  const match = catalog.data.find((card) => card.courseId === courseId);
  if (!match) {
    return {
      subscribeState: "unavailable",
      priceEgp: null,
      hasActiveProduct: false,
    };
  }
  return {
    subscribeState: match.subscribeState,
    priceEgp: match.priceEgp,
    hasActiveProduct: match.hasActiveProduct,
  };
}

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { NavbarHost } from "@/components/layout/NavbarHost";
import { Footer } from "@/components/layout/Footer";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { CourseExperience } from "@/components/learning/CourseExperience";
import { getCourseSubscribeState } from "@/lib/learning/catalog-cards";
import { getStudentCourseExperience } from "@/lib/learning/course-experience";
import { getCourseProducts } from "@/lib/learning/purchase-data";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return {
    title: `تفاصيل الكورس · ${id.slice(0, 8)} | المهندس أحمد الدويك`,
  };
}

export default async function PublicCoursePage({ params }: PageProps) {
  const { id } = await params;
  const [detail, access, productsResult] = await Promise.all([
    getStudentCourseExperience(id),
    getCourseSubscribeState(id),
    getCourseProducts(id),
  ]);

  // فقط غياب الكورس المنشور = 404. أخطاء القراءة تُعرض كتنبيه وليست 404.
  if (detail.availability === "empty" || !detail.data) {
    notFound();
  }

  const course = {
    ...detail.data,
    mode: "student" as const,
  };

  const products =
    course.hasAccess || access.subscribeState === "enrolled"
      ? []
      : productsResult.data;

  return (
    <div className="flex min-h-full flex-col">
      <NavbarHost />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-8 sm:px-6 lg:px-8">
        {(detail.availability === "setup_required" ||
          detail.availability === "unavailable") && (
          <SetupRequiredPanel message={detail.message} />
        )}

        <Suspense fallback={<LoadingState label="جارٍ تجهيز تفاصيل الكورس…" />}>
          <CourseExperience
            course={course}
            products={products}
            backHref="/"
            backLabel="العودة للرئيسية"
            subscribeState={
              course.hasAccess ? "enrolled" : access.subscribeState
            }
            priceEgp={access.priceEgp}
          />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

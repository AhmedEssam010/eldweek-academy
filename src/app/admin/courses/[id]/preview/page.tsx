import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { CourseExperience } from "@/components/learning/CourseExperience";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminCoursePreviewExperience } from "@/lib/learning/course-experience";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return {
    title: `معاينة كطالب · ${id.slice(0, 8)} | المهندس أحمد الدويك`,
  };
}

export default async function AdminCoursePreviewPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const preview = await getAdminCoursePreviewExperience(id);

  if (preview.availability === "empty" || !preview.data) {
    notFound();
  }

  return (
    <div className="space-y-5">
      {(preview.availability === "setup_required" ||
        preview.availability === "unavailable") && (
        <SetupRequiredPanel message={preview.message} />
      )}

      <Suspense fallback={<LoadingState label="جارٍ تجهيز المعاينة…" />}>
        <CourseExperience
          course={preview.data}
          backHref={`/admin/courses/${id}`}
          backLabel="العودة للإدارة"
        />
      </Suspense>
    </div>
  );
}

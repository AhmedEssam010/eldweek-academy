import { notFound } from "next/navigation";
import { CourseContentLayout } from "@/components/learning/CourseContentLayout";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { requireAdmin } from "@/lib/auth/guards";
import { resolveStaffCourseAccess } from "@/lib/learning/data";
import { getAuthReadiness } from "@/lib/auth/readiness";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminCourseProgressPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const readiness = getAuthReadiness();
  const access = await resolveStaffCourseAccess(id, {
    userId: "admin",
    isAdmin: true,
  });
  if (access.availability === "empty" || !access.data) notFound();

  return (
    <CourseContentLayout
      access={access.data}
      basePath={`/admin/courses/${id}`}
      active="progress"
      description="متابعة تقدّم الطلاب من lesson_progress بعد التحقق من الاستحقاق."
    >
      {!readiness.dbSchemaReady ? (
        <SetupRequiredPanel message="مخطط التقدّم غير جاهز للعرض." />
      ) : (
        <EmptyState
          title="لا توجد بيانات تقدّم للعرض"
          description="لن تُعرض نسب مختلقة. اربط القراءات بعد تطبيق الهجرات ووجود تسجيلات حقيقية."
        />
      )}
    </CourseContentLayout>
  );
}

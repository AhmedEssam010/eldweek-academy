import { notFound } from "next/navigation";
import { CourseContentLayout } from "@/components/learning/CourseContentLayout";
import { HomeworkEditor } from "@/components/learning/HomeworkEditor";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { requireAdmin } from "@/lib/auth/guards";
import { resolveStaffCourseAccess } from "@/lib/learning/data";
import { getHomeworkEditorData } from "@/lib/learning/homework-data";

export const instant = false;

type PageProps = {
  params: Promise<{ id: string; homeworkId: string }>;
};

export default async function AdminHomeworkDetailPage({ params }: PageProps) {
  await requireAdmin();
  const { id, homeworkId } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: "admin",
    isAdmin: true,
  });
  if (access.availability === "empty" || !access.data) notFound();

  const detail = await getHomeworkEditorData(id, homeworkId);
  if (detail.availability === "empty" || !detail.data) notFound();

  return (
    <CourseContentLayout
      access={access.data}
      basePath={`/admin/courses/${id}`}
      active="homework"
    >
      {(detail.availability === "setup_required" ||
        detail.availability === "unavailable") && (
        <SetupRequiredPanel message={detail.message} />
      )}
      <HomeworkEditor
        mode="edit"
        courseId={id}
        canManage
        homework={detail.data}
      />
    </CourseContentLayout>
  );
}

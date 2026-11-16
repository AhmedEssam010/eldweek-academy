import { notFound } from "next/navigation";
import { CourseContentLayout } from "@/components/learning/CourseContentLayout";
import { HomeworkEditor } from "@/components/learning/HomeworkEditor";
import { requireAdmin } from "@/lib/auth/guards";
import {
  listCourseSemesters,
  resolveStaffCourseAccess,
} from "@/lib/learning/data";

export const instant = false;

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminNewHomeworkPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: "admin",
    isAdmin: true,
  });
  if (access.availability === "empty" || !access.data) notFound();
  const semesters = await listCourseSemesters(id);

  return (
    <CourseContentLayout
      access={access.data}
      basePath={`/admin/courses/${id}`}
      active="homework"
    >
      <HomeworkEditor
        mode="create"
        courseId={id}
        canManage
        semesters={semesters.data.map((semester) => ({
          id: semester.id,
          title: semester.title,
        }))}
      />
    </CourseContentLayout>
  );
}

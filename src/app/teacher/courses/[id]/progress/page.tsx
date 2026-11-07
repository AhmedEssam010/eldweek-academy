import { notFound } from "next/navigation";
import { CourseContentLayout } from "@/components/learning/CourseContentLayout";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { FormMessage } from "@/components/auth/FormMessage";
import { requireTeacher } from "@/lib/auth/guards";
import { resolveStaffCourseAccess } from "@/lib/learning/data";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export default async function TeacherCourseProgressPage({ params }: PageProps) {
  const user = await requireTeacher();
  const { id } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: user.userId,
    isAdmin: false,
  });
  if (access.availability === "empty" || !access.data) notFound();

  return (
    <CourseContentLayout
      access={access.data}
      basePath={`/teacher/courses/${id}`}
      active="progress"
    >
      {!access.data.canViewStudentProgress ? (
        <FormMessage type="error">
          عرض تقدّم الطلاب يتطلب can_view_student_progress.
        </FormMessage>
      ) : (
        <EmptyState
          title="لا بيانات تقدّم بعد"
          description="لن تُختلق نسب مشاهدة. اربط القراءة بعد الهجرات والتسجيلات الحقيقية."
        />
      )}
    </CourseContentLayout>
  );
}

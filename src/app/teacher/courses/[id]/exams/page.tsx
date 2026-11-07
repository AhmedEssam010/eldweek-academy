import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseContentLayout } from "@/components/learning/CourseContentLayout";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { FormMessage } from "@/components/auth/FormMessage";
import { requireTeacher } from "@/lib/auth/guards";
import {
  listCourseExams,
  resolveStaffCourseAccess,
} from "@/lib/learning/data";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export default async function TeacherCourseExamsPage({ params }: PageProps) {
  const user = await requireTeacher();
  const { id } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: user.userId,
    isAdmin: false,
  });
  if (access.availability === "empty" || !access.data) notFound();

  if (!access.data.canManageExams) {
    return (
      <CourseContentLayout
        access={access.data}
        basePath={`/teacher/courses/${id}`}
        active="exams"
      >
        <FormMessage type="error">
          إدارة الامتحانات تتطلب can_manage_exams على هذا التعيين.
        </FormMessage>
      </CourseContentLayout>
    );
  }

  const exams = await listCourseExams(id);

  return (
    <CourseContentLayout
      access={access.data}
      basePath={`/teacher/courses/${id}`}
      active="exams"
    >
      {(exams.availability === "setup_required" ||
        exams.availability === "unavailable") && (
        <SetupRequiredPanel message={exams.message} />
      )}

      <Link
        href={`/teacher/courses/${id}/exams/new`}
        className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
      >
        مسودة امتحان
      </Link>

      {exams.data.length === 0 ? (
        <EmptyState
          title="لا توجد امتحانات"
          description="لن تُعرض امتحانات مختلقة."
        />
      ) : (
        <ul className="space-y-3">
          {exams.data.map((exam) => (
            <li key={exam.id}>
              <Link
                href={`/teacher/courses/${id}/exams/${exam.id}`}
                className="block rounded-2xl border border-white/10 bg-surface p-4 hover:border-primary/40"
              >
                <h3 className="font-semibold text-white">{exam.title}</h3>
                <p className="mt-1 text-xs text-light-purple">
                  {exam.isPublished ? "منشور" : "مسودة"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CourseContentLayout>
  );
}

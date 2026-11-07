import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { ExamAttemptsSection } from "@/components/learning/ExamAttemptsSection";
import { ExamEditor } from "@/components/learning/ExamEditor";
import { FormMessage } from "@/components/auth/FormMessage";
import { requireTeacher } from "@/lib/auth/guards";
import { getExamEditorData, resolveStaffCourseAccess } from "@/lib/learning/data";

export const instant = false;

type PageProps = {
  params: Promise<{ id: string; examId: string }>;
};

export default async function TeacherExamDetailPage({ params }: PageProps) {
  const user = await requireTeacher();
  const { id, examId } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: user.userId,
    isAdmin: false,
  });
  if (access.availability === "empty" || !access.data) notFound();

  if (!access.data.canManageExams) {
    return (
      <div className="space-y-4">
        <PageHeader title="غير مصرّح" />
        <FormMessage type="error">
          تعديل الامتحانات يتطلب can_manage_exams.
        </FormMessage>
      </div>
    );
  }

  const exam = await getExamEditorData(examId);

  return (
    <div className="space-y-6">
      <PageHeader
        title={exam.data?.title ?? "امتحان"}
        actions={
          <Link
            href={`/teacher/courses/${id}/exams`}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            رجوع
          </Link>
        }
      />

      {(exam.availability === "setup_required" ||
        exam.availability === "unavailable") && (
        <SetupRequiredPanel message={exam.message} />
      )}

      <ExamEditor exam={exam.data} canManage mode="edit" courseId={id} />
      {access.data.canViewStudentProgress ? <ExamAttemptsSection examId={examId} /> : null}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { ExamEditor } from "@/components/learning/ExamEditor";
import { ExamAttemptsSection } from "@/components/learning/ExamAttemptsSection";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { requireAdmin } from "@/lib/auth/guards";
import { getExamEditorData, resolveStaffCourseAccess } from "@/lib/learning/data";

export const instant = false;

type PageProps = {
  params: Promise<{ id: string; examId: string }>;
};

export default async function AdminExamDetailPage({ params }: PageProps) {
  await requireAdmin();
  const { id, examId } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: "admin",
    isAdmin: true,
  });
  if (access.availability === "empty" || !access.data) notFound();

  const exam = await getExamEditorData(examId);

  return (
    <div className="space-y-6">
      <PageHeader
        title={exam.data?.title ?? "الامتحان"}
        description="تحرير الأسئلة ونشر الامتحان ومراجعة محاولات الطلاب."
        actions={
          <Link
            href={`/admin/courses/${id}/exams`}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            كل الامتحانات
          </Link>
        }
      />

      {(exam.availability === "setup_required" ||
        exam.availability === "unavailable") && (
        <SetupRequiredPanel message={exam.message} />
      )}

      {exam.availability === "empty" ? (
        <EmptyState title="غير موجود" description={exam.message} />
      ) : (
        <ExamEditor exam={exam.data} canManage mode="edit" courseId={id} />
      )}

      <ExamAttemptsSection examId={examId} />
    </div>
  );
}

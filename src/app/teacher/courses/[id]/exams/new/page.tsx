import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ExamEditor } from "@/components/learning/ExamEditor";
import { FormMessage } from "@/components/auth/FormMessage";
import { requireTeacher } from "@/lib/auth/guards";
import { resolveStaffCourseAccess } from "@/lib/learning/data";
import { listExamScopeOptions } from "@/lib/learning/exam-scope";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export default function TeacherNewExamPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-white/70">جارٍ تحميل نموذج الامتحان…</p>
      }
    >
      <TeacherNewExamContent params={params} />
    </Suspense>
  );
}

async function TeacherNewExamContent({ params }: PageProps) {
  await connection();
  const user = await requireTeacher();
  const { id } = await params;
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
          إنشاء الامتحانات يتطلب can_manage_exams.
        </FormMessage>
      </div>
    );
  }

  const scope = await listExamScopeOptions(id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="مسودة امتحان"
        actions={
          <Link
            href={`/teacher/courses/${id}/exams`}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            رجوع
          </Link>
        }
      />
      <ExamEditor
        mode="create"
        canManage
        courseId={id}
        semesters={scope.data.semesters}
        lessons={scope.data.lessons}
      />
    </div>
  );
}

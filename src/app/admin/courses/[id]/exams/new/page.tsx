import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ExamEditor } from "@/components/learning/ExamEditor";
import { requireAdmin } from "@/lib/auth/guards";
import { resolveStaffCourseAccess } from "@/lib/learning/data";
import { listExamScopeOptions } from "@/lib/learning/exam-scope";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export default function AdminNewExamPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-white/70">جارٍ تحميل نموذج الامتحان…</p>
      }
    >
      <NewExamContent params={params} />
    </Suspense>
  );
}

async function NewExamContent({ params }: PageProps) {
  await connection();
  await requireAdmin();
  const { id } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: "admin",
    isAdmin: true,
  });
  if (access.availability === "empty" || !access.data) notFound();
  const scope = await listExamScopeOptions(id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="مسودة امتحان"
        description={access.data.title}
        actions={
          <Link
            href={`/admin/courses/${id}/exams`}
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

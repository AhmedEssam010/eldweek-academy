import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { ExamTakingInterface } from "@/components/learning/ExamTakingInterface";
import { requireStudent } from "@/lib/auth/guards";
import { getExamTakingData } from "@/lib/learning/data";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export default async function StudentExamPage({ params }: PageProps) {
  await requireStudent();
  const { id } = await params;
  const exam = await getExamTakingData(id);

  if (exam.availability === "empty" || !exam.data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="أداء الامتحان"
        description="التقويم على الخادم فقط. لا مفاتيح إجابة في المتصفح."
        actions={
          <Link
            href="/student/results"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            نتائجي
          </Link>
        }
      />

      {(exam.availability === "setup_required" ||
        exam.availability === "unavailable") && (
        <SetupRequiredPanel message={exam.message} />
      )}

      <ExamTakingInterface exam={exam.data} />
    </div>
  );
}

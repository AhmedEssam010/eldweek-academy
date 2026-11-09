import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EssayGradingForm } from "@/components/learning/EssayGradingForm";
import { getExamGradingDetail } from "@/lib/learning/data";

export const instant = false;

export default async function AdminGradingDetailPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const detail = await getExamGradingDetail(attemptId);

  if (detail.availability === "empty" || !detail.data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="تصحيح تسليم"
        description="راجع الإجابات الموضوعية وصحّح المقالات ثم اعتمد النتيجة."
      />
      <Link href="/admin/grading" className="text-sm text-light-purple hover:underline">
        العودة إلى طابور التصحيح
      </Link>

      {(detail.availability === "setup_required" ||
        detail.availability === "unavailable") && (
        <SetupRequiredPanel message={detail.message} />
      )}

      {detail.data ? <EssayGradingForm detail={detail.data} /> : null}
    </div>
  );
}

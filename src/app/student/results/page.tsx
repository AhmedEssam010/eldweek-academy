import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ExamResultCard } from "@/components/learning/ExamResultCard";
import { requireStudent } from "@/lib/auth/guards";
import { listStudentExamAttempts } from "@/lib/learning/data";

export const instant = false;

export const metadata = {
  title: "نتائجي | المهندس أحمد الدويك",
};

export default async function StudentResultsPage() {
  const user = await requireStudent();
  const attempts = await listStudentExamAttempts(user.userId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="نتائجي"
        description="المحاولات والدرجات من الخادم فقط — بدون درجات مختلقة."
      />

      {(attempts.availability === "setup_required" ||
        attempts.availability === "unavailable") && (
        <SetupRequiredPanel message={attempts.message} />
      )}

      {attempts.data.length === 0 ? (
        <EmptyState
          title="لا توجد محاولات بعد"
          description="بعد تسليم امتحان منشور تظهر الدرجة هنا."
        />
      ) : (
        <div className="space-y-3">
          {attempts.data.map((attempt) => (
            <ExamResultCard key={attempt.id} attempt={attempt} />
          ))}
        </div>
      )}
    </div>
  );
}

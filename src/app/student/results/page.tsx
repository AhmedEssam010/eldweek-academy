import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ExamResultCard } from "@/components/learning/ExamResultCard";
import { requireStudent } from "@/lib/auth/guards";
import { listStudentExamAttempts } from "@/lib/learning/data";
import { listStudentHomeworkAttempts } from "@/lib/learning/homework-data";

export const instant = false;

export const metadata = {
  title: "نتائجي | المهندس أحمد الدويك",
};

export default async function StudentResultsPage() {
  const user = await requireStudent();
  const attempts = await listStudentExamAttempts(user.userId);
  const homeworkAttempts = await listStudentHomeworkAttempts(user.userId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="نتائجي"
        description="نتائج الامتحانات والواجبات من الخادم فقط — بدون درجات مختلقة."
      />

      {(attempts.availability === "setup_required" ||
        attempts.availability === "unavailable" ||
        homeworkAttempts.availability === "setup_required") && (
        <SetupRequiredPanel
          message={attempts.message || homeworkAttempts.message}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">الامتحانات</h2>
        {attempts.data.length === 0 ? (
          <EmptyState
            title="لا توجد محاولات امتحان بعد"
            description="بعد تسليم امتحان منشور تظهر الدرجة هنا."
          />
        ) : (
          <div className="space-y-3">
            {attempts.data.map((attempt) => (
              <ExamResultCard key={attempt.id} attempt={attempt} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">الواجبات</h2>
        {homeworkAttempts.data.length === 0 ? (
          <EmptyState
            title="لا توجد محاولات واجب بعد"
            description="بعد تسليم واجب منشور تظهر حالته ودرجته هنا."
          />
        ) : (
          <ul className="space-y-3">
            {homeworkAttempts.data.map((attempt) => (
              <li
                key={attempt.id}
                className="rounded-2xl border border-white/10 bg-surface p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">
                    {attempt.homeworkTitle}
                  </h3>
                  <span className="text-xs text-white/50">
                    محاولة {attempt.attemptNumber}
                  </span>
                </div>
                <p className="mt-2 text-xs text-white/55">
                  {attempt.gradingStatus === "awaiting_essay" ||
                  attempt.gradingStatus === "draft"
                    ? "تم تسليم الواجب بنجاح، وجارٍ تصحيح الأسئلة المقالية."
                    : attempt.resultsReleased && attempt.score != null
                      ? `تم تصحيح الواجب · ${attempt.score}%`
                      : "تم التسليم — النتيجة وفق سياسة الإظهار."}
                </p>
                <Link
                  href={`/student/homework/${attempt.homeworkId}`}
                  className="mt-3 inline-flex text-xs text-light-purple hover:underline"
                >
                  فتح الواجب
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

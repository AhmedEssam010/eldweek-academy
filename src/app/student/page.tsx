import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { PaymentStatusBadge } from "@/components/dashboard/PaymentBadges";
import { ExamResultCard } from "@/components/learning/ExamResultCard";
import { requireStudent } from "@/lib/auth/guards";
import { listStudentCourses, listStudentExamAttempts } from "@/lib/learning/data";
import { listStudentPayments } from "@/lib/learning/purchase-data";

export const metadata = {
  title: "لوحة الطالب | المهندس أحمد الدويك",
};

export const instant = false;

export default async function StudentHomePage() {
  const user = await requireStudent();
  const [courses, payments, attempts] = await Promise.all([
    listStudentCourses(user.userId),
    listStudentPayments(user.userId),
    listStudentExamAttempts(user.userId),
  ]);
  const recentPayments = payments.data.slice(0, 3);
  const recentAttempts = attempts.data.slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        title="مساحة التعلم"
        description="كورساتك، حالة طلبات الدفع، ونتائج الامتحانات."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/student/courses"
          className="rounded-2xl border border-primary/30 bg-primary/10 p-5"
        >
          <p className="text-sm text-white/60">كورساتي</p>
          <p className="mt-2 text-3xl font-bold text-white">
            {courses.data.length.toLocaleString("ar-EG")}
          </p>
        </Link>
        <Link
          href="/student/payments"
          className="rounded-2xl border border-white/10 bg-surface p-5"
        >
          <p className="text-sm text-white/60">طلبات الدفع</p>
          <p className="mt-2 text-3xl font-bold text-white">
            {payments.data.length.toLocaleString("ar-EG")}
          </p>
        </Link>
        <Link
          href="/student/results"
          className="rounded-2xl border border-white/10 bg-surface p-5"
        >
          <p className="text-sm text-white/60">النتائج</p>
          <p className="mt-2 text-3xl font-bold text-white">
            {attempts.availability === "unavailable" ||
            attempts.availability === "setup_required"
              ? "—"
              : attempts.data.length.toLocaleString("ar-EG")}
          </p>
        </Link>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">كورساتي</h2>
          <Link href="/student/courses" className="text-sm text-light-purple hover:underline">
            كل الكورسات المتاحة
          </Link>
        </div>
        {courses.data.length === 0 ? (
          <EmptyState
            title="لا توجد اشتراكات بعد"
            description="تصفّح الكورسات المنشورة وأرسل طلب شراء. الدروس تبقى مقفلة حتى الاعتماد."
            action={
              <Link
                href="/student/courses"
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
              >
                الكورسات المتاحة
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {courses.data.slice(0, 4).map((course) => (
              <li key={course.courseId}>
                <Link
                  href={`/student/courses/${course.courseId}`}
                  className="block rounded-2xl border border-white/10 bg-surface p-4"
                >
                  <h3 className="font-semibold text-white">{course.title}</h3>
                  <p className="mt-2 text-xs text-white/55">{course.accessLabel}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">حالة طلبات الدفع</h2>
          <Link href="/student/payments" className="text-sm text-light-purple hover:underline">
            كل الطلبات
          </Link>
        </div>
        {payments.availability === "setup_required" ||
        payments.availability === "unavailable" ? (
          <SetupRequiredPanel message={payments.message} />
        ) : recentPayments.length === 0 ? (
          <EmptyState
            title="لا توجد طلبات"
            description="بعد إرسال طلب شراء تظهر حالته هنا: معلّق أو معتمد أو مرفوض."
          />
        ) : (
          <ul className="space-y-2">
            {recentPayments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{payment.targetTitle}</p>
                  <p className="mt-1 text-xs text-white/45">
                    {new Date(payment.createdAt).toLocaleDateString("ar-EG")}
                  </p>
                </div>
                <PaymentStatusBadge status={payment.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">نتائج الامتحانات</h2>
          <Link href="/student/results" className="text-sm text-light-purple hover:underline">
            كل النتائج
          </Link>
        </div>
        {attempts.availability === "setup_required" ||
        attempts.availability === "unavailable" ? (
          <SetupRequiredPanel message={attempts.message} />
        ) : recentAttempts.length === 0 ? (
          <EmptyState
            title="لا توجد نتائج بعد"
            description="روابط الامتحانات المنشورة تظهر داخل الكورس بعد الاشتراك النشط."
          />
        ) : (
          <div className="space-y-3">
            {recentAttempts.map((attempt) => (
              <ExamResultCard key={attempt.id} attempt={attempt} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

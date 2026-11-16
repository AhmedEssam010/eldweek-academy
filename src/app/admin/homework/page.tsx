import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { CourseStatusBadge } from "@/components/dashboard/StatusBadge";
import { listCourses } from "@/lib/dashboard/data";
import { getHomeworkDashboardStats } from "@/lib/learning/homework-data";

export const metadata = {
  title: "الواجبات | المهندس أحمد الدويك",
};

export const instant = false;

export default async function AdminHomeworkIndexPage() {
  const courses = await listCourses({ status: "all" });
  const stats = await getHomeworkDashboardStats();

  return (
    <div className="space-y-6">
      <PageHeader
        title="الواجبات"
        description="أنشئ الواجبات من داخل كل كورس وربطها بقسم محدد. منفصلة تمامًا عن الامتحانات."
      />

      {(courses.availability === "setup_required" ||
        stats.availability === "setup_required") && (
        <SetupRequiredPanel
          message={
            stats.message.includes("غير مطبّقة") ||
            stats.availability === "setup_required"
              ? "طبّق هجرات نظام الواجبات من docs/learning/phase-36-homework-setup.md"
              : courses.message
          }
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["إجمالي الواجبات", stats.data.totalHomework],
          ["منشورة", stats.data.publishedHomework],
          ["محاولات مُسلَّمة", stats.data.submittedAttempts],
          ["بانتظار تصحيح مقالي", stats.data.pendingEssay],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-white/10 bg-surface px-4 py-3"
          >
            <p className="text-xs text-white/50">{label}</p>
            <p className="mt-1 text-xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      {courses.data.length === 0 ? (
        <EmptyState
          title="لا توجد كورسات"
          description="أنشئ كورسًا أولًا ثم أضف واجبًا من صفحة ذلك الكورس."
          action={
            <Link
              href="/admin/courses/new"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              مسودة كورس
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {courses.data.map((course) => (
            <li key={course.id}>
              <Link
                href={`/admin/courses/${course.id}/homework`}
                className="block rounded-2xl border border-white/10 bg-surface p-5 transition hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-white">
                    {course.title}
                  </h2>
                  <CourseStatusBadge status={course.status} />
                </div>
                <p className="mt-2 text-sm text-white/60">فتح واجبات هذا الكورس</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

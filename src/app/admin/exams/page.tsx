import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { CourseStatusBadge } from "@/components/dashboard/StatusBadge";
import { listCourses } from "@/lib/dashboard/data";

export const metadata = {
  title: "الامتحانات | المهندس أحمد الدويك",
};

export const instant = false;

export default async function AdminExamsIndexPage() {
  const courses = await listCourses({ status: "all" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="الامتحانات"
        description="الامتحانات تُدار من داخل كل كورس. هذه الصفحة توصلك إليها دون إنشاء امتحان جديد."
      />

      {courses.availability === "setup_required" ||
      courses.availability === "unavailable" ? (
        <SetupRequiredPanel message={courses.message} />
      ) : null}

      {courses.data.length === 0 ? (
        <EmptyState
          title="لا توجد كورسات"
          description="أنشئ مسودة كورس أولًا، ثم أضف الامتحان من صفحة ذلك الكورس."
          action={
            <Link
              href="/admin/courses/new"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              مسودة جديدة
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {courses.data.map((course) => (
            <li key={course.id}>
              <Link
                href={`/admin/courses/${course.id}/exams`}
                className="block rounded-2xl border border-white/10 bg-surface p-5 transition hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-white">{course.title}</h2>
                  <CourseStatusBadge status={course.status} />
                </div>
                <p className="mt-2 text-sm text-white/60">فتح امتحانات هذا الكورس</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

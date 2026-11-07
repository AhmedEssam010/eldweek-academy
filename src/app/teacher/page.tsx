import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { CourseStatusBadge } from "@/components/dashboard/StatusBadge";
import { requireTeacher } from "@/lib/auth/guards";
import { listTeacherAssignedCourses } from "@/lib/dashboard/data";

export const metadata = {
  title: "لوحة المدرّس | المهندس أحمد الدويك",
};

export const instant = false;

export default async function TeacherHomePage() {
  const user = await requireTeacher();
  const courses = await listTeacherAssignedCourses(user.userId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="نظرة عامة"
        description="تعرض هذه اللوحة فقط الكورسات المعيّنة لك عبر course_staff_assignments، وليس كل كورسات المنصة."
        actions={
          <Link
            href="/teacher/courses"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            كل كورساتي
          </Link>
        }
      />

      {(courses.availability === "setup_required" ||
        courses.availability === "unavailable") && (
        <SetupRequiredPanel message={courses.message} />
      )}

      {courses.data.length === 0 ? (
        <EmptyState
          title="لا توجد كورسات معيّنة"
          description={courses.message}
        />
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {courses.data.map((course) => (
            <article
              key={course.courseId}
              className="rounded-2xl border border-white/10 bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-white">
                  {course.title}
                </h3>
                <CourseStatusBadge status={course.status} />
              </div>
              <ul className="mt-4 space-y-1 text-xs text-white/60">
                <li>
                  تعديل المحتوى:{" "}
                  {course.canEditContent ? "مسموح" : "غير مسموح"}
                </li>
                <li>
                  الامتحانات: {course.canManageExams ? "مسموح" : "غير مسموح"}
                </li>
                <li>
                  تقدّم الطلاب:{" "}
                  {course.canViewStudentProgress ? "مسموح" : "غير مسموح"}
                </li>
              </ul>
              <div className="mt-5 flex flex-wrap gap-2 text-sm">
                <Link
                  href={`/teacher/courses/${course.courseId}`}
                  className="rounded-xl bg-primary/90 px-3 py-2 font-medium text-white"
                >
                  فتح الكورس
                </Link>
                <span className="rounded-xl border border-white/10 px-3 py-2 text-white/45">
                  الدروس
                </span>
                <span className="rounded-xl border border-white/10 px-3 py-2 text-white/45">
                  الامتحانات
                </span>
                <span className="rounded-xl border border-white/10 px-3 py-2 text-white/45">
                  التقدّم
                </span>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-surface p-5">
        <h3 className="text-base font-semibold text-white">مسودات الكورسات</h3>
        <p className="mt-2 text-sm leading-7 text-white/65">
          إنشاء المسودات متاح فقط عند منح `can_create_course_drafts` من المالك.
          التنفيذ ما زال معطّلاً حتى اكتمال الجاهزية الخلفية.
        </p>
      </section>
    </div>
  );
}

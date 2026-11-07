import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseContentLayout } from "@/components/learning/CourseContentLayout";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { requireTeacher } from "@/lib/auth/guards";
import { resolveStaffCourseAccess } from "@/lib/learning/data";

export const instant = false;

type TeacherCoursePageProps = {
  params: Promise<{ id: string }>;
};

export default async function TeacherCourseDetailPage({
  params,
}: TeacherCoursePageProps) {
  const user = await requireTeacher();
  const { id } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: user.userId,
    isAdmin: false,
  });

  if (
    access.availability === "setup_required" ||
    access.availability === "unavailable"
  ) {
    return (
      <div className="space-y-6">
        <SetupRequiredPanel message={access.message} />
      </div>
    );
  }

  if (access.availability === "empty" || !access.data) {
    notFound();
  }

  return (
    <CourseContentLayout
      access={access.data}
      basePath={`/teacher/courses/${id}`}
      active="overview"
      description="الوصول يعتمد على course_staff_assignments فقط — ليس على من أنشأ الكورس."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <OverviewLink
          href={`/teacher/courses/${id}/semesters`}
          title="الترمات والدروس"
          allowed={access.data.canEditContent}
          hint="can_edit_content"
        />
        <OverviewLink
          href={`/teacher/courses/${id}/exams`}
          title="الامتحانات"
          allowed={access.data.canManageExams}
          hint="can_manage_exams"
        />
        <OverviewLink
          href={`/teacher/courses/${id}/progress`}
          title="تقدّم الطلاب"
          allowed={access.data.canViewStudentProgress}
          hint="can_view_student_progress"
        />
      </div>
    </CourseContentLayout>
  );
}

function OverviewLink({
  href,
  title,
  allowed,
  hint,
}: {
  href: string;
  title: string;
  allowed: boolean;
  hint: string;
}) {
  if (!allowed) {
    return (
      <div className="rounded-xl border border-white/10 bg-background/40 p-4 opacity-60">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-2 text-xs text-white/55">غير متاح · {hint}</p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="rounded-xl border border-primary/30 bg-primary/10 p-4 transition hover:border-primary/50"
    >
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 text-xs text-light-purple">مصرّح · {hint}</p>
    </Link>
  );
}

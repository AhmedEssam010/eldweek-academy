import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseContentLayout } from "@/components/learning/CourseContentLayout";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { ConfirmationDialog } from "@/components/dashboard/ConfirmationDialog";
import { requireTeacher } from "@/lib/auth/guards";
import { submitCourseForReviewAction } from "@/lib/dashboard/mutations";
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

  const course = access.data;
  const canSubmitReview =
    course.canEditContent &&
    (course.status === "draft" || course.status === "pending_review");

  return (
    <CourseContentLayout
      access={course}
      basePath={`/teacher/courses/${id}`}
      active="overview"
      description="الوصول يعتمد على course_staff_assignments فقط — ليس على من أنشأ الكورس."
    >
      {canSubmitReview ? (
        <div className="mb-4 rounded-2xl border border-white/10 bg-background/40 p-4">
          <h3 className="text-sm font-semibold text-white">إرسال للمراجعة</h3>
          <p className="mt-2 text-xs leading-6 text-white/60">
            {course.status === "pending_review"
              ? "الكورس بانتظار مراجعة المالك. يمكنك إعادة التأكيد إن لزم."
              : "بعد اكتمال المحتوى أرسل المسودة للمالك. النشر النهائي للمالك فقط."}
          </p>
          {course.status === "draft" ? (
            <div className="mt-3">
              <ConfirmationDialog
                triggerLabel="إرسال للمراجعة"
                title="إرسال الكورس لمراجعة المالك؟"
                description="سيصبح حالة الكورس «بانتظار المراجعة». لن يظهر للطلاب حتى ينشره المالك."
                confirmLabel="إرسال للمراجعة"
                prominent
                onConfirm={submitCourseForReviewAction.bind(null, id)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <OverviewLink
          href={`/teacher/courses/${id}/semesters`}
          title="الترمات والدروس"
          allowed={course.canEditContent}
          hint="can_edit_content"
        />
        <OverviewLink
          href={`/teacher/courses/${id}/exams`}
          title="الامتحانات"
          allowed={course.canManageExams}
          hint="can_manage_exams"
        />
        <OverviewLink
          href={`/teacher/courses/${id}/progress`}
          title="تقدّم الطلاب"
          allowed={course.canViewStudentProgress}
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

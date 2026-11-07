import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ActiveStatusBadge, CourseStatusBadge } from "@/components/dashboard/StatusBadge";
import { PermissionSwitch } from "@/components/dashboard/PermissionSwitch";
import { ConfirmationDialog } from "@/components/dashboard/ConfirmationDialog";
import { DisabledMutationForm } from "@/components/dashboard/DisabledMutationForm";
import { getTeacherDetail } from "@/lib/dashboard/data";
import {
  assignTeacherToCourseAction,
  deactivateTeacherAction,
  revokeTeacherAssignmentAction,
  updateTeacherPermissionsAction,
} from "@/lib/dashboard/mutations";

export const instant = false;

type TeacherDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: TeacherDetailPageProps) {
  const { id } = await params;
  return {
    title: `تفاصيل مدرّس ${id.slice(0, 8)} | المهندس أحمد الدويك`,
  };
}

export default async function AdminTeacherDetailPage({
  params,
}: TeacherDetailPageProps) {
  const { id } = await params;
  const result = await getTeacherDetail(id);

  if (result.availability === "empty") {
    notFound();
  }

  const teacher = result.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={teacher?.fullName || "تفاصيل المدرّس"}
        description="إدارة التعيينات والصلاحيات حصرية للمالك، والتنفيذ الفعلي معطّل حتى الجاهزية."
        actions={
          <Link
            href="/admin/teachers"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            العودة للقائمة
          </Link>
        }
      />

      {(result.availability === "setup_required" ||
        result.availability === "unavailable") && (
        <SetupRequiredPanel message={result.message} />
      )}

      {teacher ? (
        <>
          <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-white/10 bg-surface p-5">
              <div className="flex flex-wrap items-center gap-3">
                <ActiveStatusBadge active={teacher.isActive} />
                <p className="text-sm text-white/60" dir="ltr">
                  {teacher.phoneNumber || "لا يوجد هاتف"}
                </p>
              </div>

              <div className="mt-5 space-y-3">
                <PermissionSwitch
                  id="can_create_course_drafts"
                  label="إنشاء مسودات كورسات"
                  description="صلاحية على مستوى الحساب يمنحها المالك."
                  checked={teacher.canCreateCourseDrafts}
                  disabled
                />
              </div>

              <div className="mt-5">
                <DisabledMutationForm
                  action={updateTeacherPermissionsAction}
                  submitLabel="حفظ صلاحيات الحساب"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-surface p-5">
              <h3 className="text-base font-semibold text-white">إجراءات حساسة</h3>
              <p className="mt-2 text-sm leading-7 text-white/65">
                التعطيل وإزالة التعيينات تتطلب تأكيدًا ولن تُنفَّذ قبل اكتمال
                الحماية الخلفية.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ConfirmationDialog
                  triggerLabel="تعطيل المدرّس"
                  title="تأكيد تعطيل المدرّس"
                  description="سيتم منع دخول المدرّس للكورسات المعيّنة بعد تفعيل التنفيذ الآمن."
                  confirmLabel="تعطيل"
                  onConfirm={deactivateTeacherAction}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">
                الكورسات المعيّنة
              </h3>
              <DisabledMutationForm
                action={assignTeacherToCourseAction}
                submitLabel="تعيين لكورس"
              />
            </div>

            {teacher.assignments.length === 0 ? (
              <EmptyState
                title="لا توجد تعيينات"
                description="عيّن هذا المدرّس على كورسات محددة مع صلاحيات صريحة."
              />
            ) : (
              <ul className="space-y-3">
                {teacher.assignments.map((assignment) => (
                  <li
                    key={assignment.id}
                    className="rounded-2xl border border-white/10 bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">
                          {assignment.courseTitle}
                        </p>
                        <div className="mt-2">
                          <CourseStatusBadge status={assignment.courseStatus} />
                        </div>
                      </div>
                      <ConfirmationDialog
                        triggerLabel="إزالة التعيين"
                        title="إزالة تعيين المدرّس؟"
                        description="سيفقد المدرّس صلاحيات هذا الكورس بعد تفعيل التنفيذ الآمن."
                        onConfirm={revokeTeacherAssignmentAction}
                      />
                    </div>
                    <div className="mt-4 grid gap-2 md:grid-cols-3">
                      <PermissionSwitch
                        id={`${assignment.id}-edit`}
                        label="تعديل المحتوى"
                        description="can_edit_content"
                        checked={assignment.canEditContent}
                        disabled
                      />
                      <PermissionSwitch
                        id={`${assignment.id}-exams`}
                        label="إدارة الامتحانات"
                        description="can_manage_exams"
                        checked={assignment.canManageExams}
                        disabled
                      />
                      <PermissionSwitch
                        id={`${assignment.id}-progress`}
                        label="متابعة تقدّم الطلاب"
                        description="can_view_student_progress"
                        checked={assignment.canViewStudentProgress}
                        disabled
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

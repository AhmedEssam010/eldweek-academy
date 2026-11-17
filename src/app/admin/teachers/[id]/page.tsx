import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ActiveStatusBadge, CourseStatusBadge } from "@/components/dashboard/StatusBadge";
import { PermissionSwitch } from "@/components/dashboard/PermissionSwitch";
import { ConfirmationDialog } from "@/components/dashboard/ConfirmationDialog";
import { MutationForm } from "@/components/dashboard/MutationForm";
import { getTeacherDetail, listCourses } from "@/lib/dashboard/data";
import {
  activateTeacherAction,
  assignTeacherToCourseAction,
  deactivateTeacherAction,
  resetTeacherPasswordAction,
  retrySetTeacherRoleAction,
  revokeTeacherAssignmentAction,
  updateTeacherAccountAction,
} from "@/lib/dashboard/teacher-actions";

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
  const [result, courses] = await Promise.all([
    getTeacherDetail(id),
    listCourses({ status: "all" }),
  ]);

  if (result.availability === "empty") {
    notFound();
  }

  const teacher = result.data;
  const courseOptions = courses.data ?? [];

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      <PageHeader
        title={teacher?.fullName || "تفاصيل المدرّس"}
        description="إدارة التعيينات والصلاحيات حصرية للمالك."
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
          <section className="grid min-w-0 gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="min-w-0 rounded-2xl border border-white/10 bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-3">
                <ActiveStatusBadge active={teacher.isActive} />
                <p className="text-sm text-white/60" dir="ltr">
                  {teacher.phoneNumber || "لا يوجد هاتف"}
                </p>
              </div>

              <div className="mt-5">
                <MutationForm
                  action={updateTeacherAccountAction}
                  submitLabel="حفظ بيانات الحساب"
                >
                  <input type="hidden" name="teacherId" value={teacher.id} />
                  <div>
                    <label
                      htmlFor="fullName"
                      className="mb-2 block text-sm text-white"
                    >
                      الاسم الكامل
                    </label>
                    <input
                      id="fullName"
                      name="fullName"
                      required
                      minLength={3}
                      defaultValue={teacher.fullName}
                      className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none focus:border-secondary"
                    />
                  </div>
                  <PermissionSwitch
                    id="can_create_course_drafts"
                    name="can_create_course_drafts"
                    label="إنشاء مسودات كورسات"
                    description="صلاحية على مستوى الحساب يمنحها المالك."
                    checked={teacher.canCreateCourseDrafts}
                    disabled={false}
                  />
                </MutationForm>
              </div>
            </div>

            <div className="min-w-0 space-y-4 rounded-2xl border border-white/10 bg-surface p-4 sm:p-5">
              <h3 className="text-base font-semibold text-white">إجراءات حساسة</h3>
              <p className="text-sm leading-7 text-white/65">
                التعطيل يمنع دخول المدرّس فورًا. التعيينات على الكورسات تبقى محفوظة حتى تُزال.
              </p>
              <div className="flex flex-wrap gap-2">
                {teacher.isActive ? (
                  <ConfirmationDialog
                    triggerLabel="تعطيل المدرّس"
                    title="تأكيد تعطيل المدرّس"
                    description="سيُمنع المدرّس من دخول لوحة المدرّس والإجراءات المحمية حتى إعادة التفعيل."
                    confirmLabel="تعطيل"
                    danger
                    onConfirm={deactivateTeacherAction.bind(null, teacher.id)}
                  />
                ) : (
                  <ConfirmationDialog
                    triggerLabel="تفعيل المدرّس"
                    title="تأكيد تفعيل المدرّس"
                    description="سيستعيد المدرّس الوصول حسب تعييناته الحالية."
                    confirmLabel="تفعيل"
                    onConfirm={activateTeacherAction.bind(null, teacher.id)}
                  />
                )}
              </div>

              <div className="border-t border-white/10 pt-4">
                <h4 className="text-sm font-semibold text-white">إعادة تعيين كلمة المرور</h4>
                <MutationForm
                  action={resetTeacherPasswordAction}
                  submitLabel="تحديث كلمة المرور"
                  pendingLabel="جارٍ التحديث..."
                >
                  <input type="hidden" name="teacherId" value={teacher.id} />
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    placeholder="كلمة مرور جديدة (12+)"
                    className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white"
                  />
                  <input
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    placeholder="تأكيد كلمة المرور"
                    className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white"
                  />
                </MutationForm>
              </div>

              <div className="border-t border-white/10 pt-4">
                <h4 className="text-sm font-semibold text-white">إعادة تعيين الدور</h4>
                <p className="mb-3 text-xs leading-6 text-white/55">
                  للاسترداد إذا أُنشئ حساب Auth دون ترقية الدور. لا يُنشئ مستخدمًا جديدًا.
                </p>
                <MutationForm
                  action={retrySetTeacherRoleAction}
                  submitLabel="تعيين دور مدرّس"
                >
                  <input type="hidden" name="userId" value={teacher.id} />
                  <PermissionSwitch
                    id="retry_can_create_course_drafts"
                    name="can_create_course_drafts"
                    label="مع صلاحية إنشاء المسودات"
                    description="اختياري عند إعادة التعيين"
                    checked={teacher.canCreateCourseDrafts}
                    disabled={false}
                  />
                </MutationForm>
              </div>
            </div>
          </section>

          <section className="min-w-0 space-y-4">
            <h3 className="text-lg font-semibold text-white">الكورسات المعيّنة</h3>

            <div className="min-w-0 rounded-2xl border border-white/10 bg-surface p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-white">تعيين لكورس</h4>
              <MutationForm
                action={assignTeacherToCourseAction}
                submitLabel="حفظ التعيين"
              >
                <input type="hidden" name="teacherId" value={teacher.id} />
                <label className="block text-xs text-white/55">
                  الكورس
                  <select
                    name="courseId"
                    required
                    className="mt-1 w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      اختر كورسًا
                    </option>
                    {courseOptions.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-2 md:grid-cols-3">
                  <PermissionSwitch
                    id="can_edit_content"
                    name="can_edit_content"
                    label="تعديل المحتوى"
                    description="دروس وفيديوهات وأقسام"
                    disabled={false}
                    checked
                  />
                  <PermissionSwitch
                    id="can_manage_exams"
                    name="can_manage_exams"
                    label="إدارة الامتحانات"
                    description="إنشاء وتعديل الامتحانات"
                    disabled={false}
                  />
                  <PermissionSwitch
                    id="can_view_student_progress"
                    name="can_view_student_progress"
                    label="متابعة التقدّم"
                    description="عرض تقدّم الطلاب"
                    disabled={false}
                  />
                </div>
              </MutationForm>
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
                    className="min-w-0 rounded-2xl border border-white/10 bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-white">
                          {assignment.courseTitle}
                        </p>
                        <div className="mt-2">
                          <CourseStatusBadge status={assignment.courseStatus} />
                        </div>
                      </div>
                      <ConfirmationDialog
                        triggerLabel="إزالة التعيين"
                        title="إزالة تعيين المدرّس؟"
                        description="سيفقد المدرّس صلاحيات هذا الكورس فورًا."
                        danger
                        onConfirm={revokeTeacherAssignmentAction.bind(
                          null,
                          assignment.courseId,
                          teacher.id,
                        )}
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

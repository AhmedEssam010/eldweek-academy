import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { PermissionSwitch } from "@/components/dashboard/PermissionSwitch";
import { MutationForm } from "@/components/dashboard/MutationForm";
import { createTeacherAction } from "@/lib/dashboard/teacher-actions";
import { getAuthReadiness } from "@/lib/auth/readiness";

export const metadata = {
  title: "إضافة مدرّس | المهندس أحمد الدويك",
};

export const instant = false;

export default function AdminNewTeacherPage() {
  const readiness = getAuthReadiness();

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      <PageHeader
        title="إضافة مدرّس"
        description="إنشاء حساب المدرّس حصرًا للمالك. التسجيل العام يظل طالبًا ولا يمكنه منح نفسه دور مدرّس."
        actions={
          <Link
            href="/admin/teachers"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            العودة للقائمة
          </Link>
        }
      />

      {!readiness.dbSchemaReady ? (
        <SetupRequiredPanel message="لا يمكن تنفيذ دعوة مدرّس قبل تطبيق الهجرات وتأكيد جاهزية profiles والصلاحيات." />
      ) : (
        <div className="min-w-0 rounded-2xl border border-white/10 bg-surface p-4 sm:p-5">
          <p className="mb-4 text-xs leading-6 text-white/50">
            تأكيد الهاتف داخل Auth (`phone_confirm`) مطلوب لتسجيل الدخول بكلمة المرور فقط،
            وليس إثباتًا لملكية الرقم. لن يُضبط `phone_verified_at` في الملف الشخصي من هنا.
          </p>
          <MutationForm
            action={createTeacherAction}
            submitLabel="إنشاء حساب المدرّس"
            pendingLabel="جارٍ الإنشاء..."
          >
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <div className="min-w-0">
                <label className="mb-2 block text-sm text-white" htmlFor="fullName">
                  الاسم الكامل *
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  required
                  minLength={3}
                  className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none focus:border-secondary"
                  placeholder="اسم المدرّس"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-2 block text-sm text-white" htmlFor="phone">
                  رقم الموبايل المصري *
                </label>
                <input
                  id="phone"
                  name="phone"
                  required
                  inputMode="tel"
                  className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none focus:border-secondary"
                  placeholder="010xxxxxxxx"
                  dir="ltr"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-2 block text-sm text-white" htmlFor="password">
                  كلمة المرور الأولية *
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none focus:border-secondary"
                  placeholder="12 حرفًا على الأقل · حرف ورقم"
                />
              </div>
              <div className="min-w-0">
                <label
                  className="mb-2 block text-sm text-white"
                  htmlFor="confirmPassword"
                >
                  تأكيد كلمة المرور *
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none focus:border-secondary"
                />
              </div>
            </div>

            <PermissionSwitch
              id="can_create_course_drafts"
              name="can_create_course_drafts"
              label="السماح بإنشاء مسودات كورسات"
              description="يمنحها المالك فقط. المدرّس لا يستطيع منحها لنفسه."
              disabled={false}
            />
          </MutationForm>
        </div>
      )}
    </div>
  );
}

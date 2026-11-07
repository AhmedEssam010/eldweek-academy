import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { PermissionSwitch } from "@/components/dashboard/PermissionSwitch";
import { DisabledMutationForm } from "@/components/dashboard/DisabledMutationForm";
import { inviteTeacherAction } from "@/lib/dashboard/mutations";
import { getAuthReadiness } from "@/lib/auth/readiness";

export const metadata = {
  title: "إضافة مدرّس | المهندس أحمد الدويك",
};

export const instant = false;

export default function AdminNewTeacherPage() {
  const readiness = getAuthReadiness();

  return (
    <div className="space-y-6">
      <PageHeader
        title="إضافة مدرّس"
        description="دعوة أعضاء الفريق تتم بواسطة المالك فقط. لن تُمنح أدوار مرتفعة من التسجيل العام."
      />

      {!readiness.dbSchemaReady ? (
        <SetupRequiredPanel message="لا يمكن تنفيذ دعوة مدرّس قبل تطبيق الهجرات وتأكيد جاهزية profiles والصلاحيات." />
      ) : (
        <SetupRequiredPanel
          title="الكتابة مؤجّلة بأمان"
          message="النموذج جاهز بصريًا، لكن التنفيذ الفعلي لدعوة المدرّس وتعيين دوره معطّل حتى اكتمال التحقق الأمني."
        />
      )}

      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <DisabledMutationForm
          action={inviteTeacherAction}
          submitLabel="حفظ دعوة المدرّس"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-white" htmlFor="fullName">
                الاسم الكامل
              </label>
              <input
                id="fullName"
                name="fullName"
                disabled
                className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white opacity-70"
                placeholder="اسم المدرّس"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-white" htmlFor="phone">
                رقم الهاتف
              </label>
              <input
                id="phone"
                name="phone"
                disabled
                className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white opacity-70"
                placeholder="010xxxxxxxx"
              />
            </div>
          </div>

          <div className="space-y-3">
            <PermissionSwitch
              id="can_create_course_drafts"
              name="can_create_course_drafts"
              label="السماح بإنشاء مسودات كورسات"
              description="يمنحها المالك فقط. المدرّس لا يستطيع منحها لنفسه."
              disabled
            />
          </div>
        </DisabledMutationForm>
      </div>
    </div>
  );
}

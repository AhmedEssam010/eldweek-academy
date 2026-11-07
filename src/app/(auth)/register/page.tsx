import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthSplitShell } from "@/components/auth/AuthSplitShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { PhoneField } from "@/components/auth/PhoneField";
import { PasswordField } from "@/components/auth/PasswordField";
import { SetupNotice } from "@/components/auth/SetupNotice";
import { FormMessage } from "@/components/auth/FormMessage";
import { registerStudent } from "@/lib/auth/actions";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { getProfileAuthState } from "@/lib/auth/profile";
import { dashboardHrefForRole } from "@/lib/auth/dashboard-path";

export const instant = false;

export const metadata = {
  title: "إنشاء حساب | المهندس أحمد الدويك",
};

const REGISTER_IMAGE = "/انشاء حساب.png";

function NameField({
  id,
  name,
  label,
  autoComplete,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-white">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        required
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-secondary focus:ring-2 focus:ring-primary/30"
        placeholder={label}
      />
    </div>
  );
}

export default async function RegisterPage() {
  const state = await getProfileAuthState();
  if (state.status === "authenticated") {
    redirect(dashboardHrefForRole(state.role));
  }
  if (state.status === "inactive") {
    redirect("/auth/inactive");
  }

  const readiness = getAuthReadiness();

  return (
    <AuthSplitShell
      title="ابدأ رحلتك في البرمجة والذكاء الاصطناعي"
      description="أنشئ حسابك وابدأ تعلم مادة البرمجة والذكاء الاصطناعي للصف الثاني الثانوي بنظام البكالوريا."
      imageSrc={REGISTER_IMAGE}
      imageAlt="إنشاء حساب على منصة المهندس أحمد الدويك"
    >
      <div className="space-y-4">
        <SetupNotice readiness={readiness} mode="register" />

        {!readiness.canRegisterStudents ? (
          <FormMessage type="info">
            التسجيل العام غير متاح حاليًا حتى تكتمل إعدادات الهوية والأمان. يمكنك
            العودة لاحقًا أو تسجيل الدخول إن كان لديك حساب.
          </FormMessage>
        ) : null}

        <AuthForm
          action={registerStudent}
          submitLabel="إنشاء الحساب"
          pendingText="جارٍ إنشاء الحساب..."
          disabled={!readiness.canRegisterStudents}
          footer={
            <p>
              عندك حساب بالفعل؟{" "}
              <Link href="/login" className="font-medium text-light-purple hover:underline">
                سجل دخولك
              </Link>
            </p>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NameField
              id="firstName"
              name="firstName"
              label="الاسم الأول"
              autoComplete="given-name"
            />
            <NameField
              id="secondName"
              name="secondName"
              label="الاسم الثاني"
              autoComplete="additional-name"
            />
            <NameField
              id="thirdName"
              name="thirdName"
              label="الاسم الثالث"
              autoComplete="additional-name"
            />
            <NameField
              id="lastName"
              name="lastName"
              label="الاسم الأخير"
              autoComplete="family-name"
            />
          </div>

          <PhoneField />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PasswordField
              id="password"
              name="password"
              label="كلمة المرور"
              autoComplete="new-password"
            />
            <PasswordField
              id="confirmPassword"
              name="confirmPassword"
              label="تأكيد كلمة المرور"
              autoComplete="new-password"
            />
          </div>
        </AuthForm>
      </div>
    </AuthSplitShell>
  );
}

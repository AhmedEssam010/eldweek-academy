import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthSplitShell } from "@/components/auth/AuthSplitShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { PhoneField } from "@/components/auth/PhoneField";
import { PasswordField } from "@/components/auth/PasswordField";
import { SetupNotice } from "@/components/auth/SetupNotice";
import { signInWithPhonePassword } from "@/lib/auth/actions";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { sanitizeNextPath } from "@/lib/auth/next-path";
import { getProfileAuthState } from "@/lib/auth/profile";
import { dashboardHrefForRole } from "@/lib/auth/dashboard-path";

export const instant = false;

export const metadata = {
  title: "تسجيل الدخول | المهندس أحمد الدويك",
};

const LOGIN_IMAGE = "/تسجيل الدخول.png";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

async function LoginForm({ nextPath }: { nextPath: string | null }) {
  const readiness = getAuthReadiness();

  return (
    <div className="space-y-4">
      <SetupNotice readiness={readiness} />

      {nextPath ? (
        <p className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs leading-6 text-light-purple">
          بعد تسجيل الدخول ستُعاد إلى الصفحة المطلوبة لإكمال الاشتراك أو الدخول.
        </p>
      ) : null}

      <AuthForm
        action={signInWithPhonePassword}
        submitLabel="تسجيل الدخول"
        pendingText="جارٍ التحقق..."
        disabled={!readiness.canAttemptLogin}
        footer={
          <div className="flex flex-col gap-2">
            <Link
              href="/forgot-password"
              className="text-light-purple hover:underline"
            >
              نسيت كلمة المرور؟
            </Link>
            <p>
              معندكش حساب؟{" "}
              <Link
                href="/register"
                className="font-medium text-light-purple hover:underline"
              >
                أنشئ حساب جديد
              </Link>
            </p>
          </div>
        }
      >
        {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
        <PhoneField />
        <PasswordField
          id="password"
          name="password"
          label="كلمة المرور"
          autoComplete="current-password"
        />
      </AuthForm>
    </div>
  );
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params.next);

  const state = await getProfileAuthState();
  if (state.status === "authenticated") {
    if (nextPath) redirect(nextPath);
    redirect(dashboardHrefForRole(state.role));
  }
  if (state.status === "inactive") {
    redirect("/auth/inactive");
  }

  return (
    <AuthSplitShell
      title="أهلاً بيك من جديد!"
      description="سجل دخولك وكمل رحلتك مع المهندس أحمد الدويك."
      imageSrc={LOGIN_IMAGE}
      imageAlt="تسجيل الدخول إلى منصة المهندس أحمد الدويك"
    >
      <LoginForm nextPath={nextPath} />
    </AuthSplitShell>
  );
}

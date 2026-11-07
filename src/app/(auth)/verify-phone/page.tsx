import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { FormMessage } from "@/components/auth/FormMessage";
import { getProfileAuthState } from "@/lib/auth/profile";

export const instant = false;

export const metadata = {
  title: "تأكيد الهاتف غير مستخدم | المهندس أحمد الدويك",
};

/**
 * صفحة OTP متقاعدة من المسار الأساسي.
 * إن وُجدت جلسة نشطة نوجّه للوحة المناسبة دون كسرها؛ وإلا نوضح الاعتزال.
 */
export default async function VerifyPhonePage() {
  const state = await getProfileAuthState();

  if (state.status === "inactive") {
    redirect("/auth/inactive");
  }

  if (state.status === "setup_required") {
    redirect("/auth/setup-required");
  }

  if (state.status === "authenticated") {
    if (state.role === "super_admin") redirect("/admin");
    if (state.role === "teacher") redirect("/teacher");
    redirect("/student");
  }

  // unauthenticated أو unavailable: لا نكسر شيئًا — نوضح الاعتزال
  return (
    <AuthShell
      title="مسار التحقق عبر الرسائل متوقف"
      description="تجربة المنصة تعتمد على رقم الهاتف + كلمة المرور دون شاشة OTP."
    >
      <div className="space-y-4">
        <FormMessage type="info">
          صفحة تأكيد الرمز لم تعد جزءًا من التسجيل أو الدخول. سجّل الدخول برقمك
          وكلمة المرور، أو أنشئ حسابًا من صفحة التسجيل عند اكتمال الإعدادات.
        </FormMessage>
        <div className="flex flex-col gap-2 text-sm">
          <Link
            href="/login"
            className="rounded-xl bg-secondary px-4 py-3 text-center font-medium text-white transition hover:opacity-90"
          >
            الذهاب لتسجيل الدخول
          </Link>
          <Link
            href="/register"
            className="text-center text-light-purple hover:underline"
          >
            إنشاء حساب طالب
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}

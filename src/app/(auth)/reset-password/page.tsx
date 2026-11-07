import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { PasswordField } from "@/components/auth/PasswordField";
import { FormMessage } from "@/components/auth/FormMessage";
import { updatePassword } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export const metadata = {
  title: "تعيين كلمة مرور جديدة | المهندس أحمد الدويك",
};

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const user = supabase
    ? (await supabase.auth.getUser()).data.user
    : null;

  return (
    <AuthShell
      title="تعيين كلمة مرور جديدة"
      description="يتطلب جلسة مصادقة صالحة (مثل جلسة أصدرها المالك بعد التحقق من الهوية). لا يوجد مسار SMS ذاتي."
    >
      <div className="space-y-4">
        {!user ? (
          <FormMessage type="error">
            لا توجد جلسة صالحة لتغيير كلمة المرور. راجع صفحة استعادة كلمة المرور
            لمعرفة المسار المدعوم حاليًا، أو سجّل الدخول إن كنت تعرف كلمة المرور.
            <div className="mt-2 flex flex-col gap-1">
              <Link href="/forgot-password" className="underline">
                تعليمات الاستعادة
              </Link>
              <Link href="/login" className="underline">
                تسجيل الدخول
              </Link>
            </div>
          </FormMessage>
        ) : (
          <AuthForm
            action={updatePassword}
            submitLabel="حفظ كلمة المرور"
            pendingText="جارٍ الحفظ..."
            footer={
              <Link href="/login" className="text-light-purple hover:underline">
                تسجيل الدخول
              </Link>
            }
          >
            <PasswordField
              id="password"
              name="password"
              label="كلمة المرور الجديدة"
              autoComplete="new-password"
            />
            <PasswordField
              id="confirmPassword"
              name="confirmPassword"
              label="تأكيد كلمة المرور"
              autoComplete="new-password"
            />
          </AuthForm>
        )}
      </div>
    </AuthShell>
  );
}

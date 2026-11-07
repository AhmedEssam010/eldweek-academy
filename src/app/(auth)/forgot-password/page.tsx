import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { PhoneField } from "@/components/auth/PhoneField";
import { SetupNotice } from "@/components/auth/SetupNotice";
import { FormMessage } from "@/components/auth/FormMessage";
import { requestPasswordRecovery } from "@/lib/auth/actions";
import { getAuthReadiness } from "@/lib/auth/readiness";

export const metadata = {
  title: "استعادة كلمة المرور | المهندس أحمد الدويك",
};

export default function ForgotPasswordPage() {
  const readiness = getAuthReadiness();

  return (
    <AuthShell
      title="استعادة كلمة المرور"
      description="استعادة كلمة المرور عبر الرسائل غير مفعّلة. نوضح المسار المدعوم بصراحة دون وعود SMS."
    >
      <div className="space-y-4">
        <SetupNotice readiness={readiness} mode="recovery" />

        <FormMessage type="info">
          لا يوجد مسار ذاتي عبر OTP في هذه المنصة حاليًا. إن نسيت كلمة المرور،
          تواصل مع إدارة المنصة عبر القناة الرسمية؛ يُعاد التعيين بعد التحقق من
          الهوية من طرف المالك. إرسال هذا النموذج لا يكشف إن كان الرقم مسجّلًا.
        </FormMessage>

        <AuthForm
          action={requestPasswordRecovery}
          submitLabel="عرض تعليمات الاستعادة"
          pendingText="جارٍ التحضير..."
          footer={
            <Link href="/login" className="text-light-purple hover:underline">
              العودة لتسجيل الدخول
            </Link>
          }
        >
          <PhoneField />
        </AuthForm>
      </div>
    </AuthShell>
  );
}

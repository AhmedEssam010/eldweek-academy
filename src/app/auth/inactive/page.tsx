import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { FormMessage } from "@/components/auth/FormMessage";
import { signOut } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/auth/SubmitButton";

export const instant = false;

export default function InactiveAccountPage() {
  return (
    <AuthShell
      standalone
      title="الحساب غير نشط"
      description="تم تعطيل هذا الحساب. لا يمكن الوصول إلى لوحات التحكم."
    >
      <FormMessage type="error">
        حسابك غير نشط. تواصل مع إدارة المنصة عبر القنوات الرسمية عند توفرها.
      </FormMessage>
      <form action={signOut} className="mt-4">
        <SubmitButton>تسجيل الخروج</SubmitButton>
      </form>
      <Link href="/" className="mt-4 inline-block text-sm text-light-purple hover:underline">
        العودة للرئيسية
      </Link>
    </AuthShell>
  );
}

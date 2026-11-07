import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { FormMessage } from "@/components/auth/FormMessage";

export const instant = false;

type SetupRequiredPageProps = {
  searchParams: Promise<{ reason?: string }>;
};

export default async function SetupRequiredPage({
  searchParams,
}: SetupRequiredPageProps) {
  const params = await searchParams;
  const reason =
    params.reason?.trim() ||
    "الإعداد غير مكتمل. لا يمكن تجاوز التحقق من الصلاحيات.";

  return (
    <AuthShell
      standalone
      title="يلزم إكمال الإعداد"
      description="تم إيقاف الوصول بشكل آمن لأن البنية الخلفية غير جاهزة أو تعذر التحقق من الصلاحيات."
    >
      <FormMessage type="info">{reason}</FormMessage>
      <div className="mt-4 flex flex-col gap-2 text-sm">
        <Link href="/" className="text-light-purple hover:underline">
          العودة للرئيسية
        </Link>
        <Link href="/login" className="text-white/70 hover:underline">
          تسجيل الدخول
        </Link>
      </div>
    </AuthShell>
  );
}

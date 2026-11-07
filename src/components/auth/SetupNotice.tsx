import { FormMessage } from "@/components/auth/FormMessage";
import type { AuthReadiness } from "@/lib/auth/readiness";

type SetupNoticeProps = {
  readiness: AuthReadiness;
  /** على صفحة التسجيل نعرض عوائق التسجيل (تشمل تعطيل تأكيدات SMS). */
  mode?: "login" | "register" | "recovery";
};

export function SetupNotice({
  readiness,
  mode = "login",
}: SetupNoticeProps) {
  const items =
    mode === "register"
      ? readiness.registrationBlockers
      : mode === "recovery"
        ? [
            "استعادة كلمة المرور الذاتية عبر الرسائل غير مفعّلة. المسار الحالي: تواصل مع إدارة المنصة بعد التحقق من الهوية.",
          ]
        : readiness.blockers;

  const hide =
    mode === "login"
      ? items.length === 0 && readiness.canAttemptLogin
      : mode === "register"
        ? items.length === 0 && readiness.canRegisterStudents
        : false;

  if (hide) {
    return null;
  }

  return (
    <FormMessage type="info">
      <p className="font-medium">الخدمة غير مكتملة الإعداد بعد</p>
      <ul className="mt-2 list-disc space-y-1 pe-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {readiness.missingEnv.length > 0 ? (
        <p className="mt-2 text-xs opacity-90">
          متغيرات ناقصة: {readiness.missingEnv.join("، ")}
        </p>
      ) : null}
    </FormMessage>
  );
}

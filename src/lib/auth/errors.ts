/**
 * رسائل عربية آمنة دون تسريب تفاصيل داخلية أو وجود الحساب.
 */

export function mapAuthErrorMessage(
  error: { message?: string; code?: string; status?: number } | null | undefined,
  context: "login" | "register" | "verify" | "recovery" | "reset" | "generic",
): string {
  if (!error) {
    return "حدث خطأ غير متوقع. حاول مرة أخرى.";
  }

  const raw = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();

  if (
    raw.includes("rate") ||
    raw.includes("too many") ||
    raw.includes("over_request")
  ) {
    return "تم تجاوز الحد المسموح من المحاولات. انتظر قليلًا ثم حاول مجددًا.";
  }

  if (raw.includes("expired") || raw.includes("otp_expired")) {
    return "انتهت صلاحية رمز التحقق. اطلب رمزًا جديدًا.";
  }

  if (
    raw.includes("invalid") &&
    (raw.includes("otp") || raw.includes("token") || raw.includes("code"))
  ) {
    return "رمز التحقق غير صحيح. تأكد من الرمز وحاول مرة أخرى.";
  }

  if (context === "login") {
    // لا نفرّق بين عدم وجود الحساب وكلمة المرور الخاطئة
    return "تعذر تسجيل الدخول. تحقق من رقم الهاتف وكلمة المرور.";
  }

  if (context === "register") {
    if (raw.includes("already") || raw.includes("registered") || raw.includes("exists")) {
      return "تعذر إكمال التسجيل بهذه البيانات. إن كان لديك حساب فجرّب تسجيل الدخول.";
    }
    return "تعذر إنشاء الحساب حاليًا. تحقق من البيانات أو حاول لاحقًا.";
  }

  if (context === "verify") {
    return "تعذر تأكيد رقم الهاتف. تحقق من الرمز أو اطلب رمزًا جديدًا.";
  }

  if (context === "recovery") {
    return "استعادة كلمة المرور عبر الرسائل غير مفعّلة. تواصل مع إدارة المنصة عبر القناة الرسمية.";
  }

  if (context === "reset") {
    return "تعذر تحديث كلمة المرور. قد تكون الجلسة منتهية؛ تواصل مع الإدارة أو سجّل الدخول مجددًا.";
  }

  return "تعذر إكمال العملية. حاول مرة أخرى لاحقًا.";
}

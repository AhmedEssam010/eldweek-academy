import { getSupabaseEnvStatus } from "@/lib/supabase/env";

export type AuthReadiness = {
  supabaseConfigured: boolean;
  missingEnv: string[];
  /**
   * تفعيل Phone كمعرّف هوية في Auth (رقم + كلمة مرور).
   * لا يعني تفعيل SMS OTP.
   */
  phonePasswordAuthReady: boolean;
  /**
   * يجب أن تكون تأكيدات الهاتف (SMS confirmations) معطّلة في مشروع Auth
   * حتى يعمل التسجيل بدون OTP. لا تُضبط إلا بعد التحقق اليدوي.
   */
  phoneConfirmationsDisabled: boolean;
  /**
   * يجب ضبطه يدويًا بعد تطبيق هجرات profiles/RLS بنجاح.
   */
  dbSchemaReady: boolean;
  canAttemptLogin: boolean;
  canRegisterStudents: boolean;
  /**
   * استعادة كلمة المرور الذاتية عبر SMS غير مدعومة في تجربة المنصة الحالية.
   * تبقى false ما لم يُعتمد مسار استعادة آمن بديل لاحقًا.
   */
  canSelfServePasswordRecovery: boolean;
  blockers: string[];
  registrationBlockers: string[];
};

function flagEnabled(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

/**
 * بوابة جاهزية صريحة — تفشل بأمان عندما تكون البنية غير مكتملة.
 * لا تفترض دعم التسجيل بدون OTP إلا بعد تعطيل تأكيدات الهاتف يدويًا.
 */
export function getAuthReadiness(): AuthReadiness {
  const envStatus = getSupabaseEnvStatus();
  // توافق خلفي مع الاسم القديم إن وُجد
  const phonePasswordAuthReady =
    flagEnabled("NEXT_PUBLIC_AUTH_PHONE_PASSWORD_READY") ||
    flagEnabled("NEXT_PUBLIC_AUTH_PHONE_PROVIDER_READY");
  const phoneConfirmationsDisabled = flagEnabled(
    "NEXT_PUBLIC_AUTH_PHONE_CONFIRMATIONS_DISABLED",
  );
  const dbSchemaReady = flagEnabled("NEXT_PUBLIC_DB_SCHEMA_READY");

  const blockers: string[] = [];
  const registrationBlockers: string[] = [];

  if (!envStatus.configured) {
    blockers.push("متغيرات Supabase العامة غير مكتملة.");
    registrationBlockers.push("متغيرات Supabase العامة غير مكتملة.");
  }
  if (!phonePasswordAuthReady) {
    blockers.push(
      "مصادقة الهاتف + كلمة المرور غير موثّقة بعد (NEXT_PUBLIC_AUTH_PHONE_PASSWORD_READY).",
    );
    registrationBlockers.push(
      "يلزم تفعيل Phone كمعرّف هوية في Auth دون الاعتماد على OTP للدخول.",
    );
  }
  if (!dbSchemaReady) {
    blockers.push(
      "هجرات قاعدة البيانات (profiles والصلاحيات) لم تُطبَّق أو لم تُؤكَّد بعد (NEXT_PUBLIC_DB_SCHEMA_READY).",
    );
    registrationBlockers.push(
      "يلزم تطبيق هجرات profiles قبل إنشاء حسابات طلاب عامة.",
    );
  }
  if (!phoneConfirmationsDisabled) {
    registrationBlockers.push(
      "تأكيد الهاتف عبر SMS ما زال مفترضًا مفعّلًا. عطّله في إعدادات Auth ثم اضبط NEXT_PUBLIC_AUTH_PHONE_CONFIRMATIONS_DISABLED=true. لن نتجاوز OTP صامتًا.",
    );
  }

  const supabaseConfigured = envStatus.configured;
  const canAttemptLogin = supabaseConfigured && phonePasswordAuthReady;
  const canRegisterStudents =
    supabaseConfigured &&
    phonePasswordAuthReady &&
    phoneConfirmationsDisabled &&
    dbSchemaReady;

  return {
    supabaseConfigured,
    missingEnv: envStatus.configured ? [] : envStatus.missing,
    phonePasswordAuthReady,
    phoneConfirmationsDisabled,
    dbSchemaReady,
    canAttemptLogin,
    canRegisterStudents,
    canSelfServePasswordRecovery: false,
    blockers,
    registrationBlockers,
  };
}

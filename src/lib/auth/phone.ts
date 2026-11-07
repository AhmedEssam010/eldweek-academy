/**
 * تطبيع والتحقق من أرقام المحمول المصرية قبل إرسالها إلى Supabase.
 */

const LOCAL_MOBILE_RE = /^(010|011|012|015)\d{8}$/;
const E164_EG_MOBILE_RE = /^\+20(10|11|12|15)\d{8}$/;

export type PhoneNormalizationResult =
  | { ok: true; e164: string; national: string }
  | { ok: false; error: string };

/** عرض رقم مصري للقراءة فقط من قيمة E.164 المخزّنة. */
export function formatEgyptianPhoneDisplay(
  e164: string | null | undefined,
): string {
  const value = String(e164 ?? "").trim();
  if (!value) return "غير متوفر";
  if (value.startsWith("+20") && value.length >= 4) {
    return `0${value.slice(3)}`;
  }
  return value;
}

/**
 * يقبل صيغًا شائعة مثل 010xxxxxxxx أو 2010xxxxxxxx أو +2010xxxxxxxx
 * ويعيد E.164 (+20...) عند النجاح فقط.
 */
export function normalizeEgyptianPhone(input: string): PhoneNormalizationResult {
  const raw = input.trim();

  if (!raw) {
    return { ok: false, error: "يرجى إدخال رقم الهاتف." };
  }

  const digits = raw.replace(/[^\d+]/g, "");

  let national = "";

  if (digits.startsWith("+20")) {
    national = `0${digits.slice(3)}`;
  } else if (digits.startsWith("0020")) {
    national = `0${digits.slice(4)}`;
  } else if (digits.startsWith("20") && digits.length === 12) {
    national = `0${digits.slice(2)}`;
  } else if (digits.startsWith("0")) {
    national = digits;
  } else {
    return {
      ok: false,
      error: "صيغة رقم الهاتف غير مدعومة. استخدم رقمًا مصريًا يبدأ بـ 010 أو 011 أو 012 أو 015.",
    };
  }

  if (!LOCAL_MOBILE_RE.test(national)) {
    return {
      ok: false,
      error:
        "رقم غير صالح. يجب أن يكون رقم محمول مصريًا من 11 رقمًا ويبدأ بـ 010 أو 011 أو 012 أو 015.",
    };
  }

  const e164 = `+20${national.slice(1)}`;

  if (!E164_EG_MOBILE_RE.test(e164)) {
    return { ok: false, error: "تعذر تطبيع رقم الهاتف إلى الصيغة الدولية." };
  }

  return { ok: true, e164, national };
}

export function isValidOtpCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

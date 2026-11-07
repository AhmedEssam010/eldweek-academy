import "server-only";

import { getSupabaseEnvStatus } from "./env";

export type SupabaseConnectionDiagnostic = {
  ok: boolean;
  /**
   * حالة مختصرة وآمنة للسجلات/التشخيص المحلي فقط.
   * لا تتضمن عناوين أو مفاتيح أو تفاصيل إعدادات.
   */
  code:
    | "connected"
    | "missing_env"
    | "unreachable"
    | "unexpected_response"
    | "request_failed";
  missingVariables: string[];
  httpStatus: number | null;
};

/**
 * فحص اتصال آمن من السيرفر فقط:
 * - لا يستعلم عن جداول التطبيق
 * - لا يُرجع بيانات اعتماد أو إعدادات داخلية
 * - يعتمد على نقطة صحة Auth العامة في Supabase
 */
export async function diagnoseSupabaseConnection(): Promise<SupabaseConnectionDiagnostic> {
  const status = getSupabaseEnvStatus();

  if (!status.configured) {
    return {
      ok: false,
      code: "missing_env",
      missingVariables: status.missing,
      httpStatus: null,
    };
  }

  const { url, publishableKey } = status.env;
  const healthUrl = `${url.replace(/\/$/, "")}/auth/v1/health`;

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        code: "unexpected_response",
        missingVariables: [],
        httpStatus: response.status,
      };
    }

    // لا نُرجع جسم الاستجابة لأنه قد يحتوي تفاصيل إصدار غير ضرورية للعميل.
    return {
      ok: true,
      code: "connected",
      missingVariables: [],
      httpStatus: response.status,
    };
  } catch {
    return {
      ok: false,
      code: "unreachable",
      missingVariables: [],
      httpStatus: null,
    };
  }
}

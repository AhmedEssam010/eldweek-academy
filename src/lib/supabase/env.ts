export type SupabaseEnv = {
  url: string;
  publishableKey: string;
};

export type SupabaseEnvStatus =
  | { configured: true; env: SupabaseEnv; missing: [] }
  | { configured: false; env: null; missing: string[] };

/**
 * يُبلّغ بأسماء المتغيرات الناقصة فقط دون كشف أي قيم.
 */
export function getSupabaseEnvStatus(): SupabaseEnvStatus {
  const missing: string[] = [];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!publishableKey) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  if (missing.length > 0 || !url || !publishableKey) {
    return { configured: false, env: null, missing };
  }

  return {
    configured: true,
    env: { url, publishableKey },
    missing: [],
  };
}

/**
 * قراءة متغيرات بيئة Supabase العامة.
 * يعيد null إذا لم تُضبط المتغيرات بعد.
 */
export function getSupabaseEnv(): SupabaseEnv | null {
  const status = getSupabaseEnvStatus();
  return status.configured ? status.env : null;
}

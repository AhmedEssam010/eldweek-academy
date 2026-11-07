import "server-only";

/**
 * حد معدّل بدائي داخل العملية — مناسب للتطوير فقط.
 * الإنتاج يحتاج حدًا موزّعًا (مثل Upstash/Redis) + CAPTCHA وحدود Supabase Auth.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number; message: string };

export function checkAuthRateLimit(
  key: string,
  options?: { limit?: number; windowMs?: number },
): RateLimitResult {
  const limit = options?.limit ?? 8;
  const windowMs = options?.windowMs ?? 10 * 60 * 1000;
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (current.count >= limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((current.resetAt - now) / 1000),
    );
    return {
      ok: false,
      retryAfterSeconds,
      message: `تم تجاوز حد المحاولات. حاول بعد حوالي ${retryAfterSeconds} ثانية.`,
    };
  }

  current.count += 1;
  buckets.set(key, current);
  return { ok: true };
}

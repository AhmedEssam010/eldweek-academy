import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

/**
 * عميل Supabase للمتصفح عبر createBrowserClient من @supabase/ssr.
 * يعيد null إذا لم تُضبط متغيرات البيئة بعد.
 */
export function createClient() {
  const env = getSupabaseEnv();

  if (!env) {
    return null;
  }

  return createBrowserClient(env.url, env.publishableKey);
}

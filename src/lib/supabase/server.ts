import { createServerClient } from "@supabase/ssr";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

/**
 * عميل Supabase للسيرفر عبر createServerClient من @supabase/ssr.
 * يستخدم getAll/setAll المتوافقين مع Next.js App Router.
 * يعيد null إذا لم تُضبط متغيرات البيئة بعد.
 */
export async function createClient() {
  // Supabase checks the session clock with Date.now(). With cacheComponents that
  // read must happen after the request connection, or prerender fails.
  await connection();

  const env = getSupabaseEnv();

  if (!env) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // قد يفشل set في Server Components؛ يُعالج لاحقًا عبر Proxy/Middleware عند تفعيل المصادقة.
          // معاملات headers الخاصة بـ setAll تُطبَّق في Proxy عند تفعيل المصادقة.
        }
      },
    },
  });
}

import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * عميل الخدمة للخادم فقط، لكتابة وقراءة video_asset_id بعد سحب صلاحية العمود
 * من authenticated. لا يُستورد من مكوّنات المتصفح.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

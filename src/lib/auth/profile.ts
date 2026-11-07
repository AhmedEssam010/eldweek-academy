import "server-only";

import type { UserRole } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { getAuthReadiness } from "@/lib/auth/readiness";

export type ProfileAuthState =
  | {
      status: "authenticated";
      userId: string;
      role: UserRole;
      isActive: boolean;
      fullName: string;
      phoneNumber: string | null;
      phoneVerifiedAt: string | null;
    }
  | { status: "unauthenticated" }
  | { status: "setup_required"; reason: string }
  | { status: "inactive" }
  | { status: "unavailable"; reason: string };

/**
 * يقرأ الدور من جدول profiles فقط — لا يثق بـ user_metadata.
 * يفشل مغلقًا إذا لم يكن المخطط جاهزًا أو تعذّر التحقق.
 */
export async function getProfileAuthState(): Promise<ProfileAuthState> {
  const readiness = getAuthReadiness();
  const supabase = await createClient();

  if (!supabase) {
    return {
      status: "setup_required",
      reason: "إعدادات Supabase غير مكتملة.",
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: "unauthenticated" };
  }

  if (!readiness.dbSchemaReady) {
    return {
      status: "setup_required",
      reason:
        "قاعدة البيانات غير جاهزة بعد (الهجرات/profiles). لا يمكن التحقق من الصلاحيات بأمان.",
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("role, is_active, full_name, phone_number, phone_verified_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // فشل مغلق: جدول غير موجود أو RLS أو خطأ شبكة
    return {
      status: "unavailable",
      reason:
        "تعذر التحقق من ملف الصلاحيات. قد تكون الهجرات غير مطبّقة أو الخدمة غير متاحة.",
    };
  }

  if (!data) {
    return {
      status: "unavailable",
      reason: "لم يُعثر على ملف المستخدم في profiles.",
    };
  }

  const role = data.role as UserRole | null;
  if (
    role !== "student" &&
    role !== "teacher" &&
    role !== "super_admin"
  ) {
    return {
      status: "unavailable",
      reason: "دور المستخدم غير معروف أو غير موثّق.",
    };
  }

  if (!data.is_active) {
    return { status: "inactive" };
  }

  return {
    status: "authenticated",
    userId: user.id,
    role,
    isActive: true,
    fullName: data.full_name ?? "",
    phoneNumber: data.phone_number,
    phoneVerifiedAt: data.phone_verified_at,
  };
}

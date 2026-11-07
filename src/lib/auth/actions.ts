"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { normalizeEgyptianPhone } from "@/lib/auth/phone";
import { mapAuthErrorMessage } from "@/lib/auth/errors";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { sanitizeNextPath } from "@/lib/auth/next-path";
import {
  readNameParts,
  validateAndCombineFullName,
} from "@/lib/auth/name";
import { requireAuthenticatedUser } from "@/lib/auth/guards";

export type AuthActionResult = {
  ok: boolean;
  message: string;
  code?:
    | "validation"
    | "setup_required"
    | "auth_error"
    | "success"
    | "rate_limited"
    | "needs_configuration";
};

function setupBlocked(message: string): AuthActionResult {
  return { ok: false, message, code: "setup_required" };
}

function redirectAfterAuth(
  role: string | null | undefined,
  isActive: boolean | null | undefined,
  nextPath?: string | null,
) {
  if (isActive === false) {
    redirect("/auth/inactive");
  }
  if (role === "super_admin") redirect("/admin");
  if (role === "teacher") redirect("/teacher");
  const safeNext = sanitizeNextPath(nextPath);
  if (role === "student" && safeNext) redirect(safeNext);
  redirect("/student");
}

export async function signInWithPhonePassword(
  formData: FormData,
): Promise<AuthActionResult> {
  const readiness = getAuthReadiness();
  if (!readiness.canAttemptLogin) {
    return setupBlocked(
      "تسجيل الدخول غير متاح حاليًا. يلزم ضبط Supabase وتفعيل مصادقة الهاتف + كلمة المرور.",
    );
  }

  const phoneRaw = String(formData.get("phone") ?? "");
  const password = String(formData.get("password") ?? "");
  const nextPath = sanitizeNextPath(String(formData.get("next") ?? ""));
  const normalized = normalizeEgyptianPhone(phoneRaw);

  if (!normalized.ok) {
    return { ok: false, message: normalized.error, code: "validation" };
  }

  if (password.length < 8) {
    return {
      ok: false,
      message: "كلمة المرور يجب ألا تقل عن 8 أحرف.",
      code: "validation",
    };
  }

  const rate = checkAuthRateLimit(`login:${normalized.e164}`);
  if (!rate.ok) {
    return { ok: false, message: rate.message, code: "rate_limited" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return setupBlocked("إعدادات Supabase غير مكتملة.");
  }

  const { error } = await supabase.auth.signInWithPassword({
    phone: normalized.e164,
    password,
  });

  if (error) {
    return {
      ok: false,
      message: mapAuthErrorMessage(error, "login"),
      code: "auth_error",
    };
  }

  if (readiness.dbSchemaReady) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", user.id)
        .maybeSingle();

      redirectAfterAuth(profile?.role, profile?.is_active, nextPath);
    }
  }

  redirect(nextPath || "/student");
}

export async function registerStudent(
  formData: FormData,
): Promise<AuthActionResult> {
  const readiness = getAuthReadiness();
  if (!readiness.canRegisterStudents) {
    return setupBlocked(
      readiness.registrationBlockers[0] ??
        "التسجيل متوقف حتى تكتمل إعدادات الهاتف+كلمة المرور بدون OTP وتطبيق الهجرات.",
    );
  }

  const nameResult = validateAndCombineFullName(readNameParts(formData));
  if (!nameResult.ok) {
    return {
      ok: false,
      message: nameResult.message,
      code: "validation",
    };
  }
  const fullName = nameResult.fullName;

  const phoneRaw = String(formData.get("phone") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const normalized = normalizeEgyptianPhone(phoneRaw);

  if (!normalized.ok) {
    return { ok: false, message: normalized.error, code: "validation" };
  }

  if (password.length < 8) {
    return {
      ok: false,
      message: "كلمة المرور يجب ألا تقل عن 8 أحرف.",
      code: "validation",
    };
  }

  if (password !== confirmPassword) {
    return {
      ok: false,
      message: "تأكيد كلمة المرور غير متطابق.",
      code: "validation",
    };
  }

  const rate = checkAuthRateLimit(`register:${normalized.e164}`);
  if (!rate.ok) {
    return { ok: false, message: rate.message, code: "rate_limited" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return setupBlocked("إعدادات Supabase غير مكتملة.");
  }

  // لا نمرّر role عبر metadata — trigger القاعدة يفرض student بعد الهجرات
  const { data, error } = await supabase.auth.signUp({
    phone: normalized.e164,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    return {
      ok: false,
      message: mapAuthErrorMessage(error, "register"),
      code: "auth_error",
    };
  }

  // إذا طلب Auth تحقق SMS رغم رغبتنا، لا نتجاوزه ولا نوجّه لشاشة OTP
  if (!data.session) {
    return {
      ok: false,
      message:
        "مشروع Auth ما زال يطلب تأكيد الهاتف عبر الرسائل. عطّل Phone confirmations في إعدادات Supabase، أو اعتمد تزويد الحسابات من المالك. لن نتجاوز التحقق ولن نخترع بريدًا وهميًا.",
      code: "needs_configuration",
    };
  }

  // لا نعلّم الرقم كـ verified في profiles — ملكية الرقم غير مثبتة بدون تحقق
  const createdUser = data.user;
  const userId = createdUser?.id;
  if (!createdUser || !userId) {
    return {
      ok: false,
      message: "تعذر إكمال إنشاء الحساب. لم يُحفظ رقم الهاتف في ملف الطالب.",
      code: "auth_error",
    };
  }

  const createdAt = Date.parse(createdUser.created_at ?? "");
  const ageMs = Date.now() - createdAt;
  if (!Number.isFinite(ageMs) || ageMs > 10 * 60 * 1000) {
    await supabase.auth.signOut();
    return {
      ok: false,
      message:
        "تعذر إكمال التسجيل بهذه البيانات. إن كان لديك حساب فجرّب تسجيل الدخول.",
      code: "auth_error",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      phone_number: normalized.e164,
    })
    .eq("id", userId)
    .select("id, role, phone_verified_at")
    .maybeSingle();

  if (profileError || !profile) {
    return {
      ok: false,
      message:
        "أُنشئ حساب الدخول، لكن تعذر حفظ رقم الهاتف في ملف الطالب. سجّل الدخول ثم تواصل مع المالك. لم يُعلَّم الرقم كموثّق.",
      code: "auth_error",
    };
  }

  if (profile.role !== "student" || profile.phone_verified_at !== null) {
    await supabase.auth.signOut();
    return {
      ok: false,
      message:
        "رُفض الحساب لأن الدور ليس طالبًا أو لأن الرقم عُلّم كموثّق. لم يُفتح التسجيل العام.",
      code: "auth_error",
    };
  }

  redirect("/student");
}

/**
 * استعادة ذاتية عبر SMS غير مدعومة في تجربة المنصة الحالية.
 * تُرجع رسالة موحّدة دون كشف وجود الحساب.
 */
export async function requestPasswordRecovery(
  formData: FormData,
): Promise<AuthActionResult> {
  const phoneRaw = String(formData.get("phone") ?? "");
  const normalized = normalizeEgyptianPhone(phoneRaw);

  if (!normalized.ok) {
    return { ok: false, message: normalized.error, code: "validation" };
  }

  const rate = checkAuthRateLimit(`recovery:${normalized.e164}`, {
    limit: 5,
  });
  if (!rate.ok) {
    return { ok: false, message: rate.message, code: "rate_limited" };
  }

  // لا نطلق SMS OTP ولا نكشف إن كان الرقم مسجّلًا
  return {
    ok: true,
    message:
      "استعادة كلمة المرور عبر الرسائل غير مفعّلة في هذه المنصة. إن كنت تملك حسابًا، تواصل مع إدارة المنصة عبر القناة الرسمية لإعادة التعيين بعد التحقق من الهوية. لن نكشف هنا إن كان الرقم مسجّلًا أم لا.",
    code: "success",
  };
}

export async function updatePassword(
  formData: FormData,
): Promise<AuthActionResult> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    return {
      ok: false,
      message: "كلمة المرور يجب ألا تقل عن 8 أحرف.",
      code: "validation",
    };
  }

  if (password !== confirmPassword) {
    return {
      ok: false,
      message: "تأكيد كلمة المرور غير متطابق.",
      code: "validation",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return setupBlocked("إعدادات Supabase غير مكتملة.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      message:
        "لا توجد جلسة صالحة لتغيير كلمة المرور. سجّل الدخول أو اطلب مساعدة الإدارة.",
      code: "auth_error",
    };
  }

  const rate = checkAuthRateLimit(`update-password:${user.id}`, { limit: 5 });
  if (!rate.ok) {
    return { ok: false, message: rate.message, code: "rate_limited" };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return {
      ok: false,
      message: mapAuthErrorMessage(error, "reset"),
      code: "auth_error",
    };
  }

  redirect("/login");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  revalidatePath("/profile");
  revalidatePath("/student");
  revalidatePath("/admin");
  redirect("/");
}

/**
 * تحديث الاسم المعروض فقط من profiles.full_name.
 * لا يغيّر الدور أو رقم الهاتف أو حالة التوثيق.
 */
export async function updateOwnProfileName(
  formData: FormData,
): Promise<AuthActionResult> {
  const readiness = getAuthReadiness();
  if (!readiness.dbSchemaReady) {
    return setupBlocked(
      "تحديث الملف غير متاح لأن مخطط قاعدة البيانات غير جاهز بعد.",
    );
  }

  const user = await requireAuthenticatedUser({ nextPath: "/profile" });
  const nameResult = validateAndCombineFullName(readNameParts(formData));
  if (!nameResult.ok) {
    return {
      ok: false,
      message: nameResult.message,
      code: "validation",
    };
  }

  const rate = checkAuthRateLimit(`profile-name:${user.userId}`, { limit: 10 });
  if (!rate.ok) {
    return { ok: false, message: rate.message, code: "rate_limited" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return setupBlocked("إعدادات Supabase غير مكتملة.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: nameResult.fullName })
    .eq("id", user.userId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      message: "تعذر حفظ الاسم. تأكد من صلاحيات الملف وحاول مرة أخرى.",
      code: "auth_error",
    };
  }

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  revalidatePath("/admin");
  revalidatePath("/student");
  revalidatePath("/teacher");

  return {
    ok: true,
    message: "تم تحديث الاسم بنجاح.",
    code: "success",
  };
}

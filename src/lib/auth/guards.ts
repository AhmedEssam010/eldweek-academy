import "server-only";

import { redirect } from "next/navigation";
import type { UserRole } from "@/types/database";
import { getProfileAuthState } from "@/lib/auth/profile";

export type GuardResult = {
  userId: string;
  role: UserRole;
  fullName: string;
};

/**
 * يتطلب جلسة موثّقة وملف صلاحيات قابل للتحقق.
 * يفشل مغلقًا ولا يعتمد على بيانات العميل.
 */
export async function requireAuthenticatedUser(
  options?: { nextPath?: string },
): Promise<GuardResult> {
  const state = await getProfileAuthState();
  const next = options?.nextPath
    ? `?next=${encodeURIComponent(options.nextPath)}`
    : "";

  if (state.status === "unauthenticated") {
    redirect(`/login${next}`);
  }

  if (state.status === "setup_required" || state.status === "unavailable") {
    redirect(`/auth/setup-required?reason=${encodeURIComponent(state.reason)}`);
  }

  if (state.status === "inactive") {
    redirect("/auth/inactive");
  }

  return {
    userId: state.userId,
    role: state.role,
    fullName: state.fullName,
  };
}

export async function requireRole(
  allowed: readonly UserRole[],
  options?: { nextPath?: string },
): Promise<GuardResult> {
  const user = await requireAuthenticatedUser(options);

  if (!allowed.includes(user.role)) {
    // لا ترفع الصلاحيات؛ أعد التوجيه لمسار الدور الصحيح إن أمكن
    if (user.role === "super_admin") redirect("/admin");
    if (user.role === "teacher") redirect("/teacher");
    redirect("/student");
  }

  return user;
}

export async function requireStudent(options?: { nextPath?: string }) {
  return requireRole(["student"], {
    nextPath: options?.nextPath ?? "/student",
  });
}

export async function requireTeacher() {
  return requireRole(["teacher"], { nextPath: "/teacher" });
}

export async function requireAdmin() {
  return requireRole(["super_admin"], { nextPath: "/admin" });
}

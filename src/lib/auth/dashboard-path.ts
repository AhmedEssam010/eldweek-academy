import type { UserRole } from "@/types/database";

export function dashboardHrefForRole(role: UserRole): string {
  if (role === "super_admin") return "/admin";
  if (role === "teacher") return "/teacher";
  return "/student";
}

export function roleLabelAr(role: UserRole): string {
  if (role === "super_admin") return "مدير المنصة";
  if (role === "teacher") return "مدرّس";
  return "طالب";
}

export function initialsFromName(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "؟";
  return parts
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toUpperCase();
}

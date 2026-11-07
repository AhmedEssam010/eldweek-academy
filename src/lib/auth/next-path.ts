/**
 * يسمح فقط بمسارات نسبية داخل التطبيق بعد تسجيل الدخول.
 */
export function sanitizeNextPath(
  raw: string | null | undefined,
): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("://")) return null;
  if (value.includes("\\")) return null;
  if (value.includes("@")) return null;
  return value;
}

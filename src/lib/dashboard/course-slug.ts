/**
 * يولّد slug متوافقًا مع قيد courses_slug_format_chk:
 * ^[a-z0-9]+(?:-[a-z0-9]+)*$
 */
export function normalizeCourseSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildCourseSlug(title: string, optionalSlug?: string): string {
  const fromInput = optionalSlug ? normalizeCourseSlug(optionalSlug) : "";
  if (fromInput.length > 0) return fromInput;

  const fromTitle = normalizeCourseSlug(title);
  if (fromTitle.length > 0) return fromTitle;

  const stamp = Date.now().toString(36);
  return `course-${stamp}`;
}

export function isValidCourseSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

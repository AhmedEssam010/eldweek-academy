import type { AcademicSemester } from "@/types/database";

export const COURSE_THUMBNAIL_BUCKET = "course-thumbnails";
export const COURSE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
export const COURSE_THUMBNAIL_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export const academicSemesterOptions: Array<{
  value: AcademicSemester;
  label: string;
}> = [
  { value: "first", label: "الترم الأول" },
  { value: "second", label: "الترم الثاني" },
];

export function academicSemesterLabel(
  value: AcademicSemester | null | undefined,
): string {
  if (value === "first") return "الترم الأول";
  if (value === "second") return "الترم الثاني";
  return "غير محدد";
}

export function parseAcademicSemester(
  value: FormDataEntryValue | string | null | undefined,
): AcademicSemester | null {
  const raw = String(value ?? "").trim();
  if (raw === "first" || raw === "second") return raw;
  return null;
}

export function isAllowedThumbnailMime(type: string): boolean {
  return (COURSE_THUMBNAIL_MIME_TYPES as readonly string[]).includes(type);
}

export function thumbnailObjectPath(courseId: string, fileName: string): string {
  const safeExt = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg"
    : "jpg";
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`;
  return `${courseId}/${id}.${safeExt === "jpeg" ? "jpg" : safeExt}`;
}

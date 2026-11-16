export const COURSE_MATERIALS_BUCKET = "course-materials";
export const COURSE_MATERIAL_MAX_BYTES = 50 * 1024 * 1024;
export const COURSE_MATERIAL_MIME = "application/pdf";
/** مدة الرابط الموقّع للعرض داخل المنصة (ثوانٍ) */
export const COURSE_MATERIAL_VIEW_TTL_SECONDS = 15 * 60;
/** مدة الرابط الموقّع للتحميل المباشر (ثوانٍ) */
export const COURSE_MATERIAL_DOWNLOAD_TTL_SECONDS = 120;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f-]{12}$/i;

const STORAGE_PATH_RE =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i;

export function isPdfMime(mime: string): boolean {
  return mime.toLowerCase() === COURSE_MATERIAL_MIME;
}

/** يتحقق من بادئة PDF الحقيقية — لا يعتمد على الامتداد فقط. */
export function sniffPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export async function readFileMagicBytes(
  file: Blob,
  length = 8,
): Promise<Uint8Array> {
  const slice = file.slice(0, length);
  return new Uint8Array(await slice.arrayBuffer());
}

export function buildCourseMaterialObjectPath(
  courseId: string,
  semesterId: string,
): string | null {
  if (!UUID.test(courseId) || !UUID.test(semesterId)) return null;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (!UUID.test(id)) return null;
  return `${courseId}/${semesterId}/${id}.pdf`;
}

export function isValidCourseMaterialStoragePath(path: string): boolean {
  const clean = path.trim();
  if (!clean || clean.includes("..") || clean.startsWith("/")) return false;
  return STORAGE_PATH_RE.test(clean);
}

export function formatFileSizeBytes(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

export function sanitizeOriginalFilename(name: string): string {
  const base = name.replace(/[/\\]/g, "").trim();
  if (!base) return "material.pdf";
  return base.slice(0, 255);
}

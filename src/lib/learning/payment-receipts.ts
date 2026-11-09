export const PAYMENT_RECEIPT_BUCKET = "payment-receipts";
export const PAYMENT_RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isAllowedReceiptMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime.toLowerCase());
}

export function receiptExtensionForMime(mime: string): string | null {
  return EXT_BY_MIME[mime.toLowerCase()] ?? null;
}

/** يكتشف نوع الصورة من البادئة الثنائية — لا يعتمد على امتداد العميل فقط. */
export function sniffReceiptImageMime(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  const riff =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46;
  const webp =
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (riff && webp) return "image/webp";

  return null;
}

export function buildPaymentReceiptObjectPath(
  studentId: string,
  mime: string,
): string | null {
  const ext = receiptExtensionForMime(mime);
  if (!ext) return null;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${studentId}/${id}.${ext}`;
}

/** هل المسار يبدو صورة تخزين جديدة أم مرجع نصي تاريخي؟ */
export function isStoredReceiptImagePath(path: string): boolean {
  const clean = path.trim();
  if (!clean || clean.includes("..") || clean.startsWith("/")) return false;
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpe?g|png|webp)$/i.test(clean);
}

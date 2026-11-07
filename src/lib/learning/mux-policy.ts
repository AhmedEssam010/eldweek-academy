const MUX_ID = /^[A-Za-z0-9]{8,80}$/;

export function encodeMuxAssetId(assetId: string): string | null {
  const value = assetId.trim();
  if (!MUX_ID.test(value)) return null;
  return `mux:${value}`;
}

export function decodeMuxAssetId(stored: string | null | undefined): string | null {
  if (!stored?.startsWith("mux:")) return null;
  const assetId = stored.slice(4);
  return MUX_ID.test(assetId) ? assetId : null;
}

export type MuxUploadFailureKind = "configuration" | "permission" | "api" | "network";

/**
 * يحوّل فشل إنشاء الرفع إلى رسالة عربية حسب نوع الخطأ، بلا أي سرّ أو ترويسة.
 */
export function describeMuxUploadFailure(input: {
  status: number | null;
  type: string | null;
}): { kind: MuxUploadFailureKind; message: string } {
  const type = (input.type ?? "").toLowerCase();
  if (input.status === 401 || type === "unauthorized") {
    return {
      kind: "configuration",
      message: "مفاتيح Mux غير صالحة. تحقق من معرّف الرمز وسرّه على الخادم ثم أعد تشغيل التطبيق.",
    };
  }
  if (input.status === 403 || type === "insufficient_scope" || type === "forbidden") {
    return {
      kind: "permission",
      message:
        "رمز Mux لا يملك صلاحية كتابة الفيديو (video:write). أنشئ رمز وصول جديد بهذه الصلاحية من لوحة Mux ثم حدّث الإعدادات.",
    };
  }
  if (input.status == null) {
    return { kind: "network", message: "تعذر الاتصال بخدمة Mux لإنشاء رابط الرفع." };
  }
  return {
    kind: "api",
    message: "رفض Mux إنشاء رابط الرفع. راجع سجل الخادم لمعرفة رمز الحالة.",
  };
}

export type MuxAssetVerdict =
  | { ok: true; phase: "processing" | "ready" }
  | { ok: false; reason: "passthrough" | "public_playback" | "errored" | "not_signed" };

/**
 * يقبل أصل Mux فقط إذا أُنشئ لهذا الدرس وبسياسة signed.
 * أي playback public يُرفض ولا يُحفظ.
 */
export function reviewMuxAsset(input: {
  lessonId: string;
  passthrough: string | null | undefined;
  status: string | null | undefined;
  playbackPolicies: string[];
}): MuxAssetVerdict {
  if ((input.passthrough ?? "") !== input.lessonId) {
    return { ok: false, reason: "passthrough" };
  }
  if (input.playbackPolicies.some((policy) => policy === "public")) {
    return { ok: false, reason: "public_playback" };
  }
  if (input.status === "errored") {
    return { ok: false, reason: "errored" };
  }
  const signed = input.playbackPolicies.includes("signed");
  if (input.status === "ready" && !signed) {
    return { ok: false, reason: "not_signed" };
  }
  if (input.status === "ready" && signed) {
    return { ok: true, phase: "ready" };
  }
  return { ok: true, phase: "processing" };
}

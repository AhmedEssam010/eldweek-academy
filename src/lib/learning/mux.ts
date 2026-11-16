import "server-only";

import Mux from "@mux/mux-node";
import { PLAYBACK_GRANT_TTL_SECONDS } from "@/lib/learning/playback-policy";
import {
  decodeMuxAssetId,
  encodeMuxAssetId,
  reviewMuxAsset,
} from "@/lib/learning/mux-policy";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  getVideoAssetById,
  getVideoAssetByMuxAssetId,
  getVideoAssetByUploadId,
  linkLessonToVideoAsset,
  muxThumbnailUrl,
  readLessonLibraryId,
  updateVideoAssetFromMux,
  updateVideoAssetUploadMeta,
} from "@/lib/learning/video-library";
import type { VideoAssetStatus } from "@/lib/learning/video-library-types";

export type MuxReadiness = {
  ready: boolean;
  missing: string[];
};

export function getMuxReadiness(): MuxReadiness {
  const missing: string[] = [];
  if (!process.env.MUX_TOKEN_ID?.trim()) missing.push("MUX_TOKEN_ID");
  if (!process.env.MUX_TOKEN_SECRET?.trim()) missing.push("MUX_TOKEN_SECRET");
  if (!process.env.MUX_SIGNING_KEY?.trim() && !process.env.MUX_SIGNING_KEY_ID?.trim()) {
    missing.push("MUX_SIGNING_KEY");
  }
  if (!process.env.MUX_PRIVATE_KEY?.trim() && !process.env.MUX_SIGNING_PRIVATE_KEY?.trim()) {
    missing.push("MUX_PRIVATE_KEY");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  return { ready: missing.length === 0, missing };
}

function muxClient() {
  const tokenId = process.env.MUX_TOKEN_ID?.trim();
  const tokenSecret = process.env.MUX_TOKEN_SECRET?.trim();
  const jwtSigningKey =
    process.env.MUX_SIGNING_KEY?.trim() || process.env.MUX_SIGNING_KEY_ID?.trim();
  const jwtPrivateKey =
    process.env.MUX_PRIVATE_KEY?.trim() || process.env.MUX_SIGNING_PRIVATE_KEY?.trim();
  const webhookSecret = process.env.MUX_WEBHOOK_SECRET?.trim();
  if (!tokenId || !tokenSecret || !jwtSigningKey || !jwtPrivateKey) return null;
  return new Mux({
    tokenId,
    tokenSecret,
    jwtSigningKey,
    jwtPrivateKey,
    ...(webhookSecret ? { webhookSecret } : {}),
  });
}

export function getMuxClientForWebhooks() {
  return muxClient();
}

async function readStoredAssetId(lessonId: string): Promise<string | null | "unavailable"> {
  const service = createServiceRoleClient();
  if (!service) return "unavailable";

  const withLib = await service
    .from("lessons")
    .select("video_library_id, video_asset_id")
    .eq("id", lessonId)
    .maybeSingle();

  if (!withLib.error && withLib.data) {
    if (typeof withLib.data.video_library_id === "string") {
      const asset = await getVideoAssetById(withLib.data.video_library_id);
      if (asset?.mux_asset_id) return asset.mux_asset_id;
    }
    return decodeMuxAssetId(withLib.data.video_asset_id ?? null);
  }

  const legacy = await service
    .from("lessons")
    .select("video_asset_id")
    .eq("id", lessonId)
    .maybeSingle();
  if (legacy.error) return "unavailable";
  return decodeMuxAssetId(legacy.data?.video_asset_id ?? null);
}

export type LessonVideoPresence = {
  known: boolean;
  withVideo: Set<string>;
  /** lessonId → Mux | YouTube */
  sourceLabel: Map<string, "Mux" | "YouTube">;
};

/** وجود فيديو فقط. المعرّفات الخاصة لا تغادر الخادم. */
export async function lessonVideoPresence(
  lessonIds: string[],
): Promise<LessonVideoPresence> {
  const unique = [...new Set(lessonIds)].filter(Boolean);
  if (unique.length === 0) {
    return { known: true, withVideo: new Set(), sourceLabel: new Map() };
  }
  const service = createServiceRoleClient();
  if (!service) {
    return { known: false, withVideo: new Set(), sourceLabel: new Map() };
  }

  let data:
    | Array<{
        id: string;
        video_asset_id: string | null;
        video_library_id?: string | null;
        video_source?: string | null;
        youtube_video_id?: string | null;
      }>
    | null = null;

  const withSource = await service
    .from("lessons")
    .select("id, video_asset_id, video_library_id, video_source, youtube_video_id")
    .in("id", unique);
  if (withSource.error) {
    const mid = await service
      .from("lessons")
      .select("id, video_asset_id, video_source, youtube_video_id")
      .in("id", unique);
    if (mid.error) {
      const legacy = await service
        .from("lessons")
        .select("id, video_asset_id")
        .in("id", unique);
      if (legacy.error) {
        return { known: false, withVideo: new Set(), sourceLabel: new Map() };
      }
      data = legacy.data ?? [];
    } else {
      data = mid.data ?? [];
    }
  } else {
    data = withSource.data ?? [];
  }

  const withVideo = new Set<string>();
  const sourceLabel = new Map<string, "Mux" | "YouTube">();
  for (const row of data) {
    const hasMux =
      (typeof row.video_library_id === "string" && row.video_library_id.length > 0) ||
      (typeof row.video_asset_id === "string" && row.video_asset_id.trim().length > 0);
    const hasYoutube =
      row.video_source === "youtube" ||
      (typeof row.youtube_video_id === "string" &&
        /^[A-Za-z0-9_-]{11}$/.test(row.youtube_video_id));
    if (row.video_source === "youtube" && hasYoutube) {
      withVideo.add(row.id);
      sourceLabel.set(row.id, "YouTube");
    } else if (hasMux) {
      withVideo.add(row.id);
      sourceLabel.set(row.id, "Mux");
    } else if (hasYoutube) {
      withVideo.add(row.id);
      sourceLabel.set(row.id, "YouTube");
    }
  }
  return { known: true, withVideo, sourceLabel };
}

export async function createDirectUpload(input: {
  videoLibraryId: string;
  origin: string;
}): Promise<{ uploadId: string; uploadUrl: string } | null> {
  const mux = muxClient();
  if (!mux) return null;
  const upload = await mux.video.uploads.create({
    cors_origin: input.origin,
    timeout: 3600,
    new_asset_settings: {
      playback_policies: ["signed"],
      passthrough: input.videoLibraryId,
    },
  });
  if (!upload.url) return null;
  await updateVideoAssetUploadMeta({
    id: input.videoLibraryId,
    muxUploadId: upload.id,
  });
  return { uploadId: upload.id, uploadUrl: upload.url };
}

export type VideoSyncState = "waiting" | "processing" | "ready" | "error";

function assetStatusToLibrary(status: string | undefined): VideoAssetStatus {
  if (status === "ready") return "ready";
  if (status === "errored") return "failed";
  return "processing";
}

async function persistMuxAssetToLibrary(input: {
  videoLibraryId: string;
  asset: {
    id: string;
    status?: string;
    duration?: number | null;
    playback_ids?: Array<{ id: string; policy?: string | null }> | null;
    passthrough?: string | null;
  };
}): Promise<{ state: VideoSyncState; message: string }> {
  const policies = (input.asset.playback_ids ?? []).map((item) => item.policy ?? "");
  const verdict = reviewMuxAsset({
    expectedPassthrough: input.videoLibraryId,
    passthrough: input.asset.passthrough,
    status: input.asset.status,
    playbackPolicies: policies,
  });
  if (!verdict.ok) {
    await updateVideoAssetFromMux({
      id: input.videoLibraryId,
      muxAssetId: input.asset.id,
      muxPlaybackId: null,
      status: "failed",
      durationSeconds: null,
      thumbnailUrl: null,
      errorMessage:
        verdict.reason === "public_playback"
          ? "رُفض لأن سياسة التشغيل عامة."
          : "تعذر اعتماد أصل الفيديو.",
    });
    return {
      state: "error",
      message:
        verdict.reason === "public_playback"
          ? "رُفض الفيديو لأن سياسة التشغيل عامة. المطلوب signed فقط."
          : "تعذر ربط هذا الفيديو بالمكتبة.",
    };
  }

  const playbackId =
    input.asset.playback_ids?.find((item) => item.policy === "signed")?.id ?? null;
  const duration =
    typeof input.asset.duration === "number"
      ? Math.round(input.asset.duration)
      : null;
  const status = assetStatusToLibrary(input.asset.status);
  const thumb = playbackId ? muxThumbnailUrl(playbackId) : null;

  await updateVideoAssetFromMux({
    id: input.videoLibraryId,
    muxAssetId: input.asset.id,
    muxPlaybackId: playbackId,
    status: verdict.phase === "ready" ? "ready" : status,
    durationSeconds: duration,
    thumbnailUrl: thumb,
  });

  if (verdict.phase === "ready") {
    return { state: "ready", message: "الفيديو جاهز والتشغيل موقّع فقط." };
  }
  return { state: "processing", message: "الفيديو قيد المعالجة عند Mux." };
}

export async function syncDirectUpload(input: {
  videoLibraryId: string;
  uploadId: string;
  lessonId?: string;
  semesterId?: string;
}): Promise<{ state: VideoSyncState; message: string }> {
  const mux = muxClient();
  const service = createServiceRoleClient();
  if (!mux || !service) {
    return { state: "error", message: "إعداد Mux أو مفتاح الخدمة غير مكتمل على الخادم." };
  }

  const library = await getVideoAssetById(input.videoLibraryId);
  if (!library) {
    return { state: "error", message: "سجل المكتبة غير موجود." };
  }

  const upload = await mux.video.uploads.retrieve(input.uploadId);
  if (upload.status === "waiting") {
    return { state: "waiting", message: "بانتظار اكتمال رفع الملف." };
  }
  if (upload.status === "errored" || upload.status === "cancelled" || upload.status === "timed_out") {
    const serviceFail = createServiceRoleClient();
    await serviceFail
      ?.from("video_assets")
      .update({
        status: "failed",
        error_message: "فشل رفع الفيديو أو انتهت مهلة الرفع.",
      })
      .eq("id", input.videoLibraryId);
    return { state: "error", message: "فشل رفع الفيديو أو انتهت مهلة الرفع." };
  }
  if (!upload.asset_id) {
    const serviceProc = createServiceRoleClient();
    await serviceProc
      ?.from("video_assets")
      .update({ status: "processing", error_message: null })
      .eq("id", input.videoLibraryId);
    return { state: "processing", message: "وصل الملف ويجري إنشاء الفيديو." };
  }

  const asset = await mux.video.assets.retrieve(upload.asset_id);
  const result = await persistMuxAssetToLibrary({
    videoLibraryId: input.videoLibraryId,
    asset,
  });

  if (
    (result.state === "ready" || result.state === "processing") &&
    input.lessonId &&
    input.semesterId
  ) {
    const stored = encodeMuxAssetId(asset.id);
    await service
      .from("lessons")
      .update({
        video_library_id: input.videoLibraryId,
        video_asset_id: stored,
        video_source: "mux",
        youtube_video_id: null,
        duration_seconds:
          typeof asset.duration === "number" ? Math.round(asset.duration) : null,
      })
      .eq("id", input.lessonId)
      .eq("semester_id", input.semesterId);
  }

  return result;
}

/** مزامنة رفع قديم مربوط بالدرس مباشرة (توافق خلفي قبل المكتبة). */
export async function syncLegacyLessonUpload(input: {
  lessonId: string;
  semesterId: string;
  uploadId: string;
}): Promise<{ state: VideoSyncState; message: string }> {
  const byUpload = await getVideoAssetByUploadId(input.uploadId);
  if (byUpload) {
    return syncDirectUpload({
      videoLibraryId: byUpload.id,
      uploadId: input.uploadId,
      lessonId: input.lessonId,
      semesterId: input.semesterId,
    });
  }

  const libraryId = await readLessonLibraryId(input.lessonId);
  if (typeof libraryId === "string") {
    return syncDirectUpload({
      videoLibraryId: libraryId,
      uploadId: input.uploadId,
      lessonId: input.lessonId,
      semesterId: input.semesterId,
    });
  }

  // توافق: ربط مؤقت عبر passthrough = lessonId القديم
  const mux = muxClient();
  const service = createServiceRoleClient();
  if (!mux || !service) {
    return { state: "error", message: "إعداد Mux أو مفتاح الخدمة غير مكتمل على الخادم." };
  }
  const upload = await mux.video.uploads.retrieve(input.uploadId);
  if (upload.status === "waiting") {
    return { state: "waiting", message: "بانتظار اكتمال رفع الملف." };
  }
  if (upload.status === "errored" || upload.status === "cancelled" || upload.status === "timed_out") {
    return { state: "error", message: "فشل رفع الفيديو أو انتهت مهلة الرفع." };
  }
  if (!upload.asset_id) {
    return { state: "processing", message: "وصل الملف ويجري إنشاء الفيديو." };
  }
  const asset = await mux.video.assets.retrieve(upload.asset_id);
  const verdict = reviewMuxAsset({
    expectedPassthrough: input.lessonId,
    passthrough: asset.passthrough,
    status: asset.status,
    playbackPolicies: (asset.playback_ids ?? []).map((item) => item.policy ?? ""),
  });
  if (!verdict.ok) {
    return {
      state: "error",
      message:
        verdict.reason === "public_playback"
          ? "رُفض الفيديو لأن سياسة التشغيل عامة. المطلوب signed فقط."
          : "تعذر ربط هذا الفيديو بالدرس.",
    };
  }
  const stored = encodeMuxAssetId(asset.id);
  if (!stored) return { state: "error", message: "معرّف الفيديو القادم من Mux غير مقبول." };
  await service
    .from("lessons")
    .update({
      video_asset_id: stored,
      video_source: "mux",
      youtube_video_id: null,
    })
    .eq("id", input.lessonId)
    .eq("semester_id", input.semesterId);

  if (verdict.phase === "ready") {
    return { state: "ready", message: "الفيديو جاهز والتشغيل موقّع فقط." };
  }
  return { state: "processing", message: "الفيديو قيد المعالجة. حدّث الصفحة بعد قليل." };
}

export async function applyMuxAssetWebhook(input: {
  muxAssetId: string;
  passthrough: string | null | undefined;
  status: string | null | undefined;
  playbackIds: Array<{ id: string; policy?: string | null }>;
  duration: number | null | undefined;
}): Promise<{ ok: boolean; videoLibraryId: string | null; message: string }> {
  const passthrough = input.passthrough?.trim() ?? "";
  let libraryId = passthrough;
  let asset = passthrough ? await getVideoAssetById(passthrough) : null;
  if (!asset) {
    asset = await getVideoAssetByMuxAssetId(input.muxAssetId);
    libraryId = asset?.id ?? "";
  }
  if (!asset || !libraryId) {
    return { ok: false, videoLibraryId: null, message: "لا يوجد سجل مكتبة لهذا الأصل." };
  }

  const result = await persistMuxAssetToLibrary({
    videoLibraryId: libraryId,
    asset: {
      id: input.muxAssetId,
      status: input.status ?? undefined,
      duration: input.duration,
      playback_ids: input.playbackIds,
      passthrough: asset.id,
    },
  });

  return {
    ok: result.state !== "error",
    videoLibraryId: libraryId,
    message: result.message,
  };
}

export type LessonVideoPhase =
  | "unconfigured"
  | "none"
  | "processing"
  | "ready"
  | "error"
  | "unknown";

/** يسمح بنشر الدرس بلا فيديو، ويرفض النشر إذا وُجد فيديو غير جاهز أو غير موقّع. */
export async function lessonMayBePublished(
  lessonId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const service = createServiceRoleClient();
  if (!service) {
    return { ok: false, message: "تعذر التحقق من ربط الفيديو قبل النشر." };
  }

  const withYoutube = await service
    .from("lessons")
    .select("video_asset_id, video_library_id, video_source, youtube_video_id")
    .eq("id", lessonId)
    .maybeSingle();

  let videoSource: string | null = null;
  let youtubeId: string | null = null;
  let assetRaw: string | null = null;
  let libraryId: string | null = null;

  if (!withYoutube.error && withYoutube.data) {
    videoSource = withYoutube.data.video_source ?? null;
    youtubeId = withYoutube.data.youtube_video_id ?? null;
    assetRaw = withYoutube.data.video_asset_id ?? null;
    libraryId =
      typeof withYoutube.data.video_library_id === "string"
        ? withYoutube.data.video_library_id
        : null;
  } else {
    const assetId = await readStoredAssetId(lessonId);
    if (assetId === "unavailable") {
      return { ok: false, message: "تعذر التحقق من ربط الفيديو قبل النشر." };
    }
    assetRaw = assetId;
  }

  if (
    videoSource === "youtube" ||
    (typeof youtubeId === "string" && /^[A-Za-z0-9_-]{11}$/.test(youtubeId))
  ) {
    if (typeof youtubeId === "string" && /^[A-Za-z0-9_-]{11}$/.test(youtubeId)) {
      return { ok: true };
    }
    return {
      ok: false,
      message: "مصدر يوتيوب مفعّل لكن معرّف الفيديو غير صالح.",
    };
  }

  if (!libraryId && !decodeMuxAssetId(assetRaw)) return { ok: true };

  const phase = await describeStoredVideo(lessonId);
  if (phase === "ready") return { ok: true };
  if (phase === "processing") {
    return { ok: false, message: "الفيديو ما زال قيد المعالجة. انتظر اكتماله ثم انشر الدرس." };
  }
  if (phase === "unconfigured") {
    return { ok: false, message: "يوجد فيديو مرتبط ولا يمكن التحقق من جاهزيته لأن Mux غير مضبوط." };
  }
  return {
    ok: false,
    message: "لن يُنشر الدرس: الفيديو غير جاهز أو غير مربوط بسياسة تشغيل موقّعة.",
  };
}

export async function describeStoredVideo(lessonId: string): Promise<LessonVideoPhase> {
  if (!getMuxReadiness().ready) return "unconfigured";

  const libraryId = await readLessonLibraryId(lessonId);
  if (libraryId === "unavailable") return "unknown";
  if (typeof libraryId === "string") {
    const library = await getVideoAssetById(libraryId);
    if (!library) return "none";
    if (library.status === "ready") return "ready";
    if (library.status === "failed") return "error";
    if (library.status === "uploading" || library.status === "processing") return "processing";
  }

  const mux = muxClient();
  const assetId = await readStoredAssetId(lessonId);
  if (assetId === "unavailable") return "unknown";
  if (!assetId || !mux) return libraryId ? "processing" : "none";
  try {
    const asset = await mux.video.assets.retrieve(assetId);
    const expected =
      typeof libraryId === "string" ? libraryId : lessonId;
    const verdict = reviewMuxAsset({
      expectedPassthrough: expected,
      // توافق: أصول قديمة passthrough = lessonId
      passthrough:
        asset.passthrough === expected || asset.passthrough === lessonId
          ? expected
          : asset.passthrough,
      status: asset.status,
      playbackPolicies: (asset.playback_ids ?? []).map((item) => item.policy ?? ""),
    });
    // قبول passthrough القديم للدروس
    if (!verdict.ok && asset.passthrough === lessonId) {
      const legacy = reviewMuxAsset({
        expectedPassthrough: lessonId,
        passthrough: asset.passthrough,
        status: asset.status,
        playbackPolicies: (asset.playback_ids ?? []).map((item) => item.policy ?? ""),
      });
      if (!legacy.ok) return "error";
      return legacy.phase === "ready" ? "ready" : "processing";
    }
    if (!verdict.ok) return "error";
    return verdict.phase === "ready" ? "ready" : "processing";
  } catch {
    return "unknown";
  }
}

export async function issueSignedPlayback(lessonId: string): Promise<
  | { state: "unconfigured" | "none" | "processing" | "error" }
  | { state: "ready"; playbackId: string; token: string; expiresAt: string; playbackUrl: string }
> {
  if (!getMuxReadiness().ready) return { state: "unconfigured" };
  const mux = muxClient();
  if (!mux) return { state: "error" };

  const libraryId = await readLessonLibraryId(lessonId);
  if (typeof libraryId === "string") {
    const library = await getVideoAssetById(libraryId);
    if (!library) return { state: "none" };
    if (library.status === "processing" || library.status === "uploading") {
      return { state: "processing" };
    }
    if (library.status === "failed") return { state: "error" };
    if (library.status === "ready" && library.mux_playback_id && library.mux_asset_id) {
      const token = await mux.jwt.signPlaybackId(library.mux_playback_id, {
        type: "video",
        expiration: "5m",
      });
      const expiresAt = new Date(Date.now() + PLAYBACK_GRANT_TTL_SECONDS * 1000).toISOString();
      return {
        state: "ready",
        playbackId: library.mux_playback_id,
        token,
        expiresAt,
        playbackUrl: `https://stream.mux.com/${library.mux_playback_id}.m3u8?token=${token}`,
      };
    }
  }

  const assetId = await readStoredAssetId(lessonId);
  if (assetId === "unavailable") return { state: "error" };
  if (!assetId) return { state: "none" };

  const asset = await mux.video.assets.retrieve(assetId);
  const policies = (asset.playback_ids ?? []).map((item) => item.policy ?? "");
  const expected = typeof libraryId === "string" ? libraryId : lessonId;
  let verdict = reviewMuxAsset({
    expectedPassthrough: expected,
    passthrough:
      asset.passthrough === expected || asset.passthrough === lessonId
        ? expected
        : asset.passthrough,
    status: asset.status,
    playbackPolicies: policies,
  });
  if (!verdict.ok && asset.passthrough === lessonId) {
    verdict = reviewMuxAsset({
      expectedPassthrough: lessonId,
      passthrough: asset.passthrough,
      status: asset.status,
      playbackPolicies: policies,
    });
  }
  if (!verdict.ok) return { state: "error" };
  if (verdict.phase !== "ready") return { state: "processing" };

  const playbackId = asset.playback_ids?.find((item) => item.policy === "signed")?.id;
  if (!playbackId) return { state: "error" };

  const token = await mux.jwt.signPlaybackId(playbackId, {
    type: "video",
    expiration: "5m",
  });
  const expiresAt = new Date(Date.now() + PLAYBACK_GRANT_TTL_SECONDS * 1000).toISOString();
  return {
    state: "ready",
    playbackId,
    token,
    expiresAt,
    playbackUrl: `https://stream.mux.com/${playbackId}.m3u8?token=${token}`,
  };
}

export { linkLessonToVideoAsset };

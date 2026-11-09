import "server-only";

import Mux from "@mux/mux-node";
import { PLAYBACK_GRANT_TTL_SECONDS } from "@/lib/learning/playback-policy";
import {
  decodeMuxAssetId,
  encodeMuxAssetId,
  reviewMuxAsset,
} from "@/lib/learning/mux-policy";
import { createServiceRoleClient } from "@/lib/supabase/service";

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
  if (!tokenId || !tokenSecret || !jwtSigningKey || !jwtPrivateKey) return null;
  return new Mux({ tokenId, tokenSecret, jwtSigningKey, jwtPrivateKey });
}

async function readStoredAssetId(lessonId: string): Promise<string | null | "unavailable"> {
  const service = createServiceRoleClient();
  if (!service) return "unavailable";
  const { data, error } = await service
    .from("lessons")
    .select("video_asset_id")
    .eq("id", lessonId)
    .maybeSingle();
  if (error) return "unavailable";
  return decodeMuxAssetId(data?.video_asset_id ?? null);
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
        video_source?: string | null;
        youtube_video_id?: string | null;
      }>
    | null = null;

  const withSource = await service
    .from("lessons")
    .select("id, video_asset_id, video_source, youtube_video_id")
    .in("id", unique);
  if (withSource.error) {
    const legacy = await service
      .from("lessons")
      .select("id, video_asset_id")
      .in("id", unique);
    if (legacy.error) {
      return { known: false, withVideo: new Set(), sourceLabel: new Map() };
    }
    data = legacy.data ?? [];
  } else {
    data = withSource.data ?? [];
  }

  const withVideo = new Set<string>();
  const sourceLabel = new Map<string, "Mux" | "YouTube">();
  for (const row of data) {
    const hasMux =
      typeof row.video_asset_id === "string" &&
      row.video_asset_id.trim().length > 0;
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
  lessonId: string;
  origin: string;
}): Promise<{ uploadId: string; uploadUrl: string } | null> {
  const mux = muxClient();
  if (!mux) return null;
  const upload = await mux.video.uploads.create({
    cors_origin: input.origin,
    timeout: 3600,
    new_asset_settings: {
      playback_policies: ["signed"],
      passthrough: input.lessonId,
    },
  });
  if (!upload.url) return null;
  return { uploadId: upload.id, uploadUrl: upload.url };
}

export type VideoSyncState = "waiting" | "processing" | "ready" | "error";

export async function syncDirectUpload(input: {
  lessonId: string;
  semesterId: string;
  uploadId: string;
}): Promise<{ state: VideoSyncState; message: string }> {
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
    lessonId: input.lessonId,
    passthrough: asset.passthrough,
    status: asset.status,
    playbackPolicies: (asset.playback_ids ?? []).map((item) => item.policy),
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

  // تفعيل مصدر Mux دون حذف أصول غير ذات صلة لاحقًا؛ يُصفَّر يوتيوب لأن المصدر النشط أصبح Mux.
  const { error } = await service
    .from("lessons")
    .update({
      video_asset_id: stored,
      video_source: "mux",
      youtube_video_id: null,
    })
    .eq("id", input.lessonId)
    .eq("semester_id", input.semesterId);
  if (error) {
    // توافق خلفي قبل تطبيق هجرة يوتيوب
    const fallback = await service
      .from("lessons")
      .update({ video_asset_id: stored })
      .eq("id", input.lessonId)
      .eq("semester_id", input.semesterId);
    if (fallback.error) {
      return { state: "error", message: "تعذر حفظ ربط الفيديو بالدرس." };
    }
  }

  if (verdict.phase === "ready") {
    return { state: "ready", message: "الفيديو جاهز والتشغيل موقّع فقط." };
  }
  return { state: "processing", message: "الفيديو قيد المعالجة. حدّث الصفحة بعد قليل." };
}

export type LessonVideoPhase = "unconfigured" | "none" | "processing" | "ready" | "error" | "unknown";

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
    .select("video_asset_id, video_source, youtube_video_id")
    .eq("id", lessonId)
    .maybeSingle();

  let videoSource: string | null = null;
  let youtubeId: string | null = null;
  let assetRaw: string | null = null;

  if (!withYoutube.error && withYoutube.data) {
    videoSource = withYoutube.data.video_source ?? null;
    youtubeId = withYoutube.data.youtube_video_id ?? null;
    assetRaw = withYoutube.data.video_asset_id ?? null;
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

  const assetId = decodeMuxAssetId(assetRaw);
  if (!assetId) return { ok: true };

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
  const mux = muxClient();
  const assetId = await readStoredAssetId(lessonId);
  if (assetId === "unavailable") return "unknown";
  if (!assetId || !mux) return "none";
  try {
    const asset = await mux.video.assets.retrieve(assetId);
    const verdict = reviewMuxAsset({
      lessonId,
      passthrough: asset.passthrough,
      status: asset.status,
      playbackPolicies: (asset.playback_ids ?? []).map((item) => item.policy),
    });
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
  const assetId = await readStoredAssetId(lessonId);
  if (!mux || assetId === "unavailable") return { state: "error" };
  if (!assetId) return { state: "none" };

  const asset = await mux.video.assets.retrieve(assetId);
  const policies = (asset.playback_ids ?? []).map((item) => item.policy);
  const verdict = reviewMuxAsset({
    lessonId,
    passthrough: asset.passthrough,
    status: asset.status,
    playbackPolicies: policies,
  });
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

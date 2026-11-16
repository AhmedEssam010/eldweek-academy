import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service";
import type {
  VideoAsset,
  VideoAssetStatus,
  VideoLibraryListItem,
} from "@/lib/learning/video-library-types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapRow(row: Record<string, unknown>): VideoAsset {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    mux_asset_id: typeof row.mux_asset_id === "string" ? row.mux_asset_id : null,
    mux_upload_id: typeof row.mux_upload_id === "string" ? row.mux_upload_id : null,
    mux_playback_id:
      typeof row.mux_playback_id === "string" ? row.mux_playback_id : null,
    status: (row.status as VideoAssetStatus) ?? "uploading",
    duration_seconds:
      typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    thumbnail_url: typeof row.thumbnail_url === "string" ? row.thumbnail_url : null,
    error_message: typeof row.error_message === "string" ? row.error_message : null,
    created_by: typeof row.created_by === "string" ? row.created_by : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function insertVideoAssetDraft(input: {
  title: string;
  createdBy: string | null;
}): Promise<VideoAsset | null> {
  const service = createServiceRoleClient();
  if (!service) return null;
  const title = input.title.trim() || "فيديو بدون عنوان";
  const { data, error } = await service
    .from("video_assets")
    .insert({
      title,
      status: "uploading",
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function updateVideoAssetUploadMeta(input: {
  id: string;
  muxUploadId: string;
}): Promise<boolean> {
  const service = createServiceRoleClient();
  if (!service) return false;
  const { error } = await service
    .from("video_assets")
    .update({
      mux_upload_id: input.muxUploadId,
      status: "uploading",
      error_message: null,
    })
    .eq("id", input.id);
  return !error;
}

export async function updateVideoAssetFromMux(input: {
  id: string;
  muxAssetId: string;
  muxPlaybackId: string | null;
  status: VideoAssetStatus;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  errorMessage?: string | null;
}): Promise<boolean> {
  const service = createServiceRoleClient();
  if (!service) return false;
  const { error } = await service
    .from("video_assets")
    .update({
      mux_asset_id: input.muxAssetId,
      mux_playback_id: input.muxPlaybackId,
      status: input.status,
      duration_seconds: input.durationSeconds,
      thumbnail_url: input.thumbnailUrl,
      error_message: input.errorMessage ?? null,
    })
    .eq("id", input.id);
  return !error;
}

export async function getVideoAssetById(id: string): Promise<VideoAsset | null> {
  if (!UUID.test(id)) return null;
  const service = createServiceRoleClient();
  if (!service) return null;
  const { data, error } = await service
    .from("video_assets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function getVideoAssetByMuxAssetId(
  muxAssetId: string,
): Promise<VideoAsset | null> {
  const service = createServiceRoleClient();
  if (!service) return null;
  const { data, error } = await service
    .from("video_assets")
    .select("*")
    .eq("mux_asset_id", muxAssetId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function getVideoAssetByUploadId(
  uploadId: string,
): Promise<VideoAsset | null> {
  const service = createServiceRoleClient();
  if (!service) return null;
  const { data, error } = await service
    .from("video_assets")
    .select("*")
    .eq("mux_upload_id", uploadId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function getVideoAssetByPassthrough(
  passthrough: string,
): Promise<VideoAsset | null> {
  if (UUID.test(passthrough)) {
    return getVideoAssetById(passthrough);
  }
  return null;
}

export async function renameVideoAsset(
  id: string,
  title: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = title.trim();
  if (trimmed.length < 1) {
    return { ok: false, message: "العنوان مطلوب." };
  }
  const service = createServiceRoleClient();
  if (!service) return { ok: false, message: "مفتاح الخدمة غير مضبوط." };
  const { error } = await service
    .from("video_assets")
    .update({ title: trimmed })
    .eq("id", id);
  if (error) return { ok: false, message: "تعذر إعادة تسمية الفيديو." };
  return { ok: true };
}

export async function countLessonRefs(videoAssetId: string): Promise<number> {
  const service = createServiceRoleClient();
  if (!service) return -1;
  const { count, error } = await service
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("video_library_id", videoAssetId);
  if (error) return -1;
  return count ?? 0;
}

export async function deleteUnusedVideoAsset(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const refs = await countLessonRefs(id);
  if (refs < 0) return { ok: false, message: "تعذر التحقق من استخدام الفيديو." };
  if (refs > 0) {
    return {
      ok: false,
      message: `لا يمكن الحذف: الفيديو مستخدم في ${refs} درس.`,
    };
  }
  const service = createServiceRoleClient();
  if (!service) return { ok: false, message: "مفتاح الخدمة غير مضبوط." };
  const { error } = await service.from("video_assets").delete().eq("id", id);
  if (error) return { ok: false, message: "تعذر حذف الفيديو من المكتبة." };
  return { ok: true };
}

export async function listVideoLibrary(input?: {
  search?: string;
  readyOnly?: boolean;
}): Promise<VideoLibraryListItem[]> {
  const service = createServiceRoleClient();
  if (!service) return [];

  let query = service
    .from("video_assets")
    .select(
      "id, title, status, duration_seconds, thumbnail_url, created_at, lessons!video_library_id(id, title)",
    )
    .order("created_at", { ascending: false });

  if (input?.readyOnly) {
    query = query.eq("status", "ready");
  }
  const search = input?.search?.trim();
  if (search) {
    query = query.ilike("title", `%${search.replace(/[%_]/g, "")}%`);
  }

  const { data, error } = await query;
  if (error || !data) {
    // جدول غير موجود بعد الهجرة
    return [];
  }

  return data.map((row) => {
    const lessons = Array.isArray(row.lessons) ? row.lessons : [];
    return {
      id: row.id as string,
      title: String(row.title ?? ""),
      status: (row.status as VideoAssetStatus) ?? "uploading",
      durationSeconds:
        typeof row.duration_seconds === "number" ? row.duration_seconds : null,
      thumbnailUrl:
        typeof row.thumbnail_url === "string" ? row.thumbnail_url : null,
      createdAt: String(row.created_at ?? ""),
      lessonCount: lessons.length,
      lessonTitles: lessons
        .map((l) => (l && typeof l === "object" && "title" in l ? String(l.title) : ""))
        .filter(Boolean),
    };
  });
}

export async function linkLessonToVideoAsset(input: {
  lessonId: string;
  semesterId: string;
  videoLibraryId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const asset = await getVideoAssetById(input.videoLibraryId);
  if (!asset) return { ok: false, message: "الفيديو غير موجود في المكتبة." };
  if (asset.status !== "ready") {
    return { ok: false, message: "اختر فيديوًا جاهزًا فقط من المكتبة." };
  }

  const service = createServiceRoleClient();
  if (!service) return { ok: false, message: "مفتاح الخدمة غير مضبوط." };

  const storedMux = asset.mux_asset_id ? `mux:${asset.mux_asset_id}` : null;
  const { error } = await service
    .from("lessons")
    .update({
      video_library_id: input.videoLibraryId,
      video_asset_id: storedMux,
      video_source: "mux",
      youtube_video_id: null,
      duration_seconds: asset.duration_seconds,
    })
    .eq("id", input.lessonId)
    .eq("semester_id", input.semesterId);

  if (error) {
    // توافق قبل تطبيق الهجرة
    if ((error.message || "").toLowerCase().includes("video_library_id")) {
      const fallback = await service
        .from("lessons")
        .update({
          video_asset_id: storedMux,
          video_source: "mux",
          youtube_video_id: null,
        })
        .eq("id", input.lessonId)
        .eq("semester_id", input.semesterId);
      if (fallback.error) {
        return { ok: false, message: "تعذر ربط الفيديو بالدرس. قد تحتاج لهجرة المكتبة." };
      }
      return { ok: true };
    }
    return { ok: false, message: "تعذر ربط الفيديو بالدرس." };
  }
  return { ok: true };
}

export async function readLessonLibraryId(
  lessonId: string,
): Promise<string | null | "unavailable"> {
  const service = createServiceRoleClient();
  if (!service) return "unavailable";
  const withLib = await service
    .from("lessons")
    .select("video_library_id, video_asset_id")
    .eq("id", lessonId)
    .maybeSingle();
  if (!withLib.error && withLib.data) {
    if (
      typeof withLib.data.video_library_id === "string" &&
      UUID.test(withLib.data.video_library_id)
    ) {
      return withLib.data.video_library_id;
    }
    return null;
  }
  return "unavailable";
}

/** يسجّل حدث ويب هوك بشكل متماثل (idempotent). يعيد false إن كان مكررًا. */
export async function claimWebhookEvent(input: {
  eventId: string;
  eventType: string;
  videoAssetId: string | null;
  payloadDigest: string;
}): Promise<"new" | "duplicate" | "error"> {
  const service = createServiceRoleClient();
  if (!service) return "error";
  const { error } = await service.from("mux_webhook_events").insert({
    event_id: input.eventId,
    event_type: input.eventType,
    video_asset_id: input.videoAssetId,
    payload_digest: input.payloadDigest,
  });
  if (!error) return "new";
  if ((error.code || "").includes("23505") || (error.message || "").includes("duplicate")) {
    return "duplicate";
  }
  // الجدول غير موجود بعد — اعتبره جديدًا لتجنب حجب المعالجة محليًا
  if ((error.message || "").toLowerCase().includes("mux_webhook_events")) {
    return "new";
  }
  return "error";
}

export function muxThumbnailUrl(playbackId: string): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=1`;
}

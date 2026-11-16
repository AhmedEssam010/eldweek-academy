import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { applyMuxAssetWebhook, getMuxClientForWebhooks } from "@/lib/learning/mux";
import { claimWebhookEvent } from "@/lib/learning/video-library";

type MuxWebhookData = {
  type?: string;
  id?: string;
  data?: {
    id?: string;
    passthrough?: string | null;
    status?: string | null;
    duration?: number | null;
    playback_ids?: Array<{ id: string; policy?: string | null }>;
    asset_id?: string;
  };
};

/**
 * Webhook Mux — التحقق من التوقيع ثم تحديث حالة المكتبة بشكل متماثل.
 * لا يُفعَّل على الإنتاج حتى يُضبط MUX_WEBHOOK_SECRET ويُنشر المسار.
 */
export async function POST(request: Request) {
  const secret = process.env.MUX_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, message: "MUX_WEBHOOK_SECRET missing" },
      { status: 503 },
    );
  }

  const mux = getMuxClientForWebhooks();
  if (!mux) {
    return NextResponse.json(
      { ok: false, message: "Mux client not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const headerBag: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headerBag[key] = value;
  });

  let event: MuxWebhookData;
  try {
    event = (await mux.webhooks.unwrap(rawBody, headerBag, secret)) as MuxWebhookData;
  } catch {
    return NextResponse.json({ ok: false, message: "invalid signature" }, { status: 401 });
  }

  const eventId = typeof event.id === "string" ? event.id : null;
  const eventType = typeof event.type === "string" ? event.type : "unknown";
  if (!eventId) {
    return NextResponse.json({ ok: false, message: "missing event id" }, { status: 400 });
  }

  const digest = createHash("sha256").update(rawBody).digest("hex").slice(0, 32);
  const claim = await claimWebhookEvent({
    eventId,
    eventType,
    videoAssetId: null,
    payloadDigest: digest,
  });
  if (claim === "duplicate") {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  if (claim === "error") {
    // لا نرفض الحدث إذا فشل التسجيل — نتابع المعالجة بحذر
    console.error("[mux-webhook] claim failed", eventId);
  }

  const data = event.data;
  if (!data) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const relevant =
    eventType === "video.asset.ready" ||
    eventType === "video.asset.errored" ||
    eventType === "video.asset.created" ||
    eventType === "video.upload.asset_created";

  if (!relevant) {
    return NextResponse.json({ ok: true, ignored: true, type: eventType });
  }

  const muxAssetId =
    (typeof data.id === "string" && eventType.startsWith("video.asset")
      ? data.id
      : null) ||
    (typeof data.asset_id === "string" ? data.asset_id : null);

  if (!muxAssetId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "no_asset" });
  }

  const result = await applyMuxAssetWebhook({
    muxAssetId,
    passthrough: data.passthrough,
    status:
      eventType === "video.asset.errored"
        ? "errored"
        : eventType === "video.asset.ready"
          ? "ready"
          : (data.status ?? "preparing"),
    playbackIds: data.playback_ids ?? [],
    duration: data.duration,
  });

  return NextResponse.json({
    ok: result.ok,
    videoLibraryId: result.videoLibraryId,
    message: result.message,
  });
}

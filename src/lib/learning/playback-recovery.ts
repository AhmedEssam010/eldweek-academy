/** يطابق PLAYBACK_TOKEN_REFRESH_SKEW_SECONDS في playback-policy — مكرر هنا لاختبارات Node بلا path alias. */
export const PLAYBACK_TOKEN_REFRESH_SKEW_SECONDS = 90;
const DEFAULT_PLAYBACK_TTL_SECONDS = 15 * 60;

export type PlaybackFailureKind =
  | "token_expired"
  | "network"
  | "player_init"
  | "processing"
  | "missing_asset"
  | "unauthorized"
  | "config"
  | "unknown";

export type PlaybackRefreshFailureKind =
  | "unauthorized"
  | "processing"
  | "missing"
  | "unavailable"
  | "config"
  | "unknown";

export type PlayerSnapshot = {
  currentTime: number;
  paused: boolean;
  playbackRate: number;
  volume: number;
  muted: boolean;
};

export const PLAYBACK_RECOVERY_MAX_ATTEMPTS = 3;

export function isTokenFresh(
  expiresAtIso: string | null | undefined,
  nowMs: number = Date.now(),
  skewSeconds: number = PLAYBACK_TOKEN_REFRESH_SKEW_SECONDS,
): boolean {
  if (!expiresAtIso) return false;
  const expiresAtMs = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresAtMs)) return false;
  return expiresAtMs - skewSeconds * 1000 > nowMs;
}

export function msUntilTokenRefresh(
  expiresAtIso: string | null | undefined,
  nowMs: number = Date.now(),
  skewSeconds: number = PLAYBACK_TOKEN_REFRESH_SKEW_SECONDS,
): number | null {
  if (!expiresAtIso) return null;
  const expiresAtMs = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresAtMs)) return null;
  return Math.max(0, expiresAtMs - skewSeconds * 1000 - nowMs);
}

export function classifyMuxPlayerError(error: unknown): PlaybackFailureKind {
  const text = extractErrorText(error).toLowerCase();

  if (!text) return "unknown";

  if (
    text.includes("401") ||
    text.includes("403") ||
    text.includes("expir") ||
    text.includes("jwt") ||
    text.includes("token") ||
    text.includes("unauthorized") ||
    text.includes("forbidden") ||
    text.includes("signature")
  ) {
    return "token_expired";
  }

  if (
    text.includes("network") ||
    text.includes("offline") ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("failed to fetch") ||
    text.includes("net::") ||
    text.includes("load failed") ||
    text.includes("connection")
  ) {
    return "network";
  }

  if (
    text.includes("not ready") ||
    text.includes("processing") ||
    text.includes("preparing")
  ) {
    return "processing";
  }

  if (
    text.includes("not found") ||
    text.includes("404") ||
    text.includes("no asset") ||
    text.includes("missing")
  ) {
    return "missing_asset";
  }

  if (
    text.includes("decode") ||
    text.includes("mediaerror") ||
    text.includes("demux") ||
    text.includes("manifest") ||
    text.includes("hls") ||
    text.includes("pipeline") ||
    text.includes("src_not_supported")
  ) {
    return "player_init";
  }

  return "unknown";
}

export function isRecoverablePlaybackFailure(kind: PlaybackFailureKind): boolean {
  return (
    kind === "token_expired" ||
    kind === "network" ||
    kind === "player_init" ||
    kind === "unknown"
  );
}

export function shouldRefreshTokenForFailure(kind: PlaybackFailureKind): boolean {
  return kind === "token_expired" || kind === "player_init" || kind === "unknown";
}

export function arabicMessageForPlaybackFailure(
  kind: PlaybackFailureKind,
): string {
  switch (kind) {
    case "token_expired":
      return "انتهت صلاحية تفويض التشغيل. يمكن إعادة المحاولة دون تحديث الصفحة.";
    case "network":
      return "انقطع الاتصال أثناء تحميل الفيديو. تحقق من الشبكة ثم أعد المحاولة.";
    case "player_init":
      return "تعذر تهيئة مشغّل الفيديو. أعد المحاولة بعد لحظات.";
    case "processing":
      return "الفيديو ما زال قيد المعالجة لدى مزوّد التشغيل.";
    case "missing_asset":
      return "لا يوجد فيديو جاهز لهذا الدرس.";
    case "unauthorized":
      return "ليست لديك صلاحية تشغيل هذا الدرس.";
    case "config":
      return "إعدادات تشغيل الفيديو غير مكتملة على الخادم.";
    default:
      return "تعذر تشغيل الفيديو مؤقتًا. أعد المحاولة.";
  }
}

export function arabicMessageForRefreshFailure(
  kind: PlaybackRefreshFailureKind,
): string {
  switch (kind) {
    case "unauthorized":
      return "ليست لديك صلاحية تشغيل هذا الدرس.";
    case "processing":
      return "الفيديو ما زال قيد المعالجة.";
    case "missing":
      return "لا يوجد فيديو مرتبط بهذا الدرس.";
    case "config":
      return "إعدادات Mux غير مكتملة على الخادم.";
    case "unavailable":
      return "تعذر تجديد تفويض التشغيل الآن.";
    default:
      return "تعذر تجديد تفويض التشغيل.";
  }
}

export function nextBackoffMs(attempt: number): number {
  const base = 700;
  const cappedAttempt = Math.max(0, Math.min(attempt, 5));
  return Math.min(8_000, base * 2 ** cappedAttempt);
}

export function capturePlayerSnapshot(
  player: {
    currentTime?: number;
    paused?: boolean;
    playbackRate?: number;
    volume?: number;
    muted?: boolean;
  } | null,
): PlayerSnapshot | null {
  if (!player) return null;
  const currentTime =
    typeof player.currentTime === "number" && Number.isFinite(player.currentTime)
      ? Math.max(0, player.currentTime)
      : 0;
  return {
    currentTime,
    paused: Boolean(player.paused ?? true),
    playbackRate:
      typeof player.playbackRate === "number" && player.playbackRate > 0
        ? player.playbackRate
        : 1,
    volume:
      typeof player.volume === "number" && Number.isFinite(player.volume)
        ? Math.min(1, Math.max(0, player.volume))
        : 1,
    muted: Boolean(player.muted ?? false),
  };
}

export function defaultExpiresAtFromNow(
  nowMs: number = Date.now(),
  ttlSeconds: number = DEFAULT_PLAYBACK_TTL_SECONDS,
): string {
  return new Date(nowMs + ttlSeconds * 1000).toISOString();
}

function extractErrorText(error: unknown): string {
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || error.name || "";

  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const detail = record.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      const nested = detail as Record<string, unknown>;
      const parts = [nested.message, nested.error, nested.code, nested.type]
        .filter((value) => typeof value === "string")
        .join(" ");
      if (parts) return parts;
    }
    const parts = [record.message, record.error, record.code, record.type]
      .filter((value) => typeof value === "string")
      .join(" ");
    if (parts) return parts;
    try {
      return JSON.stringify(error);
    } catch {
      return "";
    }
  }

  return String(error);
}

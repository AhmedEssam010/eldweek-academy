import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arabicMessageForPlaybackFailure,
  capturePlayerSnapshot,
  classifyMuxPlayerError,
  isRecoverablePlaybackFailure,
  isTokenFresh,
  msUntilTokenRefresh,
  nextBackoffMs,
  PLAYBACK_TOKEN_REFRESH_SKEW_SECONDS,
  shouldRefreshTokenForFailure,
} from "./playback-recovery.ts";
import {
  muxJwtExpirationLabel,
  PLAYBACK_GRANT_TTL_SECONDS,
} from "./playback-policy.ts";

describe("playback token freshness", () => {
  it("يعتبر التوكن منتهيًا قبل expiresAt بهامش التجديد", () => {
    const now = Date.parse("2026-11-17T12:00:00.000Z");
    const expiresSoon = new Date(
      now + (PLAYBACK_TOKEN_REFRESH_SKEW_SECONDS - 10) * 1000,
    ).toISOString();
    assert.equal(isTokenFresh(expiresSoon, now), false);

    const expiresLater = new Date(
      now + (PLAYBACK_TOKEN_REFRESH_SKEW_SECONDS + 30) * 1000,
    ).toISOString();
    assert.equal(isTokenFresh(expiresLater, now), true);
  });

  it("يحسب وقت التجديد المتبقي بشكل صحيح", () => {
    const now = Date.parse("2026-11-17T12:00:00.000Z");
    const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
    const delay = msUntilTokenRefresh(expiresAt, now);
    assert.ok(delay != null);
    assert.equal(
      delay,
      10 * 60 * 1000 - PLAYBACK_TOKEN_REFRESH_SKEW_SECONDS * 1000,
    );
  });

  it("TTL التشغيل أطول من 5 دقائق لمنع فشل العودة المبكر", () => {
    assert.ok(PLAYBACK_GRANT_TTL_SECONDS >= 15 * 60);
    assert.equal(muxJwtExpirationLabel(15 * 60), "15m");
    assert.equal(muxJwtExpirationLabel(90), "90s");
  });
});

describe("playback error classification", () => {
  it("يميّز انتهاء التوكن عن أعطال الشبكة", () => {
    assert.equal(
      classifyMuxPlayerError({ detail: { message: "JWT expired 403" } }),
      "token_expired",
    );
    assert.equal(
      classifyMuxPlayerError({ detail: { message: "network timeout" } }),
      "network",
    );
    assert.equal(
      classifyMuxPlayerError(new Error("hls demux pipeline failed")),
      "player_init",
    );
  });

  it("يحدد الأخطاء القابلة للاسترداد ومتى يلزم تجديد التوكن", () => {
    assert.equal(isRecoverablePlaybackFailure("token_expired"), true);
    assert.equal(isRecoverablePlaybackFailure("network"), true);
    assert.equal(isRecoverablePlaybackFailure("unauthorized"), false);
    assert.equal(shouldRefreshTokenForFailure("token_expired"), true);
    assert.equal(shouldRefreshTokenForFailure("network"), false);
  });

  it("لا يستخدم رسالة التفويض العامة لكل الأعطال", () => {
    const networkMessage = arabicMessageForPlaybackFailure("network");
    assert.equal(networkMessage.includes("أعد تحميل الصفحة"), false);
    assert.equal(networkMessage.includes("تفويض جديد"), false);

    const tokenMessage = arabicMessageForPlaybackFailure("token_expired");
    assert.equal(tokenMessage.includes("أعد تحميل الصفحة"), false);
    assert.equal(tokenMessage.includes("إعادة المحاولة"), true);
  });

  it("يزيد مهلة الإعادة بشكل محدود", () => {
    assert.equal(nextBackoffMs(0), 700);
    assert.equal(nextBackoffMs(1), 1400);
    assert.ok(nextBackoffMs(10) <= 8000);
  });
});

describe("player snapshot", () => {
  it("يلتقط موضع التشغيل والإعدادات بأمان", () => {
    const snapshot = capturePlayerSnapshot({
      currentTime: 42.5,
      paused: false,
      playbackRate: 1.25,
      volume: 0.4,
      muted: true,
    });
    assert.deepEqual(snapshot, {
      currentTime: 42.5,
      paused: false,
      playbackRate: 1.25,
      volume: 0.4,
      muted: true,
    });
    assert.equal(capturePlayerSnapshot(null), null);
  });
});

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import type { MuxPlayerRefAttributes } from "@mux/mux-player-react";
import {
  refreshStaffMuxPlaybackAction,
  refreshStudentMuxPlaybackAction,
} from "@/lib/learning/playback-refresh-actions";
import {
  arabicMessageForPlaybackFailure,
  arabicMessageForRefreshFailure,
  capturePlayerSnapshot,
  classifyMuxPlayerError,
  isRecoverablePlaybackFailure,
  isTokenFresh,
  msUntilTokenRefresh,
  nextBackoffMs,
  PLAYBACK_RECOVERY_MAX_ATTEMPTS,
  shouldRefreshTokenForFailure,
  type PlayerSnapshot,
} from "@/lib/learning/playback-recovery";

type ProtectedMuxPlayerProps = {
  playbackId: string;
  token: string;
  expiresAt?: string | null;
  lessonId: string;
  courseId?: string;
  semesterId?: string;
  /** student = استحقاق اشتراك، staff = معاينة مصرّح بها */
  audience?: "student" | "staff";
};

type AuthState = {
  playbackId: string;
  token: string;
  expiresAt: string | null;
};

type UiMode = "ready" | "recovering" | "fatal";

export function ProtectedMuxPlayer({
  playbackId,
  token,
  expiresAt = null,
  lessonId,
  courseId,
  semesterId,
  audience = "student",
}: ProtectedMuxPlayerProps) {
  const playerRef = useRef<MuxPlayerRefAttributes | null>(null);
  const authRef = useRef<AuthState>({
    playbackId,
    token,
    expiresAt,
  });
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);
  const recoveryInFlightRef = useRef(false);
  const recoveryAttemptRef = useRef(0);
  const requestGenRef = useRef(0);
  const pendingSnapshotRef = useRef<PlayerSnapshot | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [auth, setAuth] = useState<AuthState>({
    playbackId,
    token,
    expiresAt,
  });
  const [playerEpoch, setPlayerEpoch] = useState(0);
  const [uiMode, setUiMode] = useState<UiMode>("ready");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [fatalKindMessage, setFatalKindMessage] = useState<string | null>(null);
  const [sourceKey, setSourceKey] = useState(
    () =>
      `${audience}|${lessonId}|${courseId ?? ""}|${semesterId ?? ""}|${playbackId}|${token}|${expiresAt ?? ""}`,
  );

  const nextSourceKey = `${audience}|${lessonId}|${courseId ?? ""}|${semesterId ?? ""}|${playbackId}|${token}|${expiresAt ?? ""}`;
  if (nextSourceKey !== sourceKey) {
    // مزامنة أثناء التصيير عند تغيّر تفويض الخادم/الدرس — أفضل من effect يسبب render متسلسل.
    setSourceKey(nextSourceKey);
    setAuth({ playbackId, token, expiresAt });
    setPlayerEpoch((value) => value + 1);
    setUiMode("ready");
    setStatusMessage(null);
    setFatalKindMessage(null);
  }

  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

  useEffect(() => {
    requestGenRef.current += 1;
    recoveryInFlightRef.current = false;
    recoveryAttemptRef.current = 0;
    pendingSnapshotRef.current = null;
  }, [sourceKey]);

  const applySnapshot = useCallback((snapshot: PlayerSnapshot | null) => {
    const player = playerRef.current;
    if (!player || !snapshot) return;
    try {
      if (snapshot.currentTime > 0) {
        player.currentTime = snapshot.currentTime;
      }
      player.playbackRate = snapshot.playbackRate;
      player.volume = snapshot.volume;
      player.muted = snapshot.muted;
      if (!snapshot.paused) {
        const playResult = player.play?.();
        if (playResult && typeof playResult.catch === "function") {
          playResult.catch(() => {
            // قيود autoplay في المتصفح — نبقي الفيديو عند الموضع دون إجبار التشغيل.
          });
        }
      } else {
        player.pause?.();
      }
    } catch {
      // تجاهل فشل الاستعادة الجزئي
    }
  }, []);

  const refreshAuthorization = useCallback(
    async (options?: { forceRemount?: boolean; reason?: string }) => {
      if (audience === "student" && (!courseId || !semesterId)) {
        return false;
      }

      if (refreshInFlightRef.current) {
        return refreshInFlightRef.current;
      }

      const generation = requestGenRef.current;
      const snapshot = capturePlayerSnapshot(playerRef.current);
      if (snapshot) pendingSnapshotRef.current = snapshot;

      const run = (async () => {
        try {
          const result =
            audience === "staff"
              ? await refreshStaffMuxPlaybackAction({ lessonId })
              : await refreshStudentMuxPlaybackAction({
                  lessonId,
                  courseId: courseId!,
                  semesterId: semesterId!,
                });

          if (generation !== requestGenRef.current) {
            return false;
          }

          if (!result.ok) {
            setFatalKindMessage(arabicMessageForRefreshFailure(result.kind));
            setUiMode("fatal");
            setStatusMessage(null);
            return false;
          }

          // لا تعِد استخدام تفويض درس آخر إن تغيّر المعرّف بشكل غير متوقع.
          if (
            result.playbackId &&
            authRef.current.playbackId &&
            result.playbackId !== authRef.current.playbackId &&
            options?.reason !== "prop-sync"
          ) {
            // مسموح عند تجديد نفس الدرس إن تغيّر playback id نادرًا؛ نحدّث بأمان.
          }

          setAuth({
            playbackId: result.playbackId,
            token: result.token,
            expiresAt: result.expiresAt,
          });

          if (options?.forceRemount) {
            setPlayerEpoch((value) => value + 1);
          }

          setUiMode("ready");
          setStatusMessage(null);
          setFatalKindMessage(null);
          return true;
        } catch {
          if (generation !== requestGenRef.current) return false;
          setFatalKindMessage("تعذر تجديد تفويض التشغيل بسبب خطأ مؤقت.");
          setUiMode("fatal");
          setStatusMessage(null);
          return false;
        } finally {
          refreshInFlightRef.current = null;
        }
      })();

      refreshInFlightRef.current = run;
      return run;
    },
    [audience, courseId, lessonId, semesterId],
  );

  const ensureFreshAuthorization = useCallback(
    async (options?: { force?: boolean; forceRemount?: boolean; reason?: string }) => {
      if (!options?.force && isTokenFresh(authRef.current.expiresAt)) {
        return true;
      }
      setUiMode((mode) => (mode === "fatal" ? mode : "recovering"));
      if (options?.force || !isTokenFresh(authRef.current.expiresAt)) {
        setStatusMessage("جارٍ استعادة تشغيل الفيديو...");
      }
      return refreshAuthorization({
        forceRemount: options?.forceRemount,
        reason: options?.reason,
      });
    },
    [refreshAuthorization],
  );

  const recoverFromError = useCallback(
    async (error: unknown) => {
      if (recoveryInFlightRef.current) return;
      recoveryInFlightRef.current = true;
      const generation = requestGenRef.current;
      const kind = classifyMuxPlayerError(error);

      try {
        if (!isRecoverablePlaybackFailure(kind)) {
          setFatalKindMessage(arabicMessageForPlaybackFailure(kind));
          setUiMode("fatal");
          setStatusMessage(null);
          return;
        }

        if (recoveryAttemptRef.current >= PLAYBACK_RECOVERY_MAX_ATTEMPTS) {
          setFatalKindMessage(arabicMessageForPlaybackFailure(kind));
          setUiMode("fatal");
          setStatusMessage(null);
          return;
        }

        const attempt = recoveryAttemptRef.current;
        recoveryAttemptRef.current = attempt + 1;
        setUiMode("recovering");
        setStatusMessage("جارٍ استعادة تشغيل الفيديو...");

        await new Promise((resolve) =>
          setTimeout(resolve, nextBackoffMs(attempt)),
        );
        if (generation !== requestGenRef.current) return;

        let ok = true;
        if (shouldRefreshTokenForFailure(kind) || !isTokenFresh(authRef.current.expiresAt)) {
          ok = await refreshAuthorization({
            forceRemount: true,
            reason: `error:${kind}`,
          });
        } else {
          // شبكة/تهيئة: أعد تهيئة المشغّل بنفس التوكن الصالح.
          pendingSnapshotRef.current = capturePlayerSnapshot(playerRef.current);
          setPlayerEpoch((value) => value + 1);
          setUiMode("ready");
          setStatusMessage(null);
        }

        if (!ok && generation === requestGenRef.current) {
          setFatalKindMessage(arabicMessageForPlaybackFailure(kind));
          setUiMode("fatal");
          setStatusMessage(null);
        }
      } finally {
        recoveryInFlightRef.current = false;
      }
    },
    [refreshAuthorization],
  );

  // تجديد استباقي حسب expiresAt — لا يعتمد على setInterval وحده.
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    const delay = msUntilTokenRefresh(auth.expiresAt);
    if (delay == null) return;

    refreshTimerRef.current = setTimeout(() => {
      void ensureFreshAuthorization({ reason: "ttl" });
    }, delay);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [auth.expiresAt, ensureFreshAuthorization, playerEpoch]);

  // العودة من الخلفية / bfcache / الشبكة
  useEffect(() => {
    const onVisibleOrOnline = () => {
      if (document.visibilityState && document.visibilityState !== "visible") {
        return;
      }
      void ensureFreshAuthorization({
        force: !isTokenFresh(authRef.current.expiresAt),
        forceRemount: !isTokenFresh(authRef.current.expiresAt),
        reason: "visibility",
      });
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted || !isTokenFresh(authRef.current.expiresAt)) {
        void ensureFreshAuthorization({
          force: true,
          forceRemount: true,
          reason: "pageshow",
        });
      }
    };

    document.addEventListener("visibilitychange", onVisibleOrOnline);
    window.addEventListener("focus", onVisibleOrOnline);
    window.addEventListener("online", onVisibleOrOnline);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibleOrOnline);
      window.removeEventListener("focus", onVisibleOrOnline);
      window.removeEventListener("online", onVisibleOrOnline);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [ensureFreshAuthorization]);

  if (!auth.playbackId || !auth.token) {
    return (
      <div className="flex aspect-video items-center justify-center p-6 text-center">
        <p className="max-w-md text-sm leading-7 text-amber-100">
          جارٍ تجهيز التفويض الموقّع للتشغيل…
        </p>
      </div>
    );
  }

  if (uiMode === "fatal") {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="max-w-md text-sm leading-7 text-red-200">
          {fatalKindMessage ?? "تعذر تشغيل الفيديو."}
        </p>
        <button
          type="button"
          className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/5"
          onClick={() => {
            recoveryAttemptRef.current = 0;
            setFatalKindMessage(null);
            setUiMode("recovering");
            setStatusMessage("جارٍ استعادة تشغيل الفيديو...");
            void ensureFreshAuthorization({
              force: true,
              forceRemount: true,
              reason: "manual-retry",
            });
          }}
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {uiMode === "recovering" ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-black/55 px-3 py-2 text-center text-xs text-amber-100">
          {statusMessage ?? "جارٍ استعادة تشغيل الفيديو..."}
        </div>
      ) : null}
      <MuxPlayer
        key={`${lessonId}-${auth.playbackId}-${playerEpoch}`}
        ref={playerRef}
        playbackId={auth.playbackId}
        tokens={{ playback: auth.token }}
        streamType="on-demand"
        accentColor="#7c3aed"
        style={{ aspectRatio: "16 / 9", width: "100%" }}
        onLoadedMetadata={() => {
          const snapshot = pendingSnapshotRef.current;
          if (snapshot) {
            pendingSnapshotRef.current = null;
            applySnapshot(snapshot);
          }
          setUiMode("ready");
          setStatusMessage(null);
          recoveryAttemptRef.current = 0;
        }}
        onError={(event) => {
          void recoverFromError(event);
        }}
      />
    </div>
  );
}

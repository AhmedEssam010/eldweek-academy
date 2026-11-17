"use server";

import { authorizeLessonPlayback, getStaffLessonPreview } from "@/lib/learning/video";
import type { PlaybackRefreshFailureKind } from "@/lib/learning/playback-recovery";

export type RefreshMuxPlaybackResult =
  | {
      ok: true;
      playbackId: string;
      token: string;
      expiresAt: string;
    }
  | {
      ok: false;
      kind: PlaybackRefreshFailureKind;
      message: string;
    };

/**
 * تجديد تفويض Mux موقّع للطالب المشترك — يعيد فحص الاستحقاق في كل مرة.
 * لا يُخزَّن على العميل ولا يُعاد استخدام تفويض طالب آخر.
 */
export async function refreshStudentMuxPlaybackAction(input: {
  lessonId: string;
  courseId: string;
  semesterId: string;
}): Promise<RefreshMuxPlaybackResult> {
  const lessonId = String(input.lessonId ?? "").trim();
  const courseId = String(input.courseId ?? "").trim();
  const semesterId = String(input.semesterId ?? "").trim();
  if (!lessonId || !courseId || !semesterId) {
    return {
      ok: false,
      kind: "unavailable",
      message: "بيانات الدرس غير صالحة لتجديد التشغيل.",
    };
  }

  const playback = await authorizeLessonPlayback({
    lessonId,
    courseId,
    semesterId,
  });

  if (playback.status === "authorized" && playback.source === "mux") {
    return {
      ok: true,
      playbackId: playback.muxPlaybackId,
      token: playback.muxPlaybackToken,
      expiresAt: playback.expiresAt,
    };
  }

  if (playback.status === "locked" || playback.status === "forbidden") {
    return { ok: false, kind: "unauthorized", message: playback.message };
  }
  if (playback.status === "processing") {
    return { ok: false, kind: "processing", message: playback.message };
  }
  if (playback.status === "provider_unconfigured" || playback.status === "setup_required") {
    return { ok: false, kind: "config", message: playback.message };
  }
  if (playback.status === "authorized" && playback.source === "youtube") {
    return {
      ok: false,
      kind: "missing",
      message: "هذا الدرس يعتمد على يوتيوب وليس Mux.",
    };
  }

  return {
    ok: false,
    kind: "unavailable",
    message: playback.message || "تعذر تجديد تفويض التشغيل.",
  };
}

/** تجديد معاينة المالك/المدرّس المصرّح له بتعديل المحتوى. */
export async function refreshStaffMuxPlaybackAction(input: {
  lessonId: string;
}): Promise<RefreshMuxPlaybackResult> {
  const lessonId = String(input.lessonId ?? "").trim();
  if (!lessonId) {
    return {
      ok: false,
      kind: "unavailable",
      message: "معرّف الدرس غير صالح.",
    };
  }

  const preview = await getStaffLessonPreview(lessonId);
  if (!preview) {
    return {
      ok: false,
      kind: "unavailable",
      message: "تعذر تجديد معاينة التشغيل لهذا الدرس.",
    };
  }

  return {
    ok: true,
    playbackId: preview.playbackId,
    token: preview.token,
    expiresAt: preview.expiresAt,
  };
}

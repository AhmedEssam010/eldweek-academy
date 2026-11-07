"use client";

import { useState } from "react";
import MuxPlayer from "@mux/mux-player-react";

export function ProtectedMuxPlayer({
  playbackId,
  token,
}: {
  playbackId: string;
  token: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex aspect-video items-center justify-center p-6 text-center">
        <p className="max-w-md text-sm leading-7 text-red-200">
          تعذر تشغيل الفيديو. أعد تحميل الصفحة للحصول على تفويض جديد. الرابط
          موقّع ومؤقت، ولن يُعرض معرّف الفيديو.
        </p>
      </div>
    );
  }

  return (
    <MuxPlayer
      playbackId={playbackId}
      tokens={{ playback: token }}
      streamType="on-demand"
      accentColor="#7c3aed"
      style={{ aspectRatio: "16 / 9", width: "100%" }}
      onError={() => setFailed(true)}
    />
  );
}

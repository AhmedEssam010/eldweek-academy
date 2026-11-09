"use client";

import { youtubeEmbedUrl } from "@/lib/learning/youtube";

type YoutubeEmbedPlayerProps = {
  videoId: string;
  title?: string;
};

/**
 * مشغّل يوتيوب رسمي (youtube-nocookie) بنسبة 16:9.
 * لا يدّعي حماية مساوية لـ Mux الموقّع.
 */
export function YoutubeEmbedPlayer({
  videoId,
  title = "فيديو يوتيوب",
}: YoutubeEmbedPlayerProps) {
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      <iframe
        key={videoId}
        src={youtubeEmbedUrl(videoId)}
        title={title}
        className="absolute inset-0 h-full w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
      />
    </div>
  );
}

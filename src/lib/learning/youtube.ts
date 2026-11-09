/**
 * استخراج والتحقق من معرّف فيديو يوتيوب من روابط رسمية فقط.
 * لا يقبل HTML iframe ولا نطاقات غير موثوقة.
 */

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export type YoutubeParseResult =
  | { ok: true; videoId: string }
  | { ok: false; message: string };

function hostIsYoutube(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtu.be" ||
    host === "www.youtu.be" ||
    host === "youtube-nocookie.com" ||
    host === "www.youtube-nocookie.com"
  );
}

export function isValidYoutubeVideoId(value: string | null | undefined): boolean {
  return typeof value === "string" && YOUTUBE_ID_RE.test(value.trim());
}

export function parseYoutubeVideoInput(raw: string): YoutubeParseResult {
  const input = String(raw ?? "").trim();
  if (!input) {
    return { ok: false, message: "يرجى إدخال رابط فيديو يوتيوب." };
  }

  if (/<iframe/i.test(input) || /javascript:/i.test(input)) {
    return {
      ok: false,
      message: "لا يُقبل كود iframe أو روابط غير آمنة. الصق رابط يوتيوب فقط.",
    };
  }

  if (YOUTUBE_ID_RE.test(input)) {
    return { ok: true, videoId: input };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return {
      ok: false,
      message:
        "رابط يوتيوب غير صالح. استخدم youtube.com/watch أو youtu.be أو shorts أو embed.",
    };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, message: "يجب أن يبدأ الرابط بـ https." };
  }

  if (!hostIsYoutube(url.hostname)) {
    return {
      ok: false,
      message: "يُقبل فقط روابط youtube.com أو youtu.be الرسمية.",
    };
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/+$/, "");

  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = path.split("/").filter(Boolean)[0] ?? "";
    if (YOUTUBE_ID_RE.test(id)) return { ok: true, videoId: id };
  }

  const watchId = url.searchParams.get("v");
  if (watchId && YOUTUBE_ID_RE.test(watchId)) {
    return { ok: true, videoId: watchId };
  }

  const segments = path.split("/").filter(Boolean);
  if (
    segments[0] === "shorts" ||
    segments[0] === "embed" ||
    segments[0] === "live" ||
    segments[0] === "v"
  ) {
    const id = segments[1] ?? "";
    if (YOUTUBE_ID_RE.test(id)) return { ok: true, videoId: id };
  }

  return {
    ok: false,
    message:
      "تعذر استخراج معرّف الفيديو. الصيغ المدعومة: watch؟v= و youtu.be و shorts و embed.",
  };
}

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

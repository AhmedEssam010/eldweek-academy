import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isValidYoutubeVideoId,
  parseYoutubeVideoInput,
  youtubeEmbedUrl,
} from "./youtube.ts";

describe("parseYoutubeVideoInput", () => {
  it("يقبل watch و youtu.be و shorts و embed", () => {
    const id = "dQw4w9WgXcQ";
    assert.deepEqual(
      parseYoutubeVideoInput(`https://www.youtube.com/watch?v=${id}`),
      { ok: true, videoId: id },
    );
    assert.deepEqual(parseYoutubeVideoInput(`https://youtu.be/${id}`), {
      ok: true,
      videoId: id,
    });
    assert.deepEqual(
      parseYoutubeVideoInput(`https://www.youtube.com/shorts/${id}`),
      { ok: true, videoId: id },
    );
    assert.deepEqual(
      parseYoutubeVideoInput(`https://www.youtube.com/embed/${id}`),
      { ok: true, videoId: id },
    );
  });

  it("يرفض iframe والنطاقات الغريبة", () => {
    assert.equal(
      parseYoutubeVideoInput('<iframe src="https://youtube.com/embed/dQw4w9WgXcQ">')
        .ok,
      false,
    );
    assert.equal(
      parseYoutubeVideoInput("https://evil.example/watch?v=dQw4w9WgXcQ").ok,
      false,
    );
  });

  it("يبنى رابط nocookie", () => {
    assert.equal(
      youtubeEmbedUrl("dQw4w9WgXcQ"),
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    assert.equal(isValidYoutubeVideoId("dQw4w9WgXcQ"), true);
    assert.equal(isValidYoutubeVideoId("short"), false);
  });
});

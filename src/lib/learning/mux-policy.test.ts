import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeMuxAssetId,
  describeMuxUploadFailure,
  encodeMuxAssetId,
  reviewMuxAsset,
} from "./mux-policy.ts";

describe("describeMuxUploadFailure", () => {
  it("يميّز الإعداد والصلاحية ورفض الواجهة", () => {
    assert.equal(describeMuxUploadFailure({ status: 401, type: "unauthorized" }).kind, "configuration");
    assert.equal(describeMuxUploadFailure({ status: 403, type: "insufficient_scope" }).kind, "permission");
    assert.equal(describeMuxUploadFailure({ status: 400, type: "invalid_parameters" }).kind, "api");
    assert.equal(describeMuxUploadFailure({ status: null, type: null }).kind, "network");
  });
});

describe("mux asset id", () => {
  it("يحفظ معرّف Mux فقط بصيغة داخلية", () => {
    assert.equal(encodeMuxAssetId("abc12345"), "mux:abc12345");
    assert.equal(encodeMuxAssetId("https://stream.mux.com/public"), null);
    assert.equal(decodeMuxAssetId("mux:abc12345"), "abc12345");
    assert.equal(decodeMuxAssetId("raw-secret"), null);
  });
});

describe("reviewMuxAsset", () => {
  const lessonId = "11111111-1111-4111-8111-111111111111";

  it("يرفض السياسة العامة واختلاف الدرس", () => {
    assert.equal(
      reviewMuxAsset({
        lessonId,
        passthrough: "other",
        status: "ready",
        playbackPolicies: ["signed"],
      }).ok,
      false,
    );
    assert.equal(
      reviewMuxAsset({
        lessonId,
        passthrough: lessonId,
        status: "ready",
        playbackPolicies: ["public"],
      }).ok,
      false,
    );
  });

  it("يقبل signed الجاهز ويعامل preparing كمعالجة", () => {
    assert.deepEqual(
      reviewMuxAsset({
        lessonId,
        passthrough: lessonId,
        status: "ready",
        playbackPolicies: ["signed"],
      }),
      { ok: true, phase: "ready" },
    );
    assert.deepEqual(
      reviewMuxAsset({
        lessonId,
        passthrough: lessonId,
        status: "preparing",
        playbackPolicies: [],
      }),
      { ok: true, phase: "processing" },
    );
  });
});

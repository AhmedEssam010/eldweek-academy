import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCourseMaterialObjectPath,
  formatFileSizeBytes,
  isValidCourseMaterialStoragePath,
  sniffPdfMagic,
} from "./course-materials.ts";

describe("course-materials helpers", () => {
  it("detects PDF magic bytes", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    assert.equal(sniffPdfMagic(pdf), true);
    assert.equal(sniffPdfMagic(new Uint8Array([0x00, 0x01])), false);
  });

  it("builds and validates storage paths", () => {
    const courseId = "11111111-1111-4111-8111-111111111111";
    const semesterId = "22222222-2222-4222-8222-222222222222";
    const path = buildCourseMaterialObjectPath(courseId, semesterId);
    assert.ok(path);
    assert.equal(isValidCourseMaterialStoragePath(path!), true);
    assert.equal(isValidCourseMaterialStoragePath("../x.pdf"), false);
  });

  it("formats file sizes in Arabic units", () => {
    assert.equal(formatFileSizeBytes(500), "500 بايت");
    assert.equal(formatFileSizeBytes(2048), "2.0 ك.ب");
    assert.equal(formatFileSizeBytes(2 * 1024 * 1024), "2.0 م.ب");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeEgyptianPhone } from "../auth/phone.ts";
import { validateTeacherPassword } from "./teacher-password.ts";

describe("validateTeacherPassword", () => {
  it("يرفض القصار وبدون أرقام/حروف", () => {
    assert.ok(validateTeacherPassword("short"));
    assert.ok(validateTeacherPassword("abcdefghijkl"));
    assert.ok(validateTeacherPassword("123456789012"));
  });

  it("يقبل كلمة قوية بطول كافٍ", () => {
    assert.equal(validateTeacherPassword("TeacherPass12"), null);
    assert.equal(validateTeacherPassword("كلمةمرورقوية1234"), null);
  });
});

describe("normalizeEgyptianPhone (teacher invite)", () => {
  it("يقبل صيغًا مصرية شائعة", () => {
    const a = normalizeEgyptianPhone("01012345678");
    assert.equal(a.ok, true);
    if (a.ok) assert.equal(a.e164, "+201012345678");

    const b = normalizeEgyptianPhone("+201112345678");
    assert.equal(b.ok, true);
  });

  it("يرفض أرقامًا غير مصرية", () => {
    assert.equal(normalizeEgyptianPhone("12345").ok, false);
    assert.equal(normalizeEgyptianPhone("+966501234567").ok, false);
  });
});

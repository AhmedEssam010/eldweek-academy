import assert from "node:assert/strict";

function normalizeEgyptianPhone(input) {
  const raw = input.trim();
  if (!raw) return { ok: false };
  const digits = raw.replace(/[^\d+]/g, "");
  let national = "";
  if (digits.startsWith("+20")) national = `0${digits.slice(3)}`;
  else if (digits.startsWith("0020")) national = `0${digits.slice(4)}`;
  else if (digits.startsWith("20") && digits.length === 12) national = `0${digits.slice(2)}`;
  else if (digits.startsWith("0")) national = digits;
  else return { ok: false };
  if (!/^(010|011|012|015)\d{8}$/.test(national)) return { ok: false };
  return { ok: true, e164: `+20${national.slice(1)}` };
}

assert.equal(normalizeEgyptianPhone("01012345678").e164, "+201012345678");
assert.equal(normalizeEgyptianPhone("+201112345678").e164, "+201112345678");
assert.equal(normalizeEgyptianPhone("201512345678").e164, "+201512345678");
assert.equal(normalizeEgyptianPhone("02xxxxxxx").ok, false);
assert.equal(normalizeEgyptianPhone("010123").ok, false);

console.log("PHONE_NORMALIZE_OK");

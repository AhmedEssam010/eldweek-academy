import assert from "node:assert/strict";

function parseAnalyticsRange(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "7d" || raw === "30d" || raw === "90d" || raw === "year" || raw === "all") {
    return raw;
  }
  return "30d";
}

function toIsoDateKey(date, groupBy) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  if (groupBy === "month") return `${y}-${m}`;
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildTimeBuckets(from, to, groupBy) {
  const keys = [];
  if (groupBy === "month") {
    let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    while (cursor.getTime() <= end.getTime()) {
      keys.push(toIsoDateKey(cursor, "month"));
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return keys;
  }
  let cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cursor.getTime() <= end.getTime()) {
    keys.push(toIsoDateKey(cursor, "day"));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return keys;
}

assert.equal(parseAnalyticsRange(undefined), "30d");
assert.equal(parseAnalyticsRange("7d"), "7d");
assert.equal(parseAnalyticsRange("bogus"), "30d");

const from = new Date(Date.UTC(2026, 10, 1));
const to = new Date(Date.UTC(2026, 10, 3));
assert.deepEqual(buildTimeBuckets(from, to, "day"), [
  "2026-11-01",
  "2026-11-02",
  "2026-11-03",
]);

const months = buildTimeBuckets(
  new Date(Date.UTC(2026, 0, 1)),
  new Date(Date.UTC(2026, 2, 15)),
  "month",
);
assert.deepEqual(months, ["2026-01", "2026-02", "2026-03"]);

console.log("verify-analytics-range: ok");

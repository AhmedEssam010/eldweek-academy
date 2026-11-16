export type AnalyticsRangeKey = "7d" | "30d" | "90d" | "year" | "all";

export type AnalyticsRangeOption = {
  key: AnalyticsRangeKey;
  label: string;
};

export const ANALYTICS_RANGE_OPTIONS: readonly AnalyticsRangeOption[] = [
  { key: "7d", label: "آخر 7 أيام" },
  { key: "30d", label: "آخر 30 يوم" },
  { key: "90d", label: "آخر 90 يوم" },
  { key: "year", label: "السنة الحالية" },
  { key: "all", label: "كل الوقت" },
] as const;

export function parseAnalyticsRange(
  value: string | string[] | undefined,
): AnalyticsRangeKey {
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    raw === "7d" ||
    raw === "30d" ||
    raw === "90d" ||
    raw === "year" ||
    raw === "all"
  ) {
    return raw;
  }
  return "30d";
}

export function resolveAnalyticsWindow(
  range: AnalyticsRangeKey,
  now = new Date(),
): {
  range: AnalyticsRangeKey;
  from: Date | null;
  to: Date;
  groupBy: "day" | "month";
  label: string;
} {
  const to = now;
  const option = ANALYTICS_RANGE_OPTIONS.find((item) => item.key === range);
  const label = option?.label ?? "آخر 30 يوم";

  if (range === "all") {
    return { range, from: null, to, groupBy: "month", label };
  }

  if (range === "year") {
    const from = new Date(Date.UTC(to.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
    return { range, from, to, groupBy: "month", label };
  }

  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    range,
    from,
    to,
    groupBy: days <= 90 ? "day" : "month",
    label,
  };
}

export function toIsoDateKey(date: Date, groupBy: "day" | "month"): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  if (groupBy === "month") return `${y}-${m}`;
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildTimeBuckets(
  from: Date | null,
  to: Date,
  groupBy: "day" | "month",
): string[] {
  if (!from) {
    // كل الوقت: آخر 12 شهرًا كحد أدنى للرسم؛ تُوسَّع لاحقًا إن وُجدت بيانات أقدم
    const start = new Date(
      Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1),
    );
    return buildTimeBuckets(start, to, "month");
  }

  const keys: string[] = [];
  if (groupBy === "month") {
    let cursor = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1),
    );
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    while (cursor.getTime() <= end.getTime()) {
      keys.push(toIsoDateKey(cursor, "month"));
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
      );
    }
    return keys;
  }

  let cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );
  while (cursor.getTime() <= end.getTime()) {
    keys.push(toIsoDateKey(cursor, "day"));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return keys;
}

export function formatBucketLabel(
  key: string,
  groupBy: "day" | "month",
): string {
  if (groupBy === "month") {
    const [y, m] = key.split("-").map(Number);
    if (!y || !m) return key;
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("ar-EG", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

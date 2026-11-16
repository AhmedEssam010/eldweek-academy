"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  ANALYTICS_RANGE_OPTIONS,
  type AnalyticsRangeKey,
} from "@/lib/dashboard/analytics-range";

type OverviewRangeControlsProps = {
  range: AnalyticsRangeKey;
  generatedAt: string;
};

export function OverviewRangeControls({
  range,
  generatedAt,
}: OverviewRangeControlsProps) {
  const router = useRouter();
  const updatedLabel = new Date(generatedAt).toLocaleString("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-white/50">
          آخر تحديث:{" "}
          <span className="text-white/75" dir="ltr">
            {updatedLabel}
          </span>
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition hover:border-primary/40 hover:bg-white/10"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          تحديث
        </button>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="تصفية الفترة الزمنية"
      >
        {ANALYTICS_RANGE_OPTIONS.map((option) => {
          const active = option.key === range;
          return (
            <Link
              key={option.key}
              href={
                option.key === "30d" ? "/admin" : `/admin?range=${option.key}`
              }
              className={`rounded-xl px-3 py-2 text-sm transition ${
                active
                  ? "bg-primary text-white shadow-[0_0_0_1px_rgba(124,58,237,0.5)]"
                  : "border border-white/10 bg-surface text-white/70 hover:border-primary/35 hover:text-white"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

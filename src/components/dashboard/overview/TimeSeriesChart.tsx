"use client";

import { useId, useState } from "react";
import { formatEgp } from "@/lib/dashboard/analytics-format";
import type { TimeSeriesPoint } from "@/lib/dashboard/analytics-types";

type TimeSeriesChartProps = {
  title: string;
  points: TimeSeriesPoint[];
  mode: "currency" | "count";
  emptyLabel?: string;
};

export function TimeSeriesChart({
  title,
  points,
  mode,
  emptyLabel = "لا توجد بيانات في هذه الفترة",
}: TimeSeriesChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.value), 0);
  const hasData = points.some((p) => p.value > 0);

  const width = 640;
  const height = 240;
  const padX = 16;
  const padTop = 20;
  const padBottom = 36;
  const chartW = width - padX * 2;
  const chartH = height - padTop - padBottom;

  const coords = points.map((point, index) => {
    const x =
      points.length <= 1
        ? padX + chartW / 2
        : padX + (index / (points.length - 1)) * chartW;
    const y =
      max <= 0
        ? padTop + chartH
        : padTop + chartH - (point.value / max) * chartH;
    return { ...point, x, y };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(" ");
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1]!.x.toFixed(2)} ${(padTop + chartH).toFixed(2)} L ${coords[0]!.x.toFixed(2)} ${(padTop + chartH).toFixed(2)} Z`
      : "";

  const active = hover !== null ? coords[hover] : null;

  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-surface p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
        <h3 className="min-w-0 break-words text-base font-semibold text-white">
          {title}
        </h3>
        {active ? (
          <p className="text-sm text-light-purple">
            {active.label}:{" "}
            {mode === "currency"
              ? formatEgp(active.value)
              : active.value.toLocaleString("ar-EG")}
          </p>
        ) : null}
      </div>

      {!hasData ? (
        <div className="mt-8 flex h-48 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 text-sm text-white/50">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-4 w-full min-w-0 max-w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-48 w-full min-w-0 sm:h-56"
            role="img"
            aria-label={title}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {[0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = padTop + chartH * (1 - ratio);
              return (
                <line
                  key={ratio}
                  x1={padX}
                  x2={width - padX}
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="1"
                />
              );
            })}

            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path
              d={linePath}
              fill="none"
              stroke="#a78bfa"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {coords.map((point, index) => (
              <g key={point.key}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={hover === index ? 5 : 3.5}
                  fill={hover === index ? "#e9d5ff" : "#7c3aed"}
                  stroke="#120c1f"
                  strokeWidth="2"
                />
                <rect
                  x={point.x - chartW / points.length / 2}
                  y={padTop}
                  width={Math.max(chartW / points.length, 8)}
                  height={chartH}
                  fill="transparent"
                  onMouseEnter={() => setHover(index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(index)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  role="listitem"
                  aria-label={`${point.label}: ${point.value}`}
                />
                {(points.length <= 14 ||
                  index === 0 ||
                  index === points.length - 1 ||
                  index % Math.ceil(points.length / 6) === 0) && (
                  <text
                    x={point.x}
                    y={height - 10}
                    textAnchor="middle"
                    className="fill-white/45"
                    style={{ fontSize: 10 }}
                  >
                    {point.label}
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>
      )}
    </section>
  );
}

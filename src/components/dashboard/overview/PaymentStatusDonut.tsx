"use client";

import { useState } from "react";
import type { StatusSlice } from "@/lib/dashboard/analytics-types";

const COLORS: Record<StatusSlice["key"], string> = {
  pending: "#fbbf24",
  approved: "#34d399",
  rejected: "#f87171",
};

type PaymentStatusDonutProps = {
  title: string;
  slices: StatusSlice[];
};

export function PaymentStatusDonut({ title, slices }: PaymentStatusDonutProps) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  const size = 180;
  const stroke = 28;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const arcs = slices.map((slice, index) => {
    const portion = total > 0 ? slice.count / total : 0;
    const length = portion * circumference;
    const offset = -slices.slice(0, index).reduce((sum, item) => {
      const itemPortion = total > 0 ? item.count / total : 0;
      return sum + itemPortion * circumference;
    }, 0);
    return {
      ...slice,
      dash: `${length} ${circumference - length}`,
      offset,
      color: COLORS[slice.key],
    };
  });

  const active = arcs.find((a) => a.key === hover) ?? null;

  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-5">
      <h3 className="text-base font-semibold text-white">{title}</h3>

      {total === 0 ? (
        <div className="mt-8 flex h-48 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 text-sm text-white/50">
          لا توجد طلبات في هذه الفترة
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              role="img"
              aria-label={title}
            >
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={stroke}
              />
              {arcs.map((arc) =>
                arc.count === 0 ? null : (
                  <circle
                    key={arc.key}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={arc.color}
                    strokeWidth={hover === arc.key ? stroke + 4 : stroke}
                    strokeDasharray={arc.dash}
                    strokeDashoffset={arc.offset}
                    strokeLinecap="butt"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    className="transition-[stroke-width] duration-150"
                    onMouseEnter={() => setHover(arc.key)}
                    onMouseLeave={() => setHover(null)}
                  />
                ),
              )}
              <text
                x="50%"
                y="48%"
                textAnchor="middle"
                className="fill-white"
                style={{ fontSize: 22, fontWeight: 700 }}
              >
                {total.toLocaleString("ar-EG")}
              </text>
              <text
                x="50%"
                y="60%"
                textAnchor="middle"
                className="fill-white/50"
                style={{ fontSize: 11 }}
              >
                {active ? active.label : "إجمالي الطلبات"}
              </text>
            </svg>
          </div>

          <ul className="w-full space-y-3 sm:max-w-xs">
            {arcs.map((arc) => (
              <li
                key={arc.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2"
                onMouseEnter={() => setHover(arc.key)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: arc.color }}
                    aria-hidden
                  />
                  <span className="text-sm text-white/80">{arc.label}</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {arc.count.toLocaleString("ar-EG")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

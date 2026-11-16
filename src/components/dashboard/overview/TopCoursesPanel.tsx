import { formatEgp } from "@/lib/dashboard/analytics-format";
import type { TopCourseRow } from "@/lib/dashboard/analytics-types";

type TopCoursesPanelProps = {
  rows: TopCourseRow[];
  rangeLabel: string;
};

export function TopCoursesPanel({ rows, rangeLabel }: TopCoursesPanelProps) {
  const maxRevenue = Math.max(...rows.map((r) => r.revenueEgp), 0);

  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-base font-semibold text-white">
          الكورسات الأعلى مبيعًا
        </h3>
        <p className="text-xs text-white/45">{rangeLabel} · إيراد معتمد</p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 flex h-40 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 text-sm text-white/50">
          لا توجد اشتراكات مدفوعة معتمدة في هذه الفترة
        </div>
      ) : (
        <ul className="mt-5 space-y-4">
          {rows.map((row, index) => {
            const width =
              maxRevenue > 0 ? Math.max((row.revenueEgp / maxRevenue) * 100, 6) : 0;
            return (
              <li key={row.courseId}>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">
                    <span className="ml-2 text-white/40">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {row.title}
                  </p>
                  <p className="text-xs text-white/55">
                    {row.paidSubscriptions.toLocaleString("ar-EG")} اشتراك ·{" "}
                    <span className="text-light-purple">
                      {formatEgp(row.revenueEgp)}
                    </span>
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-primary to-[#a78bfa]"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

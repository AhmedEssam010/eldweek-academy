import type { EducationMetric } from "@/lib/dashboard/analytics-types";

const scopeLabels: Record<EducationMetric["scope"], string> = {
  all_time: "كل الوقت",
  period: "حسب الفلتر",
  current: "الحالة الحالية",
};

export function EducationActivityPanel({
  metrics,
}: {
  metrics: EducationMetric[];
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-surface p-4 sm:p-5">
      <h3 className="text-base font-semibold text-white">النشاط التعليمي</h3>
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <article
            key={metric.key}
            className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-4"
          >
            <p className="break-words text-sm text-white/65">{metric.label}</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {!metric.available || metric.value === null
                ? "غير متاح"
                : metric.value.toLocaleString("ar-EG")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/50">
                {scopeLabels[metric.scope]}
              </span>
              <p className="text-xs text-white/45">{metric.hint}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

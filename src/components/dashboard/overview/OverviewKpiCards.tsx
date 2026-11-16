import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookOpenCheck,
  CircleDollarSign,
  ClipboardList,
  GraduationCap,
  Users,
  Wallet,
} from "lucide-react";
import type { OverviewKpi } from "@/lib/dashboard/analytics-types";

const icons: Record<string, ReactNode> = {
  revenue_all: <CircleDollarSign className="h-5 w-5" aria-hidden />,
  revenue_period: <Wallet className="h-5 w-5" aria-hidden />,
  students: <Users className="h-5 w-5" aria-hidden />,
  active_enrollments: <GraduationCap className="h-5 w-5" aria-hidden />,
  pending_payments: <ClipboardList className="h-5 w-5" aria-hidden />,
  published_courses: <BookOpenCheck className="h-5 w-5" aria-hidden />,
};

const scopeLabels: Record<OverviewKpi["scope"], string> = {
  all_time: "كل الوقت",
  period: "حسب الفلتر",
  current: "الحالة الحالية",
};

export function OverviewKpiCards({ kpis }: { kpis: OverviewKpi[] }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {kpis.map((kpi) => {
        const body = (
          <article className="group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#1b132d] via-surface to-[#120c1f] p-5 transition hover:border-primary/45">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-primary/50 to-transparent"
              aria-hidden
            />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-white/65">{kpi.label}</p>
                <p className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {kpi.display}
                </p>
              </div>
              <span className="rounded-xl border border-primary/25 bg-primary/10 p-2.5 text-light-purple">
                {icons[kpi.key] ?? <CircleDollarSign className="h-5 w-5" />}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] text-white/55">
                {scopeLabels[kpi.scope]}
              </span>
              <p className="text-xs leading-5 text-white/45">{kpi.hint}</p>
            </div>
          </article>
        );

        if (!kpi.href) return <div key={kpi.key}>{body}</div>;
        return (
          <Link key={kpi.key} href={kpi.href} className="block h-full">
            {body}
          </Link>
        );
      })}
    </section>
  );
}

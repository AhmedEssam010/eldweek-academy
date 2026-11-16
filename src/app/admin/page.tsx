import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EducationActivityPanel } from "@/components/dashboard/overview/EducationActivityPanel";
import { OverviewKpiCards } from "@/components/dashboard/overview/OverviewKpiCards";
import { OverviewRangeControls } from "@/components/dashboard/overview/OverviewRangeControls";
import { PaymentStatusDonut } from "@/components/dashboard/overview/PaymentStatusDonut";
import { RecentPaymentsPanel } from "@/components/dashboard/overview/RecentPaymentsPanel";
import { TimeSeriesChart } from "@/components/dashboard/overview/TimeSeriesChart";
import { TopCoursesPanel } from "@/components/dashboard/overview/TopCoursesPanel";
import { getAdminAnalyticsDashboard } from "@/lib/dashboard/analytics";

export const metadata = {
  title: "نظرة عامة | المهندس أحمد الدويك",
};

export const instant = false;

type PageProps = {
  searchParams: Promise<{ range?: string }>;
};

export default async function AdminHomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const result = await getAdminAnalyticsDashboard(params.range);
  const dashboard = result.data;

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      <PageHeader
        title="نظرة عامة"
        description="تابع أداء منصتك وإيراداتك ونشاط الطلاب من مكان واحد"
        actions={
          <Link
            href="/admin/courses/new"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-secondary"
          >
            مسودة كورس
          </Link>
        }
      />

      <OverviewRangeControls
        range={dashboard.range}
        generatedAt={result.generatedAt}
      />

      {result.availability === "setup_required" ||
      result.availability === "unavailable" ? (
        <SetupRequiredPanel message={result.message} />
      ) : null}

      <OverviewKpiCards kpis={dashboard.kpis} />

      <section className="grid min-w-0 gap-4 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <TimeSeriesChart
            title="الإيرادات عبر الوقت"
            points={dashboard.revenueSeries}
            mode="currency"
            emptyLabel="لا إيرادات معتمدة في هذه الفترة · 0 ج.م"
          />
        </div>
        <div className="min-w-0 xl:col-span-2">
          <PaymentStatusDonut
            title="حالة طلبات الاشتراك"
            slices={dashboard.paymentStatus}
          />
        </div>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <TimeSeriesChart
            title="الاشتراكات الجديدة"
            points={dashboard.enrollmentSeries}
            mode="count"
            emptyLabel="لا اشتراكات جديدة في هذه الفترة"
          />
        </div>
        <div className="min-w-0 xl:col-span-2">
          <TopCoursesPanel
            rows={dashboard.topCourses}
            rangeLabel={dashboard.rangeLabel}
          />
        </div>
      </section>

      <EducationActivityPanel metrics={dashboard.education} />

      <RecentPaymentsPanel rows={dashboard.recentPayments} />

      {dashboard.limitations.length > 0 &&
      result.availability === "ready" ? (
        <aside className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-6 text-white/45">
          <p className="mb-1 font-medium text-white/60">ملاحظات مالية</p>
          <ul className="list-disc space-y-1 pr-5">
            {dashboard.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}

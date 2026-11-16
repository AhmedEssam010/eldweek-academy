import type { AnalyticsRangeKey } from "@/lib/dashboard/analytics-range";

export type OverviewKpi = {
  key: string;
  label: string;
  value: number | null;
  display: string;
  hint: string;
  scope: "all_time" | "period" | "current";
  href?: string;
};

export type TimeSeriesPoint = {
  key: string;
  label: string;
  value: number;
};

export type StatusSlice = {
  key: "pending" | "approved" | "rejected";
  label: string;
  count: number;
};

export type TopCourseRow = {
  courseId: string;
  title: string;
  paidSubscriptions: number;
  revenueEgp: number;
};

export type EducationMetric = {
  key: string;
  label: string;
  value: number | null;
  hint: string;
  available: boolean;
  scope: "all_time" | "period" | "current";
};

export type RecentPaymentRow = {
  id: string;
  studentName: string;
  courseTitle: string;
  amountEgp: number;
  paymentMethod: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected" | string;
};

export type AdminAnalyticsDashboard = {
  range: AnalyticsRangeKey;
  rangeLabel: string;
  groupBy: "day" | "month";
  kpis: OverviewKpi[];
  revenueSeries: TimeSeriesPoint[];
  enrollmentSeries: TimeSeriesPoint[];
  paymentStatus: StatusSlice[];
  topCourses: TopCourseRow[];
  education: EducationMetric[];
  recentPayments: RecentPaymentRow[];
  limitations: string[];
};

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAuthReadiness } from "@/lib/auth/readiness";
import type { DataAvailability } from "@/lib/dashboard/types";
import {
  ANALYTICS_RANGE_OPTIONS,
  buildTimeBuckets,
  formatBucketLabel,
  parseAnalyticsRange,
  resolveAnalyticsWindow,
  toIsoDateKey,
  type AnalyticsRangeKey,
} from "@/lib/dashboard/analytics-range";
import { formatCount, formatEgp } from "@/lib/dashboard/analytics-format";
import type {
  AdminAnalyticsDashboard,
  EducationMetric,
  OverviewKpi,
  RecentPaymentRow,
  StatusSlice,
  TimeSeriesPoint,
  TopCourseRow,
} from "@/lib/dashboard/analytics-types";

export type { AnalyticsRangeKey };
export type {
  AdminAnalyticsDashboard,
  EducationMetric,
  OverviewKpi,
  RecentPaymentRow,
  StatusSlice,
  TimeSeriesPoint,
  TopCourseRow,
};
export { ANALYTICS_RANGE_OPTIONS, parseAnalyticsRange };
export { formatEgp, formatCount };

type QueryResult<T> = {
  availability: DataAvailability;
  message: string;
  data: T;
  generatedAt: string;
};

function setupResult<T>(data: T): QueryResult<T> {
  return {
    availability: "setup_required",
    message:
      "قاعدة البيانات غير جاهزة بعد. طبّق الهجرات وأكّد NEXT_PUBLIC_DB_SCHEMA_READY قبل عرض الإحصاءات.",
    data,
    generatedAt: new Date().toISOString(),
  };
}

function unavailableResult<T>(data: T, detail?: string): QueryResult<T> {
  return {
    availability: "unavailable",
    message: detail ?? "تعذر قراءة البيانات المحمية.",
    data,
    generatedAt: new Date().toISOString(),
  };
}

function emptyDashboard(range: AnalyticsRangeKey): AdminAnalyticsDashboard {
  const window = resolveAnalyticsWindow(range);
  const buckets = buildTimeBuckets(window.from, window.to, window.groupBy);
  const zeroSeries = buckets.map((key) => ({
    key,
    label: formatBucketLabel(key, window.groupBy),
    value: 0,
  }));

  return {
    range,
    rangeLabel: window.label,
    groupBy: window.groupBy,
    kpis: [
      {
        key: "revenue_all",
        label: "إجمالي الإيرادات المحصلة",
        value: null,
        display: "—",
        hint: "كل الوقت · مدفوعات معتمدة فقط",
        scope: "all_time",
      },
      {
        key: "revenue_period",
        label: "إيرادات الفترة المحددة",
        value: null,
        display: "—",
        hint: window.label,
        scope: "period",
      },
      {
        key: "students",
        label: "إجمالي الطلاب المسجلين",
        value: null,
        display: "—",
        hint: "الحالة الحالية · حسابات بدور طالب",
        scope: "current",
      },
      {
        key: "active_enrollments",
        label: "الاشتراكات النشطة",
        value: null,
        display: "—",
        hint: "الحالة الحالية",
        scope: "current",
        href: "/admin/students",
      },
      {
        key: "pending_payments",
        label: "طلبات الدفع قيد المراجعة",
        value: null,
        display: "—",
        hint: "الحالة الحالية",
        scope: "current",
        href: "/admin/payments",
      },
      {
        key: "published_courses",
        label: "الكورسات المنشورة",
        value: null,
        display: "—",
        hint: "الحالة الحالية",
        scope: "current",
        href: "/admin/courses",
      },
    ],
    revenueSeries: zeroSeries,
    enrollmentSeries: zeroSeries,
    paymentStatus: [
      { key: "pending", label: "قيد المراجعة", count: 0 },
      { key: "approved", label: "مقبول", count: 0 },
      { key: "rejected", label: "مرفوض", count: 0 },
    ],
    topCourses: [],
    education: [],
    recentPayments: [],
    limitations: [],
  };
}

function parseAmount(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function isMissingRelation(error: {
  message?: string;
  code?: string;
} | null): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    error.code === "42P01" ||
    error.code === "PGRST205"
  );
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function resolveCourseFromProduct(product: {
  product_type?: string | null;
  course_id?: string | null;
  courses?: { id?: string; title?: string } | { id?: string; title?: string }[] | null;
  course_semesters?:
    | {
        title?: string;
        course_id?: string | null;
        courses?: { id?: string; title?: string } | { id?: string; title?: string }[] | null;
      }
    | {
        title?: string;
        course_id?: string | null;
        courses?: { id?: string; title?: string } | { id?: string; title?: string }[] | null;
      }[]
    | null;
}): { courseId: string | null; title: string } {
  const courseDirect = unwrapRelation(product.courses);
  if (product.product_type === "full_course") {
    return {
      courseId: product.course_id ?? courseDirect?.id ?? null,
      title: courseDirect?.title ?? "كورس غير معروف",
    };
  }

  const semester = unwrapRelation(product.course_semesters);
  const courseNested = unwrapRelation(semester?.courses);
  return {
    courseId: semester?.course_id ?? courseNested?.id ?? null,
    title: courseNested?.title ?? "كورس غير معروف",
  };
}

function sumSeries(
  rows: Array<{ at: string; amount: number }>,
  buckets: string[],
  groupBy: "day" | "month",
): TimeSeriesPoint[] {
  const map = new Map(buckets.map((key) => [key, 0]));
  for (const row of rows) {
    const date = new Date(row.at);
    if (Number.isNaN(date.getTime())) continue;
    const key = toIsoDateKey(date, groupBy);
    if (!map.has(key)) {
      // بيانات خارج النافذة المعروضة (كل الوقت الأقدم من 12 شهرًا): نتجاهلها في الرسم فقط
      continue;
    }
    map.set(key, (map.get(key) ?? 0) + row.amount);
  }
  return buckets.map((key) => ({
    key,
    label: formatBucketLabel(key, groupBy),
    value: map.get(key) ?? 0,
  }));
}

function countSeries(
  timestamps: string[],
  buckets: string[],
  groupBy: "day" | "month",
): TimeSeriesPoint[] {
  return sumSeries(
    timestamps.map((at) => ({ at, amount: 1 })),
    buckets,
    groupBy,
  );
}

export async function getAdminAnalyticsDashboard(
  rangeInput?: string | string[],
): Promise<QueryResult<AdminAnalyticsDashboard>> {
  const range = parseAnalyticsRange(rangeInput);
  const empty = emptyDashboard(range);
  const readiness = getAuthReadiness();
  if (!readiness.dbSchemaReady) {
    return setupResult(empty);
  }

  const supabase = await createClient();
  if (!supabase) {
    return setupResult(empty);
  }

  const window = resolveAnalyticsWindow(range);
  const fromIso = window.from?.toISOString() ?? null;
  const toIso = window.to.toISOString();

  const productSelect =
    "id, product_type, course_id, semester_id, courses(id, title), course_semesters(title, course_id, courses(id, title))";

  const [
    studentsRes,
    publishedCoursesRes,
    activeEnrollmentsRes,
    pendingPaymentsRes,
    approvedAllRes,
    approvedPeriodRes,
    paymentsInPeriodRes,
    enrollmentsPeriodRes,
    recentPaymentsRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "student"),
    supabase
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("status", "published"),
    supabase
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("payment_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("payment_requests")
      .select("id, amount_egp, reviewed_at, product_id")
      .eq("status", "approved"),
    supabase
      .from("payment_requests")
      .select(`id, amount_egp, reviewed_at, product_id, products(${productSelect})`)
      .eq("status", "approved")
      .not("reviewed_at", "is", null)
      .gte("reviewed_at", fromIso ?? "1970-01-01T00:00:00.000Z")
      .lte("reviewed_at", toIso),
    supabase
      .from("payment_requests")
      .select("id, status, created_at")
      .gte("created_at", fromIso ?? "1970-01-01T00:00:00.000Z")
      .lte("created_at", toIso),
    supabase
      .from("enrollments")
      .select("id, created_at, starts_at")
      .eq("status", "active")
      .gte("created_at", fromIso ?? "1970-01-01T00:00:00.000Z")
      .lte("created_at", toIso),
    supabase
      .from("payment_requests")
      .select(
        `id, student_id, payment_method, amount_egp, status, created_at, products(${productSelect})`,
      )
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const coreFailures = [
    { key: "profiles", error: studentsRes.error },
    { key: "courses", error: publishedCoursesRes.error },
    { key: "enrollments", error: activeEnrollmentsRes.error },
    { key: "payment_requests", error: pendingPaymentsRes.error },
    { key: "payment_requests.approved", error: approvedAllRes.error },
  ].filter((item) => item.error);

  if (coreFailures.length > 0) {
    const primary = coreFailures[0]!;
    console.error("[admin-analytics-read-failed]", {
      targets: coreFailures.map((f) => ({
        key: f.key,
        code: f.error?.code,
        message: f.error?.message?.slice(0, 180),
      })),
    });
    return unavailableResult(
      empty,
      `تعذر قراءة بيانات لوحة التحليلات (المصدر: ${primary.key} · الرمز: ${primary.error?.code ?? "unknown"}).`,
    );
  }

  const limitations: string[] = [
    "لا يوجد جدول استرداد/عكس مدفوعات في المخطط الحالي؛ الإيرادات = مجموع amount_egp للطلبات ذات الحالة approved فقط.",
    "يُستخدم reviewed_at كختم اعتماد الدفع للإيرادات الزمنية، وليس created_at.",
  ];

  const approvedAll = approvedAllRes.data ?? [];
  const revenueAll = approvedAll.reduce(
    (sum, row) => sum + parseAmount(row.amount_egp),
    0,
  );

  const approvedPeriod = approvedPeriodRes.error
    ? []
    : (approvedPeriodRes.data ?? []);
  if (approvedPeriodRes.error) {
    console.error("[admin-analytics-period-revenue]", approvedPeriodRes.error);
  }

  const revenuePeriod = approvedPeriod.reduce(
    (sum, row) => sum + parseAmount(row.amount_egp),
    0,
  );

  // توسيع buckets لكل الوقت إن وُجدت اعتمادات أقدم من 12 شهرًا
  let buckets = buildTimeBuckets(window.from, window.to, window.groupBy);
  if (range === "all" && approvedAll.length > 0) {
    const earliest = approvedAll
      .map((row) => row.reviewed_at)
      .filter((v): v is string => Boolean(v))
      .sort()[0];
    if (earliest) {
      const earliestDate = new Date(earliest);
      const start = new Date(
        Date.UTC(earliestDate.getUTCFullYear(), earliestDate.getUTCMonth(), 1),
      );
      buckets = buildTimeBuckets(start, window.to, "month");
    }
  }

  const revenueSeries = sumSeries(
    approvedPeriod
      .filter((row) => row.reviewed_at)
      .map((row) => ({
        at: row.reviewed_at as string,
        amount: parseAmount(row.amount_egp),
      })),
    buckets,
    window.groupBy,
  );

  // لكل الوقت: استخدم كل الاعتمادات في الرسم
  const revenueSeriesFinal =
    range === "all"
      ? sumSeries(
          approvedAll
            .filter((row) => row.reviewed_at)
            .map((row) => ({
              at: row.reviewed_at as string,
              amount: parseAmount(row.amount_egp),
            })),
          buckets,
          "month",
        )
      : revenueSeries;

  let enrollmentTimestamps: string[] = enrollmentsPeriodRes.error
    ? []
    : (enrollmentsPeriodRes.data ?? []).map((row) => row.created_at);
  if (enrollmentsPeriodRes.error) {
    console.error("[admin-analytics-enrollments]", enrollmentsPeriodRes.error);
  }

  let enrollmentBuckets = buckets;
  if (range === "all") {
    const allActive = await supabase
      .from("enrollments")
      .select("id, created_at")
      .eq("status", "active");
    if (!allActive.error) {
      enrollmentTimestamps = (allActive.data ?? []).map((row) => row.created_at);
      const earliest = [...enrollmentTimestamps].sort()[0];
      if (earliest) {
        const earliestDate = new Date(earliest);
        const start = new Date(
          Date.UTC(
            earliestDate.getUTCFullYear(),
            earliestDate.getUTCMonth(),
            1,
          ),
        );
        enrollmentBuckets = buildTimeBuckets(start, window.to, "month");
      }
    }
  }

  const enrollmentSeries = countSeries(
    enrollmentTimestamps,
    enrollmentBuckets,
    window.groupBy,
  );

  const statusCounts: Record<"pending" | "approved" | "rejected", number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  if (range === "all") {
    const [p, a, r] = await Promise.all([
      supabase
        .from("payment_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("payment_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      supabase
        .from("payment_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "rejected"),
    ]);
    statusCounts.pending = p.count ?? 0;
    statusCounts.approved = a.count ?? 0;
    statusCounts.rejected = r.count ?? 0;
  } else if (!paymentsInPeriodRes.error) {
    for (const row of paymentsInPeriodRes.data ?? []) {
      const status = row.status as string;
      if (status === "pending" || status === "approved" || status === "rejected") {
        statusCounts[status] += 1;
      }
    }
  }

  const courseMap = new Map<
    string,
    { courseId: string; title: string; paidSubscriptions: number; revenueEgp: number }
  >();

  const topSource = range === "all" ? approvedAll : approvedPeriod;

  // عند كل الوقت نحتاج عناوين الكورسات — جلب منتجات مرتبطة
  const productsById = new Map<
    string,
    {
      product_type?: string | null;
      course_id?: string | null;
      courses?: { id?: string; title?: string } | { id?: string; title?: string }[] | null;
      course_semesters?:
        | {
            title?: string;
            course_id?: string | null;
            courses?: { id?: string; title?: string } | { id?: string; title?: string }[] | null;
          }
        | {
            title?: string;
            course_id?: string | null;
            courses?: { id?: string; title?: string } | { id?: string; title?: string }[] | null;
          }[]
        | null;
    }
  >();

  if (range === "all" && approvedAll.length > 0) {
    const productIds = [...new Set(approvedAll.map((r) => r.product_id))];
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select(productSelect)
      .in("id", productIds);
    if (productsError) {
      console.error("[admin-analytics-products]", productsError);
    } else {
      for (const p of products ?? []) {
        productsById.set(p.id, p);
      }
    }
  }

  for (const row of topSource) {
    const product =
      range === "all"
        ? productsById.get(row.product_id)
        : unwrapRelation(
            (
              row as {
                products?: unknown;
              }
            ).products as
              | {
                  product_type?: string | null;
                  course_id?: string | null;
                  courses?: { id?: string; title?: string } | { id?: string; title?: string }[] | null;
                  course_semesters?:
                    | {
                        title?: string;
                        course_id?: string | null;
                        courses?:
                          | { id?: string; title?: string }
                          | { id?: string; title?: string }[]
                          | null;
                      }
                    | {
                        title?: string;
                        course_id?: string | null;
                        courses?:
                          | { id?: string; title?: string }
                          | { id?: string; title?: string }[]
                          | null;
                      }[]
                    | null;
                }
              | {
                  product_type?: string | null;
                  course_id?: string | null;
                  courses?: { id?: string; title?: string } | { id?: string; title?: string }[] | null;
                  course_semesters?:
                    | {
                        title?: string;
                        course_id?: string | null;
                        courses?:
                          | { id?: string; title?: string }
                          | { id?: string; title?: string }[]
                          | null;
                      }
                    | {
                        title?: string;
                        course_id?: string | null;
                        courses?:
                          | { id?: string; title?: string }
                          | { id?: string; title?: string }[]
                          | null;
                      }[]
                    | null;
                }[]
              | null
              | undefined,
          );

    if (!product) continue;
    const resolved = resolveCourseFromProduct(product);
    if (!resolved.courseId) continue;
    const existing = courseMap.get(resolved.courseId) ?? {
      courseId: resolved.courseId,
      title: resolved.title,
      paidSubscriptions: 0,
      revenueEgp: 0,
    };
    existing.paidSubscriptions += 1;
    existing.revenueEgp += parseAmount(row.amount_egp);
    if (resolved.title && resolved.title !== "كورس غير معروف") {
      existing.title = resolved.title;
    }
    courseMap.set(resolved.courseId, existing);
  }

  const topCourses = [...courseMap.values()]
    .sort((a, b) => b.revenueEgp - a.revenueEgp || b.paidSubscriptions - a.paidSubscriptions)
    .slice(0, 8);

  // النشاط التعليمي — مع تجاهل لطيف للجداول غير المنشورة
  const education: EducationMetric[] = [];

  const examSubmitted = await supabase
    .from("exam_attempts")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted")
    .gte("submitted_at", fromIso ?? "1970-01-01T00:00:00.000Z")
    .lte("submitted_at", toIso);

  if (examSubmitted.error && isMissingRelation(examSubmitted.error)) {
    education.push({
      key: "exam_attempts",
      label: "محاولات الامتحان المكتملة",
      value: null,
      hint: "جدول الامتحانات غير متاح بعد",
      available: false,
      scope: "period",
    });
  } else if (examSubmitted.error) {
    education.push({
      key: "exam_attempts",
      label: "محاولات الامتحان المكتملة",
      value: null,
      hint: "تعذر القراءة",
      available: false,
      scope: "period",
    });
  } else {
    education.push({
      key: "exam_attempts",
      label: "محاولات الامتحان المكتملة",
      value: examSubmitted.count ?? 0,
      hint: `${window.label} · حالة submitted`,
      available: true,
      scope: "period",
    });
  }

  const homeworkSubmitted = await supabase
    .from("homework_attempts")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted")
    .gte("submitted_at", fromIso ?? "1970-01-01T00:00:00.000Z")
    .lte("submitted_at", toIso);

  if (homeworkSubmitted.error && isMissingRelation(homeworkSubmitted.error)) {
    education.push({
      key: "homework_attempts",
      label: "محاولات الواجبات المسلّمة",
      value: null,
      hint: "هجرة الواجبات غير مطبّقة بعد",
      available: false,
      scope: "period",
    });
    limitations.push(
      "إحصاءات الواجبات غير متاحة حتى تطبيق هجرات نظام الواجبات.",
    );
  } else if (homeworkSubmitted.error) {
    education.push({
      key: "homework_attempts",
      label: "محاولات الواجبات المسلّمة",
      value: null,
      hint: "تعذر القراءة",
      available: false,
      scope: "period",
    });
  } else {
    education.push({
      key: "homework_attempts",
      label: "محاولات الواجبات المسلّمة",
      value: homeworkSubmitted.count ?? 0,
      hint: window.label,
      available: true,
      scope: "period",
    });
  }

  const pendingEssayExam = await supabase
    .from("exam_attempts")
    .select("id", { count: "exact", head: true })
    .in("grading_status", ["awaiting_essay", "draft"]);

  const pendingEssayHomework = await supabase
    .from("homework_attempts")
    .select("id", { count: "exact", head: true })
    .in("grading_status", ["awaiting_essay", "draft"]);

  let pendingEssayTotal: number | null = 0;
  let pendingEssayAvailable = true;
  let pendingEssayHint = "الحالة الحالية · امتحانات وواجبات";

  if (pendingEssayExam.error && !isMissingRelation(pendingEssayExam.error)) {
    pendingEssayAvailable = false;
    pendingEssayTotal = null;
    pendingEssayHint = "تعذر قراءة تصحيح الامتحانات";
  } else if (!pendingEssayExam.error) {
    pendingEssayTotal = (pendingEssayTotal ?? 0) + (pendingEssayExam.count ?? 0);
  }

  if (pendingEssayHomework.error) {
    if (!isMissingRelation(pendingEssayHomework.error)) {
      pendingEssayAvailable = false;
      pendingEssayTotal = null;
      pendingEssayHint = "تعذر قراءة تصحيح الواجبات";
    } else {
      pendingEssayHint = "الحالة الحالية · امتحانات فقط (الواجبات غير مطبّقة)";
    }
  } else {
    pendingEssayTotal = (pendingEssayTotal ?? 0) + (pendingEssayHomework.count ?? 0);
  }

  education.push({
    key: "pending_essay",
    label: "تصحيح مقالي بانتظار المراجعة",
    value: pendingEssayTotal,
    hint: pendingEssayHint,
    available: pendingEssayAvailable,
    scope: "current",
  });

  education.push({
    key: "published_courses",
    label: "الكورسات المنشورة",
    value: publishedCoursesRes.count ?? 0,
    hint: "الحالة الحالية",
    available: true,
    scope: "current",
  });

  education.push({
    key: "active_students_enrolled",
    label: "طلاب لديهم اشتراك نشط",
    value: null,
    hint: "يُحسب من الاشتراكات النشطة دون تكرار",
    available: true,
    scope: "current",
  });

  const distinctActiveStudents = await supabase
    .from("enrollments")
    .select("student_id")
    .eq("status", "active");

  if (!distinctActiveStudents.error) {
    const unique = new Set(
      (distinctActiveStudents.data ?? []).map((r) => r.student_id),
    );
    const metric = education.find((m) => m.key === "active_students_enrolled");
    if (metric) {
      metric.value = unique.size;
      metric.hint = "الحالة الحالية · طلاب مميزون باشتراك نشط";
    }
  } else {
    const metric = education.find((m) => m.key === "active_students_enrolled");
    if (metric) {
      metric.available = false;
      metric.hint = "تعذر الحساب";
    }
  }

  const recentRows = recentPaymentsRes.error
    ? []
    : (recentPaymentsRes.data ?? []);
  const studentIds = [...new Set(recentRows.map((r) => r.student_id))];
  const studentNames = new Map<string, string>();
  if (studentIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", studentIds);
    for (const p of profiles ?? []) {
      studentNames.set(p.id, p.full_name ?? "طالب");
    }
  }

  const recentPayments: RecentPaymentRow[] = recentRows.map((row) => {
    const product = unwrapRelation(
      (
        row as {
          products?: Parameters<typeof resolveCourseFromProduct>[0] | Parameters<typeof resolveCourseFromProduct>[0][] | null;
        }
      ).products,
    );
    const course = product
      ? resolveCourseFromProduct(product)
      : { courseId: null, title: "كورس غير معروف" };
    return {
      id: row.id,
      studentName: studentNames.get(row.student_id) ?? "طالب",
      courseTitle: course.title,
      amountEgp: parseAmount(row.amount_egp),
      paymentMethod: row.payment_method,
      createdAt: row.created_at,
      status: row.status,
    };
  });

  const studentsCount = studentsRes.count ?? 0;
  const publishedCount = publishedCoursesRes.count ?? 0;
  const activeCount = activeEnrollmentsRes.count ?? 0;
  const pendingCount = pendingPaymentsRes.count ?? 0;

  const dashboard: AdminAnalyticsDashboard = {
    range,
    rangeLabel: window.label,
    groupBy: window.groupBy,
    kpis: [
      {
        key: "revenue_all",
        label: "إجمالي الإيرادات المحصلة",
        value: revenueAll,
        display: formatEgp(revenueAll),
        hint: "كل الوقت · مدفوعات معتمدة فقط · amount_egp التاريخي",
        scope: "all_time",
      },
      {
        key: "revenue_period",
        label: "إيرادات الفترة المحددة",
        value: revenuePeriod,
        display: formatEgp(revenuePeriod),
        hint: `${window.label} · حسب تاريخ الاعتماد`,
        scope: "period",
      },
      {
        key: "students",
        label: "إجمالي الطلاب المسجلين",
        value: studentsCount,
        display: formatCount(studentsCount),
        hint: "الحالة الحالية · حسابات بدور طالب",
        scope: "current",
        href: "/admin/students",
      },
      {
        key: "active_enrollments",
        label: "الاشتراكات النشطة",
        value: activeCount,
        display: formatCount(activeCount),
        hint: "الحالة الحالية",
        scope: "current",
        href: "/admin/students",
      },
      {
        key: "pending_payments",
        label: "طلبات الدفع قيد المراجعة",
        value: pendingCount,
        display: formatCount(pendingCount),
        hint: "الحالة الحالية · ليست إيرادًا",
        scope: "current",
        href: "/admin/payments",
      },
      {
        key: "published_courses",
        label: "الكورسات المنشورة",
        value: publishedCount,
        display: formatCount(publishedCount),
        hint: "الحالة الحالية",
        scope: "current",
        href: "/admin/courses",
      },
    ],
    revenueSeries: revenueSeriesFinal,
    enrollmentSeries,
    paymentStatus: [
      {
        key: "pending",
        label: "قيد المراجعة",
        count: statusCounts.pending,
      },
      {
        key: "approved",
        label: "مقبول",
        count: statusCounts.approved,
      },
      {
        key: "rejected",
        label: "مرفوض",
        count: statusCounts.rejected,
      },
    ],
    topCourses,
    education,
    recentPayments,
    limitations,
  };

  return {
    availability: "ready",
    message: "تم جلب تحليلات لوحة المالك من قاعدة البيانات.",
    data: dashboard,
    generatedAt: new Date().toISOString(),
  };
}

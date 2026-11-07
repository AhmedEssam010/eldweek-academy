import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PaymentStatusBadge } from "@/components/dashboard/PaymentBadges";
import { getAdminOverviewMetrics } from "@/lib/dashboard/data";
import { listPaymentRequests } from "@/lib/dashboard/students-data";

export const metadata = {
  title: "لوحة المالك | المهندس أحمد الدويك",
};

export const instant = false;

const metricHrefs: Record<string, string> = {
  students: "/admin/students",
  courses: "/admin/courses",
  active_enrollments: "/admin/students",
  pending_payments: "/admin/payments",
};

const shortcuts = [
  { href: "/admin/courses", title: "الكورسات", text: "المسودات والنشر والأسعار." },
  { href: "/admin/students", title: "الطلاب", text: "الحسابات والتسجيلات النشطة." },
  { href: "/admin/payments", title: "طلبات الدفع", text: "المراجعة والاعتماد اليدوي." },
  { href: "/admin/exams", title: "الامتحانات", text: "امتحانات كل كورس من مكان واحد." },
];

export default async function AdminHomePage() {
  const [overview, payments] = await Promise.all([
    getAdminOverviewMetrics(),
    listPaymentRequests({ status: "pending" }),
  ]);
  const recent = payments.data.slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="نظرة عامة"
        description="أرقام حقيقية من قاعدة البيانات. النشر والاعتماد يتمان يدويًا من صفحاتهما."
        actions={
          <Link
            href="/admin/courses/new"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-secondary"
          >
            مسودة كورس
          </Link>
        }
      />

      {overview.availability === "setup_required" ||
      overview.availability === "unavailable" ? (
        <SetupRequiredPanel message={overview.message} />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.data.map((metric) => (
          <StatCard
            key={metric.key}
            label={metric.label}
            value={metric.value}
            hint={metric.hint}
            href={metricHrefs[metric.key]}
          />
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {shortcuts.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl border border-white/10 bg-surface p-4 transition hover:border-primary/40"
          >
            <h2 className="text-base font-semibold text-white">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">{item.text}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-white">أحدث طلبات الدفع</h3>
          <Link href="/admin/payments" className="text-sm text-light-purple hover:underline">
            كل الطلبات
          </Link>
        </div>

        {payments.availability === "setup_required" ||
        payments.availability === "unavailable" ? (
          <div className="mt-4">
            <SetupRequiredPanel message={payments.message} />
          </div>
        ) : recent.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="لا توجد طلبات معلّقة"
              description="عندما يرسل طالب طلب شراء يظهر هنا للمراجعة. الاعتماد ينشئ التسجيل ولا يتم تلقائيًا."
              action={
                <Link
                  href="/admin/payments"
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white"
                >
                  فتح طلبات الدفع
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {recent.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {payment.studentName || "طالب"} · {payment.targetTitle}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    <span dir="ltr">{payment.amountEgp} ج.م</span>
                    {" · "}
                    {new Date(payment.createdAt).toLocaleDateString("ar-EG")}
                  </p>
                </div>
                <PaymentStatusBadge status={payment.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import {
  PaymentMethodLabel,
  PaymentStatusBadge,
} from "@/components/dashboard/PaymentBadges";
import { formatEgp } from "@/lib/dashboard/analytics-format";
import type { RecentPaymentRow } from "@/lib/dashboard/analytics-types";

export function RecentPaymentsPanel({ rows }: { rows: RecentPaymentRow[] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-white">
          أحدث طلبات الاشتراك
        </h3>
        <Link
          href="/admin/payments"
          className="text-sm text-light-purple hover:underline"
        >
          عرض جميع الطلبات
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 flex h-32 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 text-sm text-white/50">
          لا توجد طلبات اشتراك بعد
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-right text-white/45">
                <th className="px-3 py-2 font-medium">الطالب</th>
                <th className="px-3 py-2 font-medium">الكورس</th>
                <th className="px-3 py-2 font-medium">المبلغ</th>
                <th className="px-3 py-2 font-medium">الوسيلة</th>
                <th className="px-3 py-2 font-medium">التاريخ</th>
                <th className="px-3 py-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="px-3 py-3 text-white">{row.studentName}</td>
                  <td className="px-3 py-3 text-white/80">{row.courseTitle}</td>
                  <td className="px-3 py-3 text-white" dir="ltr">
                    {formatEgp(row.amountEgp)}
                  </td>
                  <td className="px-3 py-3">
                    <PaymentMethodLabel method={row.paymentMethod} />
                  </td>
                  <td className="px-3 py-3 text-white/60">
                    {new Date(row.createdAt).toLocaleDateString("ar-EG")}
                  </td>
                  <td className="px-3 py-3">
                    <PaymentStatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

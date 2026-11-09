import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PaymentStatusBadge, PaymentMethodLabel } from "@/components/dashboard/PaymentBadges";
import { PaymentReviewActions } from "@/components/dashboard/PaymentReviewActions";
import { PaymentReceiptViewer } from "@/components/dashboard/PaymentReceiptViewer";
import { listPaymentRequests } from "@/lib/dashboard/students-data";
import {
  approvePaymentRequestAction,
  rejectPaymentRequestAction,
} from "@/lib/dashboard/payment-actions";

export const metadata = {
  title: "طلبات الدفع | المهندس أحمد الدويك",
};

export const instant = false;

type PageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default async function AdminPaymentsPage({ searchParams }: PageProps) {
  const { status: filterStatus } = await searchParams;
  const statusFilter =
    filterStatus === "approved" || filterStatus === "rejected"
      ? filterStatus
      : filterStatus === "all"
        ? "all"
        : "pending";

  const payments = await listPaymentRequests({ status: statusFilter as "pending" | "approved" | "rejected" | "all" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلبات الدفع"
        description="مراجعة واعتماد أو رفض طلبات الدفع اليدوي. الاعتماد ينشئ التسجيل تلقائيًا."
      />

      <nav className="flex gap-2 text-sm">
        {(
          [
            ["pending", "معلّقة"],
            ["approved", "معتمدة"],
            ["rejected", "مرفوضة"],
            ["all", "الكل"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={`/admin/payments?status=${value}`}
            className={`rounded-xl border px-3 py-2 transition ${
              statusFilter === value
                ? "border-primary bg-primary/20 text-white"
                : "border-white/15 text-white/60 hover:text-white"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {payments.availability === "setup_required" ||
      payments.availability === "unavailable" ? (
        <SetupRequiredPanel message={payments.message} />
      ) : null}

      {payments.data.length === 0 ? (
        <EmptyState
          title="لا توجد طلبات دفع"
          description={
            statusFilter === "pending"
              ? "لا توجد طلبات معلّقة تحتاج مراجعة."
              : "لا توجد طلبات دفع بهذا الفلتر."
          }
        />
      ) : (
        <div className="space-y-4">
          {payments.data.map((payment) => (
            <div
              key={payment.id}
              className="rounded-2xl border border-white/10 bg-surface p-5"
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/students/${payment.studentId}`}
                      className="font-semibold text-light-purple hover:underline"
                    >
                      {payment.studentName || "طالب"}
                    </Link>
                    <PaymentStatusBadge status={payment.status} />
                  </div>
                  <p className="text-sm text-white/80">
                    <span className="text-white/50">المنتج:</span>{" "}
                    {payment.targetTitle}
                    <span className="mr-2 text-xs text-white/45">
                      ({payment.productType === "full_course" ? "كورس كامل" : "ترم"})
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm text-white/70">
                    <span>
                      <span className="text-white/45">المبلغ:</span>{" "}
                      <span className="font-mono" dir="ltr">
                        {payment.amountEgp} ج.م
                      </span>
                    </span>
                    <span>
                      <span className="text-white/45">الطريقة:</span>{" "}
                      <PaymentMethodLabel method={payment.paymentMethod} />
                    </span>
                    <span>
                      <span className="text-white/45">هاتف المرسل:</span>{" "}
                      <span className="font-mono" dir="ltr">
                        {payment.senderPhone}
                      </span>
                    </span>
                  </div>
                  <div className="pt-1">
                    <PaymentReceiptViewer
                      paymentRequestId={payment.id}
                      receiptPath={payment.receiptPath}
                    />
                  </div>
                  {payment.rejectionReason ? (
                    <p className="text-sm text-red-300">
                      سبب الرفض: {payment.rejectionReason}
                    </p>
                  ) : null}
                  <p className="text-xs text-white/40">
                    {new Date(payment.createdAt).toLocaleString("ar-EG")}
                  </p>
                </div>

                {payment.status === "pending" ? (
                  <PaymentReviewActions
                    paymentRequestId={payment.id}
                    approveAction={approvePaymentRequestAction.bind(
                      null,
                      payment.id,
                    )}
                    rejectAction={rejectPaymentRequestAction}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

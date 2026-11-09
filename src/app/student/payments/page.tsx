import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  PaymentStatusBadge,
  PaymentMethodLabel,
} from "@/components/dashboard/PaymentBadges";
import { requireStudent } from "@/lib/auth/guards";
import { listStudentPayments } from "@/lib/learning/purchase-data";

export const metadata = {
  title: "طلبات الدفع | المهندس أحمد الدويك",
};

export const instant = false;

export default async function StudentPaymentsPage() {
  const user = await requireStudent();
  const payments = await listStudentPayments(user.userId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلبات الدفع"
        description="حالة طلبات الشراء والمدفوعات اليدوية الخاصة بك."
      />

      {payments.availability === "setup_required" ||
      payments.availability === "unavailable" ? (
        <SetupRequiredPanel message={payments.message} />
      ) : null}

      {payments.data.length === 0 ? (
        <EmptyState
          title="لا توجد طلبات دفع"
          description="لم ترسل أي طلب شراء بعد. تصفّح الكورسات المنشورة وأرسل طلب شراء."
        />
      ) : (
        <div className="space-y-3">
          {payments.data.map((payment) => (
            <div
              key={payment.id}
              className="rounded-2xl border border-white/10 bg-surface p-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-white">
                  {payment.targetTitle}
                </span>
                <span className="text-xs text-white/45">
                  {payment.productType === "full_course" ? "كورس كامل" : "ترم"}
                </span>
                <PaymentStatusBadge status={payment.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-white/70">
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
                <span className="text-xs text-white/40">
                  {new Date(payment.createdAt).toLocaleDateString("ar-EG")}
                </span>
              </div>
              {payment.status === "pending" ? (
                <p className="mt-2 text-xs text-amber-200/70">
                  طلب الاشتراك قيد المراجعة
                </p>
              ) : null}
              {payment.rejectionReason ? (
                <p className="mt-2 text-xs text-red-300">
                  سبب الرفض: {payment.rejectionReason}
                </p>
              ) : null}
              {payment.status === "approved" ? (
                <p className="mt-2 text-xs text-emerald-300">
                  تم اعتماد الدفع وتفعيل الاشتراك.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

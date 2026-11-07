import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ActiveStatusBadge } from "@/components/dashboard/StatusBadge";
import { PaymentStatusBadge, EnrollmentStatusBadge } from "@/components/dashboard/PaymentBadges";
import { getStudentDetail } from "@/lib/dashboard/students-data";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminStudentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const detail = await getStudentDetail(id);

  if (detail.availability === "empty" || !detail.data) {
    notFound();
  }

  if (
    detail.availability === "setup_required" ||
    detail.availability === "unavailable"
  ) {
    return <SetupRequiredPanel message={detail.message} />;
  }

  const student = detail.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={student.fullName || "طالب"}
        description="تفاصيل الطالب وتسجيلاته وطلبات الدفع"
        actions={
          <Link
            href="/admin/students"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            جميع الطلاب
          </Link>
        }
      />

      <section className="rounded-2xl border border-white/10 bg-surface p-5">
        <h3 className="text-base font-semibold text-white">معلومات الحساب</h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-white/50">الهاتف</dt>
            <dd className="mt-1 font-mono text-white/80" dir="ltr">
              {student.phoneNumber || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-white/50">الحالة</dt>
            <dd className="mt-1">
              <ActiveStatusBadge active={student.isActive} />
            </dd>
          </div>
          <div>
            <dt className="text-white/50">تاريخ التسجيل</dt>
            <dd className="mt-1 text-white/80">
              {new Date(student.createdAt).toLocaleDateString("ar-EG", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-white/10 bg-surface p-5">
        <h3 className="text-base font-semibold text-white">
          التسجيلات ({student.enrollments.length})
        </h3>
        {student.enrollments.length === 0 ? (
          <EmptyState
            title="لا توجد تسجيلات"
            description="لم يُعتمد أي اشتراك لهذا الطالب بعد."
          />
        ) : (
          <div className="mt-4 space-y-3">
            {student.enrollments.map((enrollment) => (
              <div
                key={enrollment.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-sm"
              >
                <span className="font-medium text-white">
                  {enrollment.targetTitle}
                </span>
                <span className="text-xs text-white/45">
                  {enrollment.productType === "full_course"
                    ? "كورس كامل"
                    : "ترم"}
                </span>
                <EnrollmentStatusBadge status={enrollment.status} />
                <span className="text-xs text-white/40">
                  من{" "}
                  {new Date(enrollment.startsAt).toLocaleDateString("ar-EG")}
                  {enrollment.expiresAt
                    ? ` حتى ${new Date(enrollment.expiresAt).toLocaleDateString("ar-EG")}`
                    : " — غير محدد المدة"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-surface p-5">
        <h3 className="text-base font-semibold text-white">
          طلبات الدفع ({student.paymentRequests.length})
        </h3>
        {student.paymentRequests.length === 0 ? (
          <EmptyState
            title="لا توجد طلبات دفع"
            description="لم يرسل هذا الطالب أي طلب دفع."
          />
        ) : (
          <div className="mt-4 space-y-3">
            {student.paymentRequests.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-sm"
              >
                <span className="font-medium text-white">
                  {payment.targetTitle}
                </span>
                <span className="text-xs text-white/45">
                  {payment.paymentMethod === "vodafone_cash"
                    ? "فودافون كاش"
                    : "إنستاباي"}
                </span>
                <span className="font-mono text-xs text-white/70" dir="ltr">
                  {payment.amountEgp} ج.م
                </span>
                <PaymentStatusBadge status={payment.status} />
                {payment.rejectionReason ? (
                  <span className="text-xs text-red-300">
                    سبب الرفض: {payment.rejectionReason}
                  </span>
                ) : null}
                <span className="text-xs text-white/40">
                  {new Date(payment.createdAt).toLocaleDateString("ar-EG")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

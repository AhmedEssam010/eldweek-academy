const paymentStatusStyles: Record<string, string> = {
  pending: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  approved: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  rejected: "border-red-400/30 bg-red-400/10 text-red-100",
};

const paymentStatusLabels: Record<string, string> = {
  pending: "معلّق",
  approved: "معتمد",
  rejected: "مرفوض",
};

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${paymentStatusStyles[status] ?? "border-white/15 bg-white/5 text-white/60"}`}
    >
      {paymentStatusLabels[status] ?? status}
    </span>
  );
}

const enrollmentStatusStyles: Record<string, string> = {
  active: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  expired: "border-white/10 bg-black/20 text-white/50",
  suspended: "border-red-400/30 bg-red-400/10 text-red-100",
};

const enrollmentStatusLabels: Record<string, string> = {
  active: "نشط",
  expired: "منتهٍ",
  suspended: "موقوف",
};

export function EnrollmentStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${enrollmentStatusStyles[status] ?? "border-white/15 bg-white/5 text-white/60"}`}
    >
      {enrollmentStatusLabels[status] ?? status}
    </span>
  );
}

export function PaymentMethodLabel({ method }: { method: string }) {
  return (
    <span className="text-xs text-white/70">
      {method === "vodafone_cash" ? "فودافون كاش" : method === "instapay" ? "إنستاباي" : method}
    </span>
  );
}

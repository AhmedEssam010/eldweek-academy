"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CourseFormActionResult } from "@/lib/dashboard/types";

type PaymentReviewActionsProps = {
  paymentRequestId: string;
  approveAction: () => Promise<CourseFormActionResult>;
  rejectAction: (
    paymentRequestId: string,
    reason: string,
  ) => Promise<CourseFormActionResult>;
};

export function PaymentReviewActions({
  paymentRequestId,
  approveAction,
  rejectAction,
}: PaymentReviewActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function handleApprove() {
    setPending(true);
    const result = await approveAction();
    setPending(false);
    setMessage(result.message);
    setOk(result.ok);
    if (result.ok) router.refresh();
  }

  async function handleReject() {
    if (!reason.trim()) {
      setMessage("يجب إدخال سبب الرفض.");
      setOk(false);
      return;
    }
    setPending(true);
    const result = await rejectAction(paymentRequestId, reason.trim());
    setPending(false);
    setMessage(result.message);
    setOk(result.ok);
    if (result.ok) {
      setShowReject(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={handleApprove}
          className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
        >
          {pending ? "جارٍ..." : "اعتماد"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setShowReject(!showReject)}
          className="rounded-xl bg-red-800 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          رفض
        </button>
      </div>
      {showReject ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="سبب الرفض..."
            className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white placeholder:text-white/40"
          />
          <button
            type="button"
            disabled={pending || !reason.trim()}
            onClick={handleReject}
            className="rounded-lg bg-red-700 px-3 py-1.5 text-xs text-white hover:bg-red-600 disabled:opacity-60"
          >
            تأكيد الرفض
          </button>
        </div>
      ) : null}
      {message ? (
        <p
          className={`text-xs ${ok ? "text-emerald-300" : "text-red-300"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

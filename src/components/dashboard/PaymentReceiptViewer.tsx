"use client";

import { useState, useTransition } from "react";
import { getPaymentReceiptSignedUrlAction } from "@/lib/learning/purchase-actions";
import { isStoredReceiptImagePath } from "@/lib/learning/payment-receipts";

type PaymentReceiptViewerProps = {
  paymentRequestId: string;
  receiptPath: string;
};

export function PaymentReceiptViewer({
  paymentRequestId,
  receiptPath,
}: PaymentReceiptViewerProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pending, startTransition] = useTransition();

  const isImage = isStoredReceiptImagePath(receiptPath);

  if (!isImage) {
    return (
      <p className="text-sm text-white/60">
        <span className="text-white/45">مرجع التحويل (قديم):</span> {receiptPath}
      </p>
    );
  }

  function openReceipt() {
    setError(null);
    setOpen(true);
    setZoom(1);
    startTransition(async () => {
      const result = await getPaymentReceiptSignedUrlAction(paymentRequestId);
      if (!result.ok) {
        setUrl(null);
        setError(result.message);
        return;
      }
      setUrl(result.url);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openReceipt}
        className="rounded-xl border border-secondary/40 bg-secondary/10 px-3 py-2 text-xs font-medium text-white transition hover:bg-secondary/20"
      >
        عرض صورة التحويل
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="معاينة صورة التحويل"
        >
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-surface shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <h3 className="text-sm font-semibold text-white">صورة إثبات التحويل</h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!url || pending}
                  onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
                  className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/80 disabled:opacity-40"
                >
                  تكبير
                </button>
                <button
                  type="button"
                  disabled={!url || pending}
                  onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
                  className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/80 disabled:opacity-40"
                >
                  تصغير
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setUrl(null);
                    setError(null);
                    setZoom(1);
                  }}
                  className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/80"
                >
                  إغلاق
                </button>
              </div>
            </div>

            <div className="min-h-[240px] flex-1 overflow-auto bg-black/50 p-4">
              {pending && !url ? (
                <p className="py-16 text-center text-sm text-white/70">
                  جارٍ تجهيز الرابط الآمن…
                </p>
              ) : error ? (
                <p className="py-16 text-center text-sm text-red-200">{error}</p>
              ) : url ? (
                <div className="flex min-h-full items-start justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="صورة إثبات التحويل"
                    style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
                    className="max-w-full transition-transform duration-150"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

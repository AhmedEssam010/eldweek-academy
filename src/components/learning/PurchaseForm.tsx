"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { submitPurchaseRequestAction } from "@/lib/learning/purchase-actions";
import {
  PAYMENT_RECEIPT_MAX_BYTES,
  isAllowedReceiptMime,
} from "@/lib/learning/payment-receipts";

type ProductOption = {
  productId: string;
  productType: string;
  priceEgp: string;
  label: string;
};

type PurchaseFormProps = {
  products: ProductOption[];
};

export function PurchaseForm({ products }: PurchaseFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(
    products[0]?.productId ?? "",
  );
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const selected = products.find((p) => p.productId === selectedProduct);
  const previewUrl = useMemo(() => {
    if (!receiptFile) return null;
    return URL.createObjectURL(receiptFile);
  }, [receiptFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleReceiptChange(fileList: FileList | null) {
    setLocalError(null);
    setMessage(null);
    const file = fileList?.[0] ?? null;
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (!isAllowedReceiptMime(file.type)) {
      setReceiptFile(null);
      setLocalError("الصيغ المسموحة: JPG أو JPEG أو PNG أو WebP.");
      return;
    }
    if (file.size > PAYMENT_RECEIPT_MAX_BYTES) {
      setReceiptFile(null);
      setLocalError("حجم الصورة يجب ألا يتجاوز 5 ميجابايت.");
      return;
    }
    setReceiptFile(file);
  }

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <h3 className="text-base font-semibold text-white">طلب شراء الكورس</h3>
      <p className="mt-1 text-sm text-white/60">
        شراء الكورس يفتح كل أقسامه ودروسه وامتحاناته المنشورة. أرفق صورة إثبات
        التحويل ليراجعها المالك يدويًا.
      </p>

      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setLocalError(null);
          setMessage(null);

          if (!receiptFile) {
            setOk(false);
            setLocalError("صورة إثبات التحويل مطلوبة.");
            return;
          }
          if (pending) return;

          const form = event.currentTarget;
          const formData = new FormData(form);
          formData.set("receiptImage", receiptFile);

          startTransition(async () => {
            const result = await submitPurchaseRequestAction(formData);
            setOk(result.ok);
            setMessage(result.message);
            if (result.ok) {
              setReceiptFile(null);
              router.refresh();
            }
          });
        }}
      >
        <div>
          <label className="block text-sm font-medium text-white/80">
            المنتج
          </label>
          <select
            name="productId"
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
          >
            {products.map((p) => (
              <option key={p.productId} value={p.productId}>
                {p.label} — {p.priceEgp} ج.م
              </option>
            ))}
          </select>
        </div>

        {selected ? (
          <p className="rounded-xl border border-white/10 bg-white/3 p-3 text-sm">
            <span className="text-white/50">السعر:</span>{" "}
            <span className="font-mono font-semibold text-white" dir="ltr">
              {selected.priceEgp} ج.م
            </span>
          </p>
        ) : null}

        <div>
          <label className="block text-sm font-medium text-white/80">
            طريقة الدفع
          </label>
          <select
            name="paymentMethod"
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
          >
            <option value="vodafone_cash">فودافون كاش</option>
            <option value="instapay">إنستاباي</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="senderPhone"
            className="block text-sm font-medium text-white/80"
          >
            رقم الموبايل المحوّل منه
          </label>
          <input
            id="senderPhone"
            type="tel"
            name="senderPhone"
            inputMode="tel"
            autoComplete="tel"
            placeholder="010xxxxxxxx"
            dir="ltr"
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/40"
            required
          />
          <p className="mt-1 text-xs text-white/40">
            يُقبل 010 / 011 / 012 / 015 ويُحوَّل تلقائيًا إلى الصيغة الدولية.
          </p>
        </div>

        <div>
          <label
            htmlFor="receiptImage"
            className="block text-sm font-medium text-white/80"
          >
            صورة إثبات التحويل
          </label>
          <input
            id="receiptImage"
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            disabled={pending}
            className="mt-1 block w-full text-sm text-white/70 file:me-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-white disabled:opacity-60"
            onChange={(event) => handleReceiptChange(event.target.files)}
          />
          <p className="mt-1 text-xs text-white/40">
            JPG أو PNG أو WebP · حد أقصى 5 ميجابايت · مطلوبة
          </p>

          {previewUrl ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-background/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="معاينة صورة التحويل"
                className="max-h-64 w-full object-contain bg-black/40"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
                <p className="truncate text-xs text-white/55" dir="ltr">
                  {receiptFile?.name}
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setReceiptFile(null);
                    setLocalError(null);
                  }}
                  className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/80 hover:bg-white/5 disabled:opacity-60"
                >
                  استبدال الصورة
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending || !receiptFile}
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-secondary disabled:opacity-60"
        >
          {pending
            ? "جارٍ رفع صورة التحويل وإرسال الطلب..."
            : "إرسال طلب الاشتراك"}
        </button>

        {localError ? (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs leading-6 text-red-200">
            {localError}
          </p>
        ) : null}

        {message ? (
          <p
            className={`rounded-xl border px-3 py-2 text-xs leading-6 ${
              ok
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : "border-red-400/30 bg-red-500/10 text-red-200"
            }`}
          >
            {message}
          </p>
        ) : null}
      </form>
    </div>
  );
}

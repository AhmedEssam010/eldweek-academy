"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitPurchaseRequestAction } from "@/lib/learning/purchase-actions";

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

  const selected = products.find((p) => p.productId === selectedProduct);

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <h3 className="text-base font-semibold text-white">طلب شراء الكورس</h3>
      <p className="mt-1 text-sm text-white/60">
        شراء الكورس يفتح كل أقسامه ودروسه وامتحاناته المنشورة. لا يوجد شراء
        إضافي داخل الكورس. التحقق يدوي من المالك.
      </p>

      <form
        className="mt-4 space-y-4"
        action={(formData) => {
          startTransition(async () => {
            const result = await submitPurchaseRequestAction(formData);
            setOk(result.ok);
            setMessage(result.message);
            if (result.ok) router.refresh();
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
          <label className="block text-sm font-medium text-white/80">
            رقم هاتف المرسل (بالصيغة الدولية)
          </label>
          <input
            type="tel"
            name="senderPhone"
            placeholder="+2010xxxxxxxx"
            dir="ltr"
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/40"
            required
          />
          <p className="mt-1 text-xs text-white/40">
            اكتب الرقم بالصيغة الدولية، مثل +20 ثم رقم الموبايل.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80">
            مرجع التحويل (رقم العملية)
          </label>
          <input
            type="text"
            name="transactionRef"
            placeholder="رقم العملية أو مرجع التحويل"
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/40"
            required
            minLength={3}
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-secondary disabled:opacity-60"
        >
          {pending ? "جارٍ الإرسال..." : "إرسال طلب الشراء"}
        </button>

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

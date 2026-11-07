"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CourseFormActionResult } from "@/lib/dashboard/types";

type ProductView = {
  id: string;
  productType: string;
  targetId: string;
  targetTitle: string;
  priceEgp: string;
  isActive: boolean;
  updatedAt: string;
};

type CoursePricingProps = {
  courseId: string;
  fullCourse: ProductView | null;
  /** لم يعد يُستخدم للبيع؛ الأقسام تنظيمية فقط. */
  semesters?: ProductView[];
  upsertAction: (formData: FormData) => Promise<CourseFormActionResult>;
  toggleAction: (
    productId: string,
    isActive: boolean,
    courseId: string,
  ) => Promise<CourseFormActionResult>;
};

function ProductRow({
  product,
  courseId,
  upsertAction,
  toggleAction,
}: {
  product: ProductView;
  courseId: string;
  upsertAction: (formData: FormData) => Promise<CourseFormActionResult>;
  toggleAction: (
    productId: string,
    isActive: boolean,
    courseId: string,
  ) => Promise<CourseFormActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [price, setPrice] = useState(product.priceEgp || "");

  const exists = product.id !== "";

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await upsertAction(formData);
      setOk(result.ok);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  function handleToggle() {
    if (!exists) return;
    startTransition(async () => {
      const result = await toggleAction(
        product.id,
        !product.isActive,
        courseId,
      );
      setOk(result.ok);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-white">{product.targetTitle}</span>
        <span className="text-xs text-white/45">
          {product.productType === "full_course" ? "كورس كامل" : "ترم"}
        </span>
        {exists ? (
          <span
            className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
              product.isActive
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                : "border-white/10 bg-black/20 text-white/50"
            }`}
          >
            {product.isActive ? "نشط" : "معطّل"}
          </span>
        ) : (
          <span className="text-xs text-white/40">لم يُضبط بعد</span>
        )}
      </div>

      <form action={handleSubmit} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="productType" value={product.productType} />
        <input type="hidden" name="courseId" value={courseId} />
        {product.productType === "semester" ? (
          <input type="hidden" name="semesterId" value={product.targetId} />
        ) : null}
        <input type="hidden" name="isActive" value={exists ? String(product.isActive) : "true"} />

        <div className="flex-1">
          <label className="block text-xs text-white/60">السعر (ج.م)</label>
          <input
            type="number"
            name="priceEgp"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            dir="ltr"
            className="mt-1 w-full rounded-lg border border-white/15 bg-background/40 px-3 py-2 text-sm text-white outline-none focus:border-secondary"
            required
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-secondary disabled:opacity-60"
        >
          {pending ? "جارٍ..." : exists ? "تحديث السعر" : "ضبط السعر"}
        </button>

        {exists ? (
          <button
            type="button"
            disabled={pending}
            onClick={handleToggle}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition disabled:opacity-60 ${
              product.isActive
                ? "border-red-400/30 text-red-200 hover:bg-red-500/10"
                : "border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/10"
            }`}
          >
            {product.isActive ? "تعطيل" : "تفعيل"}
          </button>
        ) : null}
      </form>

      {message ? (
        <p
          className={`mt-2 text-xs ${ok ? "text-emerald-300" : "text-red-300"}`}
        >
          {message}
        </p>
      ) : null}

      {exists && product.updatedAt ? (
        <p className="mt-1 text-xs text-white/30">
          آخر تحديث:{" "}
          {new Date(product.updatedAt).toLocaleString("ar-EG")}
        </p>
      ) : null}
    </div>
  );
}

export function CoursePricing({
  courseId,
  fullCourse,
  upsertAction,
  toggleAction,
}: CoursePricingProps) {
  const fullCourseView: ProductView = fullCourse ?? {
    id: "",
    productType: "full_course",
    targetId: courseId,
    targetTitle: "سعر الكورس كامل",
    priceEgp: "",
    isActive: false,
    updatedAt: "",
  };

  return (
    <section id="prices" className="rounded-2xl border border-white/10 bg-surface p-5">
      <h3 className="text-base font-semibold text-white">سعر الكورس</h3>
      <p className="mt-1 text-sm text-white/60">
        الطالب يشتري الكورس مرة واحدة ويحصل على كل الأقسام والدروس والامتحانات
        المنشورة داخلها. لا يوجد شراء لأقسام منفصلة. التحقق من الدفع يدوي.
      </p>

      <div className="mt-4 space-y-3">
        <ProductRow
          product={fullCourseView}
          courseId={courseId}
          upsertAction={upsertAction}
          toggleAction={toggleAction}
        />
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getCourseMaterialDownloadUrlAction,
  getCourseMaterialViewUrlAction,
} from "@/lib/learning/material-actions";

type InlinePdfViewerProps = {
  materialId: string | null;
  title?: string | null;
  description?: string | null;
  previewMode?: boolean;
  lockedMessage?: string | null;
};

export function InlinePdfViewer({
  materialId,
  title,
  description,
  previewMode = false,
  lockedMessage = null,
}: InlinePdfViewerProps) {
  if (!materialId) return null;

  if (previewMode) {
    return (
      <div className="overflow-hidden rounded-3xl border border-amber-400/25 bg-surface">
        <div className="flex min-h-[22rem] items-center justify-center bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.18),#0b0913_70%)] p-6 text-center">
          <div className="max-w-md space-y-2">
            <p className="text-sm font-semibold text-amber-50">
              معاينة فقط — بدون رابط PDF موقّع
            </p>
            <p className="text-sm leading-7 text-amber-50/80">
              فتح الملف المحمي متاح للطالب المشترك بعد التحقق من الاشتراك على
              الخادم.
            </p>
          </div>
        </div>
        <div className="border-t border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">
            {title ?? "ملف PDF"}
          </h2>
        </div>
      </div>
    );
  }

  if (lockedMessage) {
    return (
      <div className="overflow-hidden rounded-3xl border border-amber-400/20 bg-surface">
        <div className="flex min-h-[18rem] items-center justify-center p-6 text-center">
          <p className="max-w-md text-sm leading-7 text-amber-50">{lockedMessage}</p>
        </div>
        <div className="border-t border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">
            {title ?? "ملف PDF"}
          </h2>
        </div>
      </div>
    );
  }

  return (
    <AuthorizedPdfFrame
      key={materialId}
      materialId={materialId}
      title={title}
      description={description}
    />
  );
}

function AuthorizedPdfFrame({
  materialId,
  title,
  description,
}: {
  materialId: string;
  title?: string | null;
  description?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const result = await getCourseMaterialViewUrlAction(materialId);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        setLoading(false);
        return;
      }
      setUrl(result.url);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [materialId]);

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-white sm:text-lg">
            {title ?? "ملف PDF"}
          </h2>
          {description ? (
            <p className="mt-1 line-clamp-2 text-xs text-white/50">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !url}
            className="rounded-xl border border-white/15 px-3 py-1.5 text-xs text-white/85 disabled:opacity-50"
            onClick={() => {
              if (!url) return;
              window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            فتح في تبويب جديد
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            onClick={() => {
              startTransition(async () => {
                const result = await getCourseMaterialDownloadUrlAction(materialId);
                if (!result.ok) {
                  setActionMessage(result.message);
                  return;
                }
                setActionMessage(null);
                window.open(result.url, "_blank", "noopener,noreferrer");
              });
            }}
          >
            تحميل PDF
          </button>
        </div>
      </div>

      {(loading || pending) && !url && !error ? (
        <div className="flex min-h-[28rem] items-center justify-center bg-background/80 p-6">
          <p className="text-sm text-white/70">جارٍ تجهيز عرض الملف الآمن…</p>
        </div>
      ) : error ? (
        <div className="flex min-h-[18rem] items-center justify-center p-6 text-center">
          <p className="max-w-md text-sm leading-7 text-red-100">{error}</p>
        </div>
      ) : url ? (
        <iframe
          title={title ?? "PDF"}
          src={url}
          className="h-[min(75vh,44rem)] w-full bg-black/40"
        />
      ) : (
        <div className="flex min-h-[18rem] items-center justify-center p-6">
          <p className="text-sm text-white/55">لا يتوفر رابط عرض حاليًا.</p>
        </div>
      )}

      {actionMessage ? (
        <p className="border-t border-white/10 px-4 py-3 text-xs text-red-200">
          {actionMessage}
        </p>
      ) : (
        <p className="border-t border-white/10 px-4 py-3 text-xs text-white/40">
          الرابط موقّت ويُجدَّد بعد التحقق من صلاحية الاشتراك. لا تشارك الرابط.
        </p>
      )}
    </div>
  );
}

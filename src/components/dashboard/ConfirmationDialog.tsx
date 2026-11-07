"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ConfirmResult = {
  ok?: boolean;
  message: string;
  redirectTo?: string;
};

type ConfirmationDialogProps = {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel?: string;
  disabled?: boolean;
  danger?: boolean;
  /** زر أوضح بجانب العناوين. الافتراضي يبقى الزر الهادئ الحالي. */
  prominent?: boolean;
  /** Server Action أو دالة عميل — لا تمرّر closures من Server Components */
  onConfirm: () => Promise<ConfirmResult | void> | ConfirmResult | void;
};

export function ConfirmationDialog({
  triggerLabel,
  title,
  description,
  confirmLabel = "تأكيد",
  disabled = false,
  danger = false,
  prominent = false,
  onConfirm,
}: ConfirmationDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={
          prominent
            ? danger
              ? "rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              : "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
            : "rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {triggerLabel}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-5 shadow-xl">
            <h3 id="confirm-title" className="text-lg font-semibold text-white">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-7 text-white/70">{description}</p>
            {message ? (
              <p
                className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                  ok
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                    : "border-red-400/30 bg-red-500/10 text-red-200"
                }`}
              >
                {message}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80"
                onClick={() => {
                  setOpen(false);
                  setMessage(null);
                  setOk(null);
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={pending}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                  danger ? "bg-red-700 hover:bg-red-600" : "bg-primary hover:bg-secondary"
                }`}
                onClick={async () => {
                  setPending(true);
                  const result = await onConfirm();
                  setPending(false);
                  if (result?.message) {
                    setMessage(result.message);
                    setOk(result.ok ?? false);
                    if (result.ok) {
                      if (result.redirectTo) {
                        router.push(result.redirectTo);
                      } else {
                        router.refresh();
                      }
                    }
                    return;
                  }
                  setOpen(false);
                }}
              >
                {pending ? "جارٍ التنفيذ..." : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

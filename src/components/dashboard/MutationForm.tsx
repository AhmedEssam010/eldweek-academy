"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CourseFormActionResult } from "@/lib/dashboard/types";

type MutationFormProps = {
  action: (formData: FormData) => Promise<CourseFormActionResult>;
  submitLabel: string;
  children: React.ReactNode;
  pendingLabel?: string;
};

export function MutationForm({
  action,
  submitLabel,
  children,
  pendingLabel = "جارٍ الحفظ...",
}: MutationFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      action={(formData) => {
        startTransition(async () => {
          const result = await action(formData);
          setOk(result.ok);
          setMessage(result.message);
          if (result.ok && result.redirectTo) {
            router.push(result.redirectTo);
            router.refresh();
            return;
          }
          if (result.ok) {
            router.refresh();
          }
        });
      }}
    >
      {children}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? pendingLabel : submitLabel}
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
  );
}

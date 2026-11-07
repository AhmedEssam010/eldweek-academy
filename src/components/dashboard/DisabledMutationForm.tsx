"use client";

import { useState, useTransition } from "react";
type MutationLikeResult = {
  message: string;
};

type DisabledMutationFormProps = {
  action: () => Promise<MutationLikeResult>;
  submitLabel: string;
  children?: React.ReactNode;
};

export function DisabledMutationForm({
  action,
  submitLabel,
  children,
}: DisabledMutationFormProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      action={() => {
        startTransition(async () => {
          const result = await action();
          setMessage(result.message);
        });
      }}
    >
      {children}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white opacity-80 transition hover:bg-secondary disabled:cursor-not-allowed"
      >
        {pending ? "جارٍ التحقق..." : submitLabel}
      </button>
      {message ? (
        <p className="rounded-xl border border-secondary/30 bg-secondary/10 px-3 py-2 text-xs leading-6 text-light-purple">
          {message}
        </p>
      ) : (
        <p className="text-xs text-white/45">
          التنفيذ الفعلي معطّل حتى اكتمال جاهزية القاعدة والتحقق الأمني.
        </p>
      )}
    </form>
  );
}

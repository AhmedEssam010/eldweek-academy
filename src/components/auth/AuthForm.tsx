"use client";

import { useActionState } from "react";
import type { AuthActionResult } from "@/lib/auth/actions";
import { FormMessage } from "@/components/auth/FormMessage";
import { SubmitButton } from "@/components/auth/SubmitButton";

type AuthFormProps = {
  action: (formData: FormData) => Promise<AuthActionResult>;
  children: React.ReactNode;
  submitLabel: string;
  pendingText?: string;
  disabled?: boolean;
  footer?: React.ReactNode;
};

/**
 * يمرّر Server Action مباشرة عبر useActionState حتى تُحفظ كوكيز الجلسة
 * مع redirect دون التفاف startTransition الذي كان يعرقل ثبات الجلسة.
 */
export function AuthForm({
  action,
  children,
  submitLabel,
  pendingText,
  disabled = false,
  footer,
}: AuthFormProps) {
  const [message, formAction, isPending] = useActionState(
    async (
      _prev: AuthActionResult | null,
      formData: FormData,
    ): Promise<AuthActionResult | null> => {
      return await action(formData);
    },
    null,
  );

  return (
    <form className="space-y-4" action={formAction}>
      {message ? (
        <FormMessage type={message.ok ? "success" : "error"}>
          {message.message}
        </FormMessage>
      ) : null}

      <fieldset disabled={disabled || isPending} className="space-y-4">
        {children}
        <SubmitButton pendingText={pendingText} disabled={disabled}>
          {submitLabel}
        </SubmitButton>
      </fieldset>

      {footer ? <div className="pt-2 text-sm text-white/65">{footer}</div> : null}
    </form>
  );
}

"use client";

import { useActionState } from "react";
import type { AuthActionResult } from "@/lib/auth/actions";
import { updateOwnProfileName } from "@/lib/auth/actions";
import type { NameParts } from "@/lib/auth/name";
import { FormMessage } from "@/components/auth/FormMessage";
import { SubmitButton } from "@/components/auth/SubmitButton";

type ProfileNameFormProps = {
  initialParts: NameParts;
};

function NameField({
  id,
  name,
  label,
  defaultValue,
  autoComplete,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-white">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        required
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-secondary focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

export function ProfileNameForm({ initialParts }: ProfileNameFormProps) {
  const [message, formAction, isPending] = useActionState(
    async (
      _prev: AuthActionResult | null,
      formData: FormData,
    ): Promise<AuthActionResult | null> => {
      return await updateOwnProfileName(formData);
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      {message ? (
        <FormMessage type={message.ok ? "success" : "error"}>
          {message.message}
        </FormMessage>
      ) : null}

      <fieldset disabled={isPending} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NameField
            id="firstName"
            name="firstName"
            label="الاسم الأول"
            defaultValue={initialParts.firstName}
            autoComplete="given-name"
          />
          <NameField
            id="secondName"
            name="secondName"
            label="الاسم الثاني"
            defaultValue={initialParts.secondName}
            autoComplete="additional-name"
          />
          <NameField
            id="thirdName"
            name="thirdName"
            label="الاسم الثالث"
            defaultValue={initialParts.thirdName}
            autoComplete="off"
          />
          <NameField
            id="lastName"
            name="lastName"
            label="الاسم الأخير"
            defaultValue={initialParts.lastName}
            autoComplete="family-name"
          />
        </div>
        <SubmitButton pendingText="جارٍ الحفظ...">حفظ الاسم</SubmitButton>
      </fieldset>
    </form>
  );
}

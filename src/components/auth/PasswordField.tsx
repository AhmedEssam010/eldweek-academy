"use client";

import { useState } from "react";

type PasswordFieldProps = {
  id: string;
  name: string;
  label: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
};

export function PasswordField({
  id,
  name,
  label,
  autoComplete = "current-password",
  required = true,
  minLength = 8,
  placeholder,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-white">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 pe-24 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-secondary"
        />
        <button
          type="button"
          className="absolute inset-y-0 end-2 my-auto rounded-lg px-3 py-1 text-xs font-medium text-light-purple hover:bg-white/5"
          onClick={() => setVisible((value) => !value)}
          aria-pressed={visible}
        >
          {visible ? "إخفاء" : "إظهار"}
        </button>
      </div>
    </div>
  );
}

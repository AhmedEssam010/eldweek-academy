type PhoneFieldProps = {
  id?: string;
  name?: string;
  defaultValue?: string;
  required?: boolean;
  readOnly?: boolean;
};

export function PhoneField({
  id = "phone",
  name = "phone",
  defaultValue,
  required = true,
  readOnly = false,
}: PhoneFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-white">
        رقم الموبايل المصري
      </label>
      <input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required={required}
        readOnly={readOnly}
        defaultValue={defaultValue}
        placeholder="010xxxxxxxx"
        className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-secondary read-only:opacity-80"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="mt-2 text-xs leading-5 text-white/50">
        يُقبل 010 / 011 / 012 / 015 ثم يُحوَّل تلقائيًا إلى الصيغة الدولية +20.
      </p>
    </div>
  );
}

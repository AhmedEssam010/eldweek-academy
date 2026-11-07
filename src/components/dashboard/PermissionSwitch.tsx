"use client";

type PermissionSwitchProps = {
  id: string;
  label: string;
  description: string;
  checked?: boolean;
  disabled?: boolean;
  name?: string;
};

export function PermissionSwitch({
  id,
  label,
  description,
  checked = false,
  disabled = true,
  name,
}: PermissionSwitchProps) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-background/40 p-4 ${
        disabled ? "opacity-70" : ""
      }`}
    >
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-white/55">
          {description}
        </span>
      </span>
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={checked}
        disabled={disabled}
        className="mt-1 h-4 w-4 accent-primary"
      />
    </label>
  );
}

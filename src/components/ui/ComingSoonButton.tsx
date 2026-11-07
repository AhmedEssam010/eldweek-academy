type ComingSoonButtonProps = {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
};

const variantClasses: Record<
  NonNullable<ComingSoonButtonProps["variant"]>,
  string
> = {
  primary:
    "bg-primary text-white opacity-70 cursor-not-allowed shadow-[0_0_24px_rgba(124,58,237,0.25)]",
  secondary:
    "bg-surface text-light-purple border border-white/15 opacity-70 cursor-not-allowed",
  ghost:
    "bg-transparent text-white/70 border border-white/20 opacity-70 cursor-not-allowed",
};

/**
 * زر معطّل يوضح أن الميزة قادمة قريبًا.
 */
export function ComingSoonButton({
  children,
  variant = "primary",
  className = "",
}: ComingSoonButtonProps) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title="قريبًا"
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${variantClasses[variant]} ${className}`}
    >
      <span>{children}</span>
      <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-medium text-light-purple">
        قريبًا
      </span>
    </button>
  );
}

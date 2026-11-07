export function LoadingState({ label = "جارٍ التحميل..." }: { label?: string }) {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-surface/60 px-6 py-10 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto h-8 w-8 animate-pulse rounded-full bg-primary/40" />
      <p className="mt-4 text-sm text-white/70">{label}</p>
    </div>
  );
}

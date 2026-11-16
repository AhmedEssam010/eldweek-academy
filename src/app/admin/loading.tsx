export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-white/10" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-white/5" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-24 animate-pulse rounded-xl bg-white/10"
          />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-36 animate-pulse rounded-2xl border border-white/10 bg-surface/70"
          />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="h-64 animate-pulse rounded-2xl border border-white/10 bg-surface/70 xl:col-span-3" />
        <div className="h-64 animate-pulse rounded-2xl border border-white/10 bg-surface/70 xl:col-span-2" />
      </div>
      <p className="text-center text-sm text-white/50">جارٍ تحميل لوحة التحليلات...</p>
    </div>
  );
}

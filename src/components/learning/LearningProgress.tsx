type LearningProgressProps = {
  label?: string;
  percent: number | null;
  completedLabel?: string;
  pendingLabel?: string;
};

export function LearningProgress({
  label = "التقدّم",
  percent,
  completedLabel = "مكتمل",
  pendingLabel = "لم يُحفظ بعد من الخادم",
}: LearningProgressProps) {
  const value =
    percent === null || Number.isNaN(percent)
      ? null
      : Math.min(100, Math.max(0, Math.round(percent)));

  return (
    <div className="rounded-xl border border-white/10 bg-background/40 p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-white/70">{label}</span>
        <span className="text-light-purple">
          {value === null ? pendingLabel : value === 100 ? completedLabel : `${value}%`}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-l from-primary to-secondary transition-all"
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
      {value === null ? (
        <p className="mt-2 text-xs text-white/45">
          لا نؤكّد حفظ التقدّم حتى يرد الخادم بعد تفعيل الكتابة الآمنة.
        </p>
      ) : null}
    </div>
  );
}

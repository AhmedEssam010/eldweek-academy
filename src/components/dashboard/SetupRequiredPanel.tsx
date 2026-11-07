type SetupRequiredPanelProps = {
  title?: string;
  message: string;
};

export function SetupRequiredPanel({
  title = "يلزم إكمال إعداد قاعدة البيانات",
  message,
}: SetupRequiredPanelProps) {
  return (
    <section className="rounded-2xl border border-secondary/30 bg-secondary/10 p-5">
      <h2 className="text-base font-semibold text-light-purple">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-white/75">{message}</p>
      <p className="mt-3 text-xs text-white/50">
        لن تُعرض أرقام مختلقة ولن تُنفَّذ عمليات كتابة حتى تصبح الهجرات والتحقق
        الأمني جاهزين.
      </p>
    </section>
  );
}

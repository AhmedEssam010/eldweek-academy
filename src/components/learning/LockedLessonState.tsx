type LockedLessonStateProps = {
  title?: string;
  message?: string;
};

export function LockedLessonState({
  title = "المحتوى مقفل",
  message = "يتطلب هذا الدرس اشتراكًا نشطًا (كورس كامل أو الترم المناسب) وحالة نشر. لن يُشغَّل محتوى مدفوع بدون تفويض خادمي.",
}: LockedLessonStateProps) {
  return (
    <div className="flex aspect-video flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-[linear-gradient(145deg,rgba(91,33,182,0.25),rgba(11,9,19,0.95))] p-6 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 text-light-purple">
        <span className="text-lg" aria-hidden>
          ⌘
        </span>
      </div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-7 text-white/65">{message}</p>
    </div>
  );
}

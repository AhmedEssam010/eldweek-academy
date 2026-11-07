import { BrandLogo } from "@/components/brand/BrandLogo";

type CoursesComingSoonProps = {
  className?: string;
};

export function CoursesComingSoon({ className = "" }: CoursesComingSoonProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-[#1a0b2e] via-[#12081f] to-[#0a0612] px-6 py-14 text-center sm:px-10 sm:py-16 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.22),transparent_65%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 bottom-4 h-36 w-36 rounded-full bg-secondary/15 blur-3xl"
      />

      <div className="relative mx-auto flex max-w-xl flex-col items-center">
        <div className="mb-6">
          <BrandLogo size="lg" href={null} />
        </div>

        <p className="text-xs font-medium tracking-wide text-light-purple/90 sm:text-sm">
          قريبًا على منصة المهندس أحمد الدويك
        </p>

        <h3 className="mt-3 text-2xl font-bold text-white sm:text-3xl">
          الكورسات جاية قريب! 🚀
        </h3>

        <p className="mt-4 text-sm leading-8 text-white/70 sm:text-base">
          بنجهزلك محتوى مميز في البرمجة والذكاء الاصطناعي. أول كورساتنا هتكون
          متاحة قريب جدًا، خليك متابعنا!
        </p>
      </div>
    </div>
  );
}

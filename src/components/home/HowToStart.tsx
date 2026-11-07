import { BookOpenCheck, GraduationCap, UserPlus, type LucideIcon } from "lucide-react";
import { howToSteps } from "@/lib/data/how-to-start";
import type { HowToStep } from "@/types";

const stepIcons: Record<HowToStep["icon"], LucideIcon> = {
  "user-plus": UserPlus,
  "book-open-check": BookOpenCheck,
  "graduation-cap": GraduationCap,
};

function formatStepNumber(step: number) {
  return String(step).padStart(2, "0");
}

export function HowToStart() {
  return (
    <section
      id="how-to-start"
      className="border-b border-white/5"
      aria-labelledby="how-to-start-heading"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="max-w-3xl">
          <h2
            id="how-to-start-heading"
            className="text-2xl font-bold leading-10 text-white sm:text-3xl"
          >
            ابدأ رحلتك معانا في 3 خطوات
          </h2>
          <p className="mt-3 text-sm leading-8 text-white/70 sm:text-base">
            من أول إنشاء حسابك لحد ما تبدأ تتعلم، كل حاجة بسيطة ومنظمة عشان تركز
            في مذاكرتك.
          </p>
        </div>

        <ol className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {howToSteps.map((step) => {
            const Icon = stepIcons[step.icon];
            return (
              <li
                key={step.id}
                className="group relative flex h-full flex-col rounded-2xl border border-white/10 bg-[linear-gradient(160deg,rgba(46,16,101,0.35)_0%,rgba(11,9,19,0.92)_55%,rgba(17,12,28,0.98)_100%)] p-6 shadow-[0_0_0_1px_rgba(124,58,237,0.06)] transition duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-[0_12px_40px_-20px_rgba(124,58,237,0.55)]"
              >
                <div className="mb-5 flex items-center justify-between gap-3">
                  <span
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/15 text-light-purple transition group-hover:border-primary/40 group-hover:bg-primary/25"
                    aria-hidden
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <span
                    className="text-sm font-bold tracking-wide text-primary/80"
                    aria-hidden
                  >
                    {formatStepNumber(step.step)}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-7 text-white/70">
                  {step.description}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

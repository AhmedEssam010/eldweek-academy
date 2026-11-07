import { features } from "@/lib/data/features";
import { FeatureIcon } from "@/components/home/FeatureIcon";

export function Features() {
  return (
    <section
      id="features"
      className="border-b border-white/5"
      aria-labelledby="features-heading"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="max-w-3xl">
          <h2
            id="features-heading"
            className="text-2xl font-bold leading-10 text-white sm:text-3xl"
          >
            ليه تتعلم مع المهندس أحمد الدويك؟
          </h2>
          <p className="mt-3 text-sm leading-8 text-white/70 sm:text-base">
            كل اللي محتاجه عشان تفهم مادة البرمجة والذكاء الاصطناعي، وتتدرب
            عليها، وتدخل امتحانك وأنت واثق من مستواك.
          </p>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <li
              key={feature.id}
              className="group flex h-full flex-col rounded-2xl border border-white/10 bg-[linear-gradient(160deg,rgba(46,16,101,0.35)_0%,rgba(11,9,19,0.92)_55%,rgba(17,12,28,0.98)_100%)] p-5 shadow-[0_0_0_1px_rgba(124,58,237,0.06)] transition duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-[0_12px_40px_-20px_rgba(124,58,237,0.55)]"
            >
              <div className="mb-4 inline-flex rounded-xl border border-primary/20 bg-primary/15 p-3 text-light-purple transition group-hover:border-primary/40 group-hover:bg-primary/25">
                <FeatureIcon name={feature.icon} />
              </div>
              <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-7 text-white/70">
                {feature.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

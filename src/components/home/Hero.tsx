import Image from "next/image";
import Link from "next/link";

const HERO_IMAGE = "/مطور تقني وروبوت نيون مبتسم.png";

export function Hero() {
  return (
    <section
      id="home"
      className="relative flex min-h-[100vh] min-h-[100dvh] flex-col overflow-hidden border-b border-white/5"
      aria-labelledby="hero-heading"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[rgba(11,9,19,0.38)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_left,rgba(11,9,19,0.58)_0%,rgba(30,12,55,0.42)_40%,rgba(46,16,101,0.28)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(46,16,101,0.22),transparent_55%)]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 pb-16 pt-28 sm:px-6 sm:pb-20 sm:pt-32 lg:px-8 lg:pb-24 lg:pt-36">
        <p className="mb-4 text-sm font-semibold tracking-wide text-light-purple sm:text-base">
          المهندس أحمد الدويك
        </p>

        <h1
          id="hero-heading"
          className="max-w-3xl text-3xl font-extrabold leading-[1.35] text-white sm:text-4xl lg:text-5xl lg:leading-[1.3]"
        >
          <span className="bg-gradient-to-l from-primary via-light-purple to-secondary bg-clip-text text-transparent">
            البرمجة والذكاء الاصطناعي
          </span>{" "}
          بقت أسهل معاك!
        </h1>

        <p className="mt-5 max-w-2xl text-base leading-8 text-white/80 sm:text-lg sm:leading-9">
          منصة المهندس أحمد الدويك التعليمية، وجهتك لفهم وإتقان مادة البرمجة
          والذكاء الاصطناعي لطلاب الصف الثاني الثانوي بنظام البكالوريا، من خلال
          شرح مبسط، وحل تدريبات، وواجبات تفاعلية، وامتحانات تساعدك تفهم كل درس
          خطوة بخطوة وتكون مستعد لأي امتحان.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/register"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_28px_rgba(124,58,237,0.35)] transition hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            ابدأ رحلتك دلوقتي
          </Link>
          <a
            href="#courses"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/20 px-7 py-3.5 text-sm font-semibold text-white/90 transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            استكشف الكورسات
          </a>
        </div>
      </div>
    </section>
  );
}

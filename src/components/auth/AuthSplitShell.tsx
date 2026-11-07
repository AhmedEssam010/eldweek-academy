import Image from "next/image";
import { BrandLogo } from "@/components/brand/BrandLogo";

type AuthSplitShellProps = {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  children: React.ReactNode;
};

export function AuthSplitShell({
  title,
  description,
  imageSrc,
  imageAlt,
  children,
}: AuthSplitShellProps) {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-24 start-1/4 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-0 end-0 h-64 w-64 rounded-full bg-[rgba(46,16,101,0.35)] blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex w-full flex-1 flex-col px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
        <div className="grid min-h-[calc(100dvh-6.5rem)] flex-1 gap-4 lg:grid-cols-2 lg:items-stretch lg:gap-5">
          <section className="flex flex-col justify-center rounded-3xl border border-white/10 bg-surface/90 p-6 shadow-[0_0_48px_rgba(124,58,237,0.12)] backdrop-blur-sm sm:p-8 lg:p-10">
            <div className="mb-5">
              <BrandLogo size="md" href="/" />
            </div>
            <h1 className="text-2xl font-bold leading-10 text-white sm:text-3xl">
              {title}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-8 text-white/70 sm:text-base">
              {description}
            </p>
            <div className="mt-7">{children}</div>
          </section>

          <aside className="relative hidden min-h-[28rem] overflow-hidden rounded-3xl border border-white/10 shadow-[0_0_48px_rgba(46,16,101,0.35)] lg:block">
            <Image
              src={imageSrc}
              alt={imageAlt}
              fill
              priority
              sizes="(max-width: 1024px) 0vw, 50vw"
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(11,9,19,0.15)_0%,rgba(46,16,101,0.28)_100%)]" />
          </aside>
        </div>
      </div>
    </main>
  );
}

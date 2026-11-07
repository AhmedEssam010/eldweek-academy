import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";

type AuthShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  /** شريط علوي بسيط للصفحات خارج مجموعة (auth) */
  standalone?: boolean;
};

export function AuthShell({
  title,
  description,
  children,
  standalone = false,
}: AuthShellProps) {
  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-24 start-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute bottom-0 end-0 h-64 w-64 rounded-full bg-secondary/20 blur-3xl" />
      </div>

      {standalone ? (
        <header className="relative z-10 border-b border-white/10 bg-background/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4 sm:px-6">
            <BrandLogo size="sm" href="/" />
            <Link
              href="/"
              className="text-xs text-white/60 transition hover:text-white"
            >
              العودة للرئيسية
            </Link>
          </div>
        </header>
      ) : null}

      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-white/10 bg-surface/90 p-6 shadow-[0_0_40px_rgba(124,58,237,0.12)] sm:p-8">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="mt-2 text-sm leading-7 text-white/70">{description}</p>
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

import { BrandLogo } from "@/components/brand/BrandLogo";
import { signOut } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/auth/SubmitButton";

type DashboardShellProps = {
  title: string;
  roleLabel: string;
  fullName: string;
  children: React.ReactNode;
};

export function DashboardShell({
  title,
  roleLabel,
  fullName,
  children,
}: DashboardShellProps) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-white/10 bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <BrandLogo size="sm" href="/" />
            <p className="mt-1 text-xs text-white/55">
              {roleLabel} · {fullName || "بدون اسم"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-light-purple">{title}</h1>
            <form action={signOut}>
              <SubmitButton pendingText="...">خروج</SubmitButton>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}

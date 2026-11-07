import Link from "next/link";

type StatCardProps = {
  label: string;
  value: number | null;
  hint?: string;
  href?: string;
};

export function StatCard({ label, value, hint, href }: StatCardProps) {
  const body = (
    <article className="h-full rounded-2xl border border-white/10 bg-gradient-to-br from-surface to-[#1d1433] p-5 transition hover:border-primary/40">
      <p className="text-sm text-white/65">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-white">
        {value === null ? "—" : value.toLocaleString("ar-EG")}
      </p>
      {hint ? <p className="mt-2 text-xs leading-5 text-white/45">{hint}</p> : null}
    </article>
  );

  if (!href) return body;
  return (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import type { DashboardNavItem } from "@/lib/dashboard/navigation";

type DashboardSidebarProps = {
  items: DashboardNavItem[];
  roleLabel: string;
  open: boolean;
  onClose: () => void;
};

export function DashboardSidebar({
  items,
  roleLabel,
  open,
  onClose,
}: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col border-l border-white/10 bg-[#120b1f] transition-transform lg:static lg:z-auto lg:max-w-none lg:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}
        aria-label="قائمة لوحة التحكم"
      >
        <div className="border-b border-white/10 px-5 py-5">
          <BrandLogo size="sm" href="/" />
          <p className="mt-2 text-xs text-light-purple">{roleLabel}</p>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/admin" &&
                item.href !== "/teacher" &&
                item.href !== "/student" &&
                pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`block rounded-xl px-3 py-3 transition ${
                  active
                    ? "bg-primary/20 text-white"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="block text-sm font-medium">{item.label}</span>
                {item.description ? (
                  <span className="mt-0.5 block text-xs text-white/45">
                    {item.description}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

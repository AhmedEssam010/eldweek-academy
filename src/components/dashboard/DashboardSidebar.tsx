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

      {/*
        غلاف بعرض السايدبار فقط + overflow-hidden:
        - يمنع translate-x-full من توسيع scrollWidth
        - لا يغطي الشاشة كاملة فلا يحجب زر القائمة أو الـ backdrop
      */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] overflow-hidden lg:static lg:z-auto lg:w-72 lg:max-w-none lg:shrink-0 lg:overflow-visible ${
          open ? "" : "pointer-events-none lg:pointer-events-auto"
        }`}
      >
        <aside
          className={`flex h-full w-full flex-col border-l border-white/10 bg-[#120b1f] transition-transform duration-200 ease-out lg:translate-x-0 ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
          aria-label="قائمة لوحة التحكم"
        >
          <div className="border-b border-white/10 px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <BrandLogo size="sm" href="/" />
                <p className="mt-2 text-xs text-light-purple">{roleLabel}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1.5 text-sm text-white/80 lg:hidden"
                aria-label="إغلاق القائمة"
              >
                ✕
              </button>
            </div>
          </div>

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
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
                    <span className="mt-0.5 block break-words text-xs text-white/45">
                      {item.description}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </aside>
      </div>
    </>
  );
}

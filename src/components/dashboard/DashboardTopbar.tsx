"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut } from "@/lib/auth/actions";

type DashboardTopbarProps = {
  title: string;
  fullName: string;
  onMenuOpen: () => void;
};

export function DashboardTopbar({
  title,
  fullName,
  onMenuOpen,
}: DashboardTopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-background/85 backdrop-blur-md">
      <div className="flex min-w-0 items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="shrink-0 rounded-lg border border-white/15 p-2 text-white lg:hidden"
            onClick={onMenuOpen}
            aria-label="فتح القائمة"
          >
            <span aria-hidden>☰</span>
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-white sm:text-base">
              {title}
            </h1>
            <p className="truncate text-xs text-white/50">لوحة تحكم احترافية</p>
          </div>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            className="inline-flex max-w-[10rem] items-center gap-2 rounded-xl border border-white/15 bg-surface px-2.5 py-2 text-sm text-white sm:max-w-[12rem] sm:px-3"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span className="truncate">{fullName || "حسابي"}</span>
            <span className="shrink-0 text-white/50">▾</span>
          </button>

          {menuOpen ? (
            <div className="absolute end-0 z-40 mt-2 w-48 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-surface p-2 shadow-xl">
              <Link
                href="/profile"
                className="block rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/5"
                onClick={() => setMenuOpen(false)}
              >
                الملف الشخصي
              </Link>
              <Link
                href="/"
                className="block rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/5"
                onClick={() => setMenuOpen(false)}
              >
                الصفحة الرئيسية
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className="w-full rounded-lg px-3 py-2 text-start text-sm text-red-200 hover:bg-white/5"
                >
                  تسجيل الخروج
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

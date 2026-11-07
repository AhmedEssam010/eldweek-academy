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
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-lg border border-white/15 p-2 text-white lg:hidden"
            onClick={onMenuOpen}
            aria-label="فتح القائمة"
          >
            <span aria-hidden>☰</span>
          </button>
          <div>
            <h1 className="text-sm font-semibold text-white sm:text-base">
              {title}
            </h1>
            <p className="text-xs text-white/50">لوحة تحكم احترافية</p>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-surface px-3 py-2 text-sm text-white"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span className="max-w-[9rem] truncate">{fullName || "حسابي"}</span>
            <span className="text-white/50">▾</span>
          </button>

          {menuOpen ? (
            <div className="absolute end-0 mt-2 w-48 rounded-xl border border-white/10 bg-surface p-2 shadow-xl">
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

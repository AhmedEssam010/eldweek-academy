"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { navLinks } from "@/lib/data/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { initialsFromName } from "@/lib/auth/dashboard-path";
import { signOut } from "@/lib/auth/actions";
import type { UserRole } from "@/types/database";

export type NavbarAuthUser = {
  fullName: string;
  role: UserRole;
  dashboardHref: string;
};

export type NavbarAuthState = "loading" | null | NavbarAuthUser;

type NavbarProps = {
  /** شفّاف فوق الهيرو، ويصبح غامق عند التمرير */
  overlay?: boolean;
  /**
   * حالة المصادقة من الخادم.
   * - loading: هيكل مؤقت دون ادعاء دخول/خروج
   * - null: زائر
   * - object: جلسة موثّقة
   */
  auth?: NavbarAuthState;
};

function resolveNavHref(href: string) {
  if (href === "#home" || href === "/") return "/";
  if (href.startsWith("#")) return `/${href}`;
  return href;
}

function AccountMenu({
  user,
  onNavigate,
}: {
  user: NavbarAuthUser;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initials = initialsFromName(user.fullName);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="inline-flex max-w-[14rem] items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white transition hover:bg-white/10"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/30 text-xs font-bold text-light-purple"
          aria-hidden
        >
          {initials}
        </span>
        <span className="truncate font-medium">{user.fullName || "حسابي"}</span>
        <span className="text-white/45" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute end-0 z-50 mt-2 w-52 rounded-xl border border-white/10 bg-surface p-1.5 shadow-xl"
        >
          <Link
            href="/profile"
            role="menuitem"
            className="block rounded-lg px-3 py-2.5 text-sm text-white/85 hover:bg-white/5"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
          >
            الملف الشخصي
          </Link>
          <Link
            href={user.dashboardHref}
            role="menuitem"
            className="block rounded-lg px-3 py-2.5 text-sm text-white/85 hover:bg-white/5"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
          >
            لوحة التحكم
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="w-full rounded-lg px-3 py-2.5 text-start text-sm text-red-200 hover:bg-white/5"
            >
              تسجيل الخروج
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function AuthControls({
  auth,
  mobile = false,
  onNavigate,
}: {
  auth: NavbarAuthState;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  if (auth === "loading") {
    return (
      <div
        className={`flex items-center gap-2 ${mobile ? "w-full" : ""}`}
        aria-busy="true"
        aria-label="جارٍ التحقق من الجلسة"
      >
        <span className="h-9 w-9 animate-pulse rounded-full bg-white/10" />
        <span className="h-4 w-24 animate-pulse rounded bg-white/10" />
      </div>
    );
  }

  if (auth) {
    if (mobile) {
      return (
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/30 text-sm font-bold text-light-purple">
              {initialsFromName(auth.fullName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {auth.fullName || "حسابي"}
              </p>
              <p className="text-xs text-white/50">جلسة نشطة</p>
            </div>
          </div>
          <Link
            href="/profile"
            className="rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-medium text-white"
            onClick={onNavigate}
          >
            الملف الشخصي
          </Link>
          <Link
            href={auth.dashboardHref}
            className="rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-white"
            onClick={onNavigate}
          >
            لوحة التحكم
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full rounded-xl border border-red-400/30 px-4 py-3 text-sm font-medium text-red-100"
            >
              تسجيل الخروج
            </button>
          </form>
        </div>
      );
    }

    return <AccountMenu user={auth} onNavigate={onNavigate} />;
  }

  return (
    <div className={`flex gap-2 ${mobile ? "w-full flex-col" : "items-center"}`}>
      <Link
        href="/login"
        className={`inline-flex items-center justify-center rounded-xl border border-white/20 bg-transparent px-5 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
          mobile ? "w-full" : ""
        }`}
        onClick={onNavigate}
      >
        تسجيل الدخول
      </Link>
      <Link
        href="/register"
        className={`inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(124,58,237,0.25)] transition hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
          mobile ? "w-full" : ""
        }`}
        onClick={onNavigate}
      >
        إنشاء حساب
      </Link>
    </div>
  );
}

export function Navbar({ overlay = false, auth = null }: NavbarProps) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!overlay) return;

    const onScroll = () => {
      setScrolled(window.scrollY > 24);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overlay]);

  const solid = !overlay || scrolled || open;

  return (
    <header
      className={`z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        overlay ? "fixed inset-x-0 top-0" : "sticky top-0"
      } ${
        solid
          ? "border-b border-white/10 bg-background/95 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <nav
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"
        aria-label="القائمة الرئيسية"
      >
        <BrandLogo size="md" priority />

        <ul className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={resolveNavHref(link.href)}
                className="rounded-lg px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 lg:flex">
          <AuthControls auth={auth} />
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg border border-white/15 p-2 text-white lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sr-only">{open ? "إغلاق القائمة" : "فتح القائمة"}</span>
          {open ? (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </nav>

      {open ? (
        <div
          id="mobile-menu"
          className="border-t border-white/10 bg-background/95 px-4 py-4 backdrop-blur-md lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={resolveNavHref(link.href)}
                  className="block rounded-lg px-3 py-2.5 text-sm text-white/90 hover:bg-white/5"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <AuthControls
              auth={auth}
              mobile
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </header>
  );
}

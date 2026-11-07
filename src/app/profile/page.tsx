import Link from "next/link";
import { NavbarHost } from "@/components/layout/NavbarHost";
import { Footer } from "@/components/layout/Footer";
import { ProfileNameForm } from "@/components/profile/ProfileNameForm";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { getProfileAuthState } from "@/lib/auth/profile";
import {
  dashboardHrefForRole,
  initialsFromName,
  roleLabelAr,
} from "@/lib/auth/dashboard-path";
import { splitFullNameParts } from "@/lib/auth/name";
import { formatEgyptianPhoneDisplay } from "@/lib/auth/phone";

export const instant = false;

export const metadata = {
  title: "الملف الشخصي | المهندس أحمد الدويك",
};

export default async function ProfilePage() {
  await requireAuthenticatedUser({ nextPath: "/profile" });
  const state = await getProfileAuthState();

  if (state.status !== "authenticated") {
    // requireAuthenticatedUser يوجّه الحالات الأخرى؛ هذا حاجز إضافي للأنواع فقط.
    return null;
  }

  const initials = initialsFromName(state.fullName);
  const roleLabel = roleLabelAr(state.role);
  const dashboardHref = dashboardHrefForRole(state.role);
  const phoneDisplay = formatEgyptianPhoneDisplay(state.phoneNumber);
  const nameParts = splitFullNameParts(state.fullName);

  return (
    <div className="flex min-h-full flex-col bg-background">
      <NavbarHost />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-[#1a0b2e] via-[#12081f] to-[#0a0612] p-6 sm:p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.2),transparent_55%)]"
          />
          <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/20 text-2xl font-bold text-light-purple shadow-[0_0_30px_rgba(124,58,237,0.35)]">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-light-purple">الملف الشخصي</p>
              <h1 className="mt-1 truncate text-2xl font-bold text-white sm:text-3xl">
                {state.fullName || "بدون اسم"}
              </h1>
              <p className="mt-2 text-sm text-white/65">{roleLabel}</p>
            </div>
          </div>
        </div>

        <section className="mt-6 rounded-2xl border border-white/10 bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">بيانات الحساب</h2>
          <p className="mt-1 text-sm text-white/55">
            معلومات من ملفك الموثّق على الخادم. الدور ورقم الهاتف غير قابلين
            للتعديل من هنا.
          </p>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-background/50 p-4">
              <dt className="text-xs text-white/45">الاسم الكامل</dt>
              <dd className="mt-1 text-sm font-medium text-white">
                {state.fullName || "—"}
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-background/50 p-4">
              <dt className="text-xs text-white/45">رقم المحمول</dt>
              <dd className="mt-1 text-sm font-medium text-white" dir="ltr">
                {phoneDisplay}
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-background/50 p-4">
              <dt className="text-xs text-white/45">الدور</dt>
              <dd className="mt-1 text-sm font-medium text-white">{roleLabel}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-background/50 p-4">
              <dt className="text-xs text-white/45">لوحة التحكم</dt>
              <dd className="mt-1">
                <Link
                  href={dashboardHref}
                  className="text-sm font-medium text-light-purple hover:underline"
                >
                  فتح لوحة التحكم
                </Link>
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">تعديل الاسم</h2>
          <p className="mt-1 text-sm leading-7 text-white/55">
            عدّل الاسم الرباعي كما في التسجيل. يُحفظ كحقل واحد
            (full_name) دون أعمدة إضافية.
          </p>
          <div className="mt-5">
            <ProfileNameForm initialParts={nameParts} />
          </div>
        </section>

        <p className="mt-6 text-center text-xs text-white/40">
          تغيير رقم الهاتف أو كلمة المرور يتطلب مسار تحقق آمن. استعادة كلمة
          المرور الذاتية عبر الرسائل غير مفعّلة في هذه المنصة.
        </p>
      </main>
      <Footer />
    </div>
  );
}

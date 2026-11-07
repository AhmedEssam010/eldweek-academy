import { BrandLogo } from "@/components/brand/BrandLogo";
import { navLinks, SITE_NAME } from "@/lib/data/navigation";

export function Footer() {
  return (
    <footer
      id="contact"
      className="border-t border-white/10 bg-surface"
      aria-labelledby="footer-heading"
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <h2 id="footer-heading" className="sr-only">
            {SITE_NAME}
          </h2>
          <BrandLogo size="lg" href="/" />
          <p className="mt-4 max-w-md text-sm leading-7 text-white/70">
            منصة تعليمية عربية لتعلم البرمجة والذكاء الاصطناعي بأسلوب واضح وعملي.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-light-purple">روابط سريعة</h3>
          <ul className="mt-4 space-y-2">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-sm text-white/70 transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-light-purple">تواصل معنا</h3>
          <p className="mt-4 text-sm leading-7 text-white/70">
            قنوات التواصل الرسمية ستُضاف قريبًا. لا توجد بيانات اتصال منشورة في هذه
            المرحلة.
          </p>
          <p className="mt-3 inline-flex rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-xs text-white/60">
            قريبًا: نموذج تواصل وبريد رسمي
          </p>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            © 2026 {SITE_NAME}. جميع الحقوق محفوظة.
          </p>
          <p>هذه النسخة التأسيسية للمنصة — المحتوى قيد التطوير.</p>
        </div>
      </div>
    </footer>
  );
}

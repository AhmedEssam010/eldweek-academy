import type { NavLink } from "@/types";

export const SITE_NAME = "المهندس أحمد الدويك";

/** مسار لوجو المنصة داخل مجلد public */
export const SITE_LOGO_PATH = "/logo.png";

export const navLinks: NavLink[] = [
  { href: "#home", label: "الرئيسية" },
  { href: "#courses", label: "الكورسات" },
  { href: "#features", label: "المميزات" },
  { href: "#faq", label: "الأسئلة الشائعة" },
  { href: "#contact", label: "تواصل معنا" },
];

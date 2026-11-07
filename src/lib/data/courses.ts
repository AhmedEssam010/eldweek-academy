import type { DemoCourse } from "@/types";

/**
 * بيانات تجريبية للعرض فقط — ليست كورسات حقيقية.
 */
export const demoCourses: DemoCourse[] = [
  {
    id: "demo-course-1",
    title: "أساسيات البرمجة بلغة Python",
    description:
      "محتوى تجريبي يوضح شكل صفحة الكورس: متغيرات، شروط، حلقات، ودوال بأسلوب مبسط.",
    level: "beginner",
    levelLabel: "مبتدئ",
    category: "برمجة",
    isDemo: true,
  },
  {
    id: "demo-course-2",
    title: "مقدمة إلى الذكاء الاصطناعي",
    description:
      "محتوى تجريبي للتعريف بمفاهيم الذكاء الاصطناعي وتطبيقاته دون تفاصيل إنتاجية.",
    level: "beginner",
    levelLabel: "مبتدئ",
    category: "ذكاء اصطناعي",
    isDemo: true,
  },
  {
    id: "demo-course-3",
    title: "تطوير واجهات الويب بـ Next.js",
    description:
      "محتوى تجريبي يعرض هيكل كورس ويب حديث باستخدام React وNext.js.",
    level: "intermediate",
    levelLabel: "متوسط",
    category: "تطوير ويب",
    isDemo: true,
  },
];

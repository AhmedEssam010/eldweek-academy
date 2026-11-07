/** أدوار المنصة (متوافقة مع قاعدة البيانات) */
export type { UserRole, CourseStatus as DbCourseStatus } from "./database";

/** حالة الكورس التجريبية في واجهة العرض فقط */
export type CourseStatus = "draft" | "published" | "coming_soon";

/** مستوى الكورس */
export type CourseLevel = "beginner" | "intermediate" | "advanced";

export interface NavLink {
  href: string;
  label: string;
}

export interface FeatureItem {
  id: string;
  title: string;
  description: string;
  icon:
    | "book-open"
    | "code-2"
    | "brain"
    | "clipboard-list"
    | "file-check"
    | "layers";
}

export interface DemoCourse {
  id: string;
  title: string;
  description: string;
  level: CourseLevel;
  levelLabel: string;
  category: string;
  isDemo: true;
}

export interface HowToStep {
  id: string;
  step: number;
  title: string;
  description: string;
  icon: "user-plus" | "book-open-check" | "graduation-cap";
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

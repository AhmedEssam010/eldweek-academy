export type DashboardNavItem = {
  href: string;
  label: string;
  description?: string;
};

export const adminNavItems: DashboardNavItem[] = [
  {
    href: "/admin",
    label: "نظرة عامة",
    description: "ملخص المنصة",
  },
  {
    href: "/admin/students",
    label: "الطلاب",
    description: "إدارة الطلاب والتسجيلات",
  },
  {
    href: "/admin/payments",
    label: "طلبات الدفع",
    description: "مراجعة واعتماد المدفوعات",
  },
  {
    href: "/admin/teachers",
    label: "المدرّسون",
    description: "الفريق والصلاحيات",
  },
  {
    href: "/admin/courses",
    label: "الكورسات",
    description: "الكورسات والأقسام والنشر",
  },
  {
    href: "/admin/exams",
    label: "الامتحانات",
    description: "امتحانات كل كورس",
  },
];

export const teacherNavItems: DashboardNavItem[] = [
  {
    href: "/teacher",
    label: "نظرة عامة",
    description: "كورساتك المعيّنة",
  },
  {
    href: "/teacher/courses",
    label: "كورساتي",
    description: "المحتوى المصرّح به",
  },
];

export const studentNavItems: DashboardNavItem[] = [
  {
    href: "/student",
    label: "الرئيسية",
    description: "ملخص التعلم",
  },
  {
    href: "/student/courses",
    label: "كورساتي",
    description: "المشتريات والتسجيلات",
  },
  {
    href: "/student/payments",
    label: "طلبات الدفع",
    description: "حالة مدفوعاتي",
  },
  {
    href: "/student/results",
    label: "نتائجي",
    description: "محاولات الامتحانات",
  },
];

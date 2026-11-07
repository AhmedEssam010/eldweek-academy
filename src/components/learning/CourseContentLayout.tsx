import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CourseStatusBadge } from "@/components/dashboard/StatusBadge";
import type { StaffCourseAccess } from "@/lib/learning/types";

type CourseContentLayoutProps = {
  access: StaffCourseAccess;
  basePath: string;
  active: "overview" | "semesters" | "exams" | "progress";
  children: React.ReactNode;
  description?: string;
};

export function CourseContentLayout({
  access,
  basePath,
  active,
  children,
  description,
}: CourseContentLayoutProps) {
  const tabs = [
    { key: "overview" as const, href: basePath, label: "نظرة عامة" },
    {
      key: "semesters" as const,
      href: `${basePath}/semesters`,
      label: "الأقسام والمحتوى",
    },
    {
      key: "exams" as const,
      href: `${basePath}/exams`,
      label: "الامتحانات",
      requires: access.canManageExams || access.isAdmin,
    },
    {
      key: "progress" as const,
      href: `${basePath}/progress`,
      label: "تقدّم الطلاب",
      requires: access.canViewStudentProgress || access.isAdmin,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={access.title}
        description={
          description ??
          "إدارة المحتوى وفق الصلاحيات الصريحة فقط — دون استنتاج من إنشاء الكورس."
        }
        actions={<CourseStatusBadge status={access.status} />}
      />

      <nav className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {tabs.map((tab) => {
          const allowed = tab.requires === undefined ? true : tab.requires;
          const isActive = tab.key === active;
          if (!allowed) {
            return (
              <span
                key={tab.key}
                className="rounded-lg px-3 py-1.5 text-xs text-white/35"
                title="غير مصرّح"
              >
                {tab.label}
              </span>
            );
          }
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                isActive
                  ? "bg-primary/25 text-white"
                  : "text-white/65 hover:bg-white/5 hover:text-white"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}

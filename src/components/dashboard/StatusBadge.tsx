import type { CourseStatus } from "@/types/database";

const courseStatusStyles: Record<CourseStatus, string> = {
  draft: "border-white/15 bg-white/5 text-white/75",
  pending_review: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  published: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  archived: "border-white/10 bg-black/20 text-white/50",
};

const courseStatusLabels: Record<CourseStatus, string> = {
  draft: "مسودة",
  pending_review: "بانتظار المراجعة",
  published: "منشور",
  archived: "مؤرشف",
};

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${courseStatusStyles[status]}`}
    >
      {courseStatusLabels[status]}
    </span>
  );
}

export function ActiveStatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${
        active
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
          : "border-red-400/30 bg-red-400/10 text-red-100"
      }`}
    >
      {active ? "نشط" : "غير نشط"}
    </span>
  );
}

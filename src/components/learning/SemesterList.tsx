import Link from "next/link";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type { SemesterListItem } from "@/lib/learning/types";

type SemesterListProps = {
  items: SemesterListItem[];
  hrefForSemester: (semesterId: string) => string;
  emptyDescription?: string;
  renderActions?: (semester: SemesterListItem) => React.ReactNode;
};

export function SemesterList({
  items,
  hrefForSemester,
  emptyDescription = "أضف ترمًا لتنظيم الدروس والامتحانات.",
  renderActions,
}: SemesterListProps) {
  if (items.length === 0) {
    return (
      <EmptyState title="لا توجد ترمات" description={emptyDescription} />
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((semester) => (
        <li
          key={semester.id}
          className="rounded-2xl border border-white/10 bg-surface p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Link href={hrefForSemester(semester.id)} className="min-w-0 flex-1">
              <p className="text-xs text-white/45">ترتيب {semester.sortOrder}</p>
              <h3 className="mt-1 text-base font-semibold text-white">
                {semester.title}
              </h3>
              <p className="mt-2 text-sm leading-7 text-white/65">
                {semester.description || "بدون وصف"}
              </p>
            </Link>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-3 text-xs text-light-purple">
                <span>{semester.lessonsCount} درس</span>
                <span>{semester.examsCount} امتحان</span>
              </div>
              {renderActions ? renderActions(semester) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

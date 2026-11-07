import Link from "next/link";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type { LessonListItem } from "@/lib/learning/types";

type LessonListProps = {
  items: LessonListItem[];
  hrefForLesson: (lessonId: string) => string;
  showLockState?: boolean;
  emptyDescription?: string;
  renderActions?: (lesson: LessonListItem) => React.ReactNode;
};

export function LessonList({
  items,
  hrefForLesson,
  showLockState = false,
  emptyDescription = "أضف درسًا جديدًا لهذا الترم من الزر أعلاه.",
  renderActions,
}: LessonListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="لا توجد دروس"
        description={emptyDescription}
      />
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((lesson) => {
        const locked = showLockState && lesson.locked;
        const meta = [
          lesson.isPublished ? "منشور" : "مسودة",
          lesson.durationSeconds
            ? `${Math.round(lesson.durationSeconds / 60)} د`
            : null,
          lesson.examCount ? `${lesson.examCount} امتحان` : null,
          lesson.videoLabel ?? null,
          lesson.completed ? "مكتمل" : null,
        ]
          .filter(Boolean)
          .join(" · ");
        const content = (
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
              locked
                ? "border-amber-400/25 bg-amber-400/5"
                : "border-emerald-400/20 bg-background/40"
            }`}
          >
            {locked ? (
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">
                  {lesson.sortOrder + 1}. {lesson.title}
                </p>
                <p className="mt-1 text-xs text-amber-100/80">
                  {lesson.lockedLabel ?? "مقفل — يلزم اشتراك نشط"}
                </p>
              </div>
            ) : (
              <Link href={hrefForLesson(lesson.id)} className="min-w-0">
                <p className="text-sm font-medium text-white">
                  {lesson.sortOrder + 1}. {lesson.title}
                </p>
                <p className="mt-1 text-xs text-white/50">{meta || "متاح"}</p>
              </Link>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {renderActions ? renderActions(lesson) : null}
              {locked ? (
                <span className="rounded-lg border border-amber-400/30 px-2 py-1 text-xs text-amber-100">
                  مقفل
                </span>
              ) : (
                <span className="rounded-lg border border-emerald-400/30 px-2 py-1 text-xs text-emerald-100">
                  متاح
                </span>
              )}
            </div>
          </div>
        );

        if (locked) {
          return <li key={lesson.id}>{content}</li>;
        }

        return (
          <li key={lesson.id}>
            {content}
          </li>
        );
      })}
    </ul>
  );
}

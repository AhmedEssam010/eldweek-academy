import Link from "next/link";
import type { CourseSubscribeState } from "@/lib/learning/types";

type CourseCardActionsProps = {
  courseId: string;
  subscribeState: CourseSubscribeState;
};

export function CourseCardActions({
  courseId,
  subscribeState,
}: CourseCardActionsProps) {
  const enterHref = `/courses/${courseId}`;
  const subscribeHref =
    subscribeState === "login_required"
      ? `/login?next=${encodeURIComponent(`/courses/${courseId}?subscribe=1`)}`
      : `/courses/${courseId}?subscribe=1`;

  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-2">
      <Link
        href={enterHref}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/20 bg-transparent px-3 py-2.5 text-center text-sm font-medium text-white transition hover:border-primary/50 hover:bg-white/5"
      >
        دخول الكورس
      </Link>

      {subscribeState === "enrolled" ? (
        <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2.5 text-center text-sm font-semibold text-emerald-100">
          أنت مشترك في الكورس
        </span>
      ) : subscribeState === "pending" ? (
        <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/15 px-3 py-2.5 text-center text-sm font-semibold text-amber-50">
          طلب الاشتراك قيد المراجعة
        </span>
      ) : subscribeState === "unavailable" ? (
        <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center text-sm font-medium text-white/55">
          الاشتراك غير متاح
        </span>
      ) : (
        <Link
          href={subscribeHref}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-3 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-secondary"
        >
          الاشتراك في الكورس
        </Link>
      )}
    </div>
  );
}

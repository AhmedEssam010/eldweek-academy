import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { LessonList } from "@/components/learning/LessonList";
import { MutationForm } from "@/components/dashboard/MutationForm";
import { requireAdmin } from "@/lib/auth/guards";
import {
  getSemesterDetail,
  resolveStaffCourseAccess,
} from "@/lib/learning/data";
import {
  moveLessonAction,
  updateSemesterAction,
} from "@/lib/learning/mutations";
import { lessonVideoPresence } from "@/lib/learning/mux";

export const instant = false;

type PageProps = {
  params: Promise<{ id: string; semesterId: string }>;
};

export default async function AdminSemesterDetailPage({ params }: PageProps) {
  await requireAdmin();
  const { id, semesterId } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: "admin",
    isAdmin: true,
  });
  if (access.availability === "empty" || !access.data) notFound();

  const detail = await getSemesterDetail(id, semesterId);
  if (detail.availability === "empty" || !detail.data.semester) notFound();

  const semester = detail.data.semester;
  const presence = await lessonVideoPresence(
    detail.data.lessons.map((lesson) => lesson.id),
  );
  const lessons = detail.data.lessons.map((lesson) => ({
    ...lesson,
    hasVideoAsset: presence.withVideo.has(lesson.id),
    videoLabel: presence.known
      ? presence.withVideo.has(lesson.id)
        ? "فيديو مرتبط"
        : "بدون فيديو"
      : "حالة الفيديو غير مؤكدة",
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={semester.title}
        description={semester.description || "إدارة محتوى هذا القسم داخل الكورس"}
        actions={
          <Link
            href={`/admin/courses/${id}/semesters`}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            كل الأقسام
          </Link>
        }
      />

      {(detail.availability === "setup_required" ||
        detail.availability === "unavailable") && (
        <SetupRequiredPanel message={detail.message} />
      )}

      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <h3 className="text-sm font-semibold text-white">تعديل القسم</h3>
        <div className="mt-3">
          <MutationForm action={updateSemesterAction} submitLabel="حفظ القسم">
            <input type="hidden" name="course_id" value={id} />
            <input type="hidden" name="semester_id" value={semester.id} />
            <input
              name="title"
              required
              minLength={2}
              defaultValue={semester.title}
              className="mb-2 w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white"
            />
            <textarea
              name="description"
              rows={3}
              defaultValue={semester.description}
              className="w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white"
            />
          </MutationForm>
          <p className="mt-3 text-xs leading-6 text-white/45">
            ترتيب العرض: {semester.sortOrder}. القسم ليس منتج شراء. احذفه من
            قائمة الأقسام فقط إن كان فارغًا من الدروس والامتحانات.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-white">الدروس</h3>
          <Link
            href={`/admin/courses/${id}/semesters/${semesterId}/lessons/new`}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            درس جديد
          </Link>
        </div>
        <LessonList
          items={lessons}
          hrefForLesson={(lessonId) =>
            `/admin/courses/${id}/lessons/${lessonId}`
          }
          renderActions={(lesson) => (
            <div className="flex gap-2">
              <form action={moveLessonAction.bind(null, id, semesterId, lesson.id, "up")}>
                <button type="submit" className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/80">أعلى</button>
              </form>
              <form action={moveLessonAction.bind(null, id, semesterId, lesson.id, "down")}>
                <button type="submit" className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/80">أسفل</button>
              </form>
            </div>
          )}
        />
      </section>

      <p className="text-sm text-white/55">
        امتحانات الكورس:{" "}
        <Link
          href={`/admin/courses/${id}/exams`}
          className="text-light-purple hover:underline"
        >
          إدارة الامتحانات
        </Link>
      </p>
    </div>
  );
}

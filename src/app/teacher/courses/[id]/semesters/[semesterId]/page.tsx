import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { LessonList } from "@/components/learning/LessonList";
import { MutationForm } from "@/components/dashboard/MutationForm";
import { requireTeacher } from "@/lib/auth/guards";
import {
  getSemesterDetail,
  resolveStaffCourseAccess,
} from "@/lib/learning/data";
import {
  moveLessonAction,
  updateSemesterAction,
} from "@/lib/learning/mutations";

export const instant = false;

type PageProps = {
  params: Promise<{ id: string; semesterId: string }>;
};

export default async function TeacherSemesterDetailPage({ params }: PageProps) {
  const user = await requireTeacher();
  const { id, semesterId } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: user.userId,
    isAdmin: false,
  });
  if (access.availability === "empty" || !access.data) notFound();

  const detail = await getSemesterDetail(id, semesterId);
  if (detail.availability === "empty" || !detail.data.semester) notFound();

  const semester = detail.data.semester;
  const canEdit = access.data.canEditContent;

  return (
    <div className="space-y-6">
      <PageHeader
        title={semester.title}
        description={access.data.title}
        actions={
          <Link
            href={`/teacher/courses/${id}/semesters`}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            الترمات
          </Link>
        }
      />

      {(detail.availability === "setup_required" ||
        detail.availability === "unavailable") && (
        <SetupRequiredPanel message={detail.message} />
      )}

      {canEdit ? (
        <div className="rounded-2xl border border-white/10 bg-surface p-5">
          <MutationForm action={updateSemesterAction} submitLabel="حفظ الترم">
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
        </div>
      ) : null}

      {canEdit ? (
        <Link
          href={`/teacher/courses/${id}/semesters/${semesterId}/lessons/new`}
          className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          درس جديد
        </Link>
      ) : null}

      <LessonList
        items={detail.data.lessons}
        hrefForLesson={(lessonId) =>
          `/teacher/courses/${id}/lessons/${lessonId}`
        }
        renderActions={
          canEdit
            ? (lesson) => (
                <div className="flex gap-2">
                  <form action={moveLessonAction.bind(null, id, semesterId, lesson.id, "up")}>
                    <button type="submit" className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/80">أعلى</button>
                  </form>
                  <form action={moveLessonAction.bind(null, id, semesterId, lesson.id, "down")}>
                    <button type="submit" className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/80">أسفل</button>
                  </form>
                </div>
              )
            : undefined
        }
      />
    </div>
  );
}

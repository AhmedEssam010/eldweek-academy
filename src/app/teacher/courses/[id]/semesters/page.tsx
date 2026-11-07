import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseContentLayout } from "@/components/learning/CourseContentLayout";
import { SemesterList } from "@/components/learning/SemesterList";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { requireTeacher } from "@/lib/auth/guards";
import {
  listCourseSemesters,
  resolveStaffCourseAccess,
} from "@/lib/learning/data";
import { moveSemesterAction } from "@/lib/learning/mutations";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export default async function TeacherCourseSemestersPage({ params }: PageProps) {
  const user = await requireTeacher();
  const { id } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: user.userId,
    isAdmin: false,
  });

  if (access.availability === "empty" || !access.data) notFound();

  const semesters = await listCourseSemesters(id);

  return (
    <CourseContentLayout
      access={access.data}
      basePath={`/teacher/courses/${id}`}
      active="semesters"
      description={
        access.data.canEditContent
          ? "يمكنك إدارة الترمات لأن can_edit_content مفعّل."
          : "عرض فقط — تعديل المحتوى غير مصرّح لصلاحياتك."
      }
    >
      {(semesters.availability === "setup_required" ||
        semesters.availability === "unavailable") && (
        <SetupRequiredPanel message={semesters.message} />
      )}

      {access.data.canEditContent ? (
        <Link
          href={`/teacher/courses/${id}/semesters/new`}
          className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          ترم جديد
        </Link>
      ) : null}

      <SemesterList
        items={semesters.data}
        hrefForSemester={(semesterId) =>
          `/teacher/courses/${id}/semesters/${semesterId}`
        }
        renderActions={
          access.data.canEditContent
            ? (semester) => (
                <div className="flex gap-2">
                  <form
                    action={moveSemesterAction.bind(null, id, semester.id, "up")}
                  >
                    <button
                      type="submit"
                      className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/80"
                    >
                      أعلى
                    </button>
                  </form>
                  <form
                    action={moveSemesterAction.bind(null, id, semester.id, "down")}
                  >
                    <button
                      type="submit"
                      className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/80"
                    >
                      أسفل
                    </button>
                  </form>
                </div>
              )
            : undefined
        }
      />
    </CourseContentLayout>
  );
}

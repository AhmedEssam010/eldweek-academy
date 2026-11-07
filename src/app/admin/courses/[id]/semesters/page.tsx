import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseContentLayout } from "@/components/learning/CourseContentLayout";
import { SemesterList } from "@/components/learning/SemesterList";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { ConfirmationDialog } from "@/components/dashboard/ConfirmationDialog";
import { requireAdmin } from "@/lib/auth/guards";
import {
  listCourseSemesters,
  resolveStaffCourseAccess,
} from "@/lib/learning/data";
import {
  deleteSectionAction,
  moveSemesterAction,
} from "@/lib/learning/mutations";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminCourseSemestersPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: "admin",
    isAdmin: true,
  });

  if (access.availability === "empty" || !access.data) {
    notFound();
  }

  const semesters = await listCourseSemesters(id);

  return (
    <CourseContentLayout
      access={access.data}
      basePath={`/admin/courses/${id}`}
      active="semesters"
      description={`الأقسام حاويات تنظيمية فقط (${semesters.data.length}). الطالب لا يشتري قسمًا منفصلًا.`}
    >
      {(semesters.availability === "setup_required" ||
        semesters.availability === "unavailable") && (
        <SetupRequiredPanel message={semesters.message} />
      )}

      <Link
        href={`/admin/courses/${id}/semesters/new`}
        className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
      >
        قسم جديد
      </Link>

      <SemesterList
        items={semesters.data}
        hrefForSemester={(semesterId) =>
          `/admin/courses/${id}/semesters/${semesterId}`
        }
        renderActions={(semester) => (
          <div className="flex flex-wrap gap-2">
            <form action={moveSemesterAction.bind(null, id, semester.id, "up")}>
              <button
                type="submit"
                className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/80"
              >
                أعلى
              </button>
            </form>
            <form action={moveSemesterAction.bind(null, id, semester.id, "down")}>
              <button
                type="submit"
                className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/80"
              >
                أسفل
              </button>
            </form>
            <ConfirmationDialog
              triggerLabel="حذف"
              title="حذف القسم؟"
              description="يُحذف القسم الفارغ فقط. إن وُجدت دروس أو امتحانات انقلها أو احذفها أولًا."
              confirmLabel="تأكيد الحذف"
              danger
              onConfirm={deleteSectionAction.bind(null, id, semester.id)}
            />
          </div>
        )}
      />
    </CourseContentLayout>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { LessonEditor } from "@/components/learning/LessonEditor";
import { LessonVideoSetup } from "@/components/learning/LessonVideoSetup";
import { requireAdmin } from "@/lib/auth/guards";
import {
  getLessonEditorData,
  resolveStaffCourseAccess,
} from "@/lib/learning/data";

export const instant = false;

type PageProps = {
  params: Promise<{ id: string; lessonId: string }>;
};

export default async function AdminLessonEditorPage({ params }: PageProps) {
  await requireAdmin();
  const { id, lessonId } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: "admin",
    isAdmin: true,
  });
  if (access.availability === "empty" || !access.data) notFound();

  const lesson = await getLessonEditorData(id, lessonId);
  if (lesson.availability === "empty" || !lesson.data) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={lesson.data.title}
        description={`${lesson.data.courseTitle} · ${lesson.data.semesterTitle}`}
        actions={
          <Link
            href={`/admin/courses/${id}/semesters/${lesson.data.semesterId}`}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            رجوع للترم
          </Link>
        }
      />

      {(lesson.availability === "setup_required" ||
        lesson.availability === "unavailable") && (
        <SetupRequiredPanel message={lesson.message} />
      )}

      <LessonEditor lesson={lesson.data} canEdit />
      <LessonVideoSetup
        courseId={lesson.data.courseId}
        semesterId={lesson.data.semesterId}
        lessonId={lesson.data.id}
        canEdit
      />
    </div>
  );
}

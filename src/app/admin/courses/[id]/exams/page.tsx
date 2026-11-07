import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseContentLayout } from "@/components/learning/CourseContentLayout";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { requireAdmin } from "@/lib/auth/guards";
import {
  listCourseExams,
  resolveStaffCourseAccess,
} from "@/lib/learning/data";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminCourseExamsPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: "admin",
    isAdmin: true,
  });
  if (access.availability === "empty" || !access.data) notFound();

  const exams = await listCourseExams(id);

  return (
    <CourseContentLayout
      access={access.data}
      basePath={`/admin/courses/${id}`}
      active="exams"
      description="امتحانات MCQ — مفاتيح الإجابات لا تُرسل لواجهات الطلاب."
    >
      {(exams.availability === "setup_required" ||
        exams.availability === "unavailable") && (
        <SetupRequiredPanel message={exams.message} />
      )}

      <div className="flex justify-end">
        <Link
          href={`/admin/courses/${id}/exams/new`}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          مسودة امتحان
        </Link>
      </div>

      {exams.data.length === 0 ? (
        <EmptyState
          title="لا توجد امتحانات"
          description="أنشئ مسودة بعد تطبيق هجرات exams محليًا/على staging."
        />
      ) : (
        <ul className="space-y-3">
          {exams.data.map((exam) => (
            <li key={exam.id}>
              <Link
                href={`/admin/courses/${id}/exams/${exam.id}`}
                className="block rounded-2xl border border-white/10 bg-surface p-4 hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-white">{exam.title}</h3>
                  <span className="text-xs text-light-purple">
                    {exam.isPublished ? "منشور" : "مسودة"} · {exam.questionsCount}{" "}
                    سؤال
                  </span>
                </div>
                <p className="mt-2 text-sm text-white/60">{exam.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CourseContentLayout>
  );
}

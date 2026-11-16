import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseContentLayout } from "@/components/learning/CourseContentLayout";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { requireAdmin } from "@/lib/auth/guards";
import { resolveStaffCourseAccess } from "@/lib/learning/data";
import { listCourseHomeworks } from "@/lib/learning/homework-data";

export const instant = false;

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminCourseHomeworkPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: "admin",
    isAdmin: true,
  });
  if (access.availability === "empty" || !access.data) notFound();

  const homeworks = await listCourseHomeworks(id);

  return (
    <CourseContentLayout
      access={access.data}
      basePath={`/admin/courses/${id}`}
      active="homework"
      description="واجبات مرتبطة بأقسام الكورس — منفصلة عن الامتحانات."
    >
      {(homeworks.availability === "setup_required" ||
        homeworks.availability === "unavailable") && (
        <SetupRequiredPanel message={homeworks.message} />
      )}

      <div className="mb-4 flex justify-end">
        <Link
          href={`/admin/courses/${id}/homework/new`}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          واجب جديد
        </Link>
      </div>

      {homeworks.data.length === 0 ? (
        <EmptyState
          title="لا توجد واجبات بعد"
          description="أنشئ واجبًا واربطه بقسم، ثم أضف أسئلة اختيار أو صح/خطأ أو مقالية."
        />
      ) : (
        <ul className="space-y-3">
          {homeworks.data.map((item) => (
            <li key={item.id}>
              <Link
                href={`/admin/courses/${id}/homework/${item.id}`}
                className="block rounded-2xl border border-white/10 bg-surface p-4 transition hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                  <span className="text-xs text-white/50">
                    {item.isPublished ? "منشور" : "مسودة"} · {item.questionsCount}{" "}
                    سؤال · {item.totalPoints} درجة
                  </span>
                </div>
                {item.dueAt ? (
                  <p className="mt-2 text-xs text-white/45">
                    موعد التسليم: {new Date(item.dueAt).toLocaleString("ar-EG")}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CourseContentLayout>
  );
}

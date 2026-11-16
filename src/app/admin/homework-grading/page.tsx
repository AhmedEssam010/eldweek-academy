import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { listCourses } from "@/lib/dashboard/data";
import { listHomeworkGradingQueue } from "@/lib/learning/homework-data";

export const metadata = {
  title: "تصحيح الواجبات | المهندس أحمد الدويك",
};

export const instant = false;

type SearchParams = Promise<{
  course?: string;
  status?: string;
}>;

export default async function AdminHomeworkGradingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status =
    params.status === "graded" || params.status === "all" ? params.status : "pending";
  const queue = await listHomeworkGradingQueue({
    courseId: params.course,
    status,
  });
  const courses = await listCourses({ status: "all" });
  const pendingCount = (await listHomeworkGradingQueue({ status: "pending" })).data
    .length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="تصحيح الواجبات"
        description="تصحيح مقالات الواجبات واعتماد النتائج — منفصل عن تصحيح الامتحانات."
      />

      <div className="rounded-2xl border border-white/10 bg-surface p-4 text-sm text-white/70">
        تسليمات بانتظار التصحيح:{" "}
        <span className="font-semibold text-white">{pendingCount}</span>
      </div>

      {(queue.availability === "setup_required" ||
        queue.availability === "unavailable") && (
        <SetupRequiredPanel message={queue.message} />
      )}

      <form className="grid gap-3 rounded-2xl border border-white/10 bg-surface p-4 sm:grid-cols-3">
        <label className="text-xs text-white/55">
          الكورس
          <select
            name="course"
            defaultValue={params.course ?? ""}
            className="mt-1 w-full rounded-xl border border-white/15 bg-background px-3 py-2 text-sm text-white"
          >
            <option value="">الكل</option>
            {courses.data.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-white/55">
          الحالة
          <select
            name="status"
            defaultValue={status}
            className="mt-1 w-full rounded-xl border border-white/15 bg-background px-3 py-2 text-sm text-white"
          >
            <option value="pending">بانتظار / مسودة</option>
            <option value="graded">معتمد</option>
            <option value="all">الكل</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            تصفية
          </button>
        </div>
      </form>

      {queue.data.length === 0 ? (
        <EmptyState
          title="لا توجد تسليمات"
          description="عند تسليم واجب يحتوي أسئلة مقالية تظهر هنا للتصحيح."
        />
      ) : (
        <ul className="space-y-3">
          {queue.data.map((item) => (
            <li key={item.attemptId}>
              <Link
                href={`/admin/homework-grading/${item.attemptId}`}
                className="block rounded-2xl border border-white/10 bg-surface p-4 transition hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">
                    {item.studentName} · {item.homeworkTitle}
                  </h3>
                  <span className="text-xs text-white/50">
                    {item.gradingStatus === "finalized"
                      ? "معتمد"
                      : item.gradingStatus === "draft"
                        ? "مسودة"
                        : "بانتظار التصحيح"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-white/55">
                  {item.courseTitle} · {item.semesterTitle} · محاولة{" "}
                  {item.attemptNumber}
                  {item.submittedAt
                    ? ` · ${new Date(item.submittedAt).toLocaleString("ar-EG")}`
                    : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

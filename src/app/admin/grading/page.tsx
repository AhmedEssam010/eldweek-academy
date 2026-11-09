import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { listExamGradingQueue } from "@/lib/learning/data";
import { listCourses } from "@/lib/dashboard/data";

export const metadata = {
  title: "تصحيح الامتحانات | المهندس أحمد الدويك",
};

export const instant = false;

type SearchParams = Promise<{
  course?: string;
  exam?: string;
  status?: string;
}>;

export default async function AdminGradingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status =
    params.status === "graded" || params.status === "all" ? params.status : "pending";
  const queue = await listExamGradingQueue({
    courseId: params.course,
    examId: params.exam,
    status,
  });
  const courses = await listCourses({ status: "all" });
  const pendingCount = (await listExamGradingQueue({ status: "pending" })).data.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="تصحيح الامتحانات"
        description="تصحيح الأسئلة المقالية واعتماد النتيجة النهائية للطلاب."
      />

      <div className="rounded-2xl border border-white/10 bg-surface p-4 text-sm text-white/70">
        تسليمات بانتظار التصحيح:{" "}
        <span className="font-semibold text-white">{pendingCount}</span>
      </div>

      <form className="grid gap-3 rounded-2xl border border-white/10 bg-surface p-4 sm:grid-cols-4">
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
          معرّف الامتحان (اختياري)
          <input
            name="exam"
            defaultValue={params.exam ?? ""}
            placeholder="UUID"
            className="mt-1 w-full rounded-xl border border-white/15 bg-background px-3 py-2 text-sm text-white"
          />
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
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            تصفية
          </button>
        </div>
      </form>

      {(queue.availability === "setup_required" ||
        queue.availability === "unavailable") && (
        <SetupRequiredPanel message={queue.message} />
      )}

      {queue.data.length === 0 ? (
        <EmptyState
          title="لا توجد تسليمات"
          description="عند تسليم امتحان يحتوي أسئلة مقالية تظهر هنا للتصحيح اليدوي."
        />
      ) : (
        <ul className="space-y-3">
          {queue.data.map((item) => (
            <li key={item.attemptId}>
              <Link
                href={`/admin/grading/${item.attemptId}`}
                className="block rounded-2xl border border-white/10 bg-surface p-4 transition hover:border-primary/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-white">{item.examTitle}</h2>
                    <p className="mt-1 text-sm text-white/60">
                      {item.courseTitle} · {item.studentName}
                    </p>
                  </div>
                  <span className="rounded-lg bg-white/5 px-2 py-1 text-xs text-light-purple">
                    {item.gradingStatus === "finalized"
                      ? "معتمد"
                      : item.gradingStatus === "draft"
                        ? "مسودة"
                        : "بانتظار التصحيح"}
                  </span>
                </div>
                <p className="mt-3 text-xs text-white/50">
                  التسليم:{" "}
                  {item.submittedAt
                    ? new Date(item.submittedAt).toLocaleString("ar-EG")
                    : "—"}
                  {" · "}
                  موضوعي: {item.objectiveEarned ?? "—"}
                  {item.totalPoints != null ? ` / ${item.totalPoints}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

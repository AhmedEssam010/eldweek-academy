import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { DataTable } from "@/components/dashboard/DataTable";
import { ConfirmationDialog } from "@/components/dashboard/ConfirmationDialog";
import { CourseStatusBadge } from "@/components/dashboard/StatusBadge";
import { CourseThumbnail } from "@/components/learning/CourseThumbnail";
import { listCourses } from "@/lib/dashboard/data";
import { deleteCourseAction } from "@/lib/dashboard/mutations";
import { academicSemesterLabel } from "@/lib/learning/course-structure";
import type { CourseStatus } from "@/types/database";

export const metadata = {
  title: "إدارة الكورسات | المهندس أحمد الدويك",
};

export const instant = false;

type CoursesPageProps = {
  searchParams: Promise<{ q?: string; status?: string }>;
};

const statuses: Array<CourseStatus | "all"> = [
  "all",
  "draft",
  "pending_review",
  "published",
  "archived",
];

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default async function AdminCoursesPage({
  searchParams,
}: CoursesPageProps) {
  const params = await searchParams;
  const status = statuses.includes((params.status as CourseStatus | "all") ?? "all")
    ? ((params.status as CourseStatus | "all") ?? "all")
    : "all";

  const result = await listCourses({
    query: params.q,
    status,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="الكورسات"
        description="كل صف هنا كورس مشتَرى داخل ترم دراسي. الأقسام داخل الكورس تنظيمية وليست منتجات."
        actions={
          <Link
            href="/admin/courses/new"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-secondary"
          >
            إضافة كورس جديد
          </Link>
        }
      />

      {(result.availability === "setup_required" ||
        result.availability === "unavailable") && (
        <SetupRequiredPanel message={result.message} />
      )}

      <form className="grid gap-3 rounded-2xl border border-white/10 bg-surface p-4 sm:grid-cols-[1fr_auto_auto]">
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="بحث بالعنوان أو المعرّف"
          className="rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white outline-none focus:border-secondary"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded-xl border border-white/15 bg-background px-3 py-2.5 text-sm text-white"
        >
          <option value="all">كل الحالات</option>
          <option value="draft">مسودة</option>
          <option value="pending_review">بانتظار المراجعة</option>
          <option value="published">منشور</option>
          <option value="archived">مؤرشف</option>
        </select>
        <button
          type="submit"
          className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white hover:bg-white/5"
        >
          تطبيق
        </button>
      </form>

      {result.data.length === 0 ? (
        <EmptyState
          title={
            status === "all" && !(params.q ?? "").trim()
              ? "لسه مفيش كورسات. ابدأ بإضافة أول كورس."
              : "لا توجد كورسات مطابقة"
          }
          description={
            status === "all" && !(params.q ?? "").trim()
              ? "أنشئ مسودة كورس جديدة ثم انشرها عشان تظهر للطلاب."
              : result.message
          }
          action={
            <Link
              href="/admin/courses/new"
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-secondary"
            >
              إضافة كورس جديد
            </Link>
          }
        />
      ) : (
        <DataTable
          rows={result.data}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "title",
              header: "الكورس",
              render: (row) => (
                <div className="flex max-w-lg items-start gap-3">
                  <CourseThumbnail
                    title={row.title}
                    thumbnailPath={row.thumbnailPath}
                    className="h-14 w-20 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-white">{row.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">
                      {row.description || "بدون وصف"}
                    </p>
                    <p className="mt-1 text-[11px] text-white/35" dir="ltr">
                      {row.slug}
                    </p>
                  </div>
                </div>
              ),
            },
            {
              key: "semester",
              header: "الترم الدراسي",
              render: (row) => (
                <span className="text-xs text-white/70">
                  {academicSemesterLabel(row.academicSemester)}
                </span>
              ),
            },
            {
              key: "status",
              header: "الحالة",
              render: (row) => <CourseStatusBadge status={row.status} />,
            },
            {
              key: "created",
              header: "تاريخ الإنشاء",
              render: (row) => (
                <span className="text-xs text-white/65">
                  {formatDate(row.createdAt)}
                </span>
              ),
            },
            {
              key: "actions",
              header: "إدارة",
              render: (row) => (
                <div className="flex flex-wrap gap-2 text-sm">
                  <Link
                    href={`/admin/courses/${row.id}`}
                    className="text-light-purple hover:underline"
                  >
                    فتح الكورس
                  </Link>
                  {row.status === "published" ? (
                    <Link
                      href={`/admin/courses/${row.id}#publish`}
                      className="font-medium text-white hover:underline"
                    >
                      إلغاء النشر
                    </Link>
                  ) : row.status !== "archived" ? (
                    <Link
                      href={`/admin/courses/${row.id}#publish`}
                      className="font-medium text-white hover:underline"
                    >
                      نشر الكورس
                    </Link>
                  ) : null}
                  {row.status !== "archived" ? (
                    <Link
                      href={`/admin/courses/${row.id}#archive`}
                      className="text-white/55 hover:text-white hover:underline"
                    >
                      أرشفة
                    </Link>
                  ) : (
                    <span className="text-white/35">مؤرشف</span>
                  )}
                  <ConfirmationDialog
                    danger
                    triggerLabel="حذف الكورس"
                    title="تأكيد حذف الكورس"
                    description={`سيتم حذف «${row.title}» نهائيًا مع أقسامه ودروسه المسودة المرتبطة به. لا يمكن التراجع. إن وُجدت تسجيلات أو طلبات دفع سيتم رفض الحذف واستخدام الأرشفة بدلًا منه. لن تُحذف أصول Mux أو ملفات التخزين تلقائيًا.`}
                    confirmLabel="تأكيد الحذف النهائي"
                    onConfirm={deleteCourseAction.bind(null, row.id)}
                  />
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

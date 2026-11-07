import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { DataTable } from "@/components/dashboard/DataTable";
import { ActiveStatusBadge } from "@/components/dashboard/StatusBadge";
import { listTeachers } from "@/lib/dashboard/data";

export const metadata = {
  title: "إدارة المدرّسين | المهندس أحمد الدويك",
};

export const instant = false;

type TeachersPageProps = {
  searchParams: Promise<{ q?: string; status?: string }>;
};

export default async function AdminTeachersPage({
  searchParams,
}: TeachersPageProps) {
  const params = await searchParams;
  const status =
    params.status === "active" || params.status === "inactive"
      ? params.status
      : "all";

  const result = await listTeachers({
    query: params.q,
    active: status,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="المدرّسون"
        description="فريق المنصة يُدار بواسطة المالك فقط. التعيينات والصلاحيات لا تُمنح من المتصفح مباشرة."
        actions={
          <Link
            href="/admin/teachers/new"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-secondary"
          >
            إضافة مدرّس
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
          placeholder="بحث بالاسم أو الهاتف"
          className="rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white outline-none focus:border-secondary"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded-xl border border-white/15 bg-background px-3 py-2.5 text-sm text-white"
        >
          <option value="all">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="inactive">غير نشط</option>
        </select>
        <button
          type="submit"
          className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white hover:bg-white/5"
        >
          تطبيق
        </button>
      </form>

      {result.availability === "empty" || result.data.length === 0 ? (
        <EmptyState
          title="لا يوجد مدرّسون للعرض"
          description={result.message}
          action={
            <Link
              href="/admin/teachers/new"
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white"
            >
              فتح نموذج الإضافة
            </Link>
          }
        />
      ) : (
        <DataTable
          rows={result.data}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "name",
              header: "المدرّس",
              render: (row) => (
                <div>
                  <p className="font-medium text-white">
                    {row.fullName || "بدون اسم"}
                  </p>
                  <p className="text-xs text-white/45" dir="ltr">
                    {row.phoneNumber || "لا يوجد هاتف"}
                  </p>
                </div>
              ),
            },
            {
              key: "status",
              header: "الحالة",
              render: (row) => <ActiveStatusBadge active={row.isActive} />,
            },
            {
              key: "drafts",
              header: "إنشاء مسودات",
              render: (row) =>
                row.canCreateCourseDrafts ? "مفعّل" : "غير مفعّل",
            },
            {
              key: "actions",
              header: "إدارة",
              render: (row) => (
                <Link
                  href={`/admin/teachers/${row.id}`}
                  className="text-light-purple hover:underline"
                >
                  التفاصيل
                </Link>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

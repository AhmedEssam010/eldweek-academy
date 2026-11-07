import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { DataTable } from "@/components/dashboard/DataTable";
import { ActiveStatusBadge } from "@/components/dashboard/StatusBadge";
import { listStudents } from "@/lib/dashboard/students-data";

export const metadata = {
  title: "إدارة الطلاب | المهندس أحمد الدويك",
};

export const instant = false;

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function AdminStudentsPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const students = await listStudents({ query: q });

  return (
    <div className="space-y-6">
      <PageHeader
        title="الطلاب"
        description="قائمة الطلاب المسجّلين وتسجيلاتهم النشطة."
      />

      <form className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="بحث بالاسم أو رقم الهاتف..."
          className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-secondary"
        >
          بحث
        </button>
      </form>

      {students.availability === "setup_required" ||
      students.availability === "unavailable" ? (
        <SetupRequiredPanel message={students.message} />
      ) : null}

      {students.availability === "empty" || students.data.length === 0 ? (
        <EmptyState
          title="لا يوجد طلاب"
          description="لم يسجّل أي طالب في المنصة بعد."
        />
      ) : (
        <DataTable
          rows={students.data}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "name",
              header: "الاسم",
              render: (row) => (
                <Link
                  href={`/admin/students/${row.id}`}
                  className="text-light-purple hover:underline"
                >
                  {row.fullName || "بدون اسم"}
                </Link>
              ),
            },
            {
              key: "phone",
              header: "الهاتف",
              render: (row) => (
                <span className="font-mono text-xs text-white/70" dir="ltr">
                  {row.phoneNumber || "—"}
                </span>
              ),
            },
            {
              key: "status",
              header: "الحالة",
              render: (row) => <ActiveStatusBadge active={row.isActive} />,
            },
            {
              key: "enrollments",
              header: "تسجيلات نشطة",
              render: (row) => (
                <span className="text-sm text-white/80">
                  {row.activeEnrollmentsCount}
                </span>
              ),
            },
            {
              key: "payments",
              header: "دفع معلّق",
              render: (row) =>
                row.pendingPaymentsCount > 0 ? (
                  <span className="inline-flex rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-100">
                    {row.pendingPaymentsCount}
                  </span>
                ) : (
                  <span className="text-xs text-white/40">0</span>
                ),
            },
            {
              key: "createdAt",
              header: "التسجيل",
              render: (row) => (
                <span className="text-xs text-white/50">
                  {new Date(row.createdAt).toLocaleDateString("ar-EG")}
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

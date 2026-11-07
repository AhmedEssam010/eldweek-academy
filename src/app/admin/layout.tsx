import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminNavItems } from "@/lib/dashboard/navigation";

export const instant = false;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const user = await requireAdmin();

  return (
    <DashboardLayout
      title="لوحة المالك"
      roleLabel="المالك · المهندس أحمد الدويك"
      fullName={user.fullName || "المهندس أحمد الدويك"}
      navItems={adminNavItems}
    >
      {children}
    </DashboardLayout>
  );
}

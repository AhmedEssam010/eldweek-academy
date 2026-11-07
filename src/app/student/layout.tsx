import { connection } from "next/server";
import { requireStudent } from "@/lib/auth/guards";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { studentNavItems } from "@/lib/dashboard/navigation";

export const instant = false;

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const user = await requireStudent();

  return (
    <DashboardLayout
      title="لوحة الطالب"
      roleLabel="طالب"
      fullName={user.fullName || "طالب"}
      navItems={studentNavItems}
    >
      {children}
    </DashboardLayout>
  );
}

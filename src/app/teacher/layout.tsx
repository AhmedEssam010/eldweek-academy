import { connection } from "next/server";
import { requireTeacher } from "@/lib/auth/guards";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { teacherNavItems } from "@/lib/dashboard/navigation";

export const instant = false;

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const user = await requireTeacher();

  return (
    <DashboardLayout
      title="لوحة المدرّس"
      roleLabel="مدرّس فريق المنصة"
      fullName={user.fullName || "مدرّس"}
      navItems={teacherNavItems}
    >
      {children}
    </DashboardLayout>
  );
}

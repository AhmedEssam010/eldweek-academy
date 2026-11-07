import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { DataTable } from "@/components/dashboard/DataTable";
import { CourseStatusBadge } from "@/components/dashboard/StatusBadge";
import { requireTeacher } from "@/lib/auth/guards";
import { listTeacherAssignedCourses } from "@/lib/dashboard/data";

export const metadata = {
  title: "كورساتي | المهندس أحمد الدويك",
};

export const instant = false;

export default async function TeacherCoursesPage() {
  const user = await requireTeacher();
  const courses = await listTeacherAssignedCourses(user.userId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="كورساتي"
        description="قائمة مبنية على التعيينات الصريحة فقط. لا يوجد اعتماد على created_by كمصدر صلاحية."
      />

      {(courses.availability === "setup_required" ||
        courses.availability === "unavailable") && (
        <SetupRequiredPanel message={courses.message} />
      )}

      {courses.data.length === 0 ? (
        <EmptyState title="لا توجد كورسات" description={courses.message} />
      ) : (
        <DataTable
          rows={courses.data}
          rowKey={(row) => row.courseId}
          columns={[
            {
              key: "title",
              header: "الكورس",
              render: (row) => row.title,
            },
            {
              key: "status",
              header: "الحالة",
              render: (row) => <CourseStatusBadge status={row.status} />,
            },
            {
              key: "permissions",
              header: "الصلاحيات",
              render: (row) => (
                <span className="text-xs text-white/65">
                  {[
                    row.canEditContent ? "محتوى" : null,
                    row.canManageExams ? "امتحانات" : null,
                    row.canViewStudentProgress ? "تقدّم" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "بدون صلاحيات تفصيلية"}
                </span>
              ),
            },
            {
              key: "open",
              header: "فتح",
              render: (row) => (
                <Link
                  href={`/teacher/courses/${row.courseId}`}
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

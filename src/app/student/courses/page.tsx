import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { CoursesComingSoon } from "@/components/home/CoursesComingSoon";
import { CourseThumbnail } from "@/components/learning/CourseThumbnail";
import { requireStudent } from "@/lib/auth/guards";
import { listStudentCourses } from "@/lib/learning/data";
import { listPublishedCourses } from "@/lib/learning/browse-data";
import { academicSemesterLabel } from "@/lib/learning/course-structure";
import type { PublishedCourseCard } from "@/lib/learning/browse-data";

export const instant = false;

export const metadata = {
  title: "كورساتي | المهندس أحمد الدويك",
};

function groupBySemester(courses: PublishedCourseCard[]) {
  const first = courses.filter((c) => c.academicSemester === "first");
  const second = courses.filter((c) => c.academicSemester === "second");
  const unset = courses.filter((c) => !c.academicSemester);
  return [
    { key: "first", title: "الترم الأول", items: first },
    { key: "second", title: "الترم الثاني", items: second },
    { key: "unset", title: "كورسات بدون ترم محدد", items: unset },
  ].filter((group) => group.items.length > 0);
}

export default async function StudentCoursesPage() {
  const user = await requireStudent();
  const [courses, published] = await Promise.all([
    listStudentCourses(user.userId),
    listPublishedCourses(),
  ]);

  const enrolledCourseIds = new Set(courses.data.map((c) => c.courseId));
  const browsable = published.data.filter(
    (c) => !enrolledCourseIds.has(c.courseId),
  );
  const grouped = groupBySemester(browsable);

  return (
    <div className="space-y-6">
      <PageHeader
        title="كورساتي"
        description="كل كورس مشتَرى يفتح كل أقسامه المنشورة. لا يوجد شراء داخل الكورس."
      />

      {(courses.availability === "setup_required" ||
        courses.availability === "unavailable") && (
        <SetupRequiredPanel message={courses.message} />
      )}

      {courses.data.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-white">كورساتي المشترك بها</h3>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {courses.data.map((course) => (
              <li key={`${course.courseId}-${course.accessLabel}`} className="min-w-0">
                {course.coursePublished ? (
                  <Link
                    href={`/courses/${course.courseId}`}
                    className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface transition hover:border-primary/40"
                  >
                    <CourseThumbnail
                      title={course.title}
                      thumbnailPath={course.thumbnailPath}
                      className="aspect-[16/9] w-full shrink-0 rounded-none border-0"
                    />
                    <div className="flex min-w-0 flex-1 flex-col p-4">
                      <h3 className="line-clamp-2 text-base font-semibold leading-7 text-white">
                        {course.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-7 text-white/65">
                        {course.description || "بدون وصف"}
                      </p>
                      <p className="mt-auto pt-3 text-xs text-light-purple">
                        {course.accessLabel} ·{" "}
                        {course.enrollmentStatus === "active"
                          ? "نشط"
                          : course.enrollmentStatus === "suspended"
                            ? "موقوف"
                            : "منتهٍ"}
                      </p>
                    </div>
                  </Link>
                ) : (
                  <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-surface p-5">
                    <h3 className="line-clamp-2 text-base font-semibold leading-7 text-white">
                      {course.title}
                    </h3>
                    <p className="mt-3 text-xs text-amber-200/80">
                      {course.accessLabel}. التشغيل غير متاح.
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState
          title="لا توجد كورسات مشتراة"
          description="بعد موافقة المالك على طلب الدفع تظهر الكورس هنا مع كل أقسامها المنشورة."
        />
      )}

      {published.availability === "setup_required" ||
      published.availability === "unavailable" ? (
        <SetupRequiredPanel message={published.message} />
      ) : published.availability === "empty" || published.data.length === 0 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-white">كورسات متاحة للشراء</h3>
          <CoursesComingSoon />
        </section>
      ) : grouped.length > 0 ? (
        <section className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white">كورسات متاحة للشراء</h3>
            <p className="mt-1 text-sm text-white/55">
              اشترِ الكورس مرة واحدة. الأقسام داخلها ليست منتجات منفصلة.
            </p>
          </div>
          {grouped.map((group) => (
            <div key={group.key} className="space-y-3">
              <h4 className="text-sm font-medium text-light-purple">{group.title}</h4>
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {group.items.map((course) => (
                  <li key={course.courseId} className="min-w-0">
                    <Link
                      href={`/courses/${course.courseId}`}
                      className="flex h-full flex-col overflow-hidden rounded-2xl border border-primary/15 bg-primary/5 transition hover:border-primary/40"
                    >
                      <CourseThumbnail
                        title={course.title}
                        thumbnailPath={course.thumbnailPath}
                        className="aspect-[16/9] w-full shrink-0 rounded-none border-0"
                      />
                      <div className="flex min-w-0 flex-1 flex-col p-4">
                        <h3 className="line-clamp-2 text-base font-semibold leading-7 text-white">
                          {course.title}
                        </h3>
                        <p className="mt-2 line-clamp-2 text-sm leading-7 text-white/65">
                          {course.description || "بدون وصف"}
                        </p>
                        <p className="mt-auto pt-3 text-xs text-white/50">
                          {academicSemesterLabel(course.academicSemester)}
                          {" · "}
                          {course.sectionsCount} قسم
                          {course.priceEgp
                            ? ` · ${course.priceEgp} ج.م`
                            : course.hasActiveProduct
                              ? ""
                              : " · السعر غير مضبوط"}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

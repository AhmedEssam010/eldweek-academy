import { CourseThumbnail } from "@/components/learning/CourseThumbnail";
import { CourseCardActions } from "@/components/home/CourseCardActions";
import { CoursesComingSoon } from "@/components/home/CoursesComingSoon";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { listCatalogCourseCards } from "@/lib/learning/catalog-cards";
import { academicSemesterLabel } from "@/lib/learning/course-structure";

export async function Courses() {
  const catalog = await listCatalogCourseCards();
  const queryFailed =
    catalog.availability === "setup_required" ||
    catalog.availability === "unavailable";
  const showComingSoon =
    !queryFailed &&
    (catalog.availability === "empty" || catalog.data.length === 0);

  return (
    <section
      id="courses"
      className="border-b border-white/5"
      aria-labelledby="courses-heading"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h2
              id="courses-heading"
              className="text-2xl font-bold text-white sm:text-3xl"
            >
              الكورسات
            </h2>
            <p className="mt-3 text-sm leading-7 text-white/70 sm:text-base">
              تصفّح الكورسات المنشورة. دخول الكورس يعرض التفاصيل والمنهج،
              والاشتراك يبدأ طلب شراء الكورس الكاملة.
            </p>
          </div>
        </div>

        {queryFailed ? (
          <div className="mt-10">
            <SetupRequiredPanel message={catalog.message} />
          </div>
        ) : showComingSoon ? (
          <div className="mt-10">
            <CoursesComingSoon />
          </div>
        ) : (
          <ul className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {catalog.data.map((course) => (
              <li
                key={course.courseId}
                className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface"
              >
                <CourseThumbnail
                  title={course.title}
                  thumbnailPath={course.thumbnailPath}
                  className="aspect-[16/9] w-full shrink-0 rounded-none border-0"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                <div className="flex min-w-0 flex-1 flex-col p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-primary/20 px-2.5 py-1 text-xs font-medium text-light-purple">
                      {academicSemesterLabel(course.academicSemester)}
                    </span>
                    <span className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/70">
                      {course.sectionsCount} قسم
                    </span>
                    {course.priceEgp != null ? (
                      <span className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/70">
                        {course.isFree ? "مجاني" : `${course.priceEgp} ج.م`}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="line-clamp-2 text-lg font-semibold leading-8 text-white">
                    {course.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 flex-1 text-sm leading-7 text-white/70">
                    {course.description || "بدون وصف"}
                  </p>

                  <CourseCardActions
                    courseId={course.courseId}
                    subscribeState={course.subscribeState}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

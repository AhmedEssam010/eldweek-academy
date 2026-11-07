import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { CourseStatusBadge } from "@/components/dashboard/StatusBadge";
import { PermissionSwitch } from "@/components/dashboard/PermissionSwitch";
import { ConfirmationDialog } from "@/components/dashboard/ConfirmationDialog";
import { MutationForm } from "@/components/dashboard/MutationForm";
import { CoursePricing } from "@/components/dashboard/CoursePricing";
import { CourseThumbnail } from "@/components/learning/CourseThumbnail";
import { CourseThumbnailField } from "@/components/dashboard/CourseThumbnailField";
import { getCourseDetail } from "@/lib/dashboard/data";
import { getCourseProducts } from "@/lib/dashboard/product-data";
import {
  archiveCourseAction,
  deleteCourseAction,
  publishCourseAction,
  unpublishCourseAction,
  updateCourseAction,
} from "@/lib/dashboard/mutations";
import { assessCourseDeletion } from "@/lib/dashboard/course-deletion";
import { createClient } from "@/lib/supabase/server";
import { getAuthReadiness } from "@/lib/auth/readiness";
import {
  upsertProductAction,
  toggleProductActiveAction,
} from "@/lib/dashboard/product-actions";
import {
  academicSemesterLabel,
  academicSemesterOptions,
} from "@/lib/learning/course-structure";

export const instant = false;

type CourseDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: CourseDetailPageProps) {
  const { id } = await params;
  return {
    title: `تفاصيل كورس ${id.slice(0, 8)} | المهندس أحمد الدويك`,
  };
}

export default async function AdminCourseDetailPage({
  params,
}: CourseDetailPageProps) {
  const { id } = await params;
  const [result, productsResult] = await Promise.all([
    getCourseDetail(id),
    getCourseProducts(id),
  ]);

  if (result.availability === "empty") {
    notFound();
  }

  const course = result.data;
  const canEdit = course != null && course.status !== "archived";
  const canArchive = course != null && course.status !== "archived";

  let canPermanentlyDelete = false;
  let deletionBlockers: string[] = [];
  if (course && getAuthReadiness().dbSchemaReady) {
    const supabase = await createClient();
    if (supabase) {
      const assessed = await assessCourseDeletion(supabase, course.id);
      if (assessed.ok) {
        canPermanentlyDelete = assessed.assessment.canPermanentlyDelete;
        deletionBlockers = assessed.assessment.blockers;
      }
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={course?.title || "تفاصيل الكورس"}
        description="الكورس مشتراة كاملة. الأقسام داخلها تنظيمية فقط. المحتوى المنشور يظهر للطالب بعد اعتماد الدفع."
        actions={
          <div id="publish" className="flex flex-wrap items-center gap-2">
            {course ? <CourseStatusBadge status={course.status} /> : null}
            {course?.status === "published" ? (
              <ConfirmationDialog
                prominent
                danger
                triggerLabel="إلغاء النشر"
                title="تأكيد إلغاء نشر الكورس"
                description="ستعود الكورس مسودة وتختفي من كتالوج الطلاب. التسجيلات والمدفوعات تبقى كما هي."
                confirmLabel="تأكيد إلغاء النشر"
                onConfirm={unpublishCourseAction.bind(null, course.id)}
              />
            ) : course && course.status !== "archived" ? (
              <ConfirmationDialog
                prominent
                triggerLabel="نشر الكورس"
                title="تأكيد نشر الكورس"
                description="ستظهر الكورس للطلاب. المحتوى غير المنشور يبقى مخفيًا، والتشغيل موقّع ومقيّد بالاشتراك."
                confirmLabel="تأكيد النشر"
                onConfirm={publishCourseAction.bind(null, course.id)}
              />
            ) : course?.status === "archived" ? (
              <span className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-100">
                الكورس مؤرشفة. لا يمكن نشرها من هذه الحالة.
              </span>
            ) : null}
            <Link
              href={`/admin/courses/${id}/preview`}
              className="rounded-xl border border-primary/40 bg-primary/20 px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_0_1px_rgba(168,85,247,0.25)] transition hover:bg-primary/30"
            >
              معاينة كطالب
            </Link>
            <Link
              href="/admin/courses"
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
            >
              العودة للقائمة
            </Link>
          </div>
        }
      />

      {(result.availability === "setup_required" ||
        result.availability === "unavailable") && (
        <SetupRequiredPanel message={result.message} />
      )}

      {course ? (
        <>
          <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div className="rounded-2xl border border-white/10 bg-surface p-5">
              <div className="mb-4">
                <CourseThumbnail
                  title={course.title}
                  thumbnailPath={course.thumbnailPath}
                  className="aspect-[16/9] w-full max-w-md"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <CourseStatusBadge status={course.status} />
                <span className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-light-purple">
                  {academicSemesterLabel(course.academicSemester)}
                </span>
                <span className="text-sm text-white/75">
                  {course.status === "published"
                    ? "ظاهرة للطلاب في الكتالوج."
                    : course.status === "archived"
                      ? "مؤرشفة. لن تتغير حالتها تلقائيًا."
                      : "مسودة. غير ظاهرة حتى تضغط نشر الكورس."}
                </span>
                <span className="text-xs text-white/45" dir="ltr">
                  {course.slug}
                </span>
              </div>

              {canEdit ? (
                <div className="mt-5 space-y-5">
                  <MutationForm
                    action={updateCourseAction}
                    submitLabel="حفظ بيانات الكورس"
                  >
                    <input type="hidden" name="course_id" value={course.id} />
                    <div>
                      <label
                        htmlFor="academic_semester"
                        className="mb-2 block text-sm text-white"
                      >
                        الترم الدراسي *
                      </label>
                      <select
                        id="academic_semester"
                        name="academic_semester"
                        required
                        defaultValue={course.academicSemester ?? "first"}
                        className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none focus:border-secondary"
                      >
                        {academicSemesterOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="title"
                        className="mb-2 block text-sm text-white"
                      >
                        عنوان الكورس *
                      </label>
                      <input
                        id="title"
                        name="title"
                        required
                        minLength={3}
                        defaultValue={course.title}
                        className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none focus:border-secondary"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="description"
                        className="mb-2 block text-sm text-white"
                      >
                        الوصف
                      </label>
                      <textarea
                        id="description"
                        name="description"
                        rows={5}
                        defaultValue={course.description}
                        className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none focus:border-secondary"
                      />
                    </div>
                    <input
                      type="hidden"
                      name="thumbnail_path"
                      value={course.thumbnailPath ?? ""}
                    />
                  </MutationForm>
                  <CourseThumbnailField
                    courseId={course.id}
                    initialPath={course.thumbnailPath}
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-sm leading-7 text-white/70">
                    {course.description || "لا يوجد وصف."}
                  </p>
                  <p className="text-xs text-amber-200/80">
                    الكورس مؤرشفة ولا تُعدَّل من هنا.
                  </p>
                </div>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Link
                  href={`/admin/courses/${id}/semesters`}
                  className="rounded-xl border border-white/10 bg-background/40 p-3 transition hover:border-primary/40"
                >
                  <p className="text-xs text-white/50">الأقسام</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {course.semestersCount}
                  </p>
                </Link>
                <Link
                  href={`/admin/courses/${id}/semesters`}
                  className="rounded-xl border border-white/10 bg-background/40 p-3 transition hover:border-primary/40"
                >
                  <p className="text-xs text-white/50">الدروس</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {course.lessonsCount}
                  </p>
                </Link>
                <a
                  href="#prices"
                  className="rounded-xl border border-white/10 bg-background/40 p-3 transition hover:border-primary/40"
                >
                  <p className="text-xs text-white/50">السعر</p>
                  <p className="mt-1 text-sm font-semibold text-white">كورس كامل</p>
                </a>
              </div>
            </div>

            <div id="archive" className="rounded-2xl border border-white/10 bg-surface p-5">
              <h3 className="text-base font-semibold text-white">
                الحالة والحذف
              </h3>
              <p className="mt-2 text-sm leading-7 text-white/65">
                زر النشر أعلى الصفحة. الأرشفة تخفي الكورس من الكتالوج مع حفظ
                التسجيلات والمدفوعات. الحذف النهائي متاح فقط للكورسات بلا سجلات
                مالية أو طلاب.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {canArchive ? (
                  <ConfirmationDialog
                    triggerLabel="أرشفة الكورس"
                    title="تأكيد أرشفة الكورس"
                    description={`ستُعلَّم «${course.title}» كمؤرشفة دون حذف محتواها أو تسجيلاتها.`}
                    confirmLabel="تأكيد الأرشفة"
                    danger
                    onConfirm={archiveCourseAction.bind(null, course.id)}
                  />
                ) : (
                  <span className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/45">
                    مؤرشفة بالفعل
                  </span>
                )}
                {canPermanentlyDelete ? (
                  <ConfirmationDialog
                    prominent
                    danger
                    triggerLabel="حذف الكورس"
                    title="تأكيد حذف الكورس"
                    description={`سيتم حذف «${course.title}» نهائيًا مع أقسامه ودروسه المرتبطة. لا يمكن التراجع عن هذا الإجراء. لن تُحذف أصول Mux أو ملفات التخزين تلقائيًا.`}
                    confirmLabel="تأكيد الحذف النهائي"
                    onConfirm={deleteCourseAction.bind(null, course.id)}
                  />
                ) : (
                  <div className="w-full rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-3 text-xs leading-6 text-amber-100">
                    <p className="font-medium">الحذف النهائي غير متاح لهذا الكورس.</p>
                    <p className="mt-1 text-amber-100/85">
                      {deletionBlockers.length > 0
                        ? deletionBlockers.join(" ")
                        : "تعذر التحقق من سلامة الحذف، أو توجد سجلات محمية."}{" "}
                      استخدم الأرشفة لإخفاء الكورس مع الاحتفاظ بالسجلات.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 space-y-2 text-sm">
                <p className="font-medium text-white">إدارة المحتوى</p>
                <Link
                  href={`/admin/courses/${id}/semesters`}
                  className="block text-light-purple hover:underline"
                >
                  الأقسام والدروس
                </Link>
                <Link
                  href={`/admin/courses/${id}/exams`}
                  className="block text-light-purple hover:underline"
                >
                  الامتحانات MCQ
                </Link>
                <Link
                  href={`/admin/courses/${id}/progress`}
                  className="block text-light-purple hover:underline"
                >
                  تقدّم الطلاب
                </Link>
              </div>
            </div>
          </section>

          <CoursePricing
            courseId={id}
            fullCourse={productsResult.data.fullCourse}
            semesters={productsResult.data.semesters}
            upsertAction={upsertProductAction}
            toggleAction={toggleProductActiveAction}
          />

          <section className="space-y-4">
            <h3 className="text-lg font-semibold text-white">المدرّسون المعيّنون</h3>
            {course.assignments.length === 0 ? (
              <EmptyState
                title="لا يوجد مدرّسون على هذا الكورس"
                description="تعيين المدرّسين خارج نطاق هذه المرحلة."
              />
            ) : (
              <ul className="space-y-3">
                {course.assignments.map((assignment) => (
                  <li
                    key={assignment.id}
                    className="rounded-2xl border border-white/10 bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-white">
                        {assignment.teacherName || "مدرّس"}
                      </p>
                      {assignment.teacherId ? (
                        <Link
                          href={`/admin/teachers/${assignment.teacherId}`}
                          className="text-sm text-light-purple hover:underline"
                        >
                          ملف المدرّس
                        </Link>
                      ) : null}
                    </div>
                    <div className="mt-4 grid gap-2 md:grid-cols-3">
                      <PermissionSwitch
                        id={`${assignment.id}-edit`}
                        label="تعديل المحتوى"
                        description="can_edit_content"
                        checked={assignment.canEditContent}
                        disabled
                      />
                      <PermissionSwitch
                        id={`${assignment.id}-exams`}
                        label="إدارة الامتحانات"
                        description="can_manage_exams"
                        checked={assignment.canManageExams}
                        disabled
                      />
                      <PermissionSwitch
                        id={`${assignment.id}-progress`}
                        label="متابعة التقدّم"
                        description="can_view_student_progress"
                        checked={assignment.canViewStudentProgress}
                        disabled
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

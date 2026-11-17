import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { MutationForm } from "@/components/dashboard/MutationForm";
import { CourseThumbnailField } from "@/components/dashboard/CourseThumbnailField";
import { requireTeacher } from "@/lib/auth/guards";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { createTeacherCourseDraftAction } from "@/lib/dashboard/mutations";
import { academicSemesterOptions } from "@/lib/learning/course-structure";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "مسودة كورس جديدة | المهندس أحمد الدويك",
};

export const instant = false;

export default async function TeacherNewCoursePage() {
  const user = await requireTeacher();
  const readiness = getAuthReadiness();
  const supabase = await createClient();

  let canCreateDrafts = false;
  if (supabase) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("can_create_course_drafts, is_active")
      .eq("id", user.userId)
      .maybeSingle();
    canCreateDrafts = Boolean(
      profile?.is_active && profile?.can_create_course_drafts,
    );
  }

  if (!canCreateDrafts) {
    redirect("/teacher");
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      <PageHeader
        title="إنشاء مسودة كورس"
        description="المسودة لا تظهر للطلاب. بعد اكتمال المحتوى أرسلها لمراجعة المالك، والنشر النهائي للمالك فقط."
        actions={
          <Link
            href="/teacher/courses"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            كورساتي
          </Link>
        }
      />

      {!readiness.dbSchemaReady ? (
        <SetupRequiredPanel message="إنشاء المسودات يتطلب مخطط courses بعد تطبيق الهجرات وتأكيد الجاهزية." />
      ) : (
        <div className="min-w-0 rounded-2xl border border-white/10 bg-surface p-4 sm:p-5">
          <MutationForm
            action={createTeacherCourseDraftAction}
            submitLabel="حفظ مسودة الكورس"
            pendingLabel="جارٍ الحفظ..."
          >
            <div className="min-w-0">
              <label htmlFor="academic_semester" className="mb-2 block text-sm text-white">
                الترم الدراسي *
              </label>
              <select
                id="academic_semester"
                name="academic_semester"
                required
                defaultValue="first"
                className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none focus:border-secondary"
              >
                {academicSemesterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="title" className="mb-2 block text-sm text-white">
                عنوان الكورس *
              </label>
              <input
                id="title"
                name="title"
                required
                minLength={3}
                className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none focus:border-secondary"
                placeholder="مثال: الكورس 3"
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="description" className="mb-2 block text-sm text-white">
                الوصف
              </label>
              <textarea
                id="description"
                name="description"
                rows={5}
                className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none focus:border-secondary"
                placeholder="ماذا تغطي هذه الكورس؟"
              />
            </div>
            <CourseThumbnailField />
            <div className="min-w-0">
              <label htmlFor="slug" className="mb-2 block text-sm text-white">
                المعرّف الإنجليزي slug (اختياري)
              </label>
              <input
                id="slug"
                name="slug"
                className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none focus:border-secondary"
                placeholder="unit-3 — أو اتركه فارغًا للتوليد"
                dir="ltr"
              />
            </div>
          </MutationForm>
        </div>
      )}
    </div>
  );
}

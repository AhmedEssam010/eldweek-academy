import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { MutationForm } from "@/components/dashboard/MutationForm";
import { CourseThumbnailField } from "@/components/dashboard/CourseThumbnailField";
import { createCourseDraftAction } from "@/lib/dashboard/mutations";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { academicSemesterOptions } from "@/lib/learning/course-structure";

export const metadata = {
  title: "كورس جديد | المهندس أحمد الدويك",
};

export const instant = false;

export default function AdminNewCoursePage() {
  const readiness = getAuthReadiness();

  return (
    <div className="space-y-6">
      <PageHeader
        title="إنشاء كورس مشتَرى"
        description="الكورس هي ما يشتريه الطالب (مثل الكورس 3). الأقسام داخلها تنظيمية فقط وليست منتجات منفصلة."
        actions={
          <Link
            href="/admin/courses"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            العودة للقائمة
          </Link>
        }
      />

      {!readiness.dbSchemaReady ? (
        <SetupRequiredPanel message="إنشاء الكورسات يتطلب مخطط courses بعد تطبيق الهجرات وتأكيد NEXT_PUBLIC_DB_SCHEMA_READY." />
      ) : (
        <div className="rounded-2xl border border-white/10 bg-surface p-5">
          <MutationForm
            action={createCourseDraftAction}
            submitLabel="حفظ مسودة الكورس"
          >
            <div>
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
            <div>
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
                className="w-full rounded-xl border border-white/15 bg-background px-4 py-3 text-sm text-white outline-none focus:border-secondary"
                placeholder="ماذا تغطي هذه الكورس؟"
              />
            </div>
            <CourseThumbnailField />
            <div>
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

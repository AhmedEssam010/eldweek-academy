import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { MutationForm } from "@/components/dashboard/MutationForm";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { requireAdmin } from "@/lib/auth/guards";
import { resolveStaffCourseAccess } from "@/lib/learning/data";
import { createSemesterAction } from "@/lib/learning/mutations";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminNewSemesterPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: "admin",
    isAdmin: true,
  });

  if (access.availability === "empty" || !access.data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="قسم محتوى جديد"
        description={`داخل الكورس: ${access.data.title}. سمِّ القسم كما تريد — ليس منتج شراء.`}
        actions={
          <Link
            href={`/admin/courses/${id}/semesters`}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            رجوع
          </Link>
        }
      />

      {access.availability === "setup_required" ||
      access.availability === "unavailable" ? (
        <SetupRequiredPanel message={access.message} />
      ) : (
        <div className="rounded-2xl border border-white/10 bg-surface p-5">
          <MutationForm action={createSemesterAction} submitLabel="إنشاء القسم">
            <input type="hidden" name="course_id" value={id} />
            <div>
              <label htmlFor="title" className="mb-2 block text-sm text-white">
                اسم القسم *
              </label>
              <input
                id="title"
                name="title"
                required
                minLength={2}
                placeholder="مثال: Week 1 أو مراجعة الكورس أو تدريب نهائي"
                className="w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white outline-none focus:border-secondary"
              />
            </div>
            <div>
              <label
                htmlFor="description"
                className="mb-2 block text-sm text-white"
              >
                الوصف (اختياري)
              </label>
              <textarea
                id="description"
                name="description"
                rows={4}
                placeholder="وصف مختصر للقسم"
                className="w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white outline-none focus:border-secondary"
              />
            </div>
          </MutationForm>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { MutationForm } from "@/components/dashboard/MutationForm";
import { FormMessage } from "@/components/auth/FormMessage";
import { requireTeacher } from "@/lib/auth/guards";
import { resolveStaffCourseAccess } from "@/lib/learning/data";
import { createSemesterAction } from "@/lib/learning/mutations";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export default async function TeacherNewSemesterPage({ params }: PageProps) {
  const user = await requireTeacher();
  const { id } = await params;
  const access = await resolveStaffCourseAccess(id, {
    userId: user.userId,
    isAdmin: false,
  });
  if (access.availability === "empty" || !access.data) notFound();

  if (!access.data.canEditContent) {
    return (
      <div className="space-y-4">
        <PageHeader title="غير مصرّح" />
        <FormMessage type="error">
          إنشاء الترمات يتطلب can_edit_content على هذا الكورس المعيّن.
        </FormMessage>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="ترم جديد"
        description={access.data.title}
        actions={
          <Link
            href={`/teacher/courses/${id}/semesters`}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            رجوع
          </Link>
        }
      />
      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <MutationForm action={createSemesterAction} submitLabel="إنشاء الترم">
          <input type="hidden" name="course_id" value={id} />
          <input
            name="title"
            required
            minLength={2}
            placeholder="عنوان الترم"
            className="mb-2 w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white"
          />
          <textarea
            name="description"
            rows={4}
            placeholder="وصف الترم"
            className="w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white"
          />
        </MutationForm>
      </div>
    </div>
  );
}

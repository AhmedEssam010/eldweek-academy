import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { MutationForm } from "@/components/dashboard/MutationForm";
import { FormMessage } from "@/components/auth/FormMessage";
import { requireTeacher } from "@/lib/auth/guards";
import { getSemesterDetail, resolveStaffCourseAccess } from "@/lib/learning/data";
import { createLessonAction } from "@/lib/learning/mutations";

export const instant = false;

type PageProps = { params: Promise<{ id: string; semesterId: string }> };

export default async function TeacherNewLessonPage({ params }: PageProps) {
  const user = await requireTeacher();
  const { id, semesterId } = await params;
  const access = await resolveStaffCourseAccess(id, { userId: user.userId, isAdmin: false });
  if (access.availability === "empty" || !access.data) notFound();
  if (!access.data.canEditContent) {
    return (
      <div className="space-y-4">
        <PageHeader title="غير مصرّح" />
        <FormMessage type="error">إنشاء الدروس يتطلب صلاحية تعديل هذا الكورس.</FormMessage>
      </div>
    );
  }
  const detail = await getSemesterDetail(id, semesterId);
  if (detail.availability === "empty" || !detail.data.semester) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="درس جديد"
        description={detail.data.semester.title}
        actions={
          <Link href={`/teacher/courses/${id}/semesters/${semesterId}`} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85">
            رجوع
          </Link>
        }
      />
      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <MutationForm action={createLessonAction} submitLabel="إنشاء مسودة الدرس">
          <input type="hidden" name="course_id" value={id} />
          <input type="hidden" name="semester_id" value={semesterId} />
          <input name="title" required minLength={2} placeholder="عنوان الدرس" className="w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white" />
          <textarea name="description" rows={4} placeholder="وصف الدرس" className="w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white" />
          <input name="duration_minutes" type="number" min={0} max={600} placeholder="المدة بالدقائق (اختياري)" className="w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white" />
        </MutationForm>
      </div>
    </div>
  );
}

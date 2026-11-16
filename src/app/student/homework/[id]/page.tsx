import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { HomeworkTakingInterface } from "@/components/learning/HomeworkTakingInterface";
import { requireStudent } from "@/lib/auth/guards";
import { studentHasCourseAccess } from "@/lib/learning/course-experience";
import { getHomeworkTakingView } from "@/lib/learning/homework-data";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function StudentHomeworkPage({ params }: PageProps) {
  const user = await requireStudent();
  const { id } = await params;

  const supabase = await createClient();
  if (!supabase) notFound();
  const { data: homework } = await supabase
    .from("homeworks")
    .select("id, course_id, is_published")
    .eq("id", id)
    .maybeSingle();
  if (!homework || !homework.is_published) notFound();

  const hasAccess = await studentHasCourseAccess(homework.course_id);
  if (!hasAccess) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="واجب مقفل"
          description="يلزم اشتراك نشط في الكورس لحل الواجب."
          actions={
            <Link
              href={`/courses/${homework.course_id}?subscribe=1`}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              اشترك الآن
            </Link>
          }
        />
      </div>
    );
  }

  const view = await getHomeworkTakingView(id, user.userId);
  if (view.availability === "empty" || !view.data) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={view.data.title}
        description="أجب عن الأسئلة ثم أكّد التسليم. التصحيح الموضوعي تلقائي والمقالي يدوي."
        actions={
          <Link
            href={`/courses/${homework.course_id}`}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/85"
          >
            العودة للكورس
          </Link>
        }
      />
      {(view.availability === "setup_required" ||
        view.availability === "unavailable") && (
        <SetupRequiredPanel message={view.message} />
      )}
      <HomeworkTakingInterface homework={view.data} />
    </div>
  );
}

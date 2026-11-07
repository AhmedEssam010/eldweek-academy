import Link from "next/link";
import { notFound } from "next/navigation";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { LessonVideoPlayer } from "@/components/learning/LessonVideoPlayer";
import { DisabledMutationForm } from "@/components/dashboard/DisabledMutationForm";
import { requireStudent } from "@/lib/auth/guards";
import { getStudentLessonPage } from "@/lib/learning/data";
import { authorizeLessonPlayback } from "@/lib/learning/video";
import {
  markLessonCompleteAction,
  updateLessonProgressAction,
} from "@/lib/learning/mutations";

export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

export default async function StudentLessonPage({ params }: PageProps) {
  await requireStudent();
  const { id } = await params;
  const page = await getStudentLessonPage(id);

  if (page.availability === "empty" || !page.data.lesson) {
    notFound();
  }

  const lesson = page.data.lesson;
  const playback = await authorizeLessonPlayback({
    lessonId: lesson.id,
    courseId: lesson.courseId,
    semesterId: lesson.semesterId,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/student/courses/${lesson.courseId}`}
          className="rounded-xl border border-primary/35 bg-primary/15 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary/25"
        >
          العودة لمنهج الكورس
        </Link>
        <span className="text-xs text-white/45">
          تشغيل موقّع عبر Mux — لا يُعرض إلا بعد الاستحقاق
        </span>
      </div>

      {(page.availability === "setup_required" ||
        page.availability === "unavailable" ||
        playback.status === "setup_required" ||
        playback.status === "unavailable") && (
        <SetupRequiredPanel
          message={
            playback.status === "setup_required" ||
            playback.status === "unavailable"
              ? playback.message
              : page.message
          }
        />
      )}

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-surface p-4 sm:p-5">
        <LessonVideoPlayer lesson={lesson} playback={playback} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-surface p-4">
          <p className="mb-2 text-xs text-white/50">
            حفظ موضع المشاهدة (خادمي لاحقًا)
          </p>
          <DisabledMutationForm
            action={updateLessonProgressAction}
            submitLabel="حفظ التقدّم"
          />
        </div>
        <div className="rounded-2xl border border-white/10 bg-surface p-4">
          <p className="mb-2 text-xs text-white/50">إكمال الدرس</p>
          <DisabledMutationForm
            action={markLessonCompleteAction}
            submitLabel="تعليم الدرس كمكتمل"
          />
        </div>
      </div>
    </div>
  );
}

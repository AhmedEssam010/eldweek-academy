"use server";

import { getStudentLessonPage } from "@/lib/learning/data";
import { authorizeLessonPlayback } from "@/lib/learning/video";
import type {
  LessonDetailSafe,
  PlaybackAuthorization,
} from "@/lib/learning/types";

export type InlineLessonPlaybackResult =
  | {
      ok: true;
      lesson: LessonDetailSafe;
      playback: PlaybackAuthorization;
    }
  | {
      ok: false;
      message: string;
    };

export async function loadCourseLessonPlaybackAction(
  lessonId: string,
  courseId: string,
): Promise<InlineLessonPlaybackResult> {
  if (!lessonId || !courseId) {
    return { ok: false, message: "معرّف الدرس أو الكورس غير صالح." };
  }

  const page = await getStudentLessonPage(lessonId);
  if (page.availability === "empty" || !page.data.lesson) {
    return { ok: false, message: page.message || "لم يُعثر على الدرس." };
  }

  const lesson = page.data.lesson;
  if (lesson.courseId !== courseId) {
    return { ok: false, message: "الدرس لا ينتمي إلى هذه الكورس." };
  }

  if (page.data.locked) {
    return {
      ok: true,
      lesson,
      playback: {
        status: "locked",
        lessonId: lesson.id,
        message:
          "الدرس مقفل — يلزم اشتراك نشط ونشر الدرس قبل التشغيل الموقّع.",
      },
    };
  }

  const playback = await authorizeLessonPlayback({
    lessonId: lesson.id,
    courseId: lesson.courseId,
    semesterId: lesson.semesterId,
  });

  return { ok: true, lesson, playback };
}

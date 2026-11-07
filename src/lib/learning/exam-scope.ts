import "server-only";

import { connection } from "next/server";
import { getAuthReadiness } from "@/lib/auth/readiness";
import type { ExamScopeOption, LearningQueryResult } from "@/lib/learning/types";
import { createClient } from "@/lib/supabase/server";

export async function listExamScopeOptions(
  courseId: string,
): Promise<LearningQueryResult<{ semesters: ExamScopeOption[]; lessons: ExamScopeOption[] }>> {
  await connection();

  if (!getAuthReadiness().dbSchemaReady) {
    return {
      availability: "setup_required",
      message: "قاعدة البيانات غير جاهزة بعد.",
      data: { semesters: [], lessons: [] },
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      availability: "unavailable",
      message: "تعذر الاتصال بقاعدة البيانات.",
      data: { semesters: [], lessons: [] },
    };
  }

  const { data: semesters, error } = await supabase
    .from("course_semesters")
    .select("id, title")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });

  if (error) {
    return {
      availability: "unavailable",
      message: "تعذر قراءة الترمات.",
      data: { semesters: [], lessons: [] },
    };
  }

  const semesterIds = (semesters ?? []).map((semester) => semester.id);
  const { data: lessons } = semesterIds.length
    ? await supabase
        .from("lessons")
        .select("id, title, semester_id")
        .in("semester_id", semesterIds)
        .order("sort_order", { ascending: true })
    : { data: [] as Array<{ id: string; title: string; semester_id: string }> };

  return {
    availability: "ready",
    message: "تم جلب نطاق الامتحان.",
    data: {
      semesters: (semesters ?? []).map((semester) => ({
        id: semester.id,
        title: semester.title,
      })),
      lessons: (lessons ?? []).map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        semesterId: lesson.semester_id,
      })),
    },
  };
}

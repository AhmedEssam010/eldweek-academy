"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getProfileAuthState } from "@/lib/auth/profile";
import { getAuthReadiness } from "@/lib/auth/readiness";
import {
  createDirectUpload,
  getMuxReadiness,
  syncDirectUpload,
  syncLegacyLessonUpload,
} from "@/lib/learning/mux";
import { describeMuxUploadFailure } from "@/lib/learning/mux-policy";
import { createClient } from "@/lib/supabase/server";
import {
  insertVideoAssetDraft,
  linkLessonToVideoAsset,
} from "@/lib/learning/video-library";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MUX_ID = /^[A-Za-z0-9]{8,80}$/;

export type UploadActionResult =
  | { ok: true; uploadId: string; uploadUrl: string; videoLibraryId: string }
  | { ok: false; message: string };

export type SyncActionResult =
  | { ok: true; state: "waiting" | "processing" | "ready" | "error"; message: string }
  | { ok: false; message: string };

export async function requireLessonEditor(input: {
  courseId: string;
  semesterId: string;
  lessonId: string;
}) {
  if (!getAuthReadiness().dbSchemaReady) {
    return { ok: false as const, message: "قاعدة البيانات غير جاهزة بعد." };
  }
  if (!UUID.test(input.courseId) || !UUID.test(input.semesterId) || !UUID.test(input.lessonId)) {
    return { ok: false as const, message: "بيانات الدرس غير صالحة." };
  }
  const profile = await getProfileAuthState();
  if (profile.status !== "authenticated") {
    return { ok: false as const, message: "يلزم تسجيل الدخول بصلاحية تعديل." };
  }
  if (profile.role !== "super_admin" && profile.role !== "teacher") {
    return { ok: false as const, message: "رفع الفيديو متاح للمالك أو المدرّس المحرّر فقط." };
  }
  const supabase = await createClient();
  if (!supabase) return { ok: false as const, message: "إعدادات Supabase غير مكتملة." };

  if (profile.role === "teacher") {
    const { data: assignment, error } = await supabase
      .from("course_staff_assignments")
      .select("can_edit_content")
      .eq("course_id", input.courseId)
      .eq("teacher_id", profile.userId)
      .maybeSingle();
    if (error || !assignment?.can_edit_content) {
      return { ok: false as const, message: "ليست لديك صلاحية تعديل محتوى هذا الكورس." };
    }
  }

  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id, semester_id, course_semesters!inner(course_id)")
    .eq("id", input.lessonId)
    .eq("semester_id", input.semesterId)
    .maybeSingle();
  const semester = Array.isArray(lesson?.course_semesters)
    ? lesson.course_semesters[0]
    : lesson?.course_semesters;
  if (lessonError || !lesson || semester?.course_id !== input.courseId) {
    return { ok: false as const, message: "الدرس لا ينتمي لهذا الترم والكورس." };
  }
  return { ok: true as const, userId: profile.userId, role: profile.role };
}

function readMuxUploadFailure(error: unknown) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const status = typeof record.status === "number" ? record.status : null;
  const headersObj = record.headers as { get?: (name: string) => string | null } | undefined;
  const requestId = headersObj?.get?.("x-request-id") ?? headersObj?.get?.("x-mux-request-id") ?? null;
  const body = record.error as { error?: { type?: unknown }; type?: unknown } | undefined;
  const nestedType = body?.error?.type ?? body?.type;
  const type = typeof nestedType === "string" ? nestedType : null;
  const described = describeMuxUploadFailure({ status, type });
  return { status, type, requestId, message: described.message };
}

function revalidateLesson(courseId: string, semesterId: string, lessonId: string) {
  revalidatePath(`/admin/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/teacher/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/admin/courses/${courseId}/semesters/${semesterId}`);
  revalidatePath(`/teacher/courses/${courseId}/semesters/${semesterId}`);
  revalidatePath("/admin/video-library");
}

export async function createLessonVideoUpload(input: {
  courseId: string;
  semesterId: string;
  lessonId: string;
  title?: string;
}): Promise<UploadActionResult> {
  const access = await requireLessonEditor(input);
  if (!access.ok) return access;
  if (!getMuxReadiness().ready) {
    return { ok: false, message: "مفاتيح Mux أو مفتاح الخدمة غير مضبوطة على الخادم." };
  }
  const origin = (await headers()).get("origin")?.trim() ?? "";
  if (!/^https?:\/\/[^\s]+$/.test(origin)) {
    return { ok: false, message: "تعذر تحديد عنوان الموقع اللازم لرفع الملف (Origin)." };
  }

  const draft = await insertVideoAssetDraft({
    title: input.title?.trim() || "فيديو درس",
    createdBy: access.userId,
  });
  if (!draft) {
    return {
      ok: false,
      message:
        "تعذر إنشاء سجل في مكتبة الفيديو. تأكد من تطبيق هجرة video_assets بموافقة المالك.",
    };
  }

  try {
    const upload = await createDirectUpload({
      videoLibraryId: draft.id,
      origin,
    });
    if (!upload) return { ok: false, message: "تعذر إنشاء رابط الرفع الآمن من Mux." };
    return {
      ok: true,
      uploadId: upload.uploadId,
      uploadUrl: upload.uploadUrl,
      videoLibraryId: draft.id,
    };
  } catch (error) {
    const failure = readMuxUploadFailure(error);
    console.error("[mux-direct-upload]", {
      status: failure.status,
      type: failure.type,
      requestId: failure.requestId,
    });
    return { ok: false, message: failure.message };
  }
}

export async function syncLessonVideoUpload(input: {
  courseId: string;
  semesterId: string;
  lessonId: string;
  uploadId: string;
  videoLibraryId?: string;
}): Promise<SyncActionResult> {
  const access = await requireLessonEditor(input);
  if (!access.ok) return access;
  if (!MUX_ID.test(input.uploadId)) {
    return { ok: false, message: "معرّف الرفع غير صالح." };
  }
  try {
    const result =
      input.videoLibraryId && UUID.test(input.videoLibraryId)
        ? await syncDirectUpload({
            videoLibraryId: input.videoLibraryId,
            uploadId: input.uploadId,
            lessonId: input.lessonId,
            semesterId: input.semesterId,
          })
        : await syncLegacyLessonUpload({
            lessonId: input.lessonId,
            semesterId: input.semesterId,
            uploadId: input.uploadId,
          });
    if (result.state === "ready" || result.state === "processing") {
      revalidateLesson(input.courseId, input.semesterId, input.lessonId);
    }
    return { ok: true, state: result.state, message: result.message };
  } catch {
    return { ok: false, message: "تعذر التحقق من حالة الفيديو." };
  }
}

export async function linkLessonLibraryVideoAction(input: {
  courseId: string;
  semesterId: string;
  lessonId: string;
  videoLibraryId: string;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const access = await requireLessonEditor(input);
  if (!access.ok) return access;
  if (!UUID.test(input.videoLibraryId)) {
    return { ok: false, message: "معرّف فيديو المكتبة غير صالح." };
  }
  const linked = await linkLessonToVideoAsset({
    lessonId: input.lessonId,
    semesterId: input.semesterId,
    videoLibraryId: input.videoLibraryId,
  });
  if (!linked.ok) return linked;
  revalidateLesson(input.courseId, input.semesterId, input.lessonId);
  return { ok: true, message: "تم ربط فيديو المكتبة بالدرس دون رفع جديد." };
}

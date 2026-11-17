"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getProfileAuthState } from "@/lib/auth/profile";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { createDirectUpload, getMuxReadiness, syncDirectUpload } from "@/lib/learning/mux";
import { describeMuxUploadFailure } from "@/lib/learning/mux-policy";
import { requireLessonEditor } from "@/lib/learning/video-actions";
import {
  deleteUnusedVideoAsset,
  insertVideoAssetDraft,
  listVideoLibrary,
  renameVideoAsset,
} from "@/lib/learning/video-library";
import type { VideoLibraryListItem } from "@/lib/learning/video-library-types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MUX_ID = /^[A-Za-z0-9]{8,80}$/;

async function requireAuthenticatedStaff() {
  if (!getAuthReadiness().dbSchemaReady) {
    return { ok: false as const, message: "قاعدة البيانات غير جاهزة بعد." };
  }
  const profile = await getProfileAuthState();
  if (profile.status !== "authenticated") {
    return { ok: false as const, message: "يلزم تسجيل الدخول." };
  }
  if (profile.role !== "super_admin" && profile.role !== "teacher") {
    return {
      ok: false as const,
      message: "مكتبة الفيديو متاحة للمالك والمدرّسين فقط.",
    };
  }
  return {
    ok: true as const,
    userId: profile.userId,
    role: profile.role as "super_admin" | "teacher",
  };
}

async function requireSuperAdmin() {
  const access = await requireAuthenticatedStaff();
  if (!access.ok) return access;
  if (access.role !== "super_admin") {
    return {
      ok: false as const,
      message: "حذف وإعادة تسمية فيديوهات المكتبة متاحان للمالك فقط.",
    };
  }
  return { ok: true as const, userId: access.userId };
}

function revalidateLibraryPaths() {
  revalidatePath("/admin/video-library");
  revalidatePath("/teacher/video-library");
}

function readMuxUploadFailure(error: unknown) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const status = typeof record.status === "number" ? record.status : null;
  const body = record.error as { error?: { type?: unknown }; type?: unknown } | undefined;
  const nestedType = body?.error?.type ?? body?.type;
  const type = typeof nestedType === "string" ? nestedType : null;
  return describeMuxUploadFailure({ status, type });
}

export async function listVideoLibraryAction(input?: {
  search?: string;
  readyOnly?: boolean;
}): Promise<
  | { ok: true; items: VideoLibraryListItem[] }
  | { ok: false; message: string }
> {
  const access = await requireAuthenticatedStaff();
  if (!access.ok) return access;
  const items = await listVideoLibrary({
    search: input?.search,
    readyOnly: Boolean(input?.readyOnly),
  });
  return { ok: true, items };
}

/** منتقي الدرس: محرّرو المحتوى يرون الفيديوهات الجاهزة. */
export async function listReadyLibraryForLessonAction(input: {
  courseId: string;
  semesterId: string;
  lessonId: string;
  search?: string;
}): Promise<
  | { ok: true; items: VideoLibraryListItem[] }
  | { ok: false; message: string }
> {
  const access = await requireLessonEditor(input);
  if (!access.ok) return access;
  const items = await listVideoLibrary({
    search: input.search,
    readyOnly: true,
  });
  return { ok: true, items };
}

export async function createLibraryVideoUploadAction(input: {
  title: string;
}): Promise<
  | { ok: true; uploadId: string; uploadUrl: string; videoLibraryId: string }
  | { ok: false; message: string }
> {
  const access = await requireAuthenticatedStaff();
  if (!access.ok) return access;
  if (!getMuxReadiness().ready) {
    return { ok: false, message: "مفاتيح Mux أو مفتاح الخدمة غير مضبوطة على الخادم." };
  }
  const origin = (await headers()).get("origin")?.trim() ?? "";
  if (!/^https?:\/\/[^\s]+$/.test(origin)) {
    return { ok: false, message: "تعذر تحديد عنوان الموقع اللازم لرفع الملف (Origin)." };
  }
  const title = input.title.trim();
  if (title.length < 1) {
    return { ok: false, message: "أدخل عنوانًا للفيديو." };
  }

  const draft = await insertVideoAssetDraft({
    title,
    createdBy: access.userId,
  });
  if (!draft) {
    return {
      ok: false,
      message:
        "تعذر إنشاء سجل المكتبة. طبّق هجرة video_assets بموافقة المالك ثم أعد المحاولة.",
    };
  }

  try {
    const upload = await createDirectUpload({
      videoLibraryId: draft.id,
      origin,
    });
    if (!upload) return { ok: false, message: "تعذر إنشاء رابط الرفع من Mux." };
    return {
      ok: true,
      uploadId: upload.uploadId,
      uploadUrl: upload.uploadUrl,
      videoLibraryId: draft.id,
    };
  } catch (error) {
    return { ok: false, message: readMuxUploadFailure(error).message };
  }
}

export async function syncLibraryVideoUploadAction(input: {
  videoLibraryId: string;
  uploadId: string;
}): Promise<
  | { ok: true; state: "waiting" | "processing" | "ready" | "error"; message: string }
  | { ok: false; message: string }
> {
  const access = await requireAuthenticatedStaff();
  if (!access.ok) return access;
  if (!UUID.test(input.videoLibraryId) || !MUX_ID.test(input.uploadId)) {
    return { ok: false, message: "بيانات المزامنة غير صالحة." };
  }
  try {
    const result = await syncDirectUpload({
      videoLibraryId: input.videoLibraryId,
      uploadId: input.uploadId,
    });
    revalidateLibraryPaths();
    return { ok: true, state: result.state, message: result.message };
  } catch {
    return { ok: false, message: "تعذر مزامنة حالة الفيديو." };
  }
}

export async function renameLibraryVideoAction(input: {
  videoLibraryId: string;
  title: string;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const access = await requireSuperAdmin();
  if (!access.ok) return access;
  if (!UUID.test(input.videoLibraryId)) {
    return { ok: false, message: "معرّف الفيديو غير صالح." };
  }
  const result = await renameVideoAsset(input.videoLibraryId, input.title);
  if (!result.ok) return result;
  revalidateLibraryPaths();
  return { ok: true, message: "تم تحديث العنوان." };
}

export async function deleteLibraryVideoAction(input: {
  videoLibraryId: string;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const access = await requireSuperAdmin();
  if (!access.ok) return access;
  if (!UUID.test(input.videoLibraryId)) {
    return { ok: false, message: "معرّف الفيديو غير صالح." };
  }
  const result = await deleteUnusedVideoAsset(input.videoLibraryId);
  if (!result.ok) return result;
  revalidateLibraryPaths();
  return { ok: true, message: "حُذف الفيديو من المكتبة (لم يُحذف أصل Mux تلقائيًا)." };
}

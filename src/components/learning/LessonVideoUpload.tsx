"use client";

import { useRouter } from "next/navigation";
import { MuxVideoUploader } from "@/components/learning/MuxVideoUploader";
import {
  createLessonVideoUpload,
  syncLessonVideoUpload,
} from "@/lib/learning/video-actions";

type LessonVideoUploadProps = {
  courseId: string;
  semesterId: string;
  lessonId: string;
  lessonTitle?: string;
};

export function LessonVideoUpload({
  courseId,
  semesterId,
  lessonId,
  lessonTitle,
}: LessonVideoUploadProps) {
  const router = useRouter();

  return (
    <div className="mt-4">
      <MuxVideoUploader
        initialTitle={lessonTitle || "فيديو درس"}
        requireTitle
        persistenceKey={`lesson-upload:${lessonId}`}
        titlePlaceholder="عنوان يظهر في مكتبة الفيديو"
        submitLabel="رفع فيديو جديد وربطه بالدرس"
        createUpload={async ({ title }) =>
          createLessonVideoUpload({
            courseId,
            semesterId,
            lessonId,
            title,
          })
        }
        syncUpload={async ({ uploadId, videoLibraryId }) =>
          syncLessonVideoUpload({
            courseId,
            semesterId,
            lessonId,
            uploadId,
            videoLibraryId,
          })
        }
        onComplete={() => router.refresh()}
      />
    </div>
  );
}

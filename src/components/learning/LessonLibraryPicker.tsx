"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listReadyLibraryForLessonAction } from "@/lib/learning/library-actions";
import { linkLessonLibraryVideoAction } from "@/lib/learning/video-actions";
import type { VideoLibraryListItem } from "@/lib/learning/video-library-types";

type LessonLibraryPickerProps = {
  courseId: string;
  semesterId: string;
  lessonId: string;
};

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function LessonLibraryPicker({
  courseId,
  semesterId,
  lessonId,
}: LessonLibraryPickerProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<VideoLibraryListItem[] | null>(null);
  const [listMessage, setListMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listReadyLibraryForLessonAction({
        courseId,
        semesterId,
        lessonId,
        search: debouncedSearch,
      });
      if (cancelled) return;
      if (!result.ok) {
        setItems([]);
        setListMessage(result.message);
        return;
      }
      setItems(result.items);
      setListMessage(
        result.items.length === 0 ? "لا توجد فيديوهات جاهزة مطابقة." : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, semesterId, lessonId, debouncedSearch]);

  function linkSelected() {
    if (!selectedId) {
      setOk(false);
      setMessage("اختر فيديوًا جاهزًا أولًا.");
      return;
    }
    startTransition(async () => {
      const result = await linkLessonLibraryVideoAction({
        courseId,
        semesterId,
        lessonId,
        videoLibraryId: selectedId,
      });
      setOk(result.ok);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-3">
      <label className="block text-xs text-white/55">
        بحث في المكتبة
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="عنوان الفيديو"
          className="mt-1 w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white"
        />
      </label>

      {items === null ? (
        <p className="text-sm text-white/55">جارٍ تحميل المكتبة...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-white/55">
          {listMessage ||
            "لا توجد فيديوهات جاهزة. ارفع فيديوًا جديدًا أو أضفه من مكتبة المالك."}
        </p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {items.map((item) => {
            const selected = selectedId === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-start transition ${
                    selected
                      ? "border-primary bg-primary/15"
                      : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      className="h-12 w-20 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-20 items-center justify-center rounded-lg bg-white/10 text-[10px] text-white/40">
                      بلا صورة
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{item.title}</p>
                    <p className="text-xs text-white/45">
                      المدة {formatDuration(item.durationSeconds)} · جاهز
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        disabled={pending || !selectedId}
        onClick={linkSelected}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "جارٍ الربط..." : "ربط الفيديو المحدد بالدرس"}
      </button>

      {message ? (
        <p className={`text-sm leading-7 ${ok ? "text-emerald-300" : "text-white/70"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

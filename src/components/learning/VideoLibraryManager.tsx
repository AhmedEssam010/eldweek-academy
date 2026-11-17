"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MuxVideoUploader } from "@/components/learning/MuxVideoUploader";
import {
  createLibraryVideoUploadAction,
  deleteLibraryVideoAction,
  renameLibraryVideoAction,
  syncLibraryVideoUploadAction,
} from "@/lib/learning/library-actions";
import type { VideoLibraryListItem } from "@/lib/learning/video-library-types";

export type VideoLibraryCapabilities = {
  canUpload?: boolean;
  canRename?: boolean;
  canDelete?: boolean;
};

type VideoLibraryManagerProps = {
  items: VideoLibraryListItem[];
  muxReady: boolean;
  loadError?: string | null;
  capabilities?: VideoLibraryCapabilities;
};

const statusLabel: Record<string, string> = {
  uploading: "جارٍ الرفع",
  processing: "قيد المعالجة",
  ready: "جاهز",
  failed: "فشل",
};

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function VideoLibraryManager({
  items,
  muxReady,
  loadError,
  capabilities,
}: VideoLibraryManagerProps) {
  const canUpload = capabilities?.canUpload ?? true;
  const canRename = capabilities?.canRename ?? true;
  const canDelete = capabilities?.canDelete ?? true;

  const router = useRouter();
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.title.toLowerCase().includes(q));
  }, [items, search]);

  function saveRename(id: string) {
    startTransition(async () => {
      const result = await renameLibraryVideoAction({
        videoLibraryId: id,
        title: renameValue,
      });
      setOk(result.ok);
      setMessage(result.message);
      if (result.ok) {
        setRenameId(null);
        router.refresh();
      }
    });
  }

  function confirmDelete(item: VideoLibraryListItem) {
    if (item.lessonCount > 0) {
      setOk(false);
      setMessage(`لا يمكن الحذف: مستخدم في ${item.lessonCount} درس.`);
      return;
    }
    const confirmed = window.confirm(
      `هل تريد حذف «${item.title}» من المكتبة؟ لن يُحذف أصل Mux من حساب Mux تلقائيًا.`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteLibraryVideoAction({ videoLibraryId: item.id });
      setOk(result.ok);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      {canUpload ? (
        <section className="min-w-0 rounded-2xl border border-white/10 bg-surface p-4 sm:p-5">
          <h3 className="break-words text-base font-semibold text-white">
            رفع فيديو جديد إلى المكتبة
          </h3>
          <p className="mt-2 text-sm leading-7 text-white/60">
            الرفع مباشر إلى Mux مع شريط تقدم حقيقي. لن يُعتبر الفيديو قابلاً للتشغيل حتى تصبح حالته «جاهز».
          </p>
          {muxReady ? (
            <div className="mt-4">
              <MuxVideoUploader
                requireTitle
                persistenceKey="video-library"
                titlePlaceholder="مثال: محاضرة التفاضل الأولى"
                submitLabel="رفع إلى المكتبة"
                createUpload={async ({ title }) =>
                  createLibraryVideoUploadAction({ title })
                }
                syncUpload={async ({ uploadId, videoLibraryId }) =>
                  syncLibraryVideoUploadAction({ uploadId, videoLibraryId })
                }
                onComplete={() => router.refresh()}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-amber-200/80">
              مفاتيح Mux أو مفتاح الخدمة غير مضبوطة على الخادم.
            </p>
          )}
        </section>
      ) : null}

      <section className="min-w-0 space-y-4 rounded-2xl border border-white/10 bg-surface p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">الفيديوهات المرفوعة</h3>
            <p className="mt-1 text-xs text-white/45">{items.length} عنصر في المكتبة</p>
          </div>
          <label className="block w-full min-w-0 text-xs text-white/55 sm:w-auto">
            بحث بالعنوان
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-background px-4 py-2.5 text-sm text-white sm:w-64"
              placeholder="ابحث..."
            />
          </label>
        </div>

        {loadError ? (
          <p className="text-sm text-red-300">{loadError}</p>
        ) : null}

        {filtered.length === 0 ? (
          <p className="text-sm text-white/55">
            {items.length === 0
              ? canUpload
                ? "المكتبة فارغة. ارفع أول فيديو أعلاه."
                : "المكتبة فارغة حاليًا."
              : "لا نتائج مطابقة لبحثك."}
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl border border-white/10 bg-background/40 p-4"
              >
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      className="h-24 w-full max-w-40 shrink-0 rounded-xl object-cover sm:w-40"
                    />
                  ) : (
                    <div className="flex h-24 w-full max-w-40 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xs text-white/40 sm:w-40">
                      بلا صورة مصغّرة
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    {canRename && renameId === item.id ? (
                      <div className="flex min-w-0 flex-wrap gap-2">
                        <input
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          className="min-w-0 w-full flex-1 rounded-xl border border-white/15 bg-background px-3 py-2 text-sm text-white sm:min-w-[12rem]"
                        />
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => saveRename(item.id)}
                          className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white"
                        >
                          حفظ
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenameId(null)}
                          className="rounded-xl border border-white/15 px-3 py-2 text-xs text-white/80"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <h4 className="text-sm font-semibold text-white">{item.title}</h4>
                    )}
                    <p className="text-xs leading-6 text-white/55">
                      الحالة: {statusLabel[item.status] ?? item.status} · المدة{" "}
                      {formatDuration(item.durationSeconds)} · رُفع{" "}
                      {formatDate(item.createdAt)}
                    </p>
                    <p className="text-xs leading-6 text-white/45">
                      {item.lessonCount > 0
                        ? `مستخدم في ${item.lessonCount} درس: ${item.lessonTitles.slice(0, 4).join(" · ")}${
                            item.lessonTitles.length > 4 ? "…" : ""
                          }`
                        : "غير مستخدم في أي درس حاليًا"}
                    </p>
                    {canRename || canDelete ? (
                      <div className="flex flex-wrap gap-2">
                        {canRename ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              setRenameId(item.id);
                              setRenameValue(item.title);
                            }}
                            className="rounded-xl border border-white/15 px-3 py-1.5 text-xs text-white/85 hover:bg-white/5"
                          >
                            إعادة تسمية
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            disabled={pending || item.lessonCount > 0}
                            onClick={() => confirmDelete(item)}
                            className="rounded-xl border border-red-400/30 px-3 py-1.5 text-xs text-red-200 disabled:opacity-40 hover:bg-red-500/10"
                          >
                            حذف
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message ? (
        <p className={`text-sm leading-7 ${ok ? "text-emerald-300" : "text-red-300"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

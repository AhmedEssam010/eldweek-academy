"use client";

import { useState } from "react";
import Link from "next/link";
import type { CourseContentItem, CourseExperienceSection } from "@/lib/learning/types";

function ContentIcon({
  kind,
  compact,
}: {
  kind: CourseContentItem["kind"];
  compact?: boolean;
}) {
  const box = compact ? "h-7 w-7 rounded-md" : "h-8 w-8 rounded-lg";
  const className = compact ? "h-3.5 w-3.5" : "h-4 w-4";
  if (kind === "exam") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center bg-amber-400/15 text-amber-100 ${box}`}
      >
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path
            d="M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </svg>
      </span>
    );
  }
  if (kind === "assignment") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center bg-sky-400/15 text-sky-100 ${box}`}
      >
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path
            d="M8 4h8v4H8V4Zm0 6h8v10H8V10Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path d="M10 13h4M10 16h4" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </span>
    );
  }
  if (kind === "solution_video") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center bg-emerald-400/15 text-emerald-100 ${box}`}
      >
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
          <path d="m10 9 6 3-6 3V9Z" fill="currentColor" />
        </svg>
      </span>
    );
  }
  if (kind === "explanation_video") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center bg-primary/25 text-light-purple ${box}`}
      >
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <rect
            x="3"
            y="6"
            width="14"
            height="12"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path d="m17 10 4-2v8l-4-2v-4Z" fill="currentColor" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-white/10 text-white/70 ${box}`}
    >
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
        <path
          d="M7 4h10v16H7V4Zm3 4h4M10 12h4M10 16h3"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    </span>
  );
}

function isInlineVideo(kind: CourseContentItem["kind"]) {
  return (
    kind === "explanation_video" ||
    kind === "solution_video" ||
    kind === "lesson"
  );
}

function ContentRow({
  item,
  active,
  onSelect,
  allowLockedSelection = false,
  compact = false,
}: {
  item: CourseContentItem;
  active?: boolean;
  onSelect?: (item: CourseContentItem) => void;
  allowLockedSelection?: boolean;
  compact?: boolean;
}) {
  const canWatchInline =
    Boolean(onSelect) &&
    isInlineVideo(item.kind) &&
    (!item.locked || allowLockedSelection);

  const body = (
    <div
      className={`flex items-center gap-3 rounded-xl border transition ${
        compact ? "px-2.5 py-2" : "px-3 py-2.5"
      } ${
        active
          ? "border-primary bg-primary/20"
          : item.locked
            ? "border-white/8 bg-white/[0.03] opacity-80"
            : "border-white/10 bg-background/50 hover:border-primary/40 hover:bg-primary/10"
      }`}
    >
      <ContentIcon kind={item.kind} compact={compact} />
      <div className="min-w-0 flex-1">
        <p
          className={`truncate font-medium text-white ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {item.title}
        </p>
        <p className={`mt-0.5 text-white/45 ${compact ? "text-[10px]" : "text-xs"}`}>
          {item.kindLabel}
          {item.durationLabel ? ` · ${item.durationLabel}` : ""}
          {item.unpublished ? " · غير منشور" : ""}
        </p>
      </div>
      {canWatchInline ? (
        <span
          className={`shrink-0 rounded-md bg-primary/25 font-medium text-light-purple ${
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]"
          }`}
        >
          مشاهدة
        </span>
      ) : (
        <span
          className={`shrink-0 rounded-md ${
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]"
          } ${
            item.locked
              ? "bg-amber-400/10 text-amber-100"
              : "bg-emerald-400/10 text-emerald-100"
          }`}
        >
          {item.locked ? item.lockedLabel ?? "مقفل" : item.kind === "exam" ? "فتح" : "متاح"}
        </span>
      )}
    </div>
  );

  if (canWatchInline && onSelect) {
    return (
      <button
        type="button"
        className="block w-full text-start"
        onClick={() => onSelect(item)}
      >
        {body}
      </button>
    );
  }

  if (item.href && !item.locked) {
    return <Link href={item.href}>{body}</Link>;
  }

  return body;
}

export function CourseCurriculum({
  sections,
  emptyLabel = "لا توجد أقسام منشورة بعد.",
  activeItemId,
  onSelectItem,
  allowLockedSelection = false,
  variant = "main",
}: {
  sections: CourseExperienceSection[];
  emptyLabel?: string;
  activeItemId?: string | null;
  onSelectItem?: (item: CourseContentItem) => void;
  allowLockedSelection?: boolean;
  /** main = لوحة واسعة · sidebar = قائمة مضغوطة قابلة للتمرير */
  variant?: "main" | "sidebar";
}) {
  const compact = variant === "sidebar";
  const [openIds, setOpenIds] = useState<string[]>(() => {
    if (activeItemId) {
      const match = sections.find((section) =>
        section.items.some((item) => item.id === activeItemId),
      );
      if (match) return [match.id];
    }
    return sections.slice(0, compact ? 1 : 2).map((section) => section.id);
  });

  const sectionForActive = activeItemId
    ? sections.find((section) =>
        section.items.some((item) => item.id === activeItemId),
      )
    : null;
  const effectiveOpenIds =
    sectionForActive && !openIds.includes(sectionForActive.id)
      ? [...openIds, sectionForActive.id]
      : openIds;

  function handleSelect(item: CourseContentItem) {
    const match = sections.find((section) =>
      section.items.some((entry) => entry.id === item.id),
    );
    if (match) {
      setOpenIds((current) =>
        current.includes(match.id) ? current : [...current, match.id],
      );
    }
    onSelectItem?.(item);
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-surface/60 px-5 py-10 text-center text-sm text-white/60">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      className={
        compact
          ? "max-h-[min(70vh,36rem)] space-y-2 overflow-y-auto pe-1"
          : "space-y-3"
      }
    >
      {sections.map((section) => {
        const open = effectiveOpenIds.includes(section.id);
        return (
          <section
            key={section.id}
            className={`overflow-hidden border border-white/10 bg-surface shadow-[0_0_0_1px_rgba(124,58,237,0.08)] ${
              compact ? "rounded-xl" : "rounded-2xl"
            }`}
          >
            <button
              type="button"
              className={`flex w-full items-center justify-between gap-3 bg-gradient-to-l from-primary/25 via-primary/10 to-transparent text-start transition hover:from-primary/35 ${
                compact ? "px-3 py-2.5" : "px-4 py-3"
              }`}
              aria-expanded={open}
              onClick={() =>
                setOpenIds((current) =>
                  current.includes(section.id)
                    ? current.filter((id) => id !== section.id)
                    : [...current, section.id],
                )
              }
            >
              <div className="min-w-0">
                <h3
                  className={`truncate font-semibold text-white ${
                    compact ? "text-xs" : "text-sm sm:text-base"
                  }`}
                >
                  {section.title}
                </h3>
                <p className={`mt-1 truncate text-white/50 ${compact ? "text-[10px]" : "text-xs"}`}>
                  {section.items.length} عنصر
                  {section.description ? ` · ${section.description}` : ""}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-lg border border-white/15 text-light-purple ${
                  compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
                }`}
              >
                {open ? "−" : "+"}
              </span>
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div
                  className={`space-y-2 border-t border-white/10 ${
                    compact ? "p-2" : "p-3"
                  }`}
                >
                  {section.items.length === 0 ? (
                    <p className="px-1 py-3 text-xs text-white/45">
                      لا يوجد محتوى في هذا القسم بعد.
                    </p>
                  ) : (
                    section.items.map((item) => (
                      <ContentRow
                        key={`${item.kind}-${item.id}`}
                        item={item}
                        active={activeItemId === item.id}
                        onSelect={handleSelect}
                        allowLockedSelection={allowLockedSelection}
                        compact={compact}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

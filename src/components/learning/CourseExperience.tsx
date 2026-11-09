"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CourseCurriculum } from "@/components/learning/CourseCurriculum";
import { CourseThumbnail } from "@/components/learning/CourseThumbnail";
import { InlineCoursePlayer } from "@/components/learning/InlineCoursePlayer";
import { PurchaseForm } from "@/components/learning/PurchaseForm";
import { academicSemesterLabel } from "@/lib/learning/course-structure";
import { loadCourseLessonPlaybackAction } from "@/lib/learning/inline-playback-actions";
import type {
  CourseContentItem,
  CourseExperienceView,
  CourseSubscribeState,
  LessonDetailSafe,
  PlaybackAuthorization,
} from "@/lib/learning/types";

type ProductOption = {
  productId: string;
  productType: string;
  priceEgp: string;
  label: string;
};

type CourseExperienceProps = {
  course: CourseExperienceView;
  products?: ProductOption[];
  backHref: string;
  backLabel: string;
  subscribeState?: CourseSubscribeState;
  priceEgp?: string | null;
};

type LoadedPlayback = {
  lessonId: string;
  lesson: LessonDetailSafe;
  playback: PlaybackAuthorization;
  errorMessage: string | null;
};

function isVideoItem(item: CourseContentItem) {
  return (
    item.kind === "explanation_video" ||
    item.kind === "solution_video" ||
    item.kind === "lesson"
  );
}

function formatPrice(priceEgp: string | null | undefined) {
  if (priceEgp == null || priceEgp === "") return null;
  const n = Number(priceEgp);
  if (!Number.isFinite(n)) return `${priceEgp} ج.م`;
  if (n === 0) return "مجاني";
  return `${priceEgp} ج.م`;
}

export function CourseExperience({
  course,
  products = [],
  backHref,
  backLabel,
  subscribeState = "unavailable",
  priceEgp = null,
}: CourseExperienceProps) {
  const isAdminPreview = course.mode === "admin_preview";
  const isPreview = isAdminPreview;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedLessonId = searchParams.get("lesson");
  const wantsSubscribe = searchParams.get("subscribe") === "1";
  const watching = Boolean(selectedLessonId);

  const [loaded, setLoaded] = useState<LoadedPlayback | null>(null);
  const [pending, startTransition] = useTransition();
  const [purchaseOpened, setPurchaseOpened] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const showPurchase =
    purchaseOpened ||
    (wantsSubscribe && !course.hasAccess && !isAdminPreview);

  useEffect(() => {
    if (!showPurchase) return;
    const target = document.getElementById("purchase");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showPurchase]);

  const previewLesson = useMemo(() => {
    if (!isPreview || !selectedLessonId) return null;
    const previewItem = course.sections
      .flatMap((section) => section.items)
      .find((item) => item.id === selectedLessonId);
    if (!previewItem) return null;
    return {
      id: previewItem.id,
      semesterId: "",
      courseId: course.courseId,
      courseTitle: course.title,
      semesterTitle: "معاينة",
      title: previewItem.title,
      description: "",
      durationSeconds: null,
      isPublished: !previewItem.unpublished,
      sortOrder: 0,
      relatedExams: [],
      previousLessonId: null,
      nextLessonId: null,
    } satisfies LessonDetailSafe;
  }, [
    course.courseId,
    course.sections,
    course.title,
    isPreview,
    selectedLessonId,
  ]);

  useEffect(() => {
    if (!selectedLessonId || isPreview || !course.hasAccess) {
      return;
    }

    let cancelled = false;
    const lessonId = selectedLessonId;
    startTransition(async () => {
      const result = await loadCourseLessonPlaybackAction(
        lessonId,
        course.courseId,
      );
      if (cancelled) return;
      if (!result.ok) {
        setLoaded({
          lessonId,
          lesson: {
            id: lessonId,
            semesterId: "",
            courseId: course.courseId,
            courseTitle: course.title,
            semesterTitle: "",
            title: "تعذر التحميل",
            description: "",
            durationSeconds: null,
            isPublished: false,
            sortOrder: 0,
            relatedExams: [],
            previousLessonId: null,
            nextLessonId: null,
          },
          playback: {
            status: "unavailable",
            lessonId,
            message: result.message,
          },
          errorMessage: result.message,
        });
        return;
      }
      setLoaded({
        lessonId,
        lesson: result.lesson,
        playback: result.playback,
        errorMessage: null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    selectedLessonId,
    course.courseId,
    course.hasAccess,
    course.title,
    isPreview,
  ]);

  function selectLesson(item: CourseContentItem) {
    if (!isVideoItem(item)) return;
    if (item.locked && !isAdminPreview) return;
    if (item.id !== selectedLessonId) {
      setLoaded(null);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("lesson", item.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function clearLessonSelection() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("lesson");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setLoaded(null);
  }

  const matchedLoad =
    loaded && selectedLessonId && loaded.lessonId === selectedLessonId
      ? loaded
      : null;

  const playerLesson = isPreview ? previewLesson : matchedLoad?.lesson ?? null;
  const playerPlayback = isPreview ? null : matchedLoad?.playback ?? null;
  const playerError = !selectedLessonId
    ? null
    : isPreview
      ? null
      : !course.hasAccess
        ? "يلزم اشتراك نشط لمشاهدة دروس الفيديو."
        : matchedLoad?.errorMessage ?? null;
  const playerLoading =
    Boolean(selectedLessonId) &&
    !isPreview &&
    course.hasAccess &&
    (pending || !matchedLoad);

  const priceLabel = formatPrice(priceEgp ?? products[0]?.priceEgp ?? null);
  const loginSubscribeHref = `/login?next=${encodeURIComponent(`${pathname}?subscribe=1`)}`;

  const subscribeBlock = !isAdminPreview ? (
    <div id="purchase" className="space-y-3">
      {course.hasAccess || subscribeState === "enrolled" ? (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-center text-sm font-semibold text-emerald-100">
          أنت مشترك في الكورس
        </div>
      ) : subscribeState === "pending" ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/15 px-4 py-3 text-center text-sm font-semibold text-amber-50">
          طلب الاشتراك قيد المراجعة
        </div>
      ) : subscribeState === "login_required" ? (
        <Link
          href={loginSubscribeHref}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(124,58,237,0.3)] transition hover:bg-secondary"
        >
          اشترك الآن
        </Link>
      ) : subscribeState === "available" ? (
        <>
          <button
            type="button"
            onClick={() => setPurchaseOpened(true)}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(124,58,237,0.3)] transition hover:bg-secondary"
          >
            اشترك الآن
          </button>
          {showPurchase ? (
            products.length > 0 ? (
              <PurchaseForm products={products} />
            ) : (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
                لا يوجد سعر مضبوط لهذا الكورس حاليًا. تواصل مع المالك.
              </div>
            )
          ) : null}
        </>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/55">
          الاشتراك غير متاح حاليًا
        </div>
      )}
    </div>
  ) : (
    <div className="rounded-2xl border border-white/10 bg-background/60 p-4 text-xs leading-6 text-white/55">
      اختيار درس في المعاينة يعرض تخطيط التشغيل فقط دون تجاوز أمان Mux.
    </div>
  );

  const courseInfoCard = (
    <div className="rounded-2xl border border-white/10 bg-surface p-4">
      <h3 className="text-sm font-semibold text-white">{course.title}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-white/50">الترم الدراسي</dt>
          <dd className="text-white/85">
            {academicSemesterLabel(course.academicSemester)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-white/50">الأقسام</dt>
          <dd className="text-white/85">{course.sections.length}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-white/50">سعر الكورس</dt>
          <dd className="font-semibold text-light-purple">
            {priceLabel ?? "غير مضبوط"}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-6 text-white/45">
        الاشتراك في الكورس يفتح كل المحتوى المنشور داخله. لا شراء منفصل للأقسام أو
        الدروس أو الامتحانات.
      </p>
    </div>
  );

  return (
    <div className="space-y-5 overflow-x-hidden">
      {isAdminPreview ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
          <p className="text-sm text-amber-50">
            وضع المعاينة — بدون تسجيل وهمي وبدون تشغيل فيديو موقّع.
          </p>
          <Link
            href={backHref}
            className="rounded-xl border border-amber-200/30 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-400/10"
          >
            العودة للإدارة
          </Link>
        </div>
      ) : null}

      <header className="overflow-hidden rounded-3xl border border-primary/30 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.45),transparent_45%),linear-gradient(135deg,#4c1d95_0%,#2e1065_45%,#0b0913_100%)]">
        <div className="space-y-4 px-5 py-7 sm:px-8 sm:py-9">
          <div className="flex flex-wrap items-center gap-2 text-xs text-light-purple/90">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
              {course.brandLabel}
            </span>
            <span className="rounded-full border border-white/20 bg-black/20 px-3 py-1">
              {academicSemesterLabel(course.academicSemester)}
            </span>
            {isAdminPreview ? (
              <span className="rounded-full border border-amber-300/40 bg-amber-400/15 px-3 py-1 text-amber-50">
                معاينة كطالب
              </span>
            ) : null}
          </div>
          <h1 className="max-w-3xl text-2xl font-bold leading-10 text-white sm:text-3xl">
            {course.title}
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-white/75">
            {course.description ||
              (course.hasAccess
                ? "اختر فيديو من المنهج للمشاهدة هنا دون مغادرة الصفحة."
                : "كورس مشتَرى كامل. الأقسام تنظيمية وليست للبيع منفصلة.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={backHref}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm text-white/90 hover:bg-white/10"
            >
              {backLabel}
            </Link>
            <span
              className={`rounded-xl px-4 py-2 text-sm ${
                course.hasAccess || subscribeState === "enrolled"
                  ? "bg-emerald-500/20 text-emerald-100"
                  : subscribeState === "pending"
                    ? "bg-amber-400/15 text-amber-50"
                    : "bg-white/10 text-white/70"
              }`}
            >
              {course.hasAccess || subscribeState === "enrolled"
                ? "أنت مشترك في الكورس"
                : subscribeState === "pending"
                  ? "طلب الاشتراك قيد المراجعة"
                  : isAdminPreview
                    ? "معاينة بدون اشتراك"
                    : "غير مشترك"}
            </span>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.7fr)_minmax(280px,0.3fr)]">
        {/* اللوحة الرئيسية يمينًا في RTL ≈ 70% */}
        <div
          className={`min-w-0 space-y-5 ${
            watching ? "order-1" : "order-2 lg:order-1"
          }`}
        >
          {watching ? (
            <InlineCoursePlayer
              selectedLessonId={selectedLessonId}
              loading={playerLoading}
              lesson={playerLesson}
              playback={playerPlayback}
              errorMessage={playerError}
              previewMode={isPreview}
            />
          ) : (
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-white">
                  محتويات الكورس
                </h2>
                <p className="mt-1 text-xs text-white/50">
                  {course.hasAccess
                    ? "اضغط «مشاهدة» لفتح الفيديو في هذه اللوحة دون مغادرة الصفحة."
                    : "تصفح الأقسام المنشورة. المحتوى المدفوع يظهر مقفلًا حتى الاشتراك."}
                </p>
              </div>
              <CourseCurriculum
                sections={course.sections}
                activeItemId={selectedLessonId}
                onSelectItem={selectLesson}
                allowLockedSelection={isAdminPreview}
                variant="main"
              />
            </div>
          )}
        </div>

        {/* الشريط الجانبي يسارًا في RTL ≈ 30% */}
        <aside
          className={`min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start ${
            watching ? "order-2" : "order-1 lg:order-2"
          }`}
        >
          {watching ? (
            <>
              <button
                type="button"
                onClick={clearLessonSelection}
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:border-primary/40 hover:bg-primary/10"
              >
                العودة إلى محتويات الكورس
              </button>

              <div>
                <h2 className="text-sm font-semibold text-white">منهج الكورس</h2>
                <p className="mt-1 text-xs text-white/50">
                  بدّل بين الدروس من هنا دون إعادة تحميل الصفحة.
                </p>
                <div className="mt-3">
                  <CourseCurriculum
                    sections={course.sections}
                    activeItemId={selectedLessonId}
                    onSelectItem={selectLesson}
                    allowLockedSelection={isAdminPreview}
                    variant="sidebar"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-surface">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start text-sm text-white/80"
                  aria-expanded={infoOpen}
                  onClick={() => setInfoOpen((open) => !open)}
                >
                  <span>معلومات الكورس والاشتراك</span>
                  <span className="text-xs text-light-purple">
                    {infoOpen ? "إخفاء" : "عرض"}
                  </span>
                </button>
                {infoOpen ? (
                  <div className="space-y-3 border-t border-white/10 p-4">
                    <CourseThumbnail
                      title={course.title}
                      thumbnailPath={course.thumbnailPath}
                      className="aspect-[16/10] w-full"
                      sizes="(max-width: 1024px) 100vw, 320px"
                    />
                    {courseInfoCard}
                    {subscribeBlock}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <CourseThumbnail
                title={course.title}
                thumbnailPath={course.thumbnailPath}
                className="aspect-[16/10] w-full"
                sizes="(max-width: 1024px) 100vw, 320px"
                priority
              />
              {courseInfoCard}
              {subscribeBlock}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

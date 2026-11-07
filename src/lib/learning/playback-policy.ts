/** تطابق قيم enums في migrations: user_role, course_status, product_type, enrollment_status. */
type CourseStatus = "draft" | "pending_review" | "published" | "archived";
type EnrollmentStatus = "active" | "expired" | "suspended";
type ProductType = "full_course" | "semester";
type UserRole = "super_admin" | "teacher" | "student";

/** مدة المنحة المقصودة عند تفعيل مزوّد لاحقًا. لا يُصدر رابط في هذه المرحلة. */
export const PLAYBACK_GRANT_TTL_SECONDS = 5 * 60;
export const PLAYBACK_RATE_LIMIT = 30;
export const PLAYBACK_RATE_WINDOW_MS = 60_000;

export type PlaybackActor = UserRole | "anonymous";

export type PlaybackEnrollmentFact = {
  status: EnrollmentStatus;
  startsAt: string;
  expiresAt: string | null;
  productType: ProductType | null;
  courseId: string | null;
  semesterId: string | null;
};

export type PlaybackLessonFact = {
  courseId: string;
  semesterId: string;
  courseStatus: CourseStatus;
  isPublished: boolean;
};

export type StudentPlaybackFacts = {
  now: Date;
  actor: PlaybackActor;
  accountActive: boolean;
  requestedCourseId: string;
  requestedSemesterId: string;
  lesson: PlaybackLessonFact | null;
  enrollments: PlaybackEnrollmentFact[];
};

export type PlaybackDenialReason =
  | "unauthenticated"
  | "inactive_account"
  | "staff_boundary"
  | "lesson_not_in_scope"
  | "course_mismatch"
  | "semester_mismatch"
  | "course_not_published"
  | "lesson_not_published"
  | "no_enrollment"
  | "enrollment_not_started"
  | "enrollment_expired"
  | "enrollment_inactive";

export type StudentPlaybackDecision =
  | { outcome: "deny"; reason: PlaybackDenialReason }
  | { outcome: "allow"; scope: "full_course" | "semester" };

export type PlaybackGrantResult = {
  playbackUrl: null;
  expiresAt: null;
  assetVerified: false;
  reason: "provider_unconfigured";
  ttlSeconds: number;
};

export type VideoSetupStatus =
  | "not_configured"
  | "pending"
  | "ready"
  | "unavailable";

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function matchesLesson(
  enrollment: PlaybackEnrollmentFact,
  lesson: PlaybackLessonFact,
): boolean {
  if (enrollment.productType === "full_course") {
    return enrollment.courseId === lesson.courseId && enrollment.semesterId == null;
  }
  if (enrollment.productType === "semester") {
    return enrollment.semesterId === lesson.semesterId && enrollment.courseId == null;
  }
  return false;
}

/**
 * قرار وصول الطالب فقط. المدرّس والمالك لا يحصلان على منحة تشغيل طالب.
 * النطاق يُستنتج من product_type في products، وهو ما يميّز الكورس الكامل عن الترم.
 */
export function evaluateStudentPlayback(
  facts: StudentPlaybackFacts,
): StudentPlaybackDecision {
  if (facts.actor === "anonymous") {
    return { outcome: "deny", reason: "unauthenticated" };
  }
  if (facts.actor === "teacher" || facts.actor === "super_admin") {
    return { outcome: "deny", reason: "staff_boundary" };
  }
  if (!facts.accountActive) {
    return { outcome: "deny", reason: "inactive_account" };
  }
  if (!facts.lesson) {
    return { outcome: "deny", reason: "lesson_not_in_scope" };
  }
  if (facts.lesson.courseId !== facts.requestedCourseId) {
    return { outcome: "deny", reason: "course_mismatch" };
  }
  if (facts.lesson.semesterId !== facts.requestedSemesterId) {
    return { outcome: "deny", reason: "semester_mismatch" };
  }
  if (facts.lesson.courseStatus !== "published") {
    return { outcome: "deny", reason: "course_not_published" };
  }
  if (!facts.lesson.isPublished) {
    return { outcome: "deny", reason: "lesson_not_published" };
  }

  const now = facts.now.getTime();
  const matching = facts.enrollments.filter((enrollment) =>
    matchesLesson(enrollment, facts.lesson as PlaybackLessonFact),
  );

  const valid = matching.filter((enrollment) => {
    if (enrollment.status !== "active") return false;
    const starts = parseTime(enrollment.startsAt);
    if (starts == null || starts > now) return false;
    const expires = parseTime(enrollment.expiresAt);
    if (enrollment.expiresAt && (expires == null || expires <= now)) return false;
    return true;
  });

  if (valid.some((enrollment) => enrollment.productType === "full_course")) {
    return { outcome: "allow", scope: "full_course" };
  }
  if (valid.some((enrollment) => enrollment.productType === "semester")) {
    return { outcome: "allow", scope: "semester" };
  }

  const future = matching.some((enrollment) => {
    const starts = parseTime(enrollment.startsAt);
    return enrollment.status === "active" && starts != null && starts > now;
  });
  if (future) return { outcome: "deny", reason: "enrollment_not_started" };

  const expired = matching.some((enrollment) => {
    if (enrollment.status === "expired") return true;
    const expires = parseTime(enrollment.expiresAt);
    return (
      enrollment.status === "active" &&
      enrollment.expiresAt != null &&
      expires != null &&
      expires <= now
    );
  });
  if (expired) return { outcome: "deny", reason: "enrollment_expired" };

  if (matching.some((enrollment) => enrollment.status === "suspended")) {
    return { outcome: "deny", reason: "enrollment_inactive" };
  }

  return { outcome: "deny", reason: "no_enrollment" };
}

/**
 * يقرأ العمود الآمن فقط. غياب has_video_asset يعني أن العقد القديم ما زال قائمًا
 * أو أن الرد غير مفهوم، فيُعامل كغير معروف بدل تخمين غياب الفيديو.
 */
export function privateVideoConfigured(
  grant: { has_video_asset?: boolean | null } | null | undefined,
): boolean | null {
  if (!grant || typeof grant.has_video_asset !== "boolean") return null;
  return grant.has_video_asset;
}

/** لا يصدر رابطًا ولا يتحقق من أصل خارجي. المزود غير مفعّل عمدًا. */
export function issuePlaybackGrant(): PlaybackGrantResult {
  return {
    playbackUrl: null,
    expiresAt: null,
    assetVerified: false,
    reason: "provider_unconfigured",
    ttlSeconds: PLAYBACK_GRANT_TTL_SECONDS,
  };
}

/**
 * ready فقط إذا أكد مزوّد موثوق الأصل.
 * وجود معرّف غير المتحقق منه يبقى pending، وغيابه not_configured.
 */
export function classifyVideoSetup(input: {
  known: boolean;
  present: boolean;
  verifiedByProvider: boolean;
}): VideoSetupStatus {
  if (!input.known) return "unavailable";
  if (!input.present) return "not_configured";
  if (input.verifiedByProvider) return "ready";
  return "pending";
}

/** true عندما يُسمح بالمحاولة. الحد لكل عملية خادم، وليس مشتركًا بين النسخ. */
export function consumeRateLimit(
  buckets: Map<string, number[]>,
  key: string,
  nowMs: number,
  limit = PLAYBACK_RATE_LIMIT,
  windowMs = PLAYBACK_RATE_WINDOW_MS,
): boolean {
  const fresh = (buckets.get(key) ?? []).filter((stamp) => nowMs - stamp < windowMs);
  if (fresh.length >= limit) {
    buckets.set(key, fresh);
    return false;
  }
  fresh.push(nowMs);
  buckets.set(key, fresh);
  return true;
}

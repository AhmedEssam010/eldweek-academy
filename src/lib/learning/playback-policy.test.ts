import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyVideoSetup,
  consumeRateLimit,
  evaluateStudentPlayback,
  issuePlaybackGrant,
  privateVideoConfigured,
  PLAYBACK_RATE_LIMIT,
  type StudentPlaybackFacts,
} from "./playback-policy.ts";

const NOW = new Date("2026-11-06T09:00:00.000Z");

function facts(
  patch: Partial<StudentPlaybackFacts> = {},
): StudentPlaybackFacts {
  return {
    now: NOW,
    actor: "student",
    accountActive: true,
    requestedCourseId: "course-1",
    requestedSemesterId: "semester-1",
    lesson: {
      courseId: "course-1",
      semesterId: "semester-1",
      courseStatus: "published",
      isPublished: true,
    },
    enrollments: [],
    ...patch,
  };
}

function enrollment(
  patch: Partial<StudentPlaybackFacts["enrollments"][number]> = {},
) {
  return {
    status: "active" as const,
    startsAt: "2026-11-01T00:00:00.000Z",
    expiresAt: null,
    productType: "full_course" as const,
    courseId: "course-1",
    semesterId: null,
    ...patch,
  };
}

describe("evaluateStudentPlayback", () => {
  it("يرفض غير المسجّل", () => {
    const decision = evaluateStudentPlayback(facts({ actor: "anonymous" }));
    assert.deepEqual(decision, { outcome: "deny", reason: "unauthenticated" });
  });

  it("يرفض المدرّس والمالك حتى مع تسجيل مطابق", () => {
    const enrollments = [enrollment()];
    const teacher = evaluateStudentPlayback(
      facts({ actor: "teacher", enrollments }),
    );
    const admin = evaluateStudentPlayback(
      facts({ actor: "super_admin", enrollments }),
    );
    assert.equal(teacher.outcome === "deny" && teacher.reason, "staff_boundary");
    assert.equal(admin.outcome === "deny" && admin.reason, "staff_boundary");
  });

  it("يرفض الحساب غير النشط", () => {
    assert.equal(
      evaluateStudentPlayback(facts({ accountActive: false })).reason,
      "inactive_account",
    );
  });

  it("يرفض اختلاف الكورس أو الترم عن الدرس", () => {
    assert.equal(
      evaluateStudentPlayback(facts({ requestedCourseId: "course-2" })).reason,
      "course_mismatch",
    );
    assert.equal(
      evaluateStudentPlayback(
        facts({ requestedSemesterId: "semester-2" }),
      ).reason,
      "semester_mismatch",
    );
    assert.equal(
      evaluateStudentPlayback(facts({ lesson: null })).reason,
      "lesson_not_in_scope",
    );
  });

  it("يرفض الكورس أو الدرس غير المنشور", () => {
    assert.equal(
      evaluateStudentPlayback(
        facts({
          lesson: {
            courseId: "course-1",
            semesterId: "semester-1",
            courseStatus: "draft",
            isPublished: true,
          },
          enrollments: [enrollment()],
        }),
      ).reason,
      "course_not_published",
    );
    assert.equal(
      evaluateStudentPlayback(
        facts({
          lesson: {
            courseId: "course-1",
            semesterId: "semester-1",
            courseStatus: "published",
            isPublished: false,
          },
          enrollments: [enrollment()],
        }),
      ).reason,
      "lesson_not_published",
    );
  });

  it("يرفض غياب التسجيل", () => {
    assert.equal(
      evaluateStudentPlayback(facts()).reason,
      "no_enrollment",
    );
  });

  it("يرفض التسجيل المنتهي أو الموقوف أو الذي لم يبدأ", () => {
    assert.equal(
      evaluateStudentPlayback(
        facts({
          enrollments: [enrollment({ expiresAt: "2026-11-05T00:00:00.000Z" })],
        }),
      ).reason,
      "enrollment_expired",
    );
    assert.equal(
      evaluateStudentPlayback(
        facts({ enrollments: [enrollment({ status: "expired" })] }),
      ).reason,
      "enrollment_expired",
    );
    assert.equal(
      evaluateStudentPlayback(
        facts({ enrollments: [enrollment({ status: "suspended" })] }),
      ).reason,
      "enrollment_inactive",
    );
    assert.equal(
      evaluateStudentPlayback(
        facts({
          enrollments: [enrollment({ startsAt: "2026-12-01T00:00:00.000Z" })],
        }),
      ).reason,
      "enrollment_not_started",
    );
  });

  it("يسمح بشراء الكورس الكامل لهذا الكورس فقط", () => {
    assert.deepEqual(
      evaluateStudentPlayback(facts({ enrollments: [enrollment()] })),
      { outcome: "allow", scope: "full_course" },
    );
    assert.equal(
      evaluateStudentPlayback(
        facts({
          enrollments: [enrollment({ courseId: "course-2" })],
        }),
      ).reason,
      "no_enrollment",
    );
  });

  it("يسمح بشراء الترم المطلوب فقط", () => {
    assert.deepEqual(
      evaluateStudentPlayback(
        facts({
          enrollments: [
            enrollment({
              productType: "semester",
              courseId: null,
              semesterId: "semester-1",
            }),
          ],
        }),
      ),
      { outcome: "allow", scope: "semester" },
    );
    assert.equal(
      evaluateStudentPlayback(
        facts({
          lesson: {
            courseId: "course-1",
            semesterId: "semester-2",
            courseStatus: "published",
            isPublished: true,
          },
          requestedSemesterId: "semester-2",
          enrollments: [
            enrollment({
              productType: "semester",
              courseId: null,
              semesterId: "semester-1",
            }),
          ],
        }),
      ).reason,
      "no_enrollment",
    );
  });

  it("شراء الكورس الكامل يغطي ترمًا آخر داخل نفس الكورس", () => {
    assert.deepEqual(
      evaluateStudentPlayback(
        facts({
          requestedSemesterId: "semester-2",
          lesson: {
            courseId: "course-1",
            semesterId: "semester-2",
            courseStatus: "published",
            isPublished: true,
          },
          enrollments: [enrollment()],
        }),
      ),
      { outcome: "allow", scope: "full_course" },
    );
  });
});

describe("playback grant and video setup", () => {
  it("لا يصدر رابطًا ولا يؤكد الأصل بينما المزود غير مهيأ", () => {
    const grant = issuePlaybackGrant();
    assert.equal(grant.playbackUrl, null);
    assert.equal(grant.expiresAt, null);
    assert.equal(grant.assetVerified, false);
    assert.equal(grant.reason, "provider_unconfigured");
    assert.equal("video_asset_id" in grant, false);
  });

  it("يعتمد فقط على has_video_asset ولا يقرأ المعرّف الخام", () => {
    assert.equal(privateVideoConfigured({ has_video_asset: true }), true);
    assert.equal(privateVideoConfigured({ has_video_asset: false }), false);
    assert.equal(
      privateVideoConfigured({ video_asset_id: "secret-video" } as {
        has_video_asset?: boolean;
      }),
      null,
    );
    assert.equal(privateVideoConfigured(null), null);
  });

  it("لا يعلن الجاهزية إلا بتحقق موثوق", () => {
    assert.equal(
      classifyVideoSetup({ known: false, present: false, verifiedByProvider: false }),
      "unavailable",
    );
    assert.equal(
      classifyVideoSetup({ known: true, present: false, verifiedByProvider: false }),
      "not_configured",
    );
    assert.equal(
      classifyVideoSetup({ known: true, present: true, verifiedByProvider: false }),
      "pending",
    );
    assert.equal(
      classifyVideoSetup({ known: true, present: true, verifiedByProvider: true }),
      "ready",
    );
  });
});

describe("consumeRateLimit", () => {
  it("يغلق بعد تجاوز الحد داخل النافذة", () => {
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < PLAYBACK_RATE_LIMIT; i += 1) {
      assert.equal(consumeRateLimit(buckets, "user-1", 1_000), true);
    }
    assert.equal(consumeRateLimit(buckets, "user-1", 1_000), false);
    assert.equal(consumeRateLimit(buckets, "user-1", 1_000 + 60_000), true);
  });
});

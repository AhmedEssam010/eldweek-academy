import type { AcademicSemester, CourseStatus } from "@/types/database";
import type { DataAvailability } from "@/lib/dashboard/types";

export type LearningQueryResult<T> = {
  availability: DataAvailability;
  message: string;
  data: T;
};

export type StaffCourseAccess = {
  courseId: string;
  title: string;
  status: CourseStatus;
  canEditContent: boolean;
  canManageExams: boolean;
  canViewStudentProgress: boolean;
  isAdmin: boolean;
};

export type SemesterListItem = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  sortOrder: number;
  lessonsCount: number;
  examsCount: number;
};

export type LessonListItem = {
  id: string;
  semesterId: string;
  title: string;
  description: string;
  sortOrder: number;
  durationSeconds: number | null;
  isPublished: boolean;
  examCount: number;
  /** لا يُعرَّض video_asset_id هنا أبدًا */
  hasVideoAsset: boolean;
  videoLabel?: string;
  completed?: boolean;
  locked?: boolean;
  lockedLabel?: string;
};

export type LessonDetailSafe = {
  id: string;
  semesterId: string;
  courseId: string;
  courseTitle: string;
  semesterTitle: string;
  title: string;
  description: string;
  durationSeconds: number | null;
  isPublished: boolean;
  sortOrder: number;
  relatedExams: Array<{ id: string; title: string; isPublished: boolean }>;
  previousLessonId: string | null;
  nextLessonId: string | null;
};

export type PlaybackAuthorization =
  | {
      status: "authorized";
      source: "mux";
      lessonId: string;
      durationSeconds: number | null;
      /** رابط موقّت فقط. لا يُصدر في هذه المرحلة. */
      playbackUrl: string;
      muxPlaybackId: string;
      muxPlaybackToken: string;
      expiresAt: string;
      message: string;
    }
  | {
      status: "authorized";
      source: "youtube";
      lessonId: string;
      durationSeconds: number | null;
      youtubeVideoId: string;
      message: string;
    }
  | {
      status: "provider_unconfigured";
      lessonId: string;
      durationSeconds: number | null;
      message: string;
    }
  | {
      status: "processing";
      lessonId: string;
      message: string;
    }
  | {
      status: "locked" | "forbidden" | "setup_required" | "unavailable";
      lessonId: string;
      message: string;
    };

export type ExamListItem = {
  id: string;
  title: string;
  description: string;
  lessonId: string | null;
  semesterId: string | null;
  durationMinutes: number | null;
  passingScore: number;
  maxAttempts: number | null;
  isPublished: boolean;
  questionsCount: number;
};

export type ExamQuestionTypeView = "mcq" | "true_false" | "essay";

export type ExamGradingStatusView =
  | "not_applicable"
  | "awaiting_essay"
  | "draft"
  | "finalized";

export type ExamQuestionEditorView = {
  id: string;
  questionText: string;
  sortOrder: number;
  points: number;
  questionType: ExamQuestionTypeView;
  modelAnswer: string | null;
  options: Array<{
    id: string;
    optionText: string;
    sortOrder: number;
    /** يظهر فقط في واجهات الإدارة/المدرّس المصرّح لها */
    isCorrect: boolean;
  }>;
};

export type ExamEditorView = ExamListItem & {
  questions: ExamQuestionEditorView[];
  totalPoints: number;
  releaseModelAnswers: boolean;
};

export type ExamTakingQuestion = {
  id: string;
  questionText: string;
  sortOrder: number;
  points: number;
  questionType: ExamQuestionTypeView;
  options: Array<{
    id: string;
    optionText: string;
    sortOrder: number;
  }>;
};

export type ExamTakingView = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number | null;
  passingScore: number;
  maxAttempts: number | null;
  questions: ExamTakingQuestion[];
  attemptId: string | null;
  endsAt: string | null;
  serverNow: string;
  attemptStatus: "in_progress" | "submitted" | "expired" | "abandoned" | null;
  gradingStatus: ExamGradingStatusView | null;
  score: number | null;
  passed: boolean | null;
};

export type ExamAttemptStaffRow = {
  id: string;
  studentName: string;
  status: string;
  gradingStatus: ExamGradingStatusView;
  score: number | null;
  startedAt: string;
  submittedAt: string | null;
};

export type ExamScopeOption = {
  id: string;
  title: string;
  semesterId?: string;
};

export type ExamAttemptSummary = {
  id: string;
  examId: string;
  examTitle: string;
  status: "in_progress" | "submitted" | "expired" | "abandoned";
  gradingStatus: ExamGradingStatusView;
  score: number | null;
  objectiveEarned: number | null;
  essayEarned: number | null;
  totalPoints: number | null;
  startedAt: string;
  submittedAt: string | null;
  passed: boolean | null;
  resultsReleased: boolean;
};

export type ExamGradingQueueItem = {
  attemptId: string;
  examId: string;
  examTitle: string;
  courseId: string;
  courseTitle: string;
  studentName: string;
  submittedAt: string | null;
  objectiveEarned: number | null;
  totalPoints: number | null;
  gradingStatus: ExamGradingStatusView;
};

export type ExamGradingDetailView = {
  attemptId: string;
  examId: string;
  examTitle: string;
  courseId: string;
  courseTitle: string;
  studentId: string;
  studentName: string;
  submittedAt: string | null;
  gradingStatus: ExamGradingStatusView;
  score: number | null;
  objectiveEarned: number | null;
  essayEarned: number | null;
  totalPoints: number | null;
  answers: Array<{
    answerId: string;
    questionId: string;
    questionType: ExamQuestionTypeView;
    questionText: string;
    points: number;
    awardedPoints: number | null;
    isCorrect: boolean | null;
    selectedOptionText: string | null;
    correctOptionText: string | null;
    essayText: string | null;
    teacherFeedback: string | null;
    modelAnswer: string | null;
  }>;
};

export type ExamAttemptReviewView = {
  released: boolean;
  message?: string;
  attemptId?: string;
  examId?: string;
  examTitle?: string;
  score?: number | null;
  passingScore?: number;
  passed?: boolean | null;
  gradingStatus?: ExamGradingStatusView;
  objectiveEarned?: number | null;
  essayEarned?: number | null;
  totalPoints?: number | null;
  answers?: Array<{
    answerId: string;
    questionId: string;
    questionType: ExamQuestionTypeView;
    questionText: string;
    points: number;
    awardedPoints: number | null;
    isCorrect: boolean | null;
    selectedOptionText: string | null;
    correctOptionText: string | null;
    essayText: string | null;
    teacherFeedback: string | null;
    modelAnswer: string | null;
  }>;
};

export type StudentCourseCard = {
  courseId: string;
  title: string;
  description: string;
  thumbnailPath: string | null;
  enrollmentStatus: "active" | "expired" | "suspended";
  accessLabel: string;
  progressPercent: number | null;
  coursePublished: boolean;
};

export type StudentCourseDetail = {
  courseId: string;
  title: string;
  description: string;
  thumbnailPath: string | null;
  academicSemester?: AcademicSemester | null;
  hasAccess?: boolean;
  semesters: Array<
    SemesterListItem & {
      lessons: LessonListItem[];
      exams: ExamListItem[];
    }
  >;
};

export type CourseContentKind =
  | "explanation_video"
  | "solution_video"
  | "assignment"
  | "lesson"
  | "exam";

export type CourseContentItem = {
  id: string;
  kind: CourseContentKind;
  title: string;
  kindLabel: string;
  durationLabel: string | null;
  locked: boolean;
  lockedLabel?: string;
  unpublished: boolean;
  href: string | null;
};

export type CourseExperienceSection = {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  items: CourseContentItem[];
};

export type CourseExperienceView = {
  courseId: string;
  title: string;
  description: string;
  thumbnailPath: string | null;
  academicSemester: AcademicSemester | null;
  hasAccess: boolean;
  mode: "student" | "admin_preview" | "public_preview";
  brandLabel: string;
  sections: CourseExperienceSection[];
};

export type CourseSubscribeState =
  | "enrolled"
  | "pending"
  | "available"
  | "login_required"
  | "unavailable";

export type LessonProgressView = {
  lessonId: string;
  lastPositionSeconds: number;
  watchedSeconds: number;
  completedAt: string | null;
  saved: boolean;
};

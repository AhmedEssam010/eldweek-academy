/**
 * أنواع قاعدة البيانات المتوافقة مع supabase/migrations.
 * تُحدَّث يدويًا في هذه المرحلة (بدون codegen بعد).
 */

export type UserRole = "super_admin" | "teacher" | "student";

export type CourseStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "archived";

export type ProductType = "full_course" | "semester";

/** الترم الدراسي التنظيمي. الوحدة المشتراة هي courses. */
export type AcademicSemester = "first" | "second";

export type PaymentMethod = "instapay" | "vodafone_cash";

export type PaymentStatus = "pending" | "approved" | "rejected";

export type EnrollmentStatus = "active" | "expired" | "suspended";

export type AuditAction =
  | "payment_approved"
  | "payment_rejected"
  | "enrollment_activated"
  | "enrollment_suspended"
  | "role_changed"
  | "teacher_assignment_changed"
  | "course_published"
  | "course_archived"
  | "course_draft_created"
  | "super_admin_provisioned"
  | "exam_published"
  | "exam_submitted";

export type ExamAttemptStatus =
  | "in_progress"
  | "submitted"
  | "expired"
  | "abandoned";

export type Profile = {
  id: string;
  full_name: string;
  phone_number: string | null;
  phone_verified_at: string | null;
  role: UserRole;
  can_create_course_drafts: boolean;
  avatar_path: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Course = {
  id: string;
  title: string;
  slug: string;
  description: string;
  thumbnail_path: string | null;
  academic_semester: AcademicSemester | null;
  created_by: string;
  status: CourseStatus;
  created_at: string;
  updated_at: string;
};

export type CourseStaffAssignment = {
  id: string;
  course_id: string;
  teacher_id: string;
  can_edit_content: boolean;
  can_manage_exams: boolean;
  can_view_student_progress: boolean;
  created_at: string;
};

export type CourseSemester = {
  id: string;
  course_id: string;
  title: string;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Lesson = {
  id: string;
  semester_id: string;
  title: string;
  description: string;
  video_asset_id: string | null;
  duration_seconds: number | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  product_type: ProductType;
  course_id: string | null;
  semester_id: string | null;
  price_egp: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PaymentRequest = {
  id: string;
  student_id: string;
  product_id: string;
  payment_method: PaymentMethod;
  amount_egp: string;
  sender_phone: string;
  receipt_path: string;
  status: PaymentStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type Enrollment = {
  id: string;
  student_id: string;
  product_id: string;
  payment_request_id: string | null;
  starts_at: string;
  expires_at: string | null;
  status: EnrollmentStatus;
  created_at: string;
};

export type LessonProgress = {
  id: string;
  student_id: string;
  lesson_id: string;
  last_position_seconds: number;
  watched_seconds: number;
  completed_at: string | null;
  updated_at: string;
};

export type Exam = {
  id: string;
  lesson_id: string | null;
  semester_id: string | null;
  title: string;
  description: string;
  duration_minutes: number | null;
  passing_score: number;
  max_attempts: number | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type ExamQuestion = {
  id: string;
  exam_id: string;
  question_text: string;
  sort_order: number;
  points: number;
};

export type ExamOption = {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  sort_order: number;
};

export type ExamAttempt = {
  id: string;
  exam_id: string;
  student_id: string;
  started_at: string;
  ends_at: string | null;
  submitted_at: string | null;
  score: number | null;
  status: ExamAttemptStatus;
};

export type ExamAnswer = {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option_id: string | null;
  is_correct: boolean | null;
  awarded_points: number;
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
      };
      courses: {
        Row: Course;
        Insert: Partial<Course> & {
          title: string;
          slug: string;
          created_by: string;
        };
        Update: Partial<Course>;
      };
      course_staff_assignments: {
        Row: CourseStaffAssignment;
        Insert: Partial<CourseStaffAssignment> & {
          course_id: string;
          teacher_id: string;
        };
        Update: Partial<CourseStaffAssignment>;
      };
      course_semesters: {
        Row: CourseSemester;
        Insert: Partial<CourseSemester> & { course_id: string; title: string };
        Update: Partial<CourseSemester>;
      };
      lessons: {
        Row: Lesson;
        Insert: Partial<Lesson> & { semester_id: string; title: string };
        Update: Partial<Lesson>;
      };
      products: {
        Row: Product;
        Insert: Partial<Product> & {
          product_type: ProductType;
          price_egp: string;
        };
        Update: Partial<Product>;
      };
      payment_requests: {
        Row: PaymentRequest;
        Insert: Partial<PaymentRequest> & {
          student_id: string;
          product_id: string;
          payment_method: PaymentMethod;
          sender_phone: string;
          receipt_path: string;
        };
        Update: Partial<PaymentRequest>;
      };
      enrollments: {
        Row: Enrollment;
        Insert: Partial<Enrollment> & {
          student_id: string;
          product_id: string;
        };
        Update: Partial<Enrollment>;
      };
      lesson_progress: {
        Row: LessonProgress;
        Insert: Partial<LessonProgress> & {
          student_id: string;
          lesson_id: string;
        };
        Update: Partial<LessonProgress>;
      };
      exams: {
        Row: Exam;
        Insert: Partial<Exam> & { title: string };
        Update: Partial<Exam>;
      };
      exam_questions: {
        Row: ExamQuestion;
        Insert: Partial<ExamQuestion> & {
          exam_id: string;
          question_text: string;
        };
        Update: Partial<ExamQuestion>;
      };
      exam_options: {
        Row: ExamOption;
        Insert: Partial<ExamOption> & {
          question_id: string;
          option_text: string;
        };
        Update: Partial<ExamOption>;
      };
      exam_attempts: {
        Row: ExamAttempt;
        Insert: Partial<ExamAttempt> & {
          exam_id: string;
          student_id: string;
        };
        Update: Partial<ExamAttempt>;
      };
      exam_answers: {
        Row: ExamAnswer;
        Insert: Partial<ExamAnswer> & {
          attempt_id: string;
          question_id: string;
        };
        Update: Partial<ExamAnswer>;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Partial<AuditLog> & {
          action: AuditAction;
          entity_type: string;
        };
        Update: Partial<AuditLog>;
      };
    };
    Views: {
      lessons_catalog: {
        Row: Omit<Lesson, "video_asset_id">;
      };
      exam_options_for_taking: {
        Row: Omit<ExamOption, "is_correct">;
      };
    };
    Functions: {
      create_course_draft: {
        Args: {
          p_title: string;
          p_slug: string;
          p_description?: string;
          p_thumbnail_path?: string | null;
        };
        Returns: string;
      };
      publish_course: { Args: { p_course_id: string }; Returns: undefined };
      archive_course: { Args: { p_course_id: string }; Returns: undefined };
      approve_payment_request: {
        Args: { p_payment_request_id: string; p_expires_at?: string | null };
        Returns: string;
      };
      reject_payment_request: {
        Args: { p_payment_request_id: string; p_rejection_reason: string };
        Returns: undefined;
      };
      get_lesson_playback_grant: {
        Args: { p_lesson_id: string };
        Returns: {
          lesson_id: string;
          has_video_asset: boolean;
          duration_seconds: number | null;
        }[];
      };
      student_has_active_enrollment_for_course: {
        Args: { p_course_id: string };
        Returns: boolean;
      };
      student_has_active_enrollment_for_lesson: {
        Args: { p_lesson_id: string };
        Returns: boolean;
      };
      student_has_active_enrollment_for_exam: {
        Args: { p_exam_id: string };
        Returns: boolean;
      };
      start_exam_attempt: {
        Args: { p_exam_id: string };
        Returns: string;
      };
      submit_exam_attempt: {
        Args: { p_attempt_id: string; p_answers: unknown };
        Returns: {
          attempt_id: string;
          score: number;
          status: ExamAttemptStatus;
          passed: boolean;
        }[];
      };
      provision_super_admin: {
        Args: {
          p_user_id: string;
          p_full_name: string;
          p_phone_number?: string | null;
        };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      course_status: CourseStatus;
      product_type: ProductType;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
      enrollment_status: EnrollmentStatus;
      audit_action: AuditAction;
      exam_attempt_status: ExamAttemptStatus;
    };
  };
};

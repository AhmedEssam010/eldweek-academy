import type { AcademicSemester, CourseStatus } from "@/types/database";

export type DataAvailability =
  | "ready"
  | "setup_required"
  | "unavailable"
  | "empty";

export type CourseFormActionResult = {
  ok: boolean;
  message: string;
  redirectTo?: string;
};

export type DashboardMetric = {
  key: string;
  label: string;
  value: number | null;
  hint: string;
};

export type TeacherListItem = {
  id: string;
  fullName: string;
  phoneNumber: string | null;
  isActive: boolean;
  canCreateCourseDrafts: boolean;
  createdAt: string;
};

export type TeacherDetail = TeacherListItem & {
  assignments: CourseAssignmentView[];
};

export type CourseAssignmentView = {
  id: string;
  courseId: string;
  courseTitle: string;
  courseStatus: CourseStatus;
  canEditContent: boolean;
  canManageExams: boolean;
  canViewStudentProgress: boolean;
  teacherId?: string;
  teacherName?: string;
};

export type CourseListItem = {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: CourseStatus;
  academicSemester: AcademicSemester | null;
  createdAt: string;
  updatedAt: string;
  assignedTeachersCount: number;
  thumbnailPath: string | null;
};

export type CourseDetail = CourseListItem & {
  assignments: CourseAssignmentView[];
  semestersCount: number;
  lessonsCount: number;
};

export type TeacherCourseCard = {
  courseId: string;
  title: string;
  status: CourseStatus;
  canEditContent: boolean;
  canManageExams: boolean;
  canViewStudentProgress: boolean;
  canCreateCourseDrafts: boolean;
};

export type StudentListItem = {
  id: string;
  fullName: string;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: string;
  activeEnrollmentsCount: number;
  pendingPaymentsCount: number;
};

export type StudentDetailView = {
  id: string;
  fullName: string;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: string;
  enrollments: StudentEnrollmentView[];
  paymentRequests: StudentPaymentView[];
};

export type StudentEnrollmentView = {
  id: string;
  productType: string;
  targetTitle: string;
  status: string;
  startsAt: string;
  expiresAt: string | null;
  createdAt: string;
};

export type StudentPaymentView = {
  id: string;
  productType: string;
  targetTitle: string;
  paymentMethod: string;
  amountEgp: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
};

export type PaymentRequestItem = {
  id: string;
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  productId: string;
  productType: string;
  targetTitle: string;
  paymentMethod: string;
  amountEgp: string;
  senderPhone: string;
  receiptPath: string;
  status: string;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

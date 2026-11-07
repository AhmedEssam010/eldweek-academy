import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAuthReadiness } from "@/lib/auth/readiness";
import type {
  DataAvailability,
  PaymentRequestItem,
  StudentDetailView,
  StudentEnrollmentView,
  StudentListItem,
  StudentPaymentView,
} from "@/lib/dashboard/types";

type QueryResult<T> = {
  availability: DataAvailability;
  message: string;
  data: T;
};

function setupResult<T>(data: T): QueryResult<T> {
  return {
    availability: "setup_required",
    message: "قاعدة البيانات غير جاهزة بعد.",
    data,
  };
}

function unavailableResult<T>(data: T, detail?: string): QueryResult<T> {
  return {
    availability: "unavailable",
    message: detail ?? "تعذر قراءة البيانات المحمية.",
    data,
  };
}

async function getAuthedClient() {
  if (!getAuthReadiness().dbSchemaReady) return null;
  return createClient();
}

function resolveProductTarget(product: {
  product_type?: string;
  course_id?: string | null;
  semester_id?: string | null;
  courses?: { title?: string } | { title?: string }[] | null;
  course_semesters?: {
    title?: string;
    courses?: { title?: string } | { title?: string }[] | null;
  } | {
    title?: string;
    courses?: { title?: string } | { title?: string }[] | null;
  }[] | null;
}) {
  const productType = product.product_type ?? "unknown";
  if (productType === "full_course") {
    const course = Array.isArray(product.courses) ? product.courses[0] : product.courses;
    return { productType, targetTitle: course?.title ?? "كورس غير معروف" };
  }
  const semester = Array.isArray(product.course_semesters) ? product.course_semesters[0] : product.course_semesters;
  const course = semester ? (Array.isArray(semester.courses) ? semester.courses[0] : semester.courses) : null;
  const semesterTitle = semester?.title ?? "ترم";
  const courseTitle = course?.title ?? "";
  return {
    productType,
    targetTitle: courseTitle ? `${semesterTitle} — ${courseTitle}` : semesterTitle,
  };
}

export async function listStudents(options?: {
  query?: string;
}): Promise<QueryResult<StudentListItem[]>> {
  const supabase = await getAuthedClient();
  if (!supabase) return setupResult([]);

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone_number, is_active, created_at")
    .eq("role", "student")
    .order("created_at", { ascending: false });

  if (error) return unavailableResult([]);

  const studentIds = (data ?? []).map((r) => r.id);

  const enrollmentCounts = new Map<string, number>();
  const paymentCounts = new Map<string, number>();

  if (studentIds.length > 0) {
    const [enrollments, payments] = await Promise.all([
      supabase
        .from("enrollments")
        .select("id, student_id, status")
        .in("student_id", studentIds)
        .eq("status", "active"),
      supabase
        .from("payment_requests")
        .select("id, student_id, status")
        .in("student_id", studentIds)
        .eq("status", "pending"),
    ]);

    for (const row of enrollments.data ?? []) {
      enrollmentCounts.set(row.student_id, (enrollmentCounts.get(row.student_id) ?? 0) + 1);
    }
    for (const row of payments.data ?? []) {
      paymentCounts.set(row.student_id, (paymentCounts.get(row.student_id) ?? 0) + 1);
    }
  }

  const query = options?.query?.trim().toLowerCase() ?? "";
  const mapped: StudentListItem[] = (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name ?? "",
    phoneNumber: row.phone_number,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    activeEnrollmentsCount: enrollmentCounts.get(row.id) ?? 0,
    pendingPaymentsCount: paymentCounts.get(row.id) ?? 0,
  }));

  const filtered = query
    ? mapped.filter(
        (s) =>
          s.fullName.toLowerCase().includes(query) ||
          (s.phoneNumber ?? "").includes(query),
      )
    : mapped;

  return {
    availability: filtered.length === 0 ? "empty" : "ready",
    message: filtered.length === 0 ? "لا يوجد طلاب مطابقون." : "تم جلب قائمة الطلاب.",
    data: filtered,
  };
}

export async function getStudentDetail(
  studentId: string,
): Promise<QueryResult<StudentDetailView | null>> {
  const supabase = await getAuthedClient();
  if (!supabase) return setupResult(null);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, phone_number, is_active, created_at, role")
    .eq("id", studentId)
    .eq("role", "student")
    .maybeSingle();

  if (profileError) return unavailableResult(null);
  if (!profile) return { availability: "empty", message: "لم يُعثر على هذا الطالب.", data: null };

  const [enrollmentsResult, paymentsResult] = await Promise.all([
    supabase
      .from("enrollments")
      .select(
        "id, status, starts_at, expires_at, created_at, products(product_type, course_id, semester_id, courses(title), course_semesters(title, courses(title)))",
      )
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("payment_requests")
      .select(
        "id, payment_method, amount_egp, status, rejection_reason, created_at, products(product_type, course_id, semester_id, courses(title), course_semesters(title, courses(title)))",
      )
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
  ]);

  if (enrollmentsResult.error || paymentsResult.error) return unavailableResult(null);

  const enrollments: StudentEnrollmentView[] = (enrollmentsResult.data ?? []).map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const resolved = product ? resolveProductTarget(product) : { productType: "unknown", targetTitle: "غير معروف" };
    return {
      id: row.id,
      productType: resolved.productType,
      targetTitle: resolved.targetTitle,
      status: row.status,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  });

  const paymentRequests: StudentPaymentView[] = (paymentsResult.data ?? []).map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const resolved = product ? resolveProductTarget(product) : { productType: "unknown", targetTitle: "غير معروف" };
    return {
      id: row.id,
      productType: resolved.productType,
      targetTitle: resolved.targetTitle,
      paymentMethod: row.payment_method,
      amountEgp: row.amount_egp,
      status: row.status,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
    };
  });

  return {
    availability: "ready",
    message: "تم جلب تفاصيل الطالب.",
    data: {
      id: profile.id,
      fullName: profile.full_name ?? "",
      phoneNumber: profile.phone_number,
      isActive: Boolean(profile.is_active),
      createdAt: profile.created_at,
      enrollments,
      paymentRequests,
    },
  };
}

export async function listPaymentRequests(options?: {
  status?: "pending" | "approved" | "rejected" | "all";
}): Promise<QueryResult<PaymentRequestItem[]>> {
  const supabase = await getAuthedClient();
  if (!supabase) return setupResult([]);

  let request = supabase
    .from("payment_requests")
    .select(
      "id, student_id, product_id, payment_method, amount_egp, sender_phone, receipt_path, status, rejection_reason, reviewed_at, created_at, products(product_type, course_id, semester_id, courses(title), course_semesters(title, courses(title)))",
    )
    .order("created_at", { ascending: false });

  if (options?.status && options.status !== "all") {
    request = request.eq("status", options.status);
  }

  const { data, error } = await request;
  if (error) {
    console.error("[list-payment-requests]", { code: error.code, message: error.message?.slice(0, 200) });
    return unavailableResult([]);
  }

  const studentIds = [...new Set((data ?? []).map((r) => r.student_id))];
  const studentMap = new Map<string, { full_name: string | null; phone_number: string | null }>();
  if (studentIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, phone_number")
      .in("id", studentIds);
    for (const p of profiles ?? []) {
      studentMap.set(p.id, { full_name: p.full_name, phone_number: p.phone_number });
    }
  }

  const mapped: PaymentRequestItem[] = (data ?? []).map((row) => {
    const studentProfile = studentMap.get(row.student_id);
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const resolved = product ? resolveProductTarget(product) : { productType: "unknown", targetTitle: "غير معروف" };

    return {
      id: row.id,
      studentId: row.student_id,
      studentName: studentProfile?.full_name ?? "",
      studentPhone: studentProfile?.phone_number ?? null,
      productId: row.product_id,
      productType: resolved.productType,
      targetTitle: resolved.targetTitle,
      paymentMethod: row.payment_method,
      amountEgp: row.amount_egp,
      senderPhone: row.sender_phone,
      receiptPath: row.receipt_path,
      status: row.status,
      rejectionReason: row.rejection_reason,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
    };
  });

  return {
    availability: mapped.length === 0 ? "empty" : "ready",
    message: mapped.length === 0 ? "لا توجد طلبات دفع." : "تم جلب طلبات الدفع.",
    data: mapped,
  };
}

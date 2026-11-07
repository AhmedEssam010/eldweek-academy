-- =============================================================================
-- 20261101220012_column_privileges_and_grants.sql
-- تقييد صلاحيات الأعمدة الحساسة وتقوية المنح الافتراضية
-- =============================================================================

-- إخفاء video_asset_id عن SELECT المباشر لدور authenticated قدر الإمكان.
-- المدرّسون يحتاجون تعديله عبر UPDATE؛ الطلاب يحصلون عليه عبر get_lesson_playback_grant.

REVOKE ALL ON TABLE public.lessons FROM PUBLIC;
REVOKE ALL ON TABLE public.lessons FROM anon;
REVOKE ALL ON TABLE public.lessons FROM authenticated;

GRANT SELECT (
  id,
  semester_id,
  title,
  description,
  duration_seconds,
  sort_order,
  is_published,
  created_at,
  updated_at
) ON public.lessons TO authenticated;

GRANT INSERT (
  id,
  semester_id,
  title,
  description,
  video_asset_id,
  duration_seconds,
  sort_order,
  is_published
) ON public.lessons TO authenticated;

GRANT UPDATE (
  title,
  description,
  video_asset_id,
  duration_seconds,
  sort_order,
  is_published
) ON public.lessons TO authenticated;

GRANT DELETE ON public.lessons TO authenticated;

GRANT ALL ON TABLE public.lessons TO postgres, service_role;

-- إيصالات الدفع: المسار فقط؛ محتوى الملف في Storage خاص لاحقًا
REVOKE ALL ON TABLE public.payment_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.payment_requests FROM anon;

GRANT SELECT (
  id,
  student_id,
  product_id,
  payment_method,
  amount_egp,
  sender_phone,
  receipt_path,
  status,
  rejection_reason,
  reviewed_by,
  reviewed_at,
  created_at
) ON public.payment_requests TO authenticated;

GRANT INSERT (
  id,
  student_id,
  product_id,
  payment_method,
  amount_egp,
  sender_phone,
  receipt_path,
  status
) ON public.payment_requests TO authenticated;

-- لا UPDATE/DELETE مباشر لـ authenticated؛ المراجعة عبر الدوال فقط
GRANT ALL ON TABLE public.payment_requests TO postgres, service_role;

REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.audit_logs FROM anon;
REVOKE ALL ON TABLE public.audit_logs FROM authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO postgres, service_role;

REVOKE ALL ON TABLE public.enrollments FROM PUBLIC;
REVOKE ALL ON TABLE public.enrollments FROM anon;
GRANT SELECT ON TABLE public.enrollments TO authenticated;
GRANT ALL ON TABLE public.enrollments TO postgres, service_role;

-- جداول الإدارة العامة
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO postgres, service_role;

GRANT SELECT ON TABLE public.courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.courses TO authenticated;
GRANT ALL ON TABLE public.courses TO postgres, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_staff_assignments TO authenticated;
GRANT ALL ON TABLE public.course_staff_assignments TO postgres, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_semesters TO authenticated;
GRANT SELECT ON TABLE public.course_semesters TO anon;
GRANT ALL ON TABLE public.course_semesters TO postgres, service_role;

GRANT SELECT ON TABLE public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO postgres, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.lesson_progress TO authenticated;
GRANT ALL ON TABLE public.lesson_progress TO postgres, service_role;

-- كتالوج عام آمن (security_invoker=false + تصفية published داخل العرض)
GRANT SELECT ON TABLE public.lessons_catalog TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.lessons_catalog FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.lessons_catalog FROM anon, authenticated;

-- تأكيد سحب الكتابة المباشرة على الدفع/التسجيل من authenticated
REVOKE UPDATE, DELETE ON TABLE public.payment_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.enrollments FROM authenticated;

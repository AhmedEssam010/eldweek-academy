-- =============================================================================
-- 20261101220001_extensions_and_enums.sql
-- تهيئة الامتدادات والتعدادات الأساسية لمنصة المهندس أحمد الدويك
-- لا تُطبَّق تلقائيًا على قاعدة الإنتاج في هذه المرحلة.
-- =============================================================================

-- gen_random_uuid() متوفر في PostgreSQL الحديث على Supabase دون امتداد إضافي.

-- أدوار المنصة (ليست سوقًا متعدد المستأجرين)
DO $$
BEGIN
  CREATE TYPE public.user_role AS ENUM ('super_admin', 'teacher', 'student');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.course_status AS ENUM (
    'draft',
    'pending_review',
    'published',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.product_type AS ENUM ('full_course', 'semester');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.payment_method AS ENUM ('instapay', 'vodafone_cash');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.enrollment_status AS ENUM ('active', 'expired', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.audit_action AS ENUM (
    'payment_approved',
    'payment_rejected',
    'enrollment_activated',
    'enrollment_suspended',
    'role_changed',
    'teacher_assignment_changed',
    'course_published',
    'course_archived',
    'course_draft_created',
    'super_admin_provisioned'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 20261101220003_profiles.sql
-- ملفات المستخدمين، حماية الأدوار، قيد super_admin الواحد، وتطبيع الهاتف
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  -- رقم الهاتف بصيغة E.164 بعد التطبيع (مثال مصر: +2010xxxxxxxx)
  phone_number text,
  phone_verified_at timestamptz,
  role public.user_role NOT NULL DEFAULT 'student',
  -- صلاحية إعداد مسودات كورسات (يمنحها المالك فقط؛ المدرّس لا يمنحها لنفسه)
  can_create_course_drafts boolean NOT NULL DEFAULT false,
  avatar_path text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT profiles_phone_e164_chk CHECK (
    phone_number IS NULL
    OR phone_number ~ '^\+[1-9][0-9]{7,14}$'
  ),
  CONSTRAINT profiles_student_no_draft_permission_chk CHECK (
    role <> 'student' OR can_create_course_drafts = false
  ),
  CONSTRAINT profiles_super_admin_active_chk CHECK (
    role <> 'super_admin' OR is_active = true
  )
);

COMMENT ON COLUMN public.profiles.phone_number IS
  'E.164 فقط. لا يُعتبر مملوكًا للمستخدم حتى تُعبَّأ phone_verified_at.';
COMMENT ON COLUMN public.profiles.can_create_course_drafts IS
  'يضبطه super_admin فقط. المدرّس لا يستطيع منح هذه الصلاحية لنفسه.';

-- رقم هاتف فريد عند وجود قيمة (يسمح بعدة NULL)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_number_unique_idx
  ON public.profiles (phone_number)
  WHERE phone_number IS NOT NULL;

-- مالك واحد فقط للمنصة
CREATE UNIQUE INDEX IF NOT EXISTS profiles_one_super_admin_idx
  ON public.profiles ((true))
  WHERE role = 'super_admin';

CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);
CREATE INDEX IF NOT EXISTS profiles_is_active_idx ON public.profiles (is_active);

DROP TRIGGER IF EXISTS trg_profiles_set_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- دوال أمان للقراءة عبر SECURITY DEFINER بدون تكرار RLS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.role
  FROM public.profiles AS p
  WHERE p.id = (SELECT auth.uid())
    AND p.is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'super_admin'
      AND p.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_teacher()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'teacher'
      AND p.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_student()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'student'
      AND p.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_create_course_drafts()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = true
      AND (
        p.role = 'super_admin'
        OR (p.role = 'teacher' AND p.can_create_course_drafts = true)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_teacher() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_student() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_create_course_drafts() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_teacher() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_student() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_course_drafts() TO authenticated;

GRANT EXECUTE ON FUNCTION public.current_profile_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_active_teacher() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_active_student() TO service_role;
GRANT EXECUTE ON FUNCTION public.can_create_course_drafts() TO service_role;

-- ---------------------------------------------------------------------------
-- إنشاء ملف طالب تلقائيًا عند التسجيل العام — الدور دائمًا student
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  requested_name text;
BEGIN
  requested_name := nullif(trim(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), '');

  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    can_create_course_drafts,
    is_active
  )
  VALUES (
    NEW.id,
    COALESCE(requested_name, ''),
    'student',
    false,
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- حماية الحقول الحساسة من التعديل المباشر (دفاع متعدد الطبقات مع RLS)
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER: حتى لا يصبح current_user دائمًا مالك الدالة ويُفرَّغ الحماية.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_is_super_admin boolean;
  jwt_role text;
  privileged_db_context boolean;
BEGIN
  jwt_role := COALESCE(auth.jwt() ->> 'role', '');
  actor_is_super_admin := public.is_super_admin();
  -- يتحقق عندما تُستدعى الكتابة من RPC من نوع SECURITY DEFINER مملوك لدور متميز
  privileged_db_context := (
    current_user IN ('postgres', 'supabase_admin')
    AND current_user IS DISTINCT FROM session_user
  );

  -- service_role أو سياق DEFINER للتزويد الإداري الآمن من الخادم فقط
  IF jwt_role = 'service_role' OR privileged_db_context THEN
    RETURN NEW;
  END IF;

  -- أي تغيير لرقم الهاتف يلغي التحقق السابق (منع تزوير التحقق)
  IF NEW.phone_number IS DISTINCT FROM OLD.phone_number THEN
    NEW.phone_verified_at := NULL;
  END IF;

  -- تعيين/تزوير phone_verified_at إلى قيمة غير NULL هو امتياز فقط.
  -- مسح التحقق عند تغيير الرقم مسموح للمستخدم.
  IF OLD.role IS DISTINCT FROM NEW.role
     OR OLD.is_active IS DISTINCT FROM NEW.is_active
     OR OLD.can_create_course_drafts IS DISTINCT FROM NEW.can_create_course_drafts
     OR (
       NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at
       AND NEW.phone_verified_at IS NOT NULL
     )
  THEN
    IF NOT actor_is_super_admin THEN
      RAISE EXCEPTION 'profile_privileged_columns_forbidden'
        USING ERRCODE = '42501',
              HINT = 'Role, active status, draft permission, and phone verification can only be changed by super_admin or service_role workflows.';
    END IF;
  END IF;

  -- منع إزالة آخر/الوحيد super_admin عبر demotion
  IF OLD.role = 'super_admin' AND NEW.role IS DISTINCT FROM 'super_admin' THEN
    IF (
      SELECT count(*)::integer
      FROM public.profiles AS p
      WHERE p.role = 'super_admin'
        AND p.id <> OLD.id
    ) = 0 THEN
      RAISE EXCEPTION 'cannot_remove_sole_super_admin'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_privileged_columns() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privileged_columns();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

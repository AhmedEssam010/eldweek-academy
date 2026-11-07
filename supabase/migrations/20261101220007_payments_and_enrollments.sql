-- =============================================================================
-- 20261101220007_payments_and_enrollments.sql
-- طلبات الدفع والتسجيلات — بدون ثقة بمبلغ العميل؛ التسجيل ليس ذاتيًا
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  payment_method public.payment_method NOT NULL,
  -- يُفرَض من سعر المنتج عبر trigger/workflow وليس من العميل
  amount_egp numeric(12, 2) NOT NULL,
  sender_phone text NOT NULL,
  receipt_path text NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT payment_requests_amount_nonnegative_chk CHECK (amount_egp >= 0),
  CONSTRAINT payment_requests_sender_phone_chk CHECK (
    sender_phone ~ '^\+[1-9][0-9]{7,14}$'
  ),
  CONSTRAINT payment_requests_receipt_path_not_blank_chk CHECK (
    length(trim(receipt_path)) > 0
  ),
  CONSTRAINT payment_requests_rejection_reason_chk CHECK (
    (status = 'rejected' AND rejection_reason IS NOT NULL AND length(trim(rejection_reason)) > 0)
    OR (status <> 'rejected' AND rejection_reason IS NULL)
  ),
  CONSTRAINT payment_requests_reviewed_fields_chk CHECK (
    (
      status = 'pending'
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
    )
    OR (
      status IN ('approved', 'rejected')
      AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS payment_requests_student_idx
  ON public.payment_requests (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_requests_status_idx
  ON public.payment_requests (status);
CREATE INDEX IF NOT EXISTS payment_requests_product_idx
  ON public.payment_requests (product_id);

-- طلب pending واحد لكل طالب/منتج
CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_one_pending_per_product_idx
  ON public.payment_requests (student_id, product_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  payment_request_id uuid REFERENCES public.payment_requests (id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  expires_at timestamptz,
  status public.enrollment_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT enrollments_expiry_after_start_chk CHECK (
    expires_at IS NULL OR expires_at > starts_at
  )
);

CREATE INDEX IF NOT EXISTS enrollments_student_idx
  ON public.enrollments (student_id);
CREATE INDEX IF NOT EXISTS enrollments_product_idx
  ON public.enrollments (product_id);
CREATE INDEX IF NOT EXISTS enrollments_status_idx
  ON public.enrollments (status);

-- منع تكرار استحقاق نشط لنفس المنتج
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_one_active_per_product_idx
  ON public.enrollments (student_id, product_id)
  WHERE status = 'active';

-- فرض مبلغ الدفع من المنتج عند الإدخال
CREATE OR REPLACE FUNCTION public.force_payment_amount_from_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  trusted_price numeric(12, 2);
  product_is_active boolean;
BEGIN
  SELECT p.price_egp, p.is_active
  INTO trusted_price, product_is_active
  FROM public.products AS p
  WHERE p.id = NEW.product_id
  FOR SHARE;

  IF trusted_price IS NULL THEN
    RAISE EXCEPTION 'payment_product_not_found' USING ERRCODE = '23503';
  END IF;

  IF COALESCE(product_is_active, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'payment_product_inactive' USING ERRCODE = '23514';
  END IF;

  NEW.amount_egp := trusted_price;
  NEW.status := 'pending';
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.rejection_reason := NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.force_payment_amount_from_product() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_force_payment_amount_from_product ON public.payment_requests;
CREATE TRIGGER trg_force_payment_amount_from_product
  BEFORE INSERT ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.force_payment_amount_from_product();

-- منع التعديل المباشر بعد الإنشاء.
-- SECURITY INVOKER مهم: داخل RPC من نوع SECURITY DEFINER يصبح current_user هو مالك الدالة.
CREATE OR REPLACE FUNCTION public.protect_payment_request_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  jwt_role text;
BEGIN
  jwt_role := COALESCE(auth.jwt() ->> 'role', '');

  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- يسمح فقط عندما تنفَّذ الكتابة من دالة SECURITY DEFINER مملوكة لدور متميز
  IF current_user IN ('postgres', 'supabase_admin')
     AND current_user IS DISTINCT FROM session_user
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'payment_requests_are_immutable_after_create'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.protect_payment_request_immutability() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_protect_payment_request_immutability ON public.payment_requests;
CREATE TRIGGER trg_protect_payment_request_immutability
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_payment_request_immutability();

-- دوال التحقق من صلاحية الوصول للمحتوى
CREATE OR REPLACE FUNCTION public.student_has_active_enrollment_for_course(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments AS e
    INNER JOIN public.products AS p ON p.id = e.product_id
    WHERE e.student_id = (SELECT auth.uid())
      AND e.status = 'active'
      AND (e.expires_at IS NULL OR e.expires_at > timezone('utc', now()))
      AND (
        (p.product_type = 'full_course' AND p.course_id = p_course_id)
        OR (
          p.product_type = 'semester'
          AND EXISTS (
            SELECT 1
            FROM public.course_semesters AS s
            WHERE s.id = p.semester_id
              AND s.course_id = p_course_id
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.student_has_active_enrollment_for_semester(p_semester_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments AS e
    INNER JOIN public.products AS p ON p.id = e.product_id
    WHERE e.student_id = (SELECT auth.uid())
      AND e.status = 'active'
      AND (e.expires_at IS NULL OR e.expires_at > timezone('utc', now()))
      AND (
        (p.product_type = 'semester' AND p.semester_id = p_semester_id)
        OR (
          p.product_type = 'full_course'
          AND EXISTS (
            SELECT 1
            FROM public.course_semesters AS s
            WHERE s.id = p_semester_id
              AND s.course_id = p.course_id
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.student_has_active_enrollment_for_lesson(p_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lessons AS l
    INNER JOIN public.course_semesters AS s ON s.id = l.semester_id
    WHERE l.id = p_lesson_id
      AND public.student_has_active_enrollment_for_semester(s.id)
  );
$$;

REVOKE ALL ON FUNCTION public.student_has_active_enrollment_for_course(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_has_active_enrollment_for_semester(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_has_active_enrollment_for_lesson(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.student_has_active_enrollment_for_course(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.student_has_active_enrollment_for_semester(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.student_has_active_enrollment_for_lesson(uuid)
  TO authenticated, service_role;

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments FORCE ROW LEVEL SECURITY;

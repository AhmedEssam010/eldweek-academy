-- =============================================================================
-- 20261101220011_secure_workflows.sql
-- سير عمل آمن: مسودات الكورسات، النشر، تعيين المدرسين، مراجعة الدفع، التشغيل
-- الدوال الحساسة SECURITY DEFINER مع search_path ثابت وتحقق صلاحيات صارم
-- =============================================================================

-- ---------------------------------------------------------------------------
-- تعيين أولي لمنشئ المسودة (لا يُستنتج الوصول لاحقًا من created_by وحده)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_creator_staff_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  creator_role public.user_role;
BEGIN
  SELECT p.role INTO creator_role
  FROM public.profiles AS p
  WHERE p.id = NEW.created_by;

  IF creator_role = 'teacher' THEN
    INSERT INTO public.course_staff_assignments (
      course_id,
      teacher_id,
      can_edit_content,
      can_manage_exams,
      can_view_student_progress
    )
    VALUES (
      NEW.id,
      NEW.created_by,
      true,
      false,
      false
    )
    ON CONFLICT (course_id, teacher_id) DO NOTHING;

    PERFORM public.write_audit_log(
      NEW.created_by,
      'course_draft_created',
      'course',
      NEW.id,
      jsonb_build_object('via', 'creator_assignment_trigger')
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_creator_staff_assignment() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_ensure_creator_staff_assignment ON public.courses;
CREATE TRIGGER trg_ensure_creator_staff_assignment
  AFTER INSERT ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_creator_staff_assignment();

-- ---------------------------------------------------------------------------
-- إنشاء مسودة كورس عبر دالة موحّدة (موصى بها للتطبيق)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_course_draft(
  p_title text,
  p_slug text,
  p_description text DEFAULT '',
  p_thumbnail_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_course_id uuid;
BEGIN
  IF NOT public.can_create_course_drafts() THEN
    RAISE EXCEPTION 'not_allowed_to_create_course_draft'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.courses (
    title,
    slug,
    description,
    thumbnail_path,
    created_by,
    status
  )
  VALUES (
    trim(p_title),
    lower(trim(p_slug)),
    COALESCE(p_description, ''),
    p_thumbnail_path,
    (SELECT auth.uid()),
    'draft'
  )
  RETURNING id INTO new_course_id;

  RETURN new_course_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_course_draft(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_course_draft(text, text, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- نشر / أرشفة — super_admin فقط
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_course(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only_super_admin_can_publish'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.courses
  SET status = 'published'
  WHERE id = p_course_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'course_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.write_audit_log(
    (SELECT auth.uid()),
    'course_published',
    'course',
    p_course_id,
    '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_course(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only_super_admin_can_archive'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.courses
  SET status = 'archived'
  WHERE id = p_course_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'course_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.write_audit_log(
    (SELECT auth.uid()),
    'course_archived',
    'course',
    p_course_id,
    '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_course(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_course(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_course(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_course(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- تعيين مدرّس وصلاحياته — super_admin فقط
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_course_staff_assignment(
  p_course_id uuid,
  p_teacher_id uuid,
  p_can_edit_content boolean,
  p_can_manage_exams boolean,
  p_can_view_student_progress boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  assignment_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only_super_admin_can_manage_staff_assignments'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.course_staff_assignments (
    course_id,
    teacher_id,
    can_edit_content,
    can_manage_exams,
    can_view_student_progress
  )
  VALUES (
    p_course_id,
    p_teacher_id,
    COALESCE(p_can_edit_content, false),
    COALESCE(p_can_manage_exams, false),
    COALESCE(p_can_view_student_progress, false)
  )
  ON CONFLICT (course_id, teacher_id) DO UPDATE
    SET can_edit_content = EXCLUDED.can_edit_content,
        can_manage_exams = EXCLUDED.can_manage_exams,
        can_view_student_progress = EXCLUDED.can_view_student_progress
  RETURNING id INTO assignment_id;

  PERFORM public.write_audit_log(
    (SELECT auth.uid()),
    'teacher_assignment_changed',
    'course_staff_assignment',
    assignment_id,
    jsonb_build_object(
      'course_id', p_course_id,
      'teacher_id', p_teacher_id,
      'can_edit_content', p_can_edit_content,
      'can_manage_exams', p_can_manage_exams,
      'can_view_student_progress', p_can_view_student_progress
    )
  );

  RETURN assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_course_staff_assignment(
  p_course_id uuid,
  p_teacher_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  assignment_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only_super_admin_can_manage_staff_assignments'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.course_staff_assignments AS a
  WHERE a.course_id = p_course_id
    AND a.teacher_id = p_teacher_id
  RETURNING a.id INTO assignment_id;

  IF assignment_id IS NOT NULL THEN
    PERFORM public.write_audit_log(
      (SELECT auth.uid()),
      'teacher_assignment_changed',
      'course_staff_assignment',
      assignment_id,
      jsonb_build_object(
        'course_id', p_course_id,
        'teacher_id', p_teacher_id,
        'revoked', true
      )
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_course_staff_assignment(uuid, uuid, boolean, boolean, boolean)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_course_staff_assignment(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_course_staff_assignment(uuid, uuid, boolean, boolean, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_course_staff_assignment(uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- تغيير الدور — لا يمكن عبر UPDATE المباشر من المدرس/الطالب
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_user_id uuid,
  p_role public.user_role,
  p_is_active boolean DEFAULT true,
  p_can_create_course_drafts boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  old_role public.user_role;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only_super_admin_can_change_roles'
      USING ERRCODE = '42501';
  END IF;

  IF p_role = 'super_admin' THEN
    RAISE EXCEPTION 'super_admin_role_requires_provisioning_workflow'
      USING ERRCODE = '42501',
            HINT = 'Use the dedicated secure provisioning path; do not promote via this function.';
  END IF;

  IF p_role = 'student' THEN
    p_can_create_course_drafts := false;
  END IF;

  SELECT role INTO old_role FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF old_role IS NULL THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF old_role = 'super_admin' THEN
    RAISE EXCEPTION 'cannot_change_super_admin_via_this_function'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET role = p_role,
      is_active = COALESCE(p_is_active, true),
      can_create_course_drafts = COALESCE(p_can_create_course_drafts, false)
  WHERE id = p_user_id;

  PERFORM public.write_audit_log(
    (SELECT auth.uid()),
    'role_changed',
    'profile',
    p_user_id,
    jsonb_build_object(
      'from', old_role,
      'to', p_role,
      'is_active', p_is_active,
      'can_create_course_drafts', p_can_create_course_drafts
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, public.user_role, boolean, boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, public.user_role, boolean, boolean)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- مراجعة الدفع (موافقة) — معاملاتية وآمنة ضد التكرار
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_payment_request(
  p_payment_request_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  pr public.payment_requests%ROWTYPE;
  trusted_price numeric(12, 2);
  product_active boolean;
  enrollment_id uuid;
  actor uuid := (SELECT auth.uid());
  jwt_role text := COALESCE(auth.jwt() ->> 'role', '');
BEGIN
  IF jwt_role <> 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only_super_admin_can_approve_payments'
      USING ERRCODE = '42501';
  END IF;

  IF actor IS NULL THEN
    SELECT p.id INTO actor
    FROM public.profiles AS p
    WHERE p.role = 'super_admin'
    LIMIT 1;
  END IF;

  IF actor IS NULL THEN
    RAISE EXCEPTION 'reviewer_identity_required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO pr
  FROM public.payment_requests
  WHERE id = p_payment_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: إن كانت موافق عليها مسبقًا أعد التسجيل المرتبط إن وُجد
  IF pr.status = 'approved' THEN
    SELECT e.id INTO enrollment_id
    FROM public.enrollments AS e
    WHERE e.payment_request_id = pr.id
    ORDER BY e.created_at DESC
    LIMIT 1;

    IF enrollment_id IS NOT NULL THEN
      RETURN enrollment_id;
    END IF;
  END IF;

  IF pr.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'payment_request_not_pending'
      USING ERRCODE = '23514';
  END IF;

  SELECT p.price_egp, p.is_active
  INTO trusted_price, product_active
  FROM public.products AS p
  WHERE p.id = pr.product_id
  FOR SHARE;

  IF trusted_price IS NULL OR product_active IS NOT TRUE THEN
    RAISE EXCEPTION 'payment_product_unavailable' USING ERRCODE = '23514';
  END IF;

  IF pr.amount_egp <> trusted_price THEN
    RAISE EXCEPTION 'payment_amount_mismatch_with_product_price'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.payment_requests
  SET status = 'approved',
      reviewed_by = actor,
      reviewed_at = timezone('utc', now()),
      rejection_reason = NULL
  WHERE id = pr.id;

  SELECT e.id INTO enrollment_id
  FROM public.enrollments AS e
  WHERE e.student_id = pr.student_id
    AND e.product_id = pr.product_id
    AND e.status = 'active'
  FOR UPDATE;

  IF enrollment_id IS NOT NULL THEN
    UPDATE public.enrollments
    SET expires_at = CASE
          WHEN p_expires_at IS NULL THEN expires_at
          WHEN expires_at IS NULL THEN p_expires_at
          WHEN p_expires_at > expires_at THEN p_expires_at
          ELSE expires_at
        END,
        payment_request_id = pr.id
    WHERE id = enrollment_id;
  ELSE
    INSERT INTO public.enrollments (
      student_id,
      product_id,
      payment_request_id,
      starts_at,
      expires_at,
      status
    )
    VALUES (
      pr.student_id,
      pr.product_id,
      pr.id,
      timezone('utc', now()),
      p_expires_at,
      'active'
    )
    RETURNING id INTO enrollment_id;
  END IF;

  PERFORM public.write_audit_log(
    actor,
    'payment_approved',
    'payment_request',
    pr.id,
    jsonb_build_object(
      'enrollment_id', enrollment_id,
      'product_id', pr.product_id,
      'student_id', pr.student_id,
      'amount_egp', pr.amount_egp
    )
  );

  PERFORM public.write_audit_log(
    actor,
    'enrollment_activated',
    'enrollment',
    enrollment_id,
    jsonb_build_object(
      'payment_request_id', pr.id,
      'product_id', pr.product_id,
      'student_id', pr.student_id
    )
  );

  RETURN enrollment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_payment_request(
  p_payment_request_id uuid,
  p_rejection_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  pr public.payment_requests%ROWTYPE;
  actor uuid := (SELECT auth.uid());
  jwt_role text := COALESCE(auth.jwt() ->> 'role', '');
BEGIN
  IF jwt_role <> 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only_super_admin_can_reject_payments'
      USING ERRCODE = '42501';
  END IF;

  IF actor IS NULL THEN
    SELECT p.id INTO actor
    FROM public.profiles AS p
    WHERE p.role = 'super_admin'
    LIMIT 1;
  END IF;

  IF actor IS NULL THEN
    RAISE EXCEPTION 'reviewer_identity_required'
      USING ERRCODE = '42501';
  END IF;

  IF p_rejection_reason IS NULL OR length(trim(p_rejection_reason)) = 0 THEN
    RAISE EXCEPTION 'rejection_reason_required' USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO pr
  FROM public.payment_requests
  WHERE id = p_payment_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF pr.status = 'rejected' THEN
    RETURN; -- idempotent
  END IF;

  IF pr.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'payment_request_not_pending' USING ERRCODE = '23514';
  END IF;

  UPDATE public.payment_requests
  SET status = 'rejected',
      rejection_reason = trim(p_rejection_reason),
      reviewed_by = actor,
      reviewed_at = timezone('utc', now())
  WHERE id = pr.id;

  PERFORM public.write_audit_log(
    actor,
    'payment_rejected',
    'payment_request',
    pr.id,
    jsonb_build_object(
      'student_id', pr.student_id,
      'product_id', pr.product_id,
      'reason', trim(p_rejection_reason)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.suspend_enrollment(
  p_enrollment_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only_super_admin_can_suspend_enrollment'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.enrollments
  SET status = 'suspended'
  WHERE id = p_enrollment_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_enrollment_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.write_audit_log(
    (SELECT auth.uid()),
    'enrollment_suspended',
    'enrollment',
    p_enrollment_id,
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_payment_request(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_payment_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.suspend_enrollment(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.approve_payment_request(uuid, timestamptz)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_payment_request(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.suspend_enrollment(uuid, text)
  TO authenticated, service_role;

-- السماح لدوال السيرفر بكتابة التدقيق أثناء التنفيذ كـ definer
GRANT EXECUTE ON FUNCTION public.write_audit_log(uuid, public.audit_action, text, uuid, jsonb)
  TO postgres;

-- ---------------------------------------------------------------------------
-- منح تشغيل درس: يعيد video_asset_id فقط للمستحقين (لا للقوائم العامة)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_lesson_playback_grant(p_lesson_id uuid)
RETURNS TABLE (
  lesson_id uuid,
  video_asset_id text,
  duration_seconds integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.is_super_admin()
     OR EXISTS (
       SELECT 1
       FROM public.lessons AS l
       INNER JOIN public.course_semesters AS s ON s.id = l.semester_id
       WHERE l.id = p_lesson_id
         AND public.teacher_has_course_permission(s.course_id, false, false, false)
     )
     OR (
       public.student_has_active_enrollment_for_lesson(p_lesson_id)
       AND EXISTS (
         SELECT 1 FROM public.lessons AS l
         WHERE l.id = p_lesson_id AND l.is_published = true
       )
     )
  THEN
    RETURN QUERY
    SELECT l.id, l.video_asset_id, l.duration_seconds
    FROM public.lessons AS l
    WHERE l.id = p_lesson_id;
  ELSE
    RAISE EXCEPTION 'lesson_playback_forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_lesson_playback_grant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lesson_playback_grant(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- تزويد المالك (super_admin) — service_role فقط، خارج التسجيل العام
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_super_admin(
  p_user_id uuid,
  p_full_name text,
  p_phone_number text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  jwt_role text := COALESCE(auth.jwt() ->> 'role', '');
  existing_super uuid;
BEGIN
  IF jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'provision_super_admin_requires_service_role'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO existing_super
  FROM public.profiles AS p
  WHERE p.role = 'super_admin'
  LIMIT 1;

  IF existing_super IS NOT NULL AND existing_super IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'super_admin_already_exists' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.profiles (
    id,
    full_name,
    phone_number,
    role,
    can_create_course_drafts,
    is_active
  )
  VALUES (
    p_user_id,
    COALESCE(nullif(trim(p_full_name), ''), 'المهندس أحمد الدويك'),
    p_phone_number,
    'super_admin',
    true,
    true
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        phone_number = COALESCE(EXCLUDED.phone_number, public.profiles.phone_number),
        role = 'super_admin',
        can_create_course_drafts = true,
        is_active = true;

  PERFORM public.write_audit_log(
    p_user_id,
    'super_admin_provisioned',
    'profile',
    p_user_id,
    jsonb_build_object('via', 'provision_super_admin')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_super_admin(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_super_admin(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_super_admin(uuid, text, text) TO service_role;

-- تثبيت الملكية لدور متميز حتى تعمل الكتابة مع FORCE RLS عبر SECURITY DEFINER
ALTER FUNCTION public.approve_payment_request(uuid, timestamptz) OWNER TO postgres;
ALTER FUNCTION public.reject_payment_request(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.suspend_enrollment(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.provision_super_admin(uuid, text, text) OWNER TO postgres;
ALTER FUNCTION public.admin_set_user_role(uuid, public.user_role, boolean, boolean) OWNER TO postgres;
ALTER FUNCTION public.upsert_course_staff_assignment(uuid, uuid, boolean, boolean, boolean) OWNER TO postgres;
ALTER FUNCTION public.revoke_course_staff_assignment(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.publish_course(uuid) OWNER TO postgres;
ALTER FUNCTION public.archive_course(uuid) OWNER TO postgres;
ALTER FUNCTION public.write_audit_log(uuid, public.audit_action, text, uuid, jsonb) OWNER TO postgres;
ALTER FUNCTION public.get_lesson_playback_grant(uuid) OWNER TO postgres;
ALTER FUNCTION public.create_course_draft(text, text, text, text) OWNER TO postgres;
ALTER VIEW public.lessons_catalog OWNER TO postgres;

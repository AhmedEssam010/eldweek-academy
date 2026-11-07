-- =============================================================================
-- security_suite.sql
-- اختبارات أمنية موثوقة لمنصة المهندس أحمد الدويك
--
-- المتطلبات:
--   - قاعدة LOCAL/disposable من نوع Supabase (أدوار anon/authenticated/service_role)
--   - تطبيق كل ملفات supabase/migrations أولاً
--   - تشغيل عبر psql كمالك/postgres قادر على SET ROLE
--
-- لا تشغّل ضد الإنتاج.
-- =============================================================================

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS tests;

-- ---------------------------------------------------------------------------
-- مساعدات الاختبار (SECURITY INVOKER حتى ترث الدور الحالي ولا تتجاوز RLS)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tests.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, tests
AS $$
BEGIN
  IF NOT COALESCE(p_condition, false) THEN
    RAISE EXCEPTION 'ASSERT_FAIL: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION tests.assert_current_db_role(p_expected_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, tests
AS $$
BEGIN
  IF current_user IS DISTINCT FROM p_expected_role THEN
    RAISE EXCEPTION 'ASSERT_FAIL: expected db role %, got %', p_expected_role, current_user;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_roles AS r
    WHERE r.rolname = current_user
      AND r.rolbypassrls = true
  ) THEN
    RAISE EXCEPTION
      'ASSERT_FAIL: role % has BYPASSRLS; negative authorization tests would be invalid',
      current_user;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION tests.assert_raises(p_sql text, p_message text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, tests
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'ASSERT_FAIL_EXPECTED_ERROR: % (db_role=%)', p_message, current_user;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'ASSERT_FAIL%' THEN
        RAISE;
      END IF;
      -- أي رفض صلاحية/قيود يُعد نجاحًا للاختبار السلبي
      NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION tests.set_jwt_claims(p_user_id uuid, p_jwt_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, tests
AS $$
DECLARE
  v_claims jsonb;
BEGIN
  v_claims := jsonb_build_object('role', p_jwt_role);
  IF p_user_id IS NOT NULL THEN
    v_claims := v_claims || jsonb_build_object('sub', p_user_id::text);
  END IF;

  PERFORM set_config('request.jwt.claims', v_claims::text, true);
  -- توافق إضافي مع بعض إعدادات auth.uid()
  IF p_user_id IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  END IF;
  PERFORM set_config('request.jwt.claim.role', p_jwt_role, true);
END;
$$;

CREATE OR REPLACE FUNCTION tests.become(p_db_role text, p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, tests
AS $$
BEGIN
  -- مهم: أمر SET ROLE داخل دالة يُلغى عند الخروج منها.
  -- set_config('role', ..., true) يبقى حتى نهاية المعاملة، وهذا مطلوب للاختبارات.
  IF p_db_role = 'anon' THEN
    PERFORM tests.set_jwt_claims(NULL, 'anon');
  ELSIF p_db_role = 'service_role' THEN
    PERFORM tests.set_jwt_claims(p_user_id, 'service_role');
  ELSE
    -- authenticated (طالب/مدرّس/مالك) يشتركون في دور DB واحد مع تمييز JWT
    PERFORM tests.set_jwt_claims(p_user_id, 'authenticated');
  END IF;

  PERFORM set_config('role', p_db_role, true);
  PERFORM tests.assert_current_db_role(p_db_role);
END;
$$;

CREATE OR REPLACE FUNCTION tests.become_owner()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, tests
AS $$
BEGIN
  -- إعادة current_user إلى هوية اتصال الاختبار (postgres/owner)
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION tests.ensure_role_membership()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, tests
AS $$
BEGIN
  -- ضروري ليتمكن مالك الاختبار من SET ROLE إلى أدوار Supabase
  BEGIN
    EXECUTE format('GRANT anon, authenticated, service_role TO %I', current_user);
  EXCEPTION
    WHEN insufficient_privilege OR undefined_object THEN
      RAISE EXCEPTION 'SETUP_FAIL: cannot grant anon/authenticated/service_role to %', current_user;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION tests.insert_auth_user(p_id uuid, p_email text, p_full_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, auth, extensions, tests
AS $$
DECLARE
  v_has_instance boolean;
  v_password text;
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'SETUP_FAIL: auth.users missing (need disposable Supabase DB)';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'auth'
      AND table_name = 'users'
      AND column_name = 'instance_id'
  ) INTO v_has_instance;

  BEGIN
    v_password := extensions.crypt('test-password', extensions.gen_salt('bf'));
  EXCEPTION
    WHEN undefined_function OR invalid_schema_name THEN
      BEGIN
        v_password := crypt('test-password', gen_salt('bf'));
      EXCEPTION
        WHEN undefined_function THEN
          v_password := repeat('x', 60);
      END;
  END;

  IF v_has_instance THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      p_id,
      'authenticated',
      'authenticated',
      p_email,
      v_password,
      timezone('utc', now()),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_full_name),
      timezone('utc', now()),
      timezone('utc', now()),
      '', '', '', ''
    )
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      p_id,
      'authenticated',
      'authenticated',
      p_email,
      v_password,
      timezone('utc', now()),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_full_name),
      timezone('utc', now()),
      timezone('utc', now())
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- السيناريو الرئيسي
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_admin_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  v_teacher_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
  v_student_id uuid := 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
  v_outsider_id uuid := 'dddddddd-dddd-dddd-dddd-ddddddddddd1';

  v_assigned_course_id uuid;
  v_unassigned_course_id uuid;
  v_semester_id uuid;
  v_unassigned_semester_id uuid;
  v_published_lesson_id uuid;
  v_draft_lesson_id uuid;
  v_product_id uuid;
  v_payment_id uuid;
  v_payment_id_2 uuid;
  v_enrollment_id uuid;
  v_enrollment_id_repeat uuid;
  v_enrollment_id_renewed uuid;

  v_catalog_count integer;
  v_forced_amount numeric(12, 2);
  v_has_video_col boolean;
  v_active_count integer;

  v_exam_id uuid;
  v_exam_lesson_id uuid;
  v_exam_q1 uuid;
  v_exam_q2 uuid;
  v_exam_opt_correct uuid;
  v_exam_opt_wrong uuid;
  v_exam_opt2_correct uuid;
  v_exam_opt2_wrong uuid;
  v_attempt_id uuid;
  v_submit_score numeric;
  v_submit_status public.exam_attempt_status;
  v_view_has_is_correct boolean;
  v_option_view_count integer;
BEGIN
  PERFORM tests.ensure_role_membership();
  PERFORM tests.become_owner();

  -- تنظيف بيانات الاختبار السابقة
  DELETE FROM public.exam_answers AS ea
  WHERE ea.attempt_id IN (
    SELECT a.id
    FROM public.exam_attempts AS a
    WHERE a.student_id IN (v_admin_id, v_teacher_id, v_student_id, v_outsider_id)
  );

  DELETE FROM public.exam_attempts AS a
  WHERE a.student_id IN (v_admin_id, v_teacher_id, v_student_id, v_outsider_id);

  DELETE FROM public.exams AS ex
  WHERE ex.title LIKE 'TEST_%';

  DELETE FROM public.lesson_progress AS lp
  WHERE lp.student_id IN (v_admin_id, v_teacher_id, v_student_id, v_outsider_id);

  DELETE FROM public.enrollments AS e
  WHERE e.student_id IN (v_admin_id, v_teacher_id, v_student_id, v_outsider_id);

  DELETE FROM public.payment_requests AS pr
  WHERE pr.student_id IN (v_admin_id, v_teacher_id, v_student_id, v_outsider_id);

  DELETE FROM public.course_staff_assignments AS csa
  WHERE csa.teacher_id = v_teacher_id;

  DELETE FROM public.lessons AS l
  WHERE l.title LIKE 'TEST_%';

  DELETE FROM public.course_semesters AS cs
  WHERE cs.title LIKE 'TEST_%';

  DELETE FROM public.products AS p
  WHERE p.price_egp = 999.99;

  DELETE FROM public.courses AS c
  WHERE c.slug LIKE 'test-security-%';

  DELETE FROM public.profiles AS p
  WHERE p.id IN (v_admin_id, v_teacher_id, v_student_id, v_outsider_id);

  DELETE FROM auth.users AS u
  WHERE u.id IN (v_admin_id, v_teacher_id, v_student_id, v_outsider_id);

  PERFORM tests.insert_auth_user(v_admin_id, 'admin-security@test.local', 'Admin');
  PERFORM tests.insert_auth_user(v_teacher_id, 'teacher-security@test.local', 'Teacher');
  PERFORM tests.insert_auth_user(v_student_id, 'student-security@test.local', 'Student');
  PERFORM tests.insert_auth_user(v_outsider_id, 'outsider-security@test.local', 'Outsider');

  -- تزويد المالك عبر service_role الحقيقي
  PERFORM tests.become('service_role', NULL);
  PERFORM public.provision_super_admin(v_admin_id, 'المهندس أحمد الدويك', NULL);

  PERFORM tests.become('authenticated', v_admin_id);
  PERFORM public.admin_set_user_role(v_teacher_id, 'teacher', true, true);

  -- تهيئة البيانات كمالك DB (لتجاوز تعقيدات المنح أثناء البذر فقط)
  PERFORM tests.become_owner();

  INSERT INTO public.courses AS c (title, slug, description, created_by, status)
  VALUES ('TEST Assigned Course', 'test-security-course-assigned', 'desc', v_admin_id, 'draft')
  RETURNING c.id INTO v_assigned_course_id;

  INSERT INTO public.courses AS c (title, slug, description, created_by, status)
  VALUES ('TEST Unassigned Course', 'test-security-course-unassigned', 'desc', v_admin_id, 'draft')
  RETURNING c.id INTO v_unassigned_course_id;

  PERFORM tests.become('authenticated', v_admin_id);
  PERFORM public.publish_course(v_assigned_course_id);
  -- نترك الكورس غير المعيّن كمسودة لاختبار النشر لاحقًا

  PERFORM tests.become_owner();

  INSERT INTO public.course_semesters AS cs (course_id, title, sort_order)
  VALUES (v_assigned_course_id, 'TEST_Semester_Assigned', 1)
  RETURNING cs.id INTO v_semester_id;

  INSERT INTO public.course_semesters AS cs (course_id, title, sort_order)
  VALUES (v_unassigned_course_id, 'TEST_Semester_Unassigned', 1)
  RETURNING cs.id INTO v_unassigned_semester_id;

  INSERT INTO public.lessons AS l (semester_id, title, video_asset_id, is_published, sort_order)
  VALUES (v_semester_id, 'TEST_Published_Lesson', 'secret-video-1', true, 1)
  RETURNING l.id INTO v_published_lesson_id;

  INSERT INTO public.lessons AS l (semester_id, title, video_asset_id, is_published, sort_order)
  VALUES (v_semester_id, 'TEST_Draft_Lesson', 'secret-video-draft', false, 2)
  RETURNING l.id INTO v_draft_lesson_id;

  INSERT INTO public.products AS p (product_type, course_id, price_egp, is_active)
  VALUES ('full_course', v_assigned_course_id, 999.99, true)
  RETURNING p.id INTO v_product_id;

  PERFORM tests.become('authenticated', v_admin_id);
  PERFORM public.upsert_course_staff_assignment(
    v_assigned_course_id,
    v_teacher_id,
    true,
    false,
    true
  );

  ------------------------------------------------------------------
  -- 1) lessons_catalog كـ anon حقيقي
  ------------------------------------------------------------------
  PERFORM tests.become('anon', NULL);

  SELECT count(*) INTO v_catalog_count
  FROM public.lessons_catalog AS lc
  WHERE lc.id IN (v_published_lesson_id, v_draft_lesson_id);

  PERFORM tests.assert_true(
    v_catalog_count = 1,
    'anon catalog must expose only published lesson'
  );

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns AS cols
    WHERE cols.table_schema = 'public'
      AND cols.table_name = 'lessons_catalog'
      AND cols.column_name = 'video_asset_id'
  ) INTO v_has_video_col;

  PERFORM tests.assert_true(
    NOT v_has_video_col,
    'lessons_catalog must not expose video_asset_id'
  );

  PERFORM tests.assert_raises(
    format('SELECT l.video_asset_id FROM public.lessons AS l WHERE l.id = %L', v_published_lesson_id),
    'anon cannot select lessons.video_asset_id'
  );

  PERFORM tests.assert_raises(
    format('SELECT l.id FROM public.lessons AS l WHERE l.id = %L', v_draft_lesson_id),
    'anon cannot select draft lessons base table'
  );

  ------------------------------------------------------------------
  -- 2) الطالب: لا رفع دور / لا تزوير تحقق هاتف / لا تسجيل / لا تعيين مدرّس
  ------------------------------------------------------------------
  PERFORM tests.become('authenticated', v_student_id);

  PERFORM tests.assert_raises(
    format(
      'UPDATE public.profiles AS p SET role = %L WHERE p.id = %L',
      'super_admin',
      v_student_id
    ),
    'student cannot escalate role'
  );

  PERFORM tests.assert_raises(
    format(
      'UPDATE public.profiles AS p SET phone_verified_at = now() WHERE p.id = %L',
      v_student_id
    ),
    'student cannot forge phone verification'
  );

  UPDATE public.profiles AS p
  SET phone_number = '+201000000001'
  WHERE p.id = v_student_id;

  PERFORM tests.assert_true(
    (
      SELECT p.phone_verified_at IS NULL
      FROM public.profiles AS p
      WHERE p.id = v_student_id
    ),
    'student phone change must clear verification'
  );

  PERFORM tests.assert_raises(
    format(
      'INSERT INTO public.enrollments AS e (student_id, product_id, status) VALUES (%L, %L, %L)',
      v_student_id,
      v_product_id,
      'active'
    ),
    'student cannot insert enrollment'
  );

  PERFORM tests.assert_raises(
    format(
      'INSERT INTO public.course_staff_assignments AS csa (course_id, teacher_id, can_edit_content, can_manage_exams, can_view_student_progress) VALUES (%L, %L, true, true, true)',
      v_assigned_course_id,
      v_teacher_id
    ),
    'student cannot create teacher assignment'
  );

  INSERT INTO public.payment_requests AS pr (
    student_id, product_id, payment_method, amount_egp, sender_phone, receipt_path
  ) VALUES (
    v_student_id, v_product_id, 'instapay', 1.00, '+201000000001', 'receipts/test/1.png'
  )
  RETURNING pr.id INTO v_payment_id;

  SELECT pr.amount_egp INTO v_forced_amount
  FROM public.payment_requests AS pr
  WHERE pr.id = v_payment_id;

  PERFORM tests.assert_true(v_forced_amount = 999.99, 'payment amount forced from product');

  PERFORM tests.assert_raises(
    format(
      'UPDATE public.payment_requests AS pr SET amount_egp = 1 WHERE pr.id = %L',
      v_payment_id
    ),
    'student cannot modify payment after create'
  );

  PERFORM tests.assert_raises(
    format('SELECT public.approve_payment_request(%L)', v_payment_id),
    'student cannot approve payment'
  );

  PERFORM tests.assert_raises(
    format('SELECT public.publish_course(%L)', v_unassigned_course_id),
    'student cannot publish course'
  );

  ------------------------------------------------------------------
  -- 3) المدرّس: لا موافقة دفع / لا نشر / لا تعيين / فقط الكورس المعيّن
  ------------------------------------------------------------------
  PERFORM tests.become('authenticated', v_teacher_id);

  PERFORM tests.assert_raises(
    format('SELECT public.approve_payment_request(%L)', v_payment_id),
    'teacher cannot approve payment'
  );

  PERFORM tests.assert_raises(
    format('SELECT public.publish_course(%L)', v_unassigned_course_id),
    'teacher cannot publish course'
  );

  PERFORM tests.assert_raises(
    format(
      'SELECT public.upsert_course_staff_assignment(%L, %L, true, true, true)',
      v_unassigned_course_id,
      v_teacher_id
    ),
    'teacher cannot assign self to course'
  );

  PERFORM tests.assert_raises(
    format(
      'UPDATE public.course_semesters AS cs SET title = %L WHERE cs.id = %L',
      'HACKED',
      v_unassigned_semester_id
    ),
    'teacher cannot edit unassigned course content'
  );

  -- محتوى الكورس المعيّن مسموح
  UPDATE public.course_semesters AS cs
  SET description = 'teacher-edit-ok'
  WHERE cs.id = v_semester_id;

  PERFORM tests.assert_true(
    (
      SELECT cs.description = 'teacher-edit-ok'
      FROM public.course_semesters AS cs
      WHERE cs.id = v_semester_id
    ),
    'teacher can edit assigned course content'
  );

  ------------------------------------------------------------------
  -- 4) المالك فقط: موافقة + idempotency + تجديد
  ------------------------------------------------------------------
  PERFORM tests.become('authenticated', v_admin_id);

  v_enrollment_id := public.approve_payment_request(
    v_payment_id,
    timezone('utc', now()) + interval '30 days'
  );
  v_enrollment_id_repeat := public.approve_payment_request(
    v_payment_id,
    timezone('utc', now()) + interval '60 days'
  );

  PERFORM tests.assert_true(
    v_enrollment_id = v_enrollment_id_repeat,
    'payment approval must be idempotent'
  );

  SELECT count(*) INTO v_active_count
  FROM public.enrollments AS e
  WHERE e.student_id = v_student_id
    AND e.product_id = v_product_id
    AND e.status = 'active';

  PERFORM tests.assert_true(v_active_count = 1, 'only one active enrollment after idempotent approve');

  PERFORM public.suspend_enrollment(v_enrollment_id, 'test suspend for renewal');

  PERFORM tests.become('authenticated', v_student_id);
  INSERT INTO public.payment_requests AS pr (
    student_id, product_id, payment_method, amount_egp, sender_phone, receipt_path
  ) VALUES (
    v_student_id, v_product_id, 'vodafone_cash', 1.00, '+201000000001', 'receipts/test/2.png'
  )
  RETURNING pr.id INTO v_payment_id_2;

  PERFORM tests.become('authenticated', v_admin_id);
  v_enrollment_id_renewed := public.approve_payment_request(
    v_payment_id_2,
    timezone('utc', now()) + interval '90 days'
  );

  SELECT count(*) INTO v_active_count
  FROM public.enrollments AS e
  WHERE e.student_id = v_student_id
    AND e.product_id = v_product_id
    AND e.status = 'active';

  PERFORM tests.assert_true(v_active_count = 1, 'renewal must keep a single active enrollment');

  ------------------------------------------------------------------
  -- 5) انتهاء الصلاحية يمنع الوصول
  ------------------------------------------------------------------
  PERFORM tests.become_owner();
  UPDATE public.enrollments AS e
  SET expires_at = timezone('utc', now()) - interval '1 minute'
  WHERE e.id = v_enrollment_id_renewed;

  PERFORM tests.become('authenticated', v_student_id);
  PERFORM tests.assert_true(
    NOT public.student_has_active_enrollment_for_lesson(v_published_lesson_id),
    'expired enrollment must deny lesson access'
  );

  ------------------------------------------------------------------
  -- 6) GUC وحده لا يكفي تحت دور authenticated الحقيقي
  ------------------------------------------------------------------
  PERFORM tests.become('authenticated', v_student_id);
  PERFORM set_config('request.enrollment_write', 'on', true);
  PERFORM set_config('request.payment_review', 'on', true);

  PERFORM tests.assert_raises(
    format(
      'INSERT INTO public.enrollments AS e (student_id, product_id, status) VALUES (%L, %L, %L)',
      v_student_id,
      v_product_id,
      'active'
    ),
    'caller-settable GUC must not authorize enrollment insert under authenticated'
  );

  ------------------------------------------------------------------
  -- 7) تزويد super_admin مرفوض خارج service_role
  ------------------------------------------------------------------
  PERFORM tests.become('authenticated', v_admin_id);
  PERFORM tests.assert_raises(
    format(
      'SELECT public.provision_super_admin(%L, %L, NULL)',
      v_outsider_id,
      'Hacker'
    ),
    'authenticated cannot provision super_admin'
  );

  PERFORM tests.become('anon', NULL);
  PERFORM tests.assert_raises(
    format(
      'SELECT public.provision_super_admin(%L, %L, NULL)',
      v_outsider_id,
      'Hacker'
    ),
    'anon cannot provision super_admin'
  );

  ------------------------------------------------------------------
  -- 8) المالك ينشر الكورس غير المنشور
  ------------------------------------------------------------------
  PERFORM tests.become('authenticated', v_admin_id);
  PERFORM public.publish_course(v_unassigned_course_id);

  PERFORM tests.assert_true(
    (
      SELECT c.status = 'published'
      FROM public.courses AS c
      WHERE c.id = v_unassigned_course_id
    ),
    'owner can publish course'
  );

  ------------------------------------------------------------------
  -- 9) امتحانات MCQ: إنشاء/نقل/مفاتيح/تسليم
  ------------------------------------------------------------------
  -- إعادة استحقاق الطالب بعد اختبار الانتهاء السابق
  PERFORM tests.become_owner();
  UPDATE public.enrollments AS e
  SET expires_at = timezone('utc', now()) + interval '30 days',
      status = 'active'
  WHERE e.id = v_enrollment_id_renewed;

  -- 9a) مدرّس بلا can_manage_exams لا ينشئ امتحانًا (التعيين الحالي: manage_exams=false)
  PERFORM tests.become('authenticated', v_teacher_id);
  PERFORM tests.assert_raises(
    format(
      'INSERT INTO public.exams AS ex (semester_id, title, is_published) VALUES (%L, %L, false)',
      v_semester_id,
      'TEST_Exam_Denied'
    ),
    'teacher without can_manage_exams cannot create exam'
  );

  -- 9b) منح can_manage_exams ثم إنشاء ترم/درس بنجاح
  PERFORM tests.become('authenticated', v_admin_id);
  PERFORM public.upsert_course_staff_assignment(
    v_assigned_course_id,
    v_teacher_id,
    true,
    true,
    true
  );

  PERFORM tests.become('authenticated', v_teacher_id);
  INSERT INTO public.exams AS ex (
    semester_id, title, description, duration_minutes, passing_score, max_attempts, is_published
  ) VALUES (
    v_semester_id, 'TEST_Exam_Semester', 'sec', 30, 50, 1, false
  )
  RETURNING ex.id INTO v_exam_id;

  PERFORM tests.assert_true(v_exam_id IS NOT NULL, 'teacher with can_manage_exams can insert semester-scoped exam');

  INSERT INTO public.exams AS ex (lesson_id, title, is_published, max_attempts)
  VALUES (v_published_lesson_id, 'TEST_Exam_Lesson', false, 2)
  RETURNING ex.id INTO v_exam_lesson_id;

  PERFORM tests.assert_true(
    (
      SELECT ex.semester_id = v_semester_id
      FROM public.exams AS ex
      WHERE ex.id = v_exam_lesson_id
    ),
    'lesson-scoped exam must inherit semester via scope trigger'
  );

  -- 9c) لا نقل لامتحان نحو كورس غير مصرّح
  PERFORM tests.assert_raises(
    format(
      'UPDATE public.exams AS ex SET semester_id = %L, lesson_id = NULL WHERE ex.id = %L',
      v_unassigned_semester_id,
      v_exam_id
    ),
    'teacher cannot move exam to unauthorized course'
  );

  -- 9d) إعداد أسئلة وخيارات كمدرّس ثم التحقق من العزل قبل/بعد النشر
  PERFORM tests.become('authenticated', v_teacher_id);

  INSERT INTO public.exam_questions AS q (exam_id, question_text, sort_order, points)
  VALUES (v_exam_id, 'TEST Q1', 1, 1)
  RETURNING q.id INTO v_exam_q1;

  INSERT INTO public.exam_questions AS q (exam_id, question_text, sort_order, points)
  VALUES (v_exam_id, 'TEST Q2', 2, 1)
  RETURNING q.id INTO v_exam_q2;

  INSERT INTO public.exam_options AS o (question_id, option_text, is_correct, sort_order)
  VALUES (v_exam_q1, 'correct', true, 1)
  RETURNING o.id INTO v_exam_opt_correct;

  INSERT INTO public.exam_options AS o (question_id, option_text, is_correct, sort_order)
  VALUES (v_exam_q1, 'wrong', false, 2)
  RETURNING o.id INTO v_exam_opt_wrong;

  INSERT INTO public.exam_options AS o (question_id, option_text, is_correct, sort_order)
  VALUES (v_exam_q2, 'correct2', true, 1)
  RETURNING o.id INTO v_exam_opt2_correct;

  INSERT INTO public.exam_options AS o (question_id, option_text, is_correct, sort_order)
  VALUES (v_exam_q2, 'wrong2', false, 2)
  RETURNING o.id INTO v_exam_opt2_wrong;

  -- طالب: RLS على SELECT يعيد صفر صفوف (لا خطأ) — يجب ألا يرى المفتاح عبر الجدول
  PERFORM tests.become('authenticated', v_student_id);
  PERFORM tests.assert_true(
    (
      SELECT count(*) = 0
      FROM public.exam_options AS o
      INNER JOIN public.exam_questions AS q ON q.id = o.question_id
      WHERE q.exam_id = v_exam_id
    ),
    'student must not read exam_options rows (including is_correct) from base table'
  );

  PERFORM tests.become('authenticated', v_outsider_id);
  PERFORM tests.assert_true(
    (
      SELECT count(*) = 0
      FROM public.exams AS ex
      WHERE ex.id = v_exam_id
    ),
    'outsider cannot read unpublished exam'
  );

  PERFORM tests.become('authenticated', v_teacher_id);
  UPDATE public.exams AS ex
  SET is_published = true
  WHERE ex.id = v_exam_id;

  PERFORM tests.assert_true(
    (
      SELECT ex.is_published
      FROM public.exams AS ex
      WHERE ex.id = v_exam_id
    ),
    'teacher with can_manage_exams can publish exam'
  );

  -- 9f) العرض الآمن بلا is_correct وللمستحق فقط
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns AS cols
    WHERE cols.table_schema = 'public'
      AND cols.table_name = 'exam_options_for_taking'
      AND cols.column_name = 'is_correct'
  ) INTO v_view_has_is_correct;

  PERFORM tests.assert_true(
    NOT v_view_has_is_correct,
    'exam_options_for_taking must not expose is_correct'
  );

  PERFORM tests.become('authenticated', v_student_id);
  SELECT count(*) INTO v_option_view_count
  FROM public.exam_options_for_taking AS v
  WHERE v.question_id IN (v_exam_q1, v_exam_q2);

  PERFORM tests.assert_true(
    v_option_view_count = 4,
    'enrolled student can read safe options for published exam'
  );

  PERFORM tests.become('authenticated', v_outsider_id);
  SELECT count(*) INTO v_option_view_count
  FROM public.exam_options_for_taking AS v
  WHERE v.question_id IN (v_exam_q1, v_exam_q2);

  PERFORM tests.assert_true(
    v_option_view_count = 0,
    'non-entitled user must not read exam option view rows'
  );

  -- 9g) تسليم صحيح + رفض التكرار + حد المحاولات + انتهاء المؤقّت
  PERFORM tests.become('authenticated', v_student_id);
  v_attempt_id := public.start_exam_attempt(v_exam_id);

  PERFORM tests.assert_raises(
    format(
      $sql$
      SELECT * FROM public.submit_exam_attempt(
        %L,
        jsonb_build_array(
          jsonb_build_object('question_id', %L, 'selected_option_id', %L),
          jsonb_build_object('question_id', %L, 'selected_option_id', %L)
        )
      )
      $sql$,
      v_attempt_id,
      v_exam_q1,
      v_exam_opt_correct,
      v_exam_q1,
      v_exam_opt_wrong
    ),
    'submit must reject duplicate question answers'
  );

  SELECT s.score, s.status
  INTO v_submit_score, v_submit_status
  FROM public.submit_exam_attempt(
    v_attempt_id,
    jsonb_build_array(
      jsonb_build_object(
        'question_id', v_exam_q1,
        'selected_option_id', v_exam_opt_correct
      ),
      jsonb_build_object(
        'question_id', v_exam_q2,
        'selected_option_id', v_exam_opt2_wrong
      )
    )
  ) AS s;

  PERFORM tests.assert_true(
    v_submit_status = 'submitted' AND v_submit_score = 50,
    'grading must score 50 percent for one of two correct answers'
  );

  PERFORM tests.assert_raises(
    format('SELECT public.submit_exam_attempt(%L, %L::jsonb)', v_attempt_id, '[]'),
    'resubmission of closed attempt must fail'
  );

  -- max_attempts = 1 بعد محاولة submitted
  PERFORM tests.assert_raises(
    format('SELECT public.start_exam_attempt(%L)', v_exam_id),
    'max_attempts must block a new attempt'
  );

  -- مؤقّت منتهٍ على امتحان الدرس
  PERFORM tests.become('authenticated', v_teacher_id);
  UPDATE public.exams AS ex
  SET is_published = true, max_attempts = 3, duration_minutes = 10
  WHERE ex.id = v_exam_lesson_id;

  INSERT INTO public.exam_questions AS q (exam_id, question_text, points)
  VALUES (v_exam_lesson_id, 'TEST timer Q', 1)
  RETURNING q.id INTO v_exam_q1;

  INSERT INTO public.exam_options AS o (question_id, option_text, is_correct, sort_order)
  VALUES (v_exam_q1, 't-correct', true, 1)
  RETURNING o.id INTO v_exam_opt_correct;

  PERFORM tests.become('authenticated', v_student_id);
  v_attempt_id := public.start_exam_attempt(v_exam_lesson_id);

  PERFORM tests.become_owner();
  UPDATE public.exam_attempts AS a
  SET ends_at = timezone('utc', now()) - interval '1 second'
  WHERE a.id = v_attempt_id;

  PERFORM tests.become('authenticated', v_student_id);
  SELECT s.score, s.status
  INTO v_submit_score, v_submit_status
  FROM public.submit_exam_attempt(
    v_attempt_id,
    jsonb_build_array(
      jsonb_build_object(
        'question_id', v_exam_q1,
        'selected_option_id', v_exam_opt_correct
      )
    )
  ) AS s;

  PERFORM tests.assert_true(
    v_submit_status = 'expired' AND v_submit_score = 0,
    'expired timer must close attempt with score 0 on server clock'
  );

  PERFORM tests.become_owner();
  RAISE NOTICE 'SECURITY_SUITE_PASSED';
END;
$$;

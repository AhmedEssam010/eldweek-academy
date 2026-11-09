-- =============================================================================
-- video_asset_access.sql
-- اختبارات معزولة لتشديد video_asset_id.
--
-- المتطلبات:
--   - قاعدة Supabase محلية أو disposable فقط
--   - تطبيق كل الهجرات بما فيها 20261106113015_harden_video_asset_access.sql
--   - عدم وجود super_admin سابق (قاعدة فارغة، ليست نسخة إنتاج)
--
-- لا تشغّل هذا الملف على الإنتاج. الفشل يلغي المعاملة كاملة.
-- =============================================================================

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS tests;

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
  IF p_db_role = 'anon' THEN
    PERFORM tests.set_jwt_claims(NULL, 'anon');
  ELSIF p_db_role = 'service_role' THEN
    PERFORM tests.set_jwt_claims(p_user_id, 'service_role');
  ELSE
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
      p_id, 'authenticated', 'authenticated', p_email, v_password,
      timezone('utc', now()),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_full_name),
      timezone('utc', now()), timezone('utc', now()),
      '', '', '', ''
    )
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      p_id, 'authenticated', 'authenticated', p_email, v_password,
      timezone('utc', now()),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_full_name),
      timezone('utc', now()), timezone('utc', now())
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END;
$$;

DO $$
DECLARE
  v_admin_id uuid := 'a9a9a9a9-091a-4000-8000-000000000001';
  v_teacher_id uuid := 'a9a9a9a9-091a-4000-8000-000000000002';
  v_other_teacher_id uuid := 'a9a9a9a9-091a-4000-8000-000000000003';
  v_student_id uuid := 'a9a9a9a9-091a-4000-8000-000000000004';
  v_outsider_id uuid := 'a9a9a9a9-091a-4000-8000-000000000005';
  v_secret text := 'secret-video-asset-value';
  v_course_id uuid;
  v_semester_id uuid;
  v_published_id uuid;
  v_draft_id uuid;
  v_product_id uuid;
  v_has boolean;
  v_grant_text text;
  v_title text;
BEGIN
  PERFORM tests.ensure_role_membership();
  PERFORM tests.become_owner();

  IF to_regprocedure('public.get_lesson_playback_grant(uuid)') IS NULL THEN
    RAISE EXCEPTION 'SETUP_FAIL: get_lesson_playback_grant is missing';
  END IF;

  IF position(
    'video_asset_id' IN pg_get_function_result(
      'public.get_lesson_playback_grant(uuid)'::regprocedure
    )
  ) > 0 THEN
    RAISE EXCEPTION 'SETUP_FAIL: migration 20261106113015 is not applied; RPC still returns video_asset_id';
  END IF;

  PERFORM tests.assert_true(
    NOT has_column_privilege('anon', 'public.lessons', 'video_asset_id', 'SELECT')
    AND NOT has_column_privilege('anon', 'public.lessons', 'video_asset_id', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.lessons', 'video_asset_id', 'SELECT')
    AND NOT has_column_privilege('authenticated', 'public.lessons', 'video_asset_id', 'INSERT')
    AND NOT has_column_privilege('authenticated', 'public.lessons', 'video_asset_id', 'UPDATE')
    AND has_column_privilege('authenticated', 'public.lessons', 'title', 'UPDATE')
    AND NOT has_function_privilege('anon', 'public.get_lesson_playback_grant(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.get_lesson_playback_grant(uuid)', 'EXECUTE'),
    'untrusted roles must not hold video_asset_id or anon execute'
  );

  DELETE FROM public.enrollments AS e
  WHERE e.student_id IN (v_admin_id, v_teacher_id, v_other_teacher_id, v_student_id, v_outsider_id);
  DELETE FROM public.course_staff_assignments AS a
  WHERE a.teacher_id IN (v_teacher_id, v_other_teacher_id);
  DELETE FROM public.lessons AS l
  WHERE l.title LIKE 'TEST_VIDEO_%';
  DELETE FROM public.course_semesters AS s
  WHERE s.title = 'TEST_VIDEO_SEMESTER';
  DELETE FROM public.products AS p
  WHERE p.course_id IN (SELECT c.id FROM public.courses AS c WHERE c.slug = 'test-video-asset-hardening');
  DELETE FROM public.courses AS c
  WHERE c.slug = 'test-video-asset-hardening';
  DELETE FROM public.profiles AS p
  WHERE p.id IN (v_admin_id, v_teacher_id, v_other_teacher_id, v_student_id, v_outsider_id);
  DELETE FROM auth.users AS u
  WHERE u.id IN (v_admin_id, v_teacher_id, v_other_teacher_id, v_student_id, v_outsider_id);

  IF EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.role = 'super_admin') THEN
    RAISE EXCEPTION 'SETUP_FAIL: a super_admin already exists. Use an empty disposable database, never production.';
  END IF;

  PERFORM tests.insert_auth_user(v_admin_id, 'video-admin@test.local', 'Video Admin');
  PERFORM tests.insert_auth_user(v_teacher_id, 'video-teacher@test.local', 'Video Teacher');
  PERFORM tests.insert_auth_user(v_other_teacher_id, 'video-other-teacher@test.local', 'Other Teacher');
  PERFORM tests.insert_auth_user(v_student_id, 'video-student@test.local', 'Video Student');
  PERFORM tests.insert_auth_user(v_outsider_id, 'video-outsider@test.local', 'Video Outsider');

  -- jwt فقط: service_role في Supabase قد يملك BYPASSRLS، وtests.become يرفض ذلك.
  PERFORM tests.set_jwt_claims(NULL, 'service_role');
  PERFORM public.provision_super_admin(v_admin_id, 'Video Admin', NULL);
  PERFORM tests.become_owner();
  PERFORM tests.become('authenticated', v_admin_id);
  PERFORM public.admin_set_user_role(v_teacher_id, 'teacher', true, true);
  PERFORM public.admin_set_user_role(v_other_teacher_id, 'teacher', true, false);

  PERFORM tests.become_owner();
  INSERT INTO public.courses AS c (title, slug, description, created_by, status)
  VALUES ('TEST_VIDEO_COURSE', 'test-video-asset-hardening', 'desc', v_admin_id, 'draft')
  RETURNING c.id INTO v_course_id;

  PERFORM tests.become('authenticated', v_admin_id);
  PERFORM public.publish_course(v_course_id);
  PERFORM public.upsert_course_staff_assignment(v_course_id, v_teacher_id, true, false, false);

  PERFORM tests.become_owner();
  INSERT INTO public.course_semesters AS s (course_id, title, sort_order)
  VALUES (v_course_id, 'TEST_VIDEO_SEMESTER', 0)
  RETURNING s.id INTO v_semester_id;

  INSERT INTO public.lessons AS l (semester_id, title, video_asset_id, is_published, sort_order)
  VALUES (v_semester_id, 'TEST_VIDEO_PUBLISHED', v_secret, true, 0)
  RETURNING l.id INTO v_published_id;

  INSERT INTO public.lessons AS l (semester_id, title, video_asset_id, is_published, sort_order)
  VALUES (v_semester_id, 'TEST_VIDEO_DRAFT', v_secret, false, 1)
  RETURNING l.id INTO v_draft_id;

  INSERT INTO public.products AS p (product_type, course_id, price_egp, is_active)
  VALUES ('full_course', v_course_id, 10, true)
  RETURNING p.id INTO v_product_id;

  INSERT INTO public.enrollments AS e (student_id, product_id, status, starts_at)
  VALUES (v_student_id, v_product_id, 'active', timezone('utc', now()) - interval '1 day');

  PERFORM tests.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.columns AS cols
      WHERE cols.table_schema = 'public'
        AND cols.table_name = 'lessons_catalog'
        AND cols.column_name = 'video_asset_id'
    ),
    'lessons_catalog must not expose video_asset_id'
  );

  PERFORM tests.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.columns AS cols
      WHERE cols.table_schema = 'public'
        AND cols.table_name = 'lessons_catalog'
        AND cols.column_name = 'youtube_video_id'
    ),
    'lessons_catalog must not expose youtube_video_id'
  );

  PERFORM tests.become('anon', NULL);
  PERFORM tests.assert_raises(
    format('SELECT l.video_asset_id FROM public.lessons AS l WHERE l.id = %L', v_published_id),
    'anon cannot select video_asset_id'
  );
  PERFORM tests.assert_raises(
    format('SELECT * FROM public.get_lesson_playback_grant(%L)', v_published_id),
    'anon cannot execute playback grant'
  );

  PERFORM tests.become('authenticated', v_outsider_id);
  PERFORM tests.assert_raises(
    format('SELECT * FROM public.get_lesson_playback_grant(%L)', v_published_id),
    'student without enrollment cannot obtain a playback grant'
  );
  PERFORM tests.assert_raises(
    format('SELECT l.video_asset_id FROM public.lessons AS l WHERE l.id = %L', v_published_id),
    'student cannot select video_asset_id'
  );

  PERFORM tests.become('authenticated', v_student_id);
  SELECT g.has_video_asset, g::text
  INTO v_has, v_grant_text
  FROM public.get_lesson_playback_grant(v_published_id) AS g;
  PERFORM tests.assert_true(v_has, 'enrolled student receives has_video_asset');
  PERFORM tests.assert_true(
    position(v_secret IN v_grant_text) = 0,
    'playback grant text must not contain the raw asset id'
  );
  PERFORM tests.assert_raises(
    format('SELECT * FROM public.get_lesson_playback_grant(%L)', v_draft_id),
    'enrolled student cannot grant an unpublished lesson'
  );
  PERFORM tests.assert_raises(
    format('UPDATE public.lessons AS l SET video_asset_id = %L WHERE l.id = %L', 'hijacked', v_published_id),
    'student cannot update video_asset_id'
  );

  PERFORM tests.become('authenticated', v_other_teacher_id);
  PERFORM tests.assert_raises(
    format('SELECT * FROM public.get_lesson_playback_grant(%L)', v_published_id),
    'unassigned teacher cannot obtain a playback grant'
  );

  PERFORM tests.become('authenticated', v_teacher_id);
  SELECT g.has_video_asset, g::text
  INTO v_has, v_grant_text
  FROM public.get_lesson_playback_grant(v_published_id) AS g;
  PERFORM tests.assert_true(v_has, 'assigned teacher receives has_video_asset');
  PERFORM tests.assert_true(
    position(v_secret IN v_grant_text) = 0,
    'teacher playback grant must not contain the raw asset id'
  );
  PERFORM tests.assert_raises(
    format('UPDATE public.lessons AS l SET video_asset_id = %L WHERE l.id = %L', 'hijacked', v_published_id),
    'assigned teacher cannot update video_asset_id'
  );
  UPDATE public.lessons AS l
  SET title = 'TEST_VIDEO_RENAMED'
  WHERE l.id = v_published_id;

  PERFORM tests.become('authenticated', v_admin_id);
  SELECT g.has_video_asset, g::text
  INTO v_has, v_grant_text
  FROM public.get_lesson_playback_grant(v_draft_id) AS g;
  PERFORM tests.assert_true(v_has, 'super_admin can inspect draft video configuration');
  PERFORM tests.assert_true(
    position(v_secret IN v_grant_text) = 0,
    'super_admin playback grant must not contain the raw asset id'
  );
  PERFORM tests.assert_raises(
    format('UPDATE public.lessons AS l SET video_asset_id = %L WHERE l.id = %L', 'hijacked-admin', v_published_id),
    'super_admin authenticated session cannot update video_asset_id'
  );

  PERFORM tests.become_owner();
  SELECT l.title INTO v_title
  FROM public.lessons AS l
  WHERE l.id = v_published_id;
  PERFORM tests.assert_true(v_title = 'TEST_VIDEO_RENAMED', 'teacher can still edit the lesson title');
  PERFORM tests.assert_true(
    (SELECT l.video_asset_id FROM public.lessons AS l WHERE l.id = v_published_id) = v_secret,
    'direct update attempts must leave the private asset id unchanged'
  );
END;
$$;

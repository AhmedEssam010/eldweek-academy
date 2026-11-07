-- =============================================================================
-- 20261106113015_harden_video_asset_access.sql
-- تشديد الوصول إلى lessons.video_asset_id
--
-- لا تُطبَّق هذه الهجرة على الإنتاج إلا بعد مراجعة وموافقة صريحة.
--
-- المتصلون الحاليون بدالة get_lesson_playback_grant(uuid):
--   - src/lib/learning/video.ts (inspectLessonVideoSetup) كان يقرأ video_asset_id
--   - src/types/database.ts يعرّف شكل الإرجاع
-- لا يستدعي authorizeLessonPlayback هذه الدالة.
-- PostgreSQL لا يسمح بتغيير نوع الإرجاع عبر CREATE OR REPLACE، لذلك تُحذف الدالة
-- وتُعاد بالاسم والمعامل نفسهما (p_lesson_id uuid) مع عمود has_video_asset
-- بدل video_asset_id. هذا تغيير في شكل الصف المُعاد، لا في اسم الدالة أو معاملها.
-- =============================================================================

DO $drop_guard$
DECLARE
  v_func regprocedure;
  v_deps text;
BEGIN
  v_func := to_regprocedure('public.get_lesson_playback_grant(uuid)');
  IF v_func IS NULL THEN
    RAISE EXCEPTION
      'get_lesson_playback_grant(uuid) is missing; apply prior migrations first';
  END IF;

  -- deptype n فقط: التبعيات التلقائية/الداخلية تُحذف مع الدالة من غير CASCADE.
  SELECT string_agg(pg_describe_object(d.classid, d.objid, d.objsubid), ', ' ORDER BY 1)
  INTO v_deps
  FROM pg_depend AS d
  WHERE d.refobjid = v_func
    AND d.deptype = 'n';

  IF v_deps IS NOT NULL THEN
    RAISE EXCEPTION
      'refusing to DROP get_lesson_playback_grant(uuid) because dependents exist: %. No CASCADE.',
      v_deps;
  END IF;
END
$drop_guard$;

DROP FUNCTION public.get_lesson_playback_grant(uuid);

CREATE FUNCTION public.get_lesson_playback_grant(p_lesson_id uuid)
RETURNS TABLE (
  lesson_id uuid,
  has_video_asset boolean,
  duration_seconds integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- نفس بوابة التفويض السابقة: المالك، أو مدرّس معيّن على كورس الدرس،
  -- أو طالب باستحقاق نشط ودرس منشور. لا يُعاد معرّف الأصل.
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
         SELECT 1
         FROM public.lessons AS l
         WHERE l.id = p_lesson_id
           AND l.is_published = true
       )
     )
  THEN
    RETURN QUERY
    SELECT
      l.id,
      (
        l.video_asset_id IS NOT NULL
        AND length(btrim(l.video_asset_id)) > 0
      ),
      l.duration_seconds
    FROM public.lessons AS l
    WHERE l.id = p_lesson_id;
  ELSE
    RAISE EXCEPTION 'lesson_playback_forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_lesson_playback_grant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_lesson_playback_grant(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_lesson_playback_grant(uuid)
  TO authenticated, service_role;

ALTER FUNCTION public.get_lesson_playback_grant(uuid) OWNER TO postgres;

-- منح الجدول تلغي تقييد العمود في PostgreSQL.
-- سحب كل صلاحيات الأدوار غير الموثوقة ثم إعادة منح أعمدة التحرير فقط.
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
  duration_seconds,
  sort_order,
  is_published
) ON public.lessons TO authenticated;

GRANT UPDATE (
  title,
  description,
  duration_seconds,
  sort_order,
  is_published
) ON public.lessons TO authenticated;

GRANT DELETE ON public.lessons TO authenticated;

REVOKE SELECT (video_asset_id), INSERT (video_asset_id), UPDATE (video_asset_id)
  ON public.lessons FROM PUBLIC, anon, authenticated;

-- service_role وpostgres يبقيان للمسار الخادمي فقط. لا يُستخدم service_role من المتصفح.
GRANT ALL ON TABLE public.lessons TO postgres, service_role;

DO $video_acl_check$
DECLARE
  v_untrusted oid[];
  v_table_grants integer;
  v_column_grants integer;
  v_config text[];
BEGIN
  SELECT COALESCE(array_agg(r.oid), ARRAY[]::oid[])
  INTO v_untrusted
  FROM pg_roles AS r
  WHERE r.rolname IN ('anon', 'authenticated');

  v_untrusted := v_untrusted || ARRAY[0]::oid[];

  SELECT count(*)
  INTO v_table_grants
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) AS priv
  WHERE n.nspname = 'public'
    AND c.relname = 'lessons'
    AND c.relacl IS NOT NULL
    AND priv.grantee = ANY (v_untrusted)
    AND priv.privilege_type IN ('SELECT', 'INSERT', 'UPDATE');

  IF v_table_grants > 0 THEN
    RAISE EXCEPTION
      'table-level SELECT/INSERT/UPDATE on lessons would override video_asset_id column restrictions';
  END IF;

  SELECT count(*)
  INTO v_column_grants
  FROM pg_attribute AS a
  JOIN pg_class AS c ON c.oid = a.attrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(a.attacl) AS priv
  WHERE n.nspname = 'public'
    AND c.relname = 'lessons'
    AND a.attname = 'video_asset_id'
    AND NOT a.attisdropped
    AND a.attacl IS NOT NULL
    AND priv.grantee = ANY (v_untrusted);

  IF v_column_grants > 0 THEN
    RAISE EXCEPTION 'video_asset_id remains granted to anon, authenticated, or PUBLIC';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.get_lesson_playback_grant(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon must not execute get_lesson_playback_grant';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.get_lesson_playback_grant(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated must keep execute on get_lesson_playback_grant';
  END IF;

  IF position(
    'video_asset_id' IN pg_get_function_result(
      'public.get_lesson_playback_grant(uuid)'::regprocedure
    )
  ) > 0 THEN
    RAISE EXCEPTION 'get_lesson_playback_grant still exposes video_asset_id';
  END IF;

  SELECT p.proconfig
  INTO v_config
  FROM pg_proc AS p
  WHERE p.oid = 'public.get_lesson_playback_grant(uuid)'::regprocedure;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    WHERE p.oid = 'public.get_lesson_playback_grant(uuid)'::regprocedure
      AND p.prosecdef
  ) OR NOT ('search_path=pg_catalog, public' = ANY (COALESCE(v_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'get_lesson_playback_grant must stay SECURITY DEFINER with a locked search_path';
  END IF;
END
$video_acl_check$;

-- =============================================================================
-- 20261109120000_lesson_youtube_source.sql
-- مصدر فيديو ثانٍ: YouTube (بجانب Mux)
--
-- لا تُطبَّق على الإنتاج إلا بعد مراجعة وموافقة صريحة.
-- لا تمس أصول Mux الحالية؛ فقط تضيف أعمدة اختيارية وتوسّع منحة التشغيل.
-- =============================================================================

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS video_source text;

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS youtube_video_id text;

UPDATE public.lessons
SET video_source = 'mux'
WHERE video_source IS NULL
  AND video_asset_id IS NOT NULL
  AND length(btrim(video_asset_id)) > 0;

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_video_source_chk;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_video_source_chk
  CHECK (
    video_source IS NULL
    OR video_source IN ('mux', 'youtube')
  );

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_youtube_video_id_chk;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_youtube_video_id_chk
  CHECK (
    youtube_video_id IS NULL
    OR youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
  );

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_youtube_source_consistency_chk;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_youtube_source_consistency_chk
  CHECK (
    (video_source IS DISTINCT FROM 'youtube')
    OR (
      youtube_video_id IS NOT NULL
      AND length(btrim(youtube_video_id)) = 11
    )
  );

COMMENT ON COLUMN public.lessons.video_source IS
  'مصدر تشغيل الدرس: mux | youtube | null (بدون مصدر نشط).';
COMMENT ON COLUMN public.lessons.youtube_video_id IS
  'معرّف فيديو يوتيوب (11 حرفًا) فقط. لا يُعرَض في lessons_catalog.';

-- لا تُضف youtube_video_id إلى lessons_catalog (الأمان العام).
-- video_source اختياري للموظفين عبر service_role وليس للكتالوج العام.

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
  duration_seconds integer,
  video_source text,
  youtube_video_id text
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
      l.duration_seconds,
      CASE
        WHEN l.video_source = 'youtube'
          AND l.youtube_video_id IS NOT NULL
          AND length(btrim(l.youtube_video_id)) = 11
          THEN 'youtube'
        WHEN l.video_source = 'mux'
          AND l.video_asset_id IS NOT NULL
          AND length(btrim(l.video_asset_id)) > 0
          THEN 'mux'
        WHEN l.video_asset_id IS NOT NULL
          AND length(btrim(l.video_asset_id)) > 0
          THEN 'mux'
        WHEN l.youtube_video_id IS NOT NULL
          AND length(btrim(l.youtube_video_id)) = 11
          THEN 'youtube'
        ELSE 'none'
      END,
      CASE
        WHEN COALESCE(l.video_source, '') = 'youtube'
          OR (
            (l.video_source IS NULL OR l.video_source = 'youtube')
            AND l.youtube_video_id IS NOT NULL
            AND length(btrim(l.youtube_video_id)) = 11
            AND (
              l.video_asset_id IS NULL
              OR length(btrim(l.video_asset_id)) = 0
              OR l.video_source = 'youtube'
            )
          )
          THEN l.youtube_video_id
        ELSE NULL
      END
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

-- إبقاء تقييد الأعمدة الحساسة: لا SELECT/UPDATE لـ authenticated على youtube_video_id
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

REVOKE SELECT (youtube_video_id), INSERT (youtube_video_id), UPDATE (youtube_video_id)
  ON public.lessons FROM PUBLIC, anon, authenticated;

REVOKE SELECT (video_source), INSERT (video_source), UPDATE (video_source)
  ON public.lessons FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.lessons TO postgres, service_role;

DO $acl_check$
BEGIN
  IF position(
    'video_asset_id' IN pg_get_function_result(
      'public.get_lesson_playback_grant(uuid)'::regprocedure
    )
  ) > 0 THEN
    RAISE EXCEPTION 'get_lesson_playback_grant must not expose video_asset_id';
  END IF;

  IF NOT (
    position(
      'youtube_video_id' IN pg_get_function_result(
        'public.get_lesson_playback_grant(uuid)'::regprocedure
      )
    ) > 0
  ) THEN
    RAISE EXCEPTION 'get_lesson_playback_grant must expose youtube_video_id for entitled callers';
  END IF;
END
$acl_check$;

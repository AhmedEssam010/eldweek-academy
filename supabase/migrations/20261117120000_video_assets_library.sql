-- =============================================================================
-- 20261117120000_video_assets_library.sql
-- مكتبة فيديو Mux قابلة لإعادة الاستخدام + ربط الدروس
--
-- لا تُطبَّق هذه الهجرة على الإنتاج إلا بعد موافقة صريحة من المالك.
-- لا تحذف أصول Mux عند تغيير مصدر الدرس.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- video_assets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  mux_asset_id text,
  mux_upload_id text,
  mux_playback_id text,
  status text NOT NULL DEFAULT 'uploading',
  duration_seconds integer,
  thumbnail_url text,
  error_message text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT video_assets_title_nonempty_chk CHECK (length(btrim(title)) >= 1),
  CONSTRAINT video_assets_status_chk CHECK (
    status IN ('uploading', 'processing', 'ready', 'failed')
  ),
  CONSTRAINT video_assets_duration_nonnegative_chk CHECK (
    duration_seconds IS NULL OR duration_seconds >= 0
  ),
  CONSTRAINT video_assets_mux_asset_id_unique UNIQUE (mux_asset_id)
);

CREATE INDEX IF NOT EXISTS video_assets_status_idx
  ON public.video_assets (status);

CREATE INDEX IF NOT EXISTS video_assets_created_at_idx
  ON public.video_assets (created_at DESC);

CREATE INDEX IF NOT EXISTS video_assets_title_lower_idx
  ON public.video_assets (lower(title));

COMMENT ON TABLE public.video_assets IS
  'مكتبة فيديو Mux العامة للمنصة. الحقول الحساسة تُدار عبر service_role فقط.';

CREATE TRIGGER video_assets_set_updated_at
  BEFORE UPDATE ON public.video_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.video_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_assets FORCE ROW LEVEL SECURITY;

-- لا سياسات لـ anon/authenticated: الوصول عبر service_role من الخادم فقط.
REVOKE ALL ON TABLE public.video_assets FROM PUBLIC;
REVOKE ALL ON TABLE public.video_assets FROM anon;
REVOKE ALL ON TABLE public.video_assets FROM authenticated;
GRANT ALL ON TABLE public.video_assets TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- idempotent Mux webhook receipt log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mux_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  video_asset_id uuid REFERENCES public.video_assets (id) ON DELETE SET NULL,
  processed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  payload_digest text
);

REVOKE ALL ON TABLE public.mux_webhook_events FROM PUBLIC;
REVOKE ALL ON TABLE public.mux_webhook_events FROM anon;
REVOKE ALL ON TABLE public.mux_webhook_events FROM authenticated;
GRANT ALL ON TABLE public.mux_webhook_events TO postgres, service_role;

ALTER TABLE public.mux_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mux_webhook_events FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- lessons.video_library_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS video_library_id uuid
    REFERENCES public.video_assets (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lessons_video_library_id_idx
  ON public.lessons (video_library_id)
  WHERE video_library_id IS NOT NULL;

COMMENT ON COLUMN public.lessons.video_library_id IS
  'مرجع إلى مكتبة الفيديو. تغيير المصدر لا يحذف أصل Mux.';

-- إخفاء العمود عن العملاء (نفس نمط video_asset_id)
REVOKE SELECT (video_library_id), INSERT (video_library_id), UPDATE (video_library_id)
  ON public.lessons FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: mux:<id> على الدروس → صفوف مكتبة
-- ---------------------------------------------------------------------------
DO $backfill$
DECLARE
  r RECORD;
  v_new_id uuid;
  v_mux_id text;
  v_title text;
BEGIN
  FOR r IN
    SELECT
      l.id AS lesson_id,
      l.title AS lesson_title,
      l.video_asset_id,
      l.duration_seconds,
      l.video_library_id
    FROM public.lessons AS l
    WHERE l.video_library_id IS NULL
      AND l.video_asset_id IS NOT NULL
      AND l.video_asset_id LIKE 'mux:%'
      AND length(btrim(substring(l.video_asset_id FROM 5))) BETWEEN 8 AND 80
  LOOP
    v_mux_id := btrim(substring(r.video_asset_id FROM 5));
    v_title := COALESCE(NULLIF(btrim(r.lesson_title), ''), 'فيديو مستورد');

    SELECT va.id INTO v_new_id
    FROM public.video_assets AS va
    WHERE va.mux_asset_id = v_mux_id
    LIMIT 1;

    IF v_new_id IS NULL THEN
      INSERT INTO public.video_assets (
        title,
        mux_asset_id,
        status,
        duration_seconds
      )
      VALUES (
        v_title,
        v_mux_id,
        'ready',
        r.duration_seconds
      )
      RETURNING id INTO v_new_id;
    END IF;

    UPDATE public.lessons AS l
    SET
      video_library_id = v_new_id,
      video_source = COALESCE(l.video_source, 'mux')
    WHERE l.id = r.lesson_id;
  END LOOP;
END
$backfill$;

-- ---------------------------------------------------------------------------
-- تحديث منحة التشغيل: اعتبر video_library_id مصدر Mux أيضًا
-- ---------------------------------------------------------------------------
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
        l.video_library_id IS NOT NULL
        OR (
          l.video_asset_id IS NOT NULL
          AND length(btrim(l.video_asset_id)) > 0
        )
      ),
      COALESCE(va.duration_seconds, l.duration_seconds),
      CASE
        WHEN l.video_source = 'youtube'
          AND l.youtube_video_id IS NOT NULL
          AND length(btrim(l.youtube_video_id)) = 11
          THEN 'youtube'
        WHEN l.video_source = 'mux'
          AND (
            l.video_library_id IS NOT NULL
            OR (
              l.video_asset_id IS NOT NULL
              AND length(btrim(l.video_asset_id)) > 0
            )
          )
          THEN 'mux'
        WHEN l.video_library_id IS NOT NULL
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
            AND l.video_library_id IS NULL
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
    LEFT JOIN public.video_assets AS va ON va.id = l.video_library_id
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

DO $assert_acl$
BEGIN
  IF has_column_privilege('anon', 'public.video_assets', 'mux_asset_id', 'SELECT')
     OR has_column_privilege('authenticated', 'public.video_assets', 'mux_asset_id', 'SELECT')
  THEN
    RAISE EXCEPTION 'video_assets must not be readable by anon/authenticated';
  END IF;

  IF has_column_privilege('authenticated', 'public.lessons', 'video_library_id', 'SELECT')
     OR has_column_privilege('authenticated', 'public.lessons', 'video_library_id', 'UPDATE')
  THEN
    RAISE EXCEPTION 'lessons.video_library_id must remain revoked from authenticated';
  END IF;

  IF position(
    'video_asset_id' IN pg_get_function_result(
      'public.get_lesson_playback_grant(uuid)'::regprocedure
    )
  ) > 0 THEN
    RAISE EXCEPTION 'get_lesson_playback_grant must not expose video_asset_id';
  END IF;
END
$assert_acl$;

-- =============================================================================
-- 20261101220008_lesson_progress.sql
-- تقدم الطالب في الدروس
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons (id) ON DELETE CASCADE,
  last_position_seconds integer NOT NULL DEFAULT 0,
  watched_seconds integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT lesson_progress_unique_student_lesson UNIQUE (student_id, lesson_id),
  CONSTRAINT lesson_progress_position_nonnegative_chk CHECK (last_position_seconds >= 0),
  CONSTRAINT lesson_progress_watched_nonnegative_chk CHECK (watched_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS lesson_progress_student_idx
  ON public.lesson_progress (student_id);
CREATE INDEX IF NOT EXISTS lesson_progress_lesson_idx
  ON public.lesson_progress (lesson_id);

DROP TRIGGER IF EXISTS trg_lesson_progress_set_updated_at ON public.lesson_progress;
CREATE TRIGGER trg_lesson_progress_set_updated_at
  BEFORE UPDATE ON public.lesson_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_lesson_progress_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  jwt_role text;
BEGIN
  jwt_role := COALESCE(auth.jwt() ->> 'role', '');

  IF jwt_role = 'service_role' OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.student_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'lesson_progress_owner_mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.student_has_active_enrollment_for_lesson(NEW.lesson_id) THEN
    RAISE EXCEPTION 'lesson_progress_requires_active_access' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.watched_seconds < OLD.watched_seconds THEN
    -- منع تقليل المشاهدة بشكل تعسفي من العميل
    NEW.watched_seconds := OLD.watched_seconds;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_lesson_progress_access() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_lesson_progress_access ON public.lesson_progress;
CREATE TRIGGER trg_enforce_lesson_progress_access
  BEFORE INSERT OR UPDATE ON public.lesson_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_lesson_progress_access();

ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress FORCE ROW LEVEL SECURITY;

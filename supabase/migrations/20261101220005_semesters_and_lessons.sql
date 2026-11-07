-- =============================================================================
-- 20261101220005_semesters_and_lessons.sql
-- الترمات والدروس — مع حماية معرّفات الفيديو
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.course_semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT course_semesters_title_not_blank_chk CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS course_semesters_course_sort_idx
  ON public.course_semesters (course_id, sort_order);

DROP TRIGGER IF EXISTS trg_course_semesters_set_updated_at ON public.course_semesters;
CREATE TRIGGER trg_course_semesters_set_updated_at
  BEFORE UPDATE ON public.course_semesters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id uuid NOT NULL REFERENCES public.course_semesters (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  -- معرّف أصل فيديو خاص؛ لا يُعرَض للعامة ويجب عدم الاعتماد على إخفائه في الواجهة فقط
  video_asset_id text,
  duration_seconds integer,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT lessons_title_not_blank_chk CHECK (length(trim(title)) > 0),
  CONSTRAINT lessons_duration_nonnegative_chk CHECK (
    duration_seconds IS NULL OR duration_seconds >= 0
  )
);

CREATE INDEX IF NOT EXISTS lessons_semester_sort_idx
  ON public.lessons (semester_id, sort_order);
CREATE INDEX IF NOT EXISTS lessons_published_idx
  ON public.lessons (is_published);

DROP TRIGGER IF EXISTS trg_lessons_set_updated_at ON public.lessons;
CREATE TRIGGER trg_lessons_set_updated_at
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- كتالوج عام آمن:
-- security_invoker=false حتى يعمل لـ anon بدون منح SELECT على lessons.
-- التصفية داخل العرض تمنع الدروس الخاصة/غير المنشورة، ولا يشمل video_asset_id.
CREATE OR REPLACE VIEW public.lessons_catalog
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  l.id,
  l.semester_id,
  l.title,
  l.description,
  l.duration_seconds,
  l.sort_order,
  l.is_published,
  l.created_at,
  l.updated_at
FROM public.lessons AS l
INNER JOIN public.course_semesters AS s
  ON s.id = l.semester_id
INNER JOIN public.courses AS c
  ON c.id = s.course_id
WHERE l.is_published = true
  AND c.status = 'published';

COMMENT ON VIEW public.lessons_catalog IS
  'كتالوج عام للدروس المنشورة فقط بدون video_asset_id. يعمل بصلاحية مالك العرض مع security_barrier.';

ALTER TABLE public.course_semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_semesters FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons FORCE ROW LEVEL SECURITY;

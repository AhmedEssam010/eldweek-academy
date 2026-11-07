-- =============================================================================
-- 20261101220013_exams.sql
-- جداول امتحانات MCQ — محلية فقط؛ لا تُطبَّق عن بُعد في هذه المرحلة
-- =============================================================================

DO $$
BEGIN
  CREATE TYPE public.exam_attempt_status AS ENUM (
    'in_progress',
    'submitted',
    'expired',
    'abandoned'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- توسيع audit_action بأحداث الامتحانات (آمن إن وُجدت القيم)
DO $$
BEGIN
  ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'exam_published';
  ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'exam_submitted';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid REFERENCES public.lessons (id) ON DELETE CASCADE,
  semester_id uuid REFERENCES public.course_semesters (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  duration_minutes integer,
  passing_score numeric(5, 2) NOT NULL DEFAULT 50,
  max_attempts integer,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT exams_title_not_blank_chk CHECK (length(trim(title)) > 0),
  CONSTRAINT exams_scope_chk CHECK (
    lesson_id IS NOT NULL OR semester_id IS NOT NULL
  ),
  CONSTRAINT exams_duration_positive_chk CHECK (
    duration_minutes IS NULL OR duration_minutes > 0
  ),
  CONSTRAINT exams_passing_score_chk CHECK (
    passing_score >= 0 AND passing_score <= 100
  ),
  CONSTRAINT exams_max_attempts_positive_chk CHECK (
    max_attempts IS NULL OR max_attempts > 0
  )
);

CREATE INDEX IF NOT EXISTS exams_lesson_idx ON public.exams (lesson_id);
CREATE INDEX IF NOT EXISTS exams_semester_idx ON public.exams (semester_id);
CREATE INDEX IF NOT EXISTS exams_published_idx ON public.exams (is_published);

DROP TRIGGER IF EXISTS trg_exams_set_updated_at ON public.exams;
CREATE TRIGGER trg_exams_set_updated_at
  BEFORE UPDATE ON public.exams
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- اتساق النطاق: إن وُجد lesson_id و semester_id معًا يجب أن ينتمي الدرس للترم
CREATE OR REPLACE FUNCTION public.enforce_exam_scope_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  lesson_semester uuid;
BEGIN
  IF NEW.lesson_id IS NOT NULL THEN
    SELECT l.semester_id INTO lesson_semester
    FROM public.lessons AS l
    WHERE l.id = NEW.lesson_id;

    IF lesson_semester IS NULL THEN
      RAISE EXCEPTION 'exam_lesson_not_found' USING ERRCODE = '23503';
    END IF;

    IF NEW.semester_id IS NULL THEN
      NEW.semester_id := lesson_semester;
    ELSIF NEW.semester_id IS DISTINCT FROM lesson_semester THEN
      RAISE EXCEPTION 'exam_lesson_semester_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_exam_scope_consistency() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_exam_scope_consistency ON public.exams;
CREATE TRIGGER trg_enforce_exam_scope_consistency
  BEFORE INSERT OR UPDATE OF lesson_id, semester_id ON public.exams
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_exam_scope_consistency();

CREATE TABLE IF NOT EXISTS public.exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams (id) ON DELETE CASCADE,
  question_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  points numeric(8, 2) NOT NULL DEFAULT 1,
  CONSTRAINT exam_questions_text_not_blank_chk CHECK (length(trim(question_text)) > 0),
  CONSTRAINT exam_questions_points_positive_chk CHECK (points > 0)
);

CREATE INDEX IF NOT EXISTS exam_questions_exam_sort_idx
  ON public.exam_questions (exam_id, sort_order);

CREATE TABLE IF NOT EXISTS public.exam_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.exam_questions (id) ON DELETE CASCADE,
  option_text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT exam_options_text_not_blank_chk CHECK (length(trim(option_text)) > 0)
);

CREATE INDEX IF NOT EXISTS exam_options_question_sort_idx
  ON public.exam_options (question_id, sort_order);

-- سؤال واحد على الأقل بخيار صحيح واحد عند النشر (يُفرض في workflow النشر)
CREATE UNIQUE INDEX IF NOT EXISTS exam_options_one_correct_per_question_idx
  ON public.exam_options (question_id)
  WHERE is_correct = true;

CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams (id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  -- ينتهي عند started_at + duration من ساعة الخادم (يُحسب عند البدء)
  ends_at timestamptz,
  submitted_at timestamptz,
  score numeric(8, 2),
  status public.exam_attempt_status NOT NULL DEFAULT 'in_progress',
  CONSTRAINT exam_attempts_score_range_chk CHECK (
    score IS NULL OR (score >= 0 AND score <= 100)
  ),
  CONSTRAINT exam_attempts_submitted_fields_chk CHECK (
    (
      status = 'submitted'
      AND submitted_at IS NOT NULL
      AND score IS NOT NULL
    )
    OR (
      status <> 'submitted'
      AND (score IS NULL OR status IN ('expired', 'abandoned'))
    )
  )
);

CREATE INDEX IF NOT EXISTS exam_attempts_exam_student_idx
  ON public.exam_attempts (exam_id, student_id, started_at DESC);
CREATE INDEX IF NOT EXISTS exam_attempts_student_idx
  ON public.exam_attempts (student_id, started_at DESC);
CREATE INDEX IF NOT EXISTS exam_attempts_status_idx
  ON public.exam_attempts (status);

-- محاولة واحدة قيد التنفيذ لكل طالب/امتحان
CREATE UNIQUE INDEX IF NOT EXISTS exam_attempts_one_in_progress_idx
  ON public.exam_attempts (exam_id, student_id)
  WHERE status = 'in_progress';

CREATE TABLE IF NOT EXISTS public.exam_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts (id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.exam_questions (id) ON DELETE CASCADE,
  selected_option_id uuid REFERENCES public.exam_options (id) ON DELETE RESTRICT,
  is_correct boolean,
  awarded_points numeric(8, 2) NOT NULL DEFAULT 0,
  CONSTRAINT exam_answers_unique_question_per_attempt UNIQUE (attempt_id, question_id),
  CONSTRAINT exam_answers_points_nonnegative_chk CHECK (awarded_points >= 0)
);

CREATE INDEX IF NOT EXISTS exam_answers_attempt_idx
  ON public.exam_answers (attempt_id);

-- مساعد: اشتقاق course_id من نطاق الصف (lesson/semester) دون الاعتماد على صف exams موجود.
-- ضروري لـ INSERT RLS لأن exam_course_id(id) يفشل قبل اكتمال الإدراج.
CREATE OR REPLACE FUNCTION public.exam_course_id_from_scope(
  p_lesson_id uuid,
  p_semester_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (
      SELECT s.course_id
      FROM public.course_semesters AS s
      WHERE s.id = p_semester_id
    ),
    (
      SELECT s.course_id
      FROM public.lessons AS l
      INNER JOIN public.course_semesters AS s ON s.id = l.semester_id
      WHERE l.id = p_lesson_id
    )
  );
$$;

-- مساعد: استخراج course_id من امتحان موجود
CREATE OR REPLACE FUNCTION public.exam_course_id(p_exam_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.exam_course_id_from_scope(e.lesson_id, e.semester_id)
  FROM public.exams AS e
  WHERE e.id = p_exam_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.student_has_active_enrollment_for_exam(p_exam_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exams AS e
    WHERE e.id = p_exam_id
      AND e.is_published = true
      AND (
        (e.lesson_id IS NOT NULL AND public.student_has_active_enrollment_for_lesson(e.lesson_id))
        OR (
          e.semester_id IS NOT NULL
          AND public.student_has_active_enrollment_for_semester(e.semester_id)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.exam_course_id_from_scope(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exam_course_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_has_active_enrollment_for_exam(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_course_id_from_scope(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exam_course_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.student_has_active_enrollment_for_exam(uuid)
  TO authenticated, service_role;

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams FORCE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.exam_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_options FORCE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_answers FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- 20261111130000_homework_system.sql
-- نظام الواجبات (منفصل عن الامتحانات) — أسئلة MCQ / صح-خطأ / مقالي
-- لا تُطبَّق على الإنتاج إلا يدويًا بعد مراجعة المالك.
-- يعيد استخدام: exam_question_type, exam_attempt_status, exam_grading_status
-- =============================================================================

DO $$
BEGIN
  ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'homework_published';
  ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'homework_submitted';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.homeworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  semester_id uuid NOT NULL REFERENCES public.course_semesters (id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  max_attempts integer,
  available_from timestamptz,
  due_at timestamptz,
  feedback_release_policy text NOT NULL DEFAULT 'on_finalize',
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT homeworks_title_not_blank_chk CHECK (length(trim(title)) > 0),
  CONSTRAINT homeworks_max_attempts_chk CHECK (
    max_attempts IS NULL OR max_attempts IN (1, 2, 3)
  ),
  CONSTRAINT homeworks_feedback_policy_chk CHECK (
    feedback_release_policy IN ('on_finalize', 'after_due', 'never')
  ),
  CONSTRAINT homeworks_due_after_available_chk CHECK (
    available_from IS NULL
    OR due_at IS NULL
    OR due_at >= available_from
  )
);

CREATE INDEX IF NOT EXISTS homeworks_course_idx ON public.homeworks (course_id);
CREATE INDEX IF NOT EXISTS homeworks_semester_idx ON public.homeworks (semester_id);
CREATE INDEX IF NOT EXISTS homeworks_published_idx ON public.homeworks (is_published);

DROP TRIGGER IF EXISTS trg_homeworks_set_updated_at ON public.homeworks;
CREATE TRIGGER trg_homeworks_set_updated_at
  BEFORE UPDATE ON public.homeworks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.homeworks_enforce_semester_course()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_course uuid;
BEGIN
  SELECT s.course_id INTO v_course
  FROM public.course_semesters AS s
  WHERE s.id = NEW.semester_id;

  IF v_course IS NULL THEN
    RAISE EXCEPTION 'homework_semester_not_found' USING ERRCODE = '23503';
  END IF;
  IF NEW.course_id IS DISTINCT FROM v_course THEN
    RAISE EXCEPTION 'homework_semester_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_homeworks_enforce_semester ON public.homeworks;
CREATE TRIGGER trg_homeworks_enforce_semester
  BEFORE INSERT OR UPDATE OF course_id, semester_id
  ON public.homeworks
  FOR EACH ROW
  EXECUTE FUNCTION public.homeworks_enforce_semester_course();

CREATE TABLE IF NOT EXISTS public.homework_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id uuid NOT NULL REFERENCES public.homeworks (id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type public.exam_question_type NOT NULL DEFAULT 'mcq',
  sort_order integer NOT NULL DEFAULT 0,
  points numeric(8, 2) NOT NULL DEFAULT 1,
  CONSTRAINT homework_questions_text_not_blank_chk CHECK (length(trim(question_text)) > 0),
  CONSTRAINT homework_questions_points_positive_chk CHECK (points > 0)
);

CREATE INDEX IF NOT EXISTS homework_questions_hw_sort_idx
  ON public.homework_questions (homework_id, sort_order);

CREATE TABLE IF NOT EXISTS public.homework_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.homework_questions (id) ON DELETE CASCADE,
  option_text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT homework_options_text_not_blank_chk CHECK (length(trim(option_text)) > 0)
);

CREATE INDEX IF NOT EXISTS homework_options_question_idx
  ON public.homework_options (question_id, sort_order);

CREATE TABLE IF NOT EXISTS public.homework_question_guides (
  question_id uuid PRIMARY KEY REFERENCES public.homework_questions (id) ON DELETE CASCADE,
  model_answer text,
  CONSTRAINT homework_question_guides_model_not_blank_chk
    CHECK (model_answer IS NULL OR length(trim(model_answer)) > 0)
);

CREATE TABLE IF NOT EXISTS public.homework_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id uuid NOT NULL REFERENCES public.homeworks (id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  status public.exam_attempt_status NOT NULL DEFAULT 'in_progress',
  grading_status public.exam_grading_status NOT NULL DEFAULT 'not_applicable',
  score numeric(8, 2),
  objective_earned numeric(10, 2),
  essay_earned numeric(10, 2),
  total_points numeric(10, 2),
  started_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  submitted_at timestamptz,
  graded_at timestamptz,
  graded_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  results_released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT homework_attempts_number_positive_chk CHECK (attempt_number >= 1),
  CONSTRAINT homework_attempts_score_range_chk CHECK (
    score IS NULL OR (score >= 0 AND score <= 100)
  ),
  CONSTRAINT homework_attempts_fields_chk CHECK (
    (status = 'in_progress' AND submitted_at IS NULL AND score IS NULL
      AND grading_status = 'not_applicable')
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND (
      (grading_status = 'not_applicable' AND score IS NOT NULL)
      OR (grading_status IN ('awaiting_essay', 'draft') AND score IS NULL)
      OR (grading_status = 'finalized' AND score IS NOT NULL AND results_released_at IS NOT NULL)
    ))
    OR (status IN ('expired', 'abandoned')
      AND grading_status IN ('not_applicable', 'finalized'))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS homework_attempts_open_uidx
  ON public.homework_attempts (homework_id, student_id)
  WHERE status = 'in_progress';

CREATE UNIQUE INDEX IF NOT EXISTS homework_attempts_number_uidx
  ON public.homework_attempts (homework_id, student_id, attempt_number);

CREATE INDEX IF NOT EXISTS homework_attempts_homework_idx
  ON public.homework_attempts (homework_id, status, grading_status);

CREATE INDEX IF NOT EXISTS homework_attempts_student_idx
  ON public.homework_attempts (student_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.homework_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.homework_attempts (id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.homework_questions (id) ON DELETE RESTRICT,
  selected_option_id uuid REFERENCES public.homework_options (id) ON DELETE SET NULL,
  is_correct boolean,
  awarded_points numeric(8, 2),
  essay_text text,
  teacher_feedback text,
  question_type_snapshot public.exam_question_type,
  question_text_snapshot text,
  points_snapshot numeric(8, 2),
  sort_order_snapshot integer,
  graded_at timestamptz,
  CONSTRAINT homework_answers_points_nonnegative_chk
    CHECK (awarded_points IS NULL OR awarded_points >= 0),
  CONSTRAINT homework_answers_points_lte_snapshot_chk
    CHECK (
      awarded_points IS NULL
      OR points_snapshot IS NULL
      OR awarded_points <= points_snapshot
    ),
  CONSTRAINT homework_answers_attempt_question_uidx UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS homework_answers_attempt_idx
  ON public.homework_answers (attempt_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.homework_course_id(p_homework_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT h.course_id FROM public.homeworks AS h WHERE h.id = p_homework_id;
$$;

CREATE OR REPLACE FUNCTION public.student_has_active_enrollment_for_homework(p_homework_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.student_has_active_enrollment_for_course(
    public.homework_course_id(p_homework_id)
  );
$$;

REVOKE ALL ON FUNCTION public.homework_course_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_has_active_enrollment_for_homework(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.homework_course_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.student_has_active_enrollment_for_homework(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.homeworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeworks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.homework_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.homework_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_options FORCE ROW LEVEL SECURITY;
ALTER TABLE public.homework_question_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_question_guides FORCE ROW LEVEL SECURITY;
ALTER TABLE public.homework_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.homework_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_answers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS homeworks_staff_all ON public.homeworks;
CREATE POLICY homeworks_staff_all
  ON public.homeworks FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.teacher_has_course_permission(course_id, false, true, false)
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.teacher_has_course_permission(course_id, false, true, false)
  );

DROP POLICY IF EXISTS homeworks_student_published_read ON public.homeworks;
CREATE POLICY homeworks_student_published_read
  ON public.homeworks FOR SELECT TO authenticated
  USING (
    is_published = true
    AND public.student_has_active_enrollment_for_course(course_id)
  );

DROP POLICY IF EXISTS homeworks_public_title_published ON public.homeworks;
CREATE POLICY homeworks_public_title_published
  ON public.homeworks FOR SELECT TO authenticated, anon
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM public.courses AS c
      WHERE c.id = homeworks.course_id AND c.status = 'published'
    )
  );

DROP POLICY IF EXISTS homework_questions_staff ON public.homework_questions;
CREATE POLICY homework_questions_staff
  ON public.homework_questions FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.teacher_has_course_permission(
      public.homework_course_id(homework_id), false, true, false
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.teacher_has_course_permission(
      public.homework_course_id(homework_id), false, true, false
    )
  );

DROP POLICY IF EXISTS homework_questions_enrolled_read ON public.homework_questions;
CREATE POLICY homework_questions_enrolled_read
  ON public.homework_questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.homeworks AS h
      WHERE h.id = homework_id
        AND h.is_published = true
        AND public.student_has_active_enrollment_for_course(h.course_id)
    )
  );

DROP POLICY IF EXISTS homework_options_staff ON public.homework_options;
CREATE POLICY homework_options_staff
  ON public.homework_options FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.homework_questions AS q
      WHERE q.id = question_id
        AND public.teacher_has_course_permission(
          public.homework_course_id(q.homework_id), false, true, false
        )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.homework_questions AS q
      WHERE q.id = question_id
        AND public.teacher_has_course_permission(
          public.homework_course_id(q.homework_id), false, true, false
        )
    )
  );

-- الطلاب يرون نصوص الخيارات فقط عبر دوال/تحديد أعمدة — بدون is_correct في المنح أدناه
DROP POLICY IF EXISTS homework_options_enrolled_read ON public.homework_options;
CREATE POLICY homework_options_enrolled_read
  ON public.homework_options FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.homework_questions AS q
      JOIN public.homeworks AS h ON h.id = q.homework_id
      WHERE q.id = question_id
        AND h.is_published = true
        AND public.student_has_active_enrollment_for_course(h.course_id)
    )
  );

DROP POLICY IF EXISTS homework_guides_staff ON public.homework_question_guides;
CREATE POLICY homework_guides_staff
  ON public.homework_question_guides FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.homework_questions AS q
      WHERE q.id = question_id
        AND public.teacher_has_course_permission(
          public.homework_course_id(q.homework_id), false, true, false
        )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.homework_questions AS q
      WHERE q.id = question_id
        AND public.teacher_has_course_permission(
          public.homework_course_id(q.homework_id), false, true, false
        )
    )
  );

DROP POLICY IF EXISTS homework_attempts_staff ON public.homework_attempts;
CREATE POLICY homework_attempts_staff
  ON public.homework_attempts FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.teacher_has_course_permission(
      public.homework_course_id(homework_id), false, true, false
    )
  );

DROP POLICY IF EXISTS homework_attempts_own ON public.homework_attempts;
CREATE POLICY homework_attempts_own
  ON public.homework_attempts FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS homework_answers_staff ON public.homework_answers;
CREATE POLICY homework_answers_staff
  ON public.homework_answers FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.homework_attempts AS a
      WHERE a.id = attempt_id
        AND public.teacher_has_course_permission(
          public.homework_course_id(a.homework_id), false, true, false
        )
    )
  );

DROP POLICY IF EXISTS homework_answers_own ON public.homework_answers;
CREATE POLICY homework_answers_own
  ON public.homework_answers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.homework_attempts AS a
      WHERE a.id = attempt_id AND a.student_id = (SELECT auth.uid())
    )
  );

-- Grants
REVOKE ALL ON TABLE public.homeworks FROM PUBLIC, anon;
GRANT SELECT (
  id, course_id, semester_id, title, description, max_attempts,
  available_from, due_at, feedback_release_policy, is_published, created_at, updated_at
) ON public.homeworks TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.homeworks TO authenticated;
GRANT ALL ON TABLE public.homeworks TO postgres, service_role;

REVOKE ALL ON TABLE public.homework_questions FROM PUBLIC, anon;
GRANT SELECT (
  id, homework_id, question_text, question_type, sort_order, points
) ON public.homework_questions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.homework_questions TO authenticated;
GRANT ALL ON TABLE public.homework_questions TO postgres, service_role;

REVOKE ALL ON TABLE public.homework_options FROM PUBLIC, anon;
-- is_correct للطاقم فقط عبر service أو سياسات الكتابة؛ امنح للـ authenticated ثم أخفِ في واجهة الطالب
GRANT SELECT (id, question_id, option_text, sort_order) ON public.homework_options TO authenticated;
GRANT SELECT (is_correct) ON public.homework_options TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.homework_options TO authenticated;
GRANT ALL ON TABLE public.homework_options TO postgres, service_role;

REVOKE ALL ON TABLE public.homework_question_guides FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework_question_guides TO authenticated;
GRANT ALL ON TABLE public.homework_question_guides TO postgres, service_role;

REVOKE ALL ON TABLE public.homework_attempts FROM PUBLIC, anon;
GRANT SELECT ON public.homework_attempts TO authenticated;
GRANT ALL ON TABLE public.homework_attempts TO postgres, service_role;

REVOKE ALL ON TABLE public.homework_answers FROM PUBLIC, anon;
GRANT SELECT ON public.homework_answers TO authenticated;
GRANT ALL ON TABLE public.homework_answers TO postgres, service_role;

ALTER FUNCTION public.homeworks_enforce_semester_course() OWNER TO postgres;
ALTER FUNCTION public.homework_course_id(uuid) OWNER TO postgres;
ALTER FUNCTION public.student_has_active_enrollment_for_homework(uuid) OWNER TO postgres;

-- =============================================================================
-- 20261109140000_exam_question_types_and_essay_grading.sql
-- أنواع أسئلة: mcq / true_false / essay + تصحيح مقالي يدوي
-- لا تُطبَّق على الإنتاج إلا بعد موافقة صريحة.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'exam_question_type'
  ) THEN
    CREATE TYPE public.exam_question_type AS ENUM ('mcq', 'true_false', 'essay');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'exam_grading_status'
  ) THEN
    CREATE TYPE public.exam_grading_status AS ENUM (
      'not_applicable',
      'awaiting_essay',
      'draft',
      'finalized'
    );
  END IF;
END
$$;

ALTER TABLE public.exam_questions
  ADD COLUMN IF NOT EXISTS question_type public.exam_question_type NOT NULL DEFAULT 'mcq';

-- إرشاد التصحيح / نموذج الإجابة — جدول منفصل بحماية RLS للطاقم فقط
CREATE TABLE IF NOT EXISTS public.exam_question_guides (
  question_id uuid PRIMARY KEY REFERENCES public.exam_questions (id) ON DELETE CASCADE,
  model_answer text,
  CONSTRAINT exam_question_guides_model_not_blank_chk
    CHECK (model_answer IS NULL OR length(trim(model_answer)) > 0)
);

ALTER TABLE public.exam_question_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_question_guides_staff ON public.exam_question_guides;
CREATE POLICY exam_question_guides_staff
  ON public.exam_question_guides
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.exam_questions AS q
      WHERE q.id = question_id
        AND public.teacher_has_course_permission(
          public.exam_course_id(q.exam_id), false, true, false
        )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.exam_questions AS q
      WHERE q.id = question_id
        AND public.teacher_has_course_permission(
          public.exam_course_id(q.exam_id), false, true, false
        )
    )
  );

REVOKE ALL ON TABLE public.exam_question_guides FROM PUBLIC;
REVOKE ALL ON TABLE public.exam_question_guides FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exam_question_guides TO authenticated;
GRANT ALL ON TABLE public.exam_question_guides TO postgres, service_role;

ALTER TABLE public.exam_answers
  ADD COLUMN IF NOT EXISTS essay_text text;

ALTER TABLE public.exam_answers
  ADD COLUMN IF NOT EXISTS teacher_feedback text;

ALTER TABLE public.exam_answers
  ADD COLUMN IF NOT EXISTS question_type_snapshot public.exam_question_type;

ALTER TABLE public.exam_answers
  ADD COLUMN IF NOT EXISTS question_text_snapshot text;

ALTER TABLE public.exam_answers
  ADD COLUMN IF NOT EXISTS points_snapshot numeric(8, 2);

ALTER TABLE public.exam_answers
  ADD COLUMN IF NOT EXISTS sort_order_snapshot integer;

ALTER TABLE public.exam_answers
  ADD COLUMN IF NOT EXISTS graded_at timestamptz;

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS grading_status public.exam_grading_status NOT NULL DEFAULT 'not_applicable';

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS objective_earned numeric(10, 2);

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS essay_earned numeric(10, 2);

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS total_points numeric(10, 2);

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS graded_at timestamptz;

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS graded_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS results_released_at timestamptz;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS release_model_answers boolean NOT NULL DEFAULT false;

-- توافق: awarded_points قد تكون NULL للمقال غير المصحَّح
ALTER TABLE public.exam_answers
  ALTER COLUMN awarded_points DROP NOT NULL;

ALTER TABLE public.exam_answers
  DROP CONSTRAINT IF EXISTS exam_answers_points_nonnegative_chk;

ALTER TABLE public.exam_answers
  ADD CONSTRAINT exam_answers_points_nonnegative_chk
  CHECK (awarded_points IS NULL OR awarded_points >= 0);

ALTER TABLE public.exam_answers
  DROP CONSTRAINT IF EXISTS exam_answers_points_lte_snapshot_chk;

ALTER TABLE public.exam_answers
  ADD CONSTRAINT exam_answers_points_lte_snapshot_chk
  CHECK (
    awarded_points IS NULL
    OR points_snapshot IS NULL
    OR awarded_points <= points_snapshot
  );

-- فك قيد التسليم القديم الذي يفرض score عند submitted
ALTER TABLE public.exam_attempts
  DROP CONSTRAINT IF EXISTS exam_attempts_submitted_fields_chk;

ALTER TABLE public.exam_attempts
  ADD CONSTRAINT exam_attempts_submitted_fields_chk
  CHECK (
    (
      status = 'in_progress'
      AND submitted_at IS NULL
      AND score IS NULL
      AND grading_status = 'not_applicable'
    )
    OR (
      status = 'submitted'
      AND submitted_at IS NOT NULL
      AND (
        (
          grading_status = 'not_applicable'
          AND score IS NOT NULL
        )
        OR (
          grading_status IN ('awaiting_essay', 'draft')
          AND score IS NULL
        )
        OR (
          grading_status = 'finalized'
          AND score IS NOT NULL
          AND results_released_at IS NOT NULL
        )
      )
    )
    OR (
      status IN ('expired', 'abandoned')
      AND grading_status IN ('not_applicable', 'finalized')
    )
  );

-- تقييد أعمدة الأسئلة: لا يُعرَض model عبر الجدول الأساسي (الدليل في جدول منفصل)
REVOKE ALL ON TABLE public.exam_questions FROM authenticated;
GRANT SELECT (
  id,
  exam_id,
  question_text,
  sort_order,
  points,
  question_type
) ON public.exam_questions TO authenticated;
GRANT INSERT (
  id,
  exam_id,
  question_text,
  sort_order,
  points,
  question_type
) ON public.exam_questions TO authenticated;
GRANT UPDATE (
  question_text,
  sort_order,
  points,
  question_type
) ON public.exam_questions TO authenticated;
GRANT DELETE ON public.exam_questions TO authenticated;

-- أعمدة إجابات آمنة للقراءة عبر RLS (بدون is_correct — يُعاد عبر RPC المراجعة بعد النشر)
REVOKE ALL ON TABLE public.exam_answers FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.exam_answers FROM authenticated;
GRANT SELECT (
  id,
  attempt_id,
  question_id,
  selected_option_id,
  awarded_points,
  essay_text,
  teacher_feedback,
  question_type_snapshot,
  question_text_snapshot,
  points_snapshot,
  graded_at,
  sort_order_snapshot
) ON public.exam_answers TO authenticated;

-- ---------------------------------------------------------------------------
-- تسليم محدّث: يصحح الموضوعي ويُبقي المقال بانتظار التصحيح
-- يجب DROP أولًا لأن نوع الإرجاع تغيّر (أُضيف grading_status)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_exam_attempt(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
  p_attempt_id uuid,
  p_answers jsonb
)
RETURNS TABLE (
  attempt_id uuid,
  score numeric,
  status public.exam_attempt_status,
  passed boolean,
  grading_status public.exam_grading_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_attempt public.exam_attempts%ROWTYPE;
  v_exam public.exams%ROWTYPE;
  v_total_points numeric := 0;
  v_objective_earned numeric := 0;
  v_score numeric := 0;
  v_item jsonb;
  v_question public.exam_questions%ROWTYPE;
  v_question_id uuid;
  v_option_id uuid;
  v_essay text;
  v_is_correct boolean;
  v_points numeric;
  v_payload_count integer;
  v_distinct_count integer;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_has_essay boolean := false;
  v_grading public.exam_grading_status;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.student_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE = '42501';
  END IF;

  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'attempt_already_closed' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = v_attempt.exam_id FOR SHARE;

  IF v_attempt.ends_at IS NOT NULL
     AND v_attempt.ends_at < timezone('utc', now()) THEN
    UPDATE public.exam_attempts
    SET status = 'expired',
        submitted_at = timezone('utc', now()),
        score = 0,
        grading_status = 'not_applicable',
        objective_earned = 0,
        essay_earned = 0,
        total_points = (
          SELECT COALESCE(sum(q.points), 0)
          FROM public.exam_questions AS q
          WHERE q.exam_id = v_attempt.exam_id
        ),
        results_released_at = timezone('utc', now())
    WHERE id = p_attempt_id;

    attempt_id := p_attempt_id;
    score := 0;
    status := 'expired';
    passed := false;
    grading_status := 'not_applicable';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT count(*), count(DISTINCT elem ->> 'question_id')
  INTO v_payload_count, v_distinct_count
  FROM jsonb_array_elements(COALESCE(p_answers, '[]'::jsonb)) AS elem;

  IF v_payload_count IS DISTINCT FROM v_distinct_count THEN
    RAISE EXCEPTION 'duplicate_question_answers' USING ERRCODE = '23505';
  END IF;

  SELECT COALESCE(sum(q.points), 0) INTO v_total_points
  FROM public.exam_questions AS q
  WHERE q.exam_id = v_attempt.exam_id;

  IF v_total_points <= 0 THEN
    RAISE EXCEPTION 'exam_has_no_questions' USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.exam_questions AS q
    WHERE q.exam_id = v_attempt.exam_id AND q.question_type = 'essay'
  ) INTO v_has_essay;

  DELETE FROM public.exam_answers WHERE attempt_id = p_attempt_id;

  FOR v_item IN
    SELECT * FROM jsonb_array_elements(COALESCE(p_answers, '[]'::jsonb))
  LOOP
    v_question_id := (v_item ->> 'question_id')::uuid;
    v_option_id := NULLIF(v_item ->> 'selected_option_id', '')::uuid;
    v_essay := NULLIF(btrim(COALESCE(v_item ->> 'essay_text', '')), '');

    IF v_question_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'duplicate_question_answers' USING ERRCODE = '23505';
    END IF;
    v_seen := array_append(v_seen, v_question_id);

    SELECT * INTO v_question
    FROM public.exam_questions
    WHERE id = v_question_id AND exam_id = v_attempt.exam_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'answer_question_not_in_exam' USING ERRCODE = '23514';
    END IF;

    v_points := v_question.points;

    IF v_question.question_type = 'essay' THEN
      INSERT INTO public.exam_answers (
        attempt_id,
        question_id,
        selected_option_id,
        is_correct,
        awarded_points,
        essay_text,
        question_type_snapshot,
        question_text_snapshot,
        points_snapshot,
        sort_order_snapshot
      )
      VALUES (
        p_attempt_id,
        v_question_id,
        NULL,
        NULL,
        NULL,
        v_essay,
        v_question.question_type,
        v_question.question_text,
        v_points,
        v_question.sort_order
      );
    ELSE
      IF v_option_id IS NOT NULL THEN
        SELECT o.is_correct
        INTO v_is_correct
        FROM public.exam_options AS o
        WHERE o.id = v_option_id
          AND o.question_id = v_question_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'selected_option_mismatch' USING ERRCODE = '23514';
        END IF;
      ELSE
        v_is_correct := false;
      END IF;

      INSERT INTO public.exam_answers (
        attempt_id,
        question_id,
        selected_option_id,
        is_correct,
        awarded_points,
        essay_text,
        question_type_snapshot,
        question_text_snapshot,
        points_snapshot,
        sort_order_snapshot
      )
      VALUES (
        p_attempt_id,
        v_question_id,
        v_option_id,
        COALESCE(v_is_correct, false),
        CASE WHEN COALESCE(v_is_correct, false) THEN v_points ELSE 0 END,
        NULL,
        v_question.question_type,
        v_question.question_text,
        v_points,
        v_question.sort_order
      );

      IF COALESCE(v_is_correct, false) THEN
        v_objective_earned := v_objective_earned + v_points;
      END IF;
    END IF;
  END LOOP;

  -- أدخل إجابات فارغة للأسئلة غير المُجابة للحفاظ على اللقطة التاريخية
  INSERT INTO public.exam_answers (
    attempt_id,
    question_id,
    selected_option_id,
    is_correct,
    awarded_points,
    essay_text,
    question_type_snapshot,
    question_text_snapshot,
    points_snapshot,
    sort_order_snapshot
  )
  SELECT
    p_attempt_id,
    q.id,
    NULL,
    CASE WHEN q.question_type = 'essay' THEN NULL ELSE false END,
    CASE WHEN q.question_type = 'essay' THEN NULL ELSE 0 END,
    NULL,
    q.question_type,
    q.question_text,
    q.points,
    q.sort_order
  FROM public.exam_questions AS q
  WHERE q.exam_id = v_attempt.exam_id
    AND NOT (q.id = ANY (v_seen));

  IF v_has_essay THEN
    v_grading := 'awaiting_essay';
    UPDATE public.exam_attempts
    SET status = 'submitted',
        submitted_at = timezone('utc', now()),
        score = NULL,
        grading_status = v_grading,
        objective_earned = v_objective_earned,
        essay_earned = NULL,
        total_points = v_total_points,
        results_released_at = NULL
    WHERE id = p_attempt_id
      AND status = 'in_progress';
  ELSE
    v_grading := 'not_applicable';
    v_score := round((v_objective_earned / v_total_points) * 100, 2);
    UPDATE public.exam_attempts
    SET status = 'submitted',
        submitted_at = timezone('utc', now()),
        score = v_score,
        grading_status = v_grading,
        objective_earned = v_objective_earned,
        essay_earned = 0,
        total_points = v_total_points,
        results_released_at = timezone('utc', now())
    WHERE id = p_attempt_id
      AND status = 'in_progress';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_already_closed' USING ERRCODE = '23514';
  END IF;

  attempt_id := p_attempt_id;
  score := CASE WHEN v_has_essay THEN NULL ELSE v_score END;
  status := 'submitted';
  passed := CASE
    WHEN v_has_essay THEN NULL
    ELSE v_score >= v_exam.passing_score
  END;
  grading_status := v_grading;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- حفظ مسودة تصحيح مقالات
-- p_grades: [{ answer_id, awarded_points, teacher_feedback }]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_exam_essay_grades_draft(
  p_attempt_id uuid,
  p_grades jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_attempt public.exam_attempts%ROWTYPE;
  v_course uuid;
  v_item jsonb;
  v_answer_id uuid;
  v_points numeric;
  v_feedback text;
  v_max numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attempt.status <> 'submitted'
     OR v_attempt.grading_status NOT IN ('awaiting_essay', 'draft') THEN
    RAISE EXCEPTION 'attempt_not_gradable' USING ERRCODE = '23514';
  END IF;

  v_course := public.exam_course_id(v_attempt.exam_id);
  IF NOT (
    public.is_super_admin()
    OR public.teacher_has_course_permission(v_course, false, true, false)
  ) THEN
    RAISE EXCEPTION 'grading_forbidden' USING ERRCODE = '42501';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_grades, '[]'::jsonb))
  LOOP
    v_answer_id := (v_item ->> 'answer_id')::uuid;
    v_points := (v_item ->> 'awarded_points')::numeric;
    v_feedback := NULLIF(btrim(COALESCE(v_item ->> 'teacher_feedback', '')), '');

    SELECT a.points_snapshot INTO v_max
    FROM public.exam_answers AS a
    WHERE a.id = v_answer_id
      AND a.attempt_id = p_attempt_id
      AND a.question_type_snapshot = 'essay'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'essay_answer_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_points IS NULL OR v_points < 0 OR v_points > COALESCE(v_max, 0) THEN
      RAISE EXCEPTION 'invalid_essay_points' USING ERRCODE = '23514';
    END IF;

    UPDATE public.exam_answers
    SET awarded_points = v_points,
        teacher_feedback = v_feedback,
        graded_at = timezone('utc', now())
    WHERE id = v_answer_id;
  END LOOP;

  UPDATE public.exam_attempts
  SET grading_status = 'draft'
  WHERE id = p_attempt_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- اعتماد التصحيح ونشر النتيجة — ذري
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_exam_grading(p_attempt_id uuid)
RETURNS TABLE (
  attempt_id uuid,
  score numeric,
  passed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_attempt public.exam_attempts%ROWTYPE;
  v_exam public.exams%ROWTYPE;
  v_course uuid;
  v_ungraded integer;
  v_objective numeric := 0;
  v_essay numeric := 0;
  v_total numeric := 0;
  v_score numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attempt.grading_status = 'finalized' THEN
    attempt_id := v_attempt.id;
    score := v_attempt.score;
    passed := v_attempt.score >= (
      SELECT e.passing_score FROM public.exams AS e WHERE e.id = v_attempt.exam_id
    );
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_attempt.status <> 'submitted'
     OR v_attempt.grading_status NOT IN ('awaiting_essay', 'draft') THEN
    RAISE EXCEPTION 'attempt_not_gradable' USING ERRCODE = '23514';
  END IF;

  v_course := public.exam_course_id(v_attempt.exam_id);
  IF NOT (
    public.is_super_admin()
    OR public.teacher_has_course_permission(v_course, false, true, false)
  ) THEN
    RAISE EXCEPTION 'grading_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_ungraded
  FROM public.exam_answers AS a
  WHERE a.attempt_id = p_attempt_id
    AND a.question_type_snapshot = 'essay'
    AND a.awarded_points IS NULL;

  IF v_ungraded > 0 THEN
    RAISE EXCEPTION 'essays_incomplete' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = v_attempt.exam_id;

  SELECT COALESCE(sum(a.awarded_points), 0) INTO v_objective
  FROM public.exam_answers AS a
  WHERE a.attempt_id = p_attempt_id
    AND a.question_type_snapshot IN ('mcq', 'true_false');

  SELECT COALESCE(sum(a.awarded_points), 0) INTO v_essay
  FROM public.exam_answers AS a
  WHERE a.attempt_id = p_attempt_id
    AND a.question_type_snapshot = 'essay';

  v_total := COALESCE(v_attempt.total_points, 0);
  IF v_total <= 0 THEN
    SELECT COALESCE(sum(q.points), 0) INTO v_total
    FROM public.exam_questions AS q
    WHERE q.exam_id = v_attempt.exam_id;
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'exam_has_no_questions' USING ERRCODE = '23514';
  END IF;

  v_score := round(((v_objective + v_essay) / v_total) * 100, 2);

  UPDATE public.exam_attempts
  SET grading_status = 'finalized',
      score = v_score,
      objective_earned = v_objective,
      essay_earned = v_essay,
      total_points = v_total,
      graded_at = timezone('utc', now()),
      graded_by = v_uid,
      results_released_at = timezone('utc', now())
  WHERE id = p_attempt_id
    AND grading_status IN ('awaiting_essay', 'draft');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_already_closed' USING ERRCODE = '23514';
  END IF;

  attempt_id := p_attempt_id;
  score := v_score;
  passed := v_score >= v_exam.passing_score;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_exam_essay_grades_draft(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_exam_grading(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_exam_essay_grades_draft(uuid, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_exam_grading(uuid)
  TO authenticated, service_role;

ALTER FUNCTION public.submit_exam_attempt(uuid, jsonb) OWNER TO postgres;
ALTER FUNCTION public.save_exam_essay_grades_draft(uuid, jsonb) OWNER TO postgres;
ALTER FUNCTION public.finalize_exam_grading(uuid) OWNER TO postgres;

-- ---------------------------------------------------------------------------
-- مراجعة الطالب بعد نشر النتيجة
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_exam_attempt_review(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_attempt public.exam_attempts%ROWTYPE;
  v_exam public.exams%ROWTYPE;
  v_payload jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attempt.student_id IS DISTINCT FROM v_uid AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'review_forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_attempt.results_released_at IS NULL
     OR v_attempt.grading_status NOT IN ('not_applicable', 'finalized') THEN
    RETURN jsonb_build_object(
      'released', false,
      'grading_status', v_attempt.grading_status,
      'message', 'النتيجة لم تُنشر بعد.'
    );
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = v_attempt.exam_id;

  SELECT jsonb_build_object(
    'released', true,
    'attempt_id', v_attempt.id,
    'exam_id', v_attempt.exam_id,
    'exam_title', v_exam.title,
    'score', v_attempt.score,
    'passing_score', v_exam.passing_score,
    'passed', v_attempt.score >= v_exam.passing_score,
    'grading_status', v_attempt.grading_status,
    'objective_earned', v_attempt.objective_earned,
    'essay_earned', v_attempt.essay_earned,
    'total_points', v_attempt.total_points,
    'release_model_answers', v_exam.release_model_answers,
    'answers', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'answer_id', a.id,
          'question_id', a.question_id,
          'question_type', a.question_type_snapshot,
          'question_text', a.question_text_snapshot,
          'points', a.points_snapshot,
          'awarded_points', a.awarded_points,
          'is_correct', a.is_correct,
          'selected_option_id', a.selected_option_id,
          'selected_option_text', (
            SELECT o.option_text FROM public.exam_options AS o WHERE o.id = a.selected_option_id
          ),
          'correct_option_text', (
            SELECT o.option_text
            FROM public.exam_options AS o
            WHERE o.question_id = a.question_id AND o.is_correct = true
            LIMIT 1
          ),
          'essay_text', a.essay_text,
          'teacher_feedback', a.teacher_feedback,
          'model_answer', CASE
            WHEN v_exam.release_model_answers THEN (
              SELECT g.model_answer
              FROM public.exam_question_guides AS g
              WHERE g.question_id = a.question_id
            )
            ELSE NULL
          END
        )
        ORDER BY a.sort_order_snapshot NULLS LAST, a.question_text_snapshot
      )
      FROM public.exam_answers AS a
      WHERE a.attempt_id = v_attempt.id
    ), '[]'::jsonb)
  ) INTO v_payload;

  RETURN v_payload;
END;
$$;

-- ---------------------------------------------------------------------------
-- حزمة تصحيح للطاقم
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_exam_grading_detail(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_attempt public.exam_attempts%ROWTYPE;
  v_exam public.exams%ROWTYPE;
  v_course uuid;
  v_student_name text;
  v_course_title text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_course := public.exam_course_id(v_attempt.exam_id);
  IF NOT (
    public.is_super_admin()
    OR public.teacher_has_course_permission(v_course, false, true, false)
  ) THEN
    RAISE EXCEPTION 'grading_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = v_attempt.exam_id;
  SELECT p.full_name INTO v_student_name FROM public.profiles AS p WHERE p.id = v_attempt.student_id;
  SELECT c.title INTO v_course_title FROM public.courses AS c WHERE c.id = v_course;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'exam_id', v_attempt.exam_id,
    'exam_title', v_exam.title,
    'course_id', v_course,
    'course_title', COALESCE(v_course_title, ''),
    'student_id', v_attempt.student_id,
    'student_name', COALESCE(v_student_name, 'طالب'),
    'submitted_at', v_attempt.submitted_at,
    'grading_status', v_attempt.grading_status,
    'score', v_attempt.score,
    'objective_earned', v_attempt.objective_earned,
    'essay_earned', v_attempt.essay_earned,
    'total_points', v_attempt.total_points,
    'answers', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'answer_id', a.id,
          'question_id', a.question_id,
          'question_type', a.question_type_snapshot,
          'question_text', a.question_text_snapshot,
          'points', a.points_snapshot,
          'awarded_points', a.awarded_points,
          'is_correct', a.is_correct,
          'selected_option_id', a.selected_option_id,
          'selected_option_text', (
            SELECT o.option_text FROM public.exam_options AS o WHERE o.id = a.selected_option_id
          ),
          'correct_option_text', (
            SELECT o.option_text
            FROM public.exam_options AS o
            WHERE o.question_id = a.question_id AND o.is_correct = true
            LIMIT 1
          ),
          'essay_text', a.essay_text,
          'teacher_feedback', a.teacher_feedback,
          'model_answer', (
            SELECT g.model_answer
            FROM public.exam_question_guides AS g
            WHERE g.question_id = a.question_id
          )
        )
        ORDER BY a.sort_order_snapshot NULLS LAST, a.question_text_snapshot
      )
      FROM public.exam_answers AS a
      WHERE a.attempt_id = v_attempt.id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_exam_attempt_review(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_exam_grading_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exam_attempt_review(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_exam_grading_detail(uuid) TO authenticated, service_role;
ALTER FUNCTION public.get_exam_attempt_review(uuid) OWNER TO postgres;
ALTER FUNCTION public.get_exam_grading_detail(uuid) OWNER TO postgres;

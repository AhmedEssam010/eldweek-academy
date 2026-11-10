-- =============================================================================
-- 20261110160000_repair_submit_exam_attempt.sql
-- إصلاح تسليم الامتحان بعد تطبيق ناقص لهجرة أنواع الأسئلة.
-- شغّله يدويًا من Supabase SQL Editor إذا ظهر «تعذر تسليم الامتحان».
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

-- المقال غير المصحَّح يحتاج awarded_points قابلة للقيمة NULL
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

CREATE TABLE IF NOT EXISTS public.exam_question_guides (
  question_id uuid PRIMARY KEY REFERENCES public.exam_questions (id) ON DELETE CASCADE,
  model_answer text,
  CONSTRAINT exam_question_guides_model_not_blank_chk
    CHECK (model_answer IS NULL OR length(trim(model_answer)) > 0)
);

ALTER TABLE public.exam_question_guides ENABLE ROW LEVEL SECURITY;

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

  DELETE FROM public.exam_answers AS ans
  WHERE ans.attempt_id = p_attempt_id;

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

REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb)
  TO authenticated, service_role;
ALTER FUNCTION public.submit_exam_attempt(uuid, jsonb) OWNER TO postgres;

NOTIFY pgrst, 'reload schema';

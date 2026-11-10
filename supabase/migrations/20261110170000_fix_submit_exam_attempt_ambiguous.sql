-- =============================================================================
-- 20261110170000_fix_submit_exam_attempt_ambiguous.sql
-- إصلاح: column reference "attempt_id" is ambiguous داخل submit_exam_attempt
-- بسبب RETURNS TABLE الذي يعرّف متغيرات بنفس أسماء الأعمدة.
-- =============================================================================

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

  SELECT a.* INTO v_attempt
  FROM public.exam_attempts AS a
  WHERE a.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.student_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE = '42501';
  END IF;

  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'attempt_already_closed' USING ERRCODE = '23514';
  END IF;

  SELECT e.* INTO v_exam
  FROM public.exams AS e
  WHERE e.id = v_attempt.exam_id
  FOR SHARE;

  IF v_attempt.ends_at IS NOT NULL
     AND v_attempt.ends_at < timezone('utc', now()) THEN
    UPDATE public.exam_attempts AS a
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
    WHERE a.id = p_attempt_id;

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
    v_option_id := CASE
      WHEN jsonb_typeof(v_item -> 'selected_option_id') = 'string'
           AND NULLIF(btrim(v_item ->> 'selected_option_id'), '') IS NOT NULL
        THEN (v_item ->> 'selected_option_id')::uuid
      ELSE NULL
    END;
    v_essay := NULLIF(btrim(COALESCE(v_item ->> 'essay_text', '')), '');

    IF v_question_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'duplicate_question_answers' USING ERRCODE = '23505';
    END IF;
    v_seen := array_append(v_seen, v_question_id);

    SELECT q.* INTO v_question
    FROM public.exam_questions AS q
    WHERE q.id = v_question_id AND q.exam_id = v_attempt.exam_id;

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
    UPDATE public.exam_attempts AS a
    SET status = 'submitted',
        submitted_at = timezone('utc', now()),
        score = NULL,
        grading_status = v_grading,
        objective_earned = v_objective_earned,
        essay_earned = NULL,
        total_points = v_total_points,
        results_released_at = NULL
    WHERE a.id = p_attempt_id
      AND a.status = 'in_progress';
  ELSE
    v_grading := 'not_applicable';
    v_score := round((v_objective_earned / v_total_points) * 100, 2);
    UPDATE public.exam_attempts AS a
    SET status = 'submitted',
        submitted_at = timezone('utc', now()),
        score = v_score,
        grading_status = v_grading,
        objective_earned = v_objective_earned,
        essay_earned = 0,
        total_points = v_total_points,
        results_released_at = timezone('utc', now())
    WHERE a.id = p_attempt_id
      AND a.status = 'in_progress';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_already_closed' USING ERRCODE = '23514';
  END IF;

  attempt_id := p_attempt_id;
  score := CASE WHEN v_has_essay THEN NULL ELSE v_score END;
  status := 'submitted'::public.exam_attempt_status;
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

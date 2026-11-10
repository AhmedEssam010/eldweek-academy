-- =============================================================================
-- 20261110180000_fix_grading_rpc_ambiguity.sql
-- 1) فصل استثناءات التصحيح عن 23514 حتى لا تُخلط مع check constraints
-- 2) تأهيل أعمدة finalize_exam_grading لتفادي تعارض OUT params (attempt_id/score)
-- =============================================================================

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

  SELECT ea.* INTO v_attempt
  FROM public.exam_attempts AS ea
  WHERE ea.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attempt.status <> 'submitted'
     OR v_attempt.grading_status NOT IN ('awaiting_essay', 'draft') THEN
    RAISE EXCEPTION 'attempt_not_gradable' USING ERRCODE = 'P0001';
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
      RAISE EXCEPTION 'invalid_essay_points' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.exam_answers AS a
    SET awarded_points = v_points,
        teacher_feedback = v_feedback,
        graded_at = timezone('utc', now())
    WHERE a.id = v_answer_id;
  END LOOP;

  UPDATE public.exam_attempts AS ea
  SET grading_status = 'draft'
  WHERE ea.id = p_attempt_id;
END;
$$;

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

  SELECT ea.* INTO v_attempt
  FROM public.exam_attempts AS ea
  WHERE ea.id = p_attempt_id
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
    RAISE EXCEPTION 'attempt_not_gradable' USING ERRCODE = 'P0001';
  END IF;

  v_course := public.exam_course_id(v_attempt.exam_id);
  IF NOT (
    public.is_super_admin()
    OR public.teacher_has_course_permission(v_course, false, true, false)
  ) THEN
    RAISE EXCEPTION 'grading_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_ungraded
  FROM public.exam_answers AS a
  WHERE a.attempt_id = p_attempt_id
    AND a.question_type_snapshot = 'essay'
    AND a.awarded_points IS NULL;

  IF v_ungraded > 0 THEN
    RAISE EXCEPTION 'essays_incomplete' USING ERRCODE = 'P0001';
  END IF;

  SELECT e.* INTO v_exam
  FROM public.exams AS e
  WHERE e.id = v_attempt.exam_id;

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
    RAISE EXCEPTION 'exam_has_no_questions' USING ERRCODE = 'P0001';
  END IF;

  v_score := round(((v_objective + v_essay) / v_total) * 100, 2);

  UPDATE public.exam_attempts AS ea
  SET grading_status = 'finalized',
      score = v_score,
      objective_earned = v_objective,
      essay_earned = v_essay,
      total_points = v_total,
      graded_at = timezone('utc', now()),
      graded_by = v_uid,
      results_released_at = timezone('utc', now())
  WHERE ea.id = p_attempt_id
    AND ea.grading_status IN ('awaiting_essay', 'draft');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_already_closed' USING ERRCODE = 'P0001';
  END IF;

  attempt_id := p_attempt_id;
  score := v_score;
  passed := v_score >= v_exam.passing_score;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.save_exam_essay_grades_draft(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_exam_grading(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_exam_essay_grades_draft(uuid, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_exam_grading(uuid)
  TO authenticated, service_role;

ALTER FUNCTION public.save_exam_essay_grades_draft(uuid, jsonb) OWNER TO postgres;
ALTER FUNCTION public.finalize_exam_grading(uuid) OWNER TO postgres;

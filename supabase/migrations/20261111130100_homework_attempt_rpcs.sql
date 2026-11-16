-- =============================================================================
-- 20261111130100_homework_attempt_rpcs.sql
-- دوال بدء/تسليم/تصحيح/مراجعة الواجبات — SECURITY DEFINER
-- لا تُطبَّق على الإنتاج إلا يدويًا.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.start_homework_attempt(p_homework_id uuid)
RETURNS TABLE (
  attempt_id uuid,
  attempt_number integer,
  status public.exam_attempt_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_hw public.homeworks%ROWTYPE;
  v_used integer := 0;
  v_open uuid;
  v_next integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT h.* INTO v_hw
  FROM public.homeworks AS h
  WHERE h.id = p_homework_id
  FOR SHARE;

  IF NOT FOUND OR NOT v_hw.is_published THEN
    RAISE EXCEPTION 'homework_not_available' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.student_has_active_enrollment_for_course(v_hw.course_id) THEN
    RAISE EXCEPTION 'homework_entitlement_required' USING ERRCODE = '42501';
  END IF;

  IF v_hw.available_from IS NOT NULL
     AND v_hw.available_from > timezone('utc', now()) THEN
    RAISE EXCEPTION 'homework_not_yet_available' USING ERRCODE = '23514';
  END IF;

  IF v_hw.due_at IS NOT NULL AND v_hw.due_at < timezone('utc', now()) THEN
    RAISE EXCEPTION 'homework_closed' USING ERRCODE = '23514';
  END IF;

  SELECT a.id INTO v_open
  FROM public.homework_attempts AS a
  WHERE a.homework_id = p_homework_id
    AND a.student_id = v_uid
    AND a.status = 'in_progress'
  LIMIT 1;

  IF v_open IS NOT NULL THEN
    SELECT a.attempt_number INTO v_next
    FROM public.homework_attempts AS a WHERE a.id = v_open;
    attempt_id := v_open;
    attempt_number := v_next;
    status := 'in_progress';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT count(*)::integer INTO v_used
  FROM public.homework_attempts AS a
  WHERE a.homework_id = p_homework_id
    AND a.student_id = v_uid
    AND a.status <> 'abandoned';

  IF v_hw.max_attempts IS NOT NULL AND v_used >= v_hw.max_attempts THEN
    RAISE EXCEPTION 'homework_max_attempts_reached' USING ERRCODE = '23514';
  END IF;

  v_next := v_used + 1;

  INSERT INTO public.homework_attempts (
    homework_id, student_id, attempt_number, status, grading_status
  )
  VALUES (
    p_homework_id, v_uid, v_next, 'in_progress', 'not_applicable'
  )
  RETURNING id INTO v_open;

  attempt_id := v_open;
  attempt_number := v_next;
  status := 'in_progress';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_homework_attempt(
  p_attempt_id uuid,
  p_answers jsonb
)
RETURNS TABLE (
  attempt_id uuid,
  score numeric,
  status public.exam_attempt_status,
  grading_status public.exam_grading_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_attempt public.homework_attempts%ROWTYPE;
  v_hw public.homeworks%ROWTYPE;
  v_total_points numeric := 0;
  v_objective_earned numeric := 0;
  v_score numeric := 0;
  v_item jsonb;
  v_question public.homework_questions%ROWTYPE;
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
  FROM public.homework_attempts AS a
  WHERE a.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.student_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE = '42501';
  END IF;

  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'attempt_already_closed' USING ERRCODE = 'P0001';
  END IF;

  SELECT h.* INTO v_hw
  FROM public.homeworks AS h
  WHERE h.id = v_attempt.homework_id
  FOR SHARE;

  IF NOT FOUND OR NOT v_hw.is_published THEN
    RAISE EXCEPTION 'homework_not_available' USING ERRCODE = 'P0002';
  END IF;

  IF v_hw.due_at IS NOT NULL AND v_hw.due_at < timezone('utc', now()) THEN
    -- السماح بإكمال المحاولة المفتوحة بعد الاستحقاق؟ المواصفة: منع بدء جديد بعد الاستحقاق
    -- التسليم لمحاولة مفتوحة يبقى مسموحًا إن بدأت قبل الإغلاق
    NULL;
  END IF;

  SELECT count(*), count(DISTINCT elem ->> 'question_id')
  INTO v_payload_count, v_distinct_count
  FROM jsonb_array_elements(COALESCE(p_answers, '[]'::jsonb)) AS elem;

  IF v_payload_count IS DISTINCT FROM v_distinct_count THEN
    RAISE EXCEPTION 'duplicate_question_answers' USING ERRCODE = '23505';
  END IF;

  SELECT COALESCE(sum(q.points), 0) INTO v_total_points
  FROM public.homework_questions AS q
  WHERE q.homework_id = v_attempt.homework_id;

  IF v_total_points <= 0 THEN
    RAISE EXCEPTION 'homework_has_no_questions' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.homework_questions AS q
    WHERE q.homework_id = v_attempt.homework_id AND q.question_type = 'essay'
  ) INTO v_has_essay;

  DELETE FROM public.homework_answers AS ans
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
    FROM public.homework_questions AS q
    WHERE q.id = v_question_id AND q.homework_id = v_attempt.homework_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'answer_question_not_in_homework' USING ERRCODE = 'P0001';
    END IF;

    v_points := v_question.points;

    IF v_question.question_type = 'essay' THEN
      INSERT INTO public.homework_answers (
        attempt_id, question_id, selected_option_id, is_correct, awarded_points,
        essay_text, question_type_snapshot, question_text_snapshot,
        points_snapshot, sort_order_snapshot
      ) VALUES (
        p_attempt_id, v_question_id, NULL, NULL, NULL,
        v_essay, v_question.question_type, v_question.question_text,
        v_points, v_question.sort_order
      );
    ELSE
      IF v_option_id IS NOT NULL THEN
        SELECT o.is_correct INTO v_is_correct
        FROM public.homework_options AS o
        WHERE o.id = v_option_id AND o.question_id = v_question_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'selected_option_mismatch' USING ERRCODE = 'P0001';
        END IF;
      ELSE
        v_is_correct := false;
      END IF;

      INSERT INTO public.homework_answers (
        attempt_id, question_id, selected_option_id, is_correct, awarded_points,
        essay_text, question_type_snapshot, question_text_snapshot,
        points_snapshot, sort_order_snapshot
      ) VALUES (
        p_attempt_id, v_question_id, v_option_id, COALESCE(v_is_correct, false),
        CASE WHEN COALESCE(v_is_correct, false) THEN v_points ELSE 0 END,
        NULL, v_question.question_type, v_question.question_text,
        v_points, v_question.sort_order
      );

      IF COALESCE(v_is_correct, false) THEN
        v_objective_earned := v_objective_earned + v_points;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.homework_answers (
    attempt_id, question_id, selected_option_id, is_correct, awarded_points,
    essay_text, question_type_snapshot, question_text_snapshot,
    points_snapshot, sort_order_snapshot
  )
  SELECT
    p_attempt_id, q.id, NULL,
    CASE WHEN q.question_type = 'essay' THEN NULL ELSE false END,
    CASE WHEN q.question_type = 'essay' THEN NULL ELSE 0 END,
    NULL, q.question_type, q.question_text, q.points, q.sort_order
  FROM public.homework_questions AS q
  WHERE q.homework_id = v_attempt.homework_id
    AND NOT (q.id = ANY (v_seen));

  IF v_has_essay THEN
    v_grading := 'awaiting_essay';
    UPDATE public.homework_attempts AS a
    SET status = 'submitted',
        submitted_at = timezone('utc', now()),
        score = NULL,
        grading_status = v_grading,
        objective_earned = v_objective_earned,
        essay_earned = NULL,
        total_points = v_total_points,
        results_released_at = NULL
    WHERE a.id = p_attempt_id AND a.status = 'in_progress';
  ELSE
    v_grading := 'not_applicable';
    v_score := round((v_objective_earned / v_total_points) * 100, 2);
    UPDATE public.homework_attempts AS a
    SET status = 'submitted',
        submitted_at = timezone('utc', now()),
        score = v_score,
        grading_status = v_grading,
        objective_earned = v_objective_earned,
        essay_earned = 0,
        total_points = v_total_points,
        results_released_at = CASE
          WHEN v_hw.feedback_release_policy = 'never' THEN NULL
          WHEN v_hw.feedback_release_policy = 'after_due'
            AND (v_hw.due_at IS NULL OR v_hw.due_at > timezone('utc', now()))
            THEN NULL
          ELSE timezone('utc', now())
        END
    WHERE a.id = p_attempt_id AND a.status = 'in_progress';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_already_closed' USING ERRCODE = 'P0001';
  END IF;

  attempt_id := p_attempt_id;
  score := CASE WHEN v_has_essay THEN NULL ELSE v_score END;
  status := 'submitted'::public.exam_attempt_status;
  grading_status := v_grading;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_homework_essay_grades_draft(
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
  v_attempt public.homework_attempts%ROWTYPE;
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

  SELECT a.* INTO v_attempt
  FROM public.homework_attempts AS a
  WHERE a.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attempt.status <> 'submitted'
     OR v_attempt.grading_status NOT IN ('awaiting_essay', 'draft') THEN
    RAISE EXCEPTION 'attempt_not_gradable' USING ERRCODE = 'P0001';
  END IF;

  v_course := public.homework_course_id(v_attempt.homework_id);
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

    SELECT ans.points_snapshot INTO v_max
    FROM public.homework_answers AS ans
    WHERE ans.id = v_answer_id
      AND ans.attempt_id = p_attempt_id
      AND ans.question_type_snapshot = 'essay'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'essay_answer_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_points IS NULL OR v_points < 0 OR v_points > COALESCE(v_max, 0) THEN
      RAISE EXCEPTION 'invalid_essay_points' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.homework_answers AS ans
    SET awarded_points = v_points,
        teacher_feedback = v_feedback,
        graded_at = timezone('utc', now())
    WHERE ans.id = v_answer_id;
  END LOOP;

  UPDATE public.homework_attempts AS a
  SET grading_status = 'draft'
  WHERE a.id = p_attempt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_homework_grading(p_attempt_id uuid)
RETURNS TABLE (
  attempt_id uuid,
  score numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_attempt public.homework_attempts%ROWTYPE;
  v_hw public.homeworks%ROWTYPE;
  v_course uuid;
  v_ungraded integer;
  v_objective numeric := 0;
  v_essay numeric := 0;
  v_total numeric := 0;
  v_score numeric := 0;
  v_release timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.homework_attempts AS a
  WHERE a.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attempt.grading_status = 'finalized' THEN
    attempt_id := v_attempt.id;
    score := v_attempt.score;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_attempt.status <> 'submitted'
     OR v_attempt.grading_status NOT IN ('awaiting_essay', 'draft') THEN
    RAISE EXCEPTION 'attempt_not_gradable' USING ERRCODE = 'P0001';
  END IF;

  v_course := public.homework_course_id(v_attempt.homework_id);
  IF NOT (
    public.is_super_admin()
    OR public.teacher_has_course_permission(v_course, false, true, false)
  ) THEN
    RAISE EXCEPTION 'grading_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_ungraded
  FROM public.homework_answers AS ans
  WHERE ans.attempt_id = p_attempt_id
    AND ans.question_type_snapshot = 'essay'
    AND ans.awarded_points IS NULL;

  IF v_ungraded > 0 THEN
    RAISE EXCEPTION 'essays_incomplete' USING ERRCODE = 'P0001';
  END IF;

  SELECT h.* INTO v_hw FROM public.homeworks AS h WHERE h.id = v_attempt.homework_id;

  SELECT COALESCE(sum(ans.awarded_points), 0) INTO v_objective
  FROM public.homework_answers AS ans
  WHERE ans.attempt_id = p_attempt_id
    AND ans.question_type_snapshot IN ('mcq', 'true_false');

  SELECT COALESCE(sum(ans.awarded_points), 0) INTO v_essay
  FROM public.homework_answers AS ans
  WHERE ans.attempt_id = p_attempt_id
    AND ans.question_type_snapshot = 'essay';

  v_total := COALESCE(v_attempt.total_points, 0);
  IF v_total <= 0 THEN
    SELECT COALESCE(sum(q.points), 0) INTO v_total
    FROM public.homework_questions AS q
    WHERE q.homework_id = v_attempt.homework_id;
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'homework_has_no_questions' USING ERRCODE = 'P0001';
  END IF;

  v_score := round(((v_objective + v_essay) / v_total) * 100, 2);

  v_release := CASE
    WHEN v_hw.feedback_release_policy = 'never' THEN NULL
    WHEN v_hw.feedback_release_policy = 'after_due'
      AND (v_hw.due_at IS NULL OR v_hw.due_at > timezone('utc', now()))
      THEN NULL
    ELSE timezone('utc', now())
  END;

  -- سياسة after_due: عند الاعتماد قبل الاستحقاق نضع results_released_at = due_at
  IF v_hw.feedback_release_policy = 'after_due'
     AND v_hw.due_at IS NOT NULL
     AND v_hw.due_at > timezone('utc', now()) THEN
    v_release := v_hw.due_at;
  ELSIF v_hw.feedback_release_policy = 'never' THEN
    -- نحتاج results_released_at NOT NULL للقيد عند finalized — نستخدم وقت الاعتماد
    -- لكن واجهة المراجعة لن تكشف الإجابات الصحيحة عند never
    v_release := timezone('utc', now());
  END IF;

  UPDATE public.homework_attempts AS a
  SET grading_status = 'finalized',
      score = v_score,
      objective_earned = v_objective,
      essay_earned = v_essay,
      total_points = v_total,
      graded_at = timezone('utc', now()),
      graded_by = v_uid,
      results_released_at = v_release
  WHERE a.id = p_attempt_id
    AND a.grading_status IN ('awaiting_essay', 'draft');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_already_closed' USING ERRCODE = 'P0001';
  END IF;

  attempt_id := p_attempt_id;
  score := v_score;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_homework_attempt_review(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_attempt public.homework_attempts%ROWTYPE;
  v_hw public.homeworks%ROWTYPE;
  v_staff boolean := false;
  v_released boolean := false;
  v_show_keys boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.homework_attempts AS a
  WHERE a.id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT h.* INTO v_hw FROM public.homeworks AS h WHERE h.id = v_attempt.homework_id;

  v_staff := public.is_super_admin()
    OR public.teacher_has_course_permission(v_hw.course_id, false, true, false);

  IF v_attempt.student_id IS DISTINCT FROM v_uid AND NOT v_staff THEN
    RAISE EXCEPTION 'attempt_forbidden' USING ERRCODE = '42501';
  END IF;

  v_released := v_attempt.results_released_at IS NOT NULL
    AND v_attempt.results_released_at <= timezone('utc', now());

  v_show_keys := v_staff OR (
    v_released
    AND v_hw.feedback_release_policy <> 'never'
    AND v_attempt.grading_status IN ('not_applicable', 'finalized')
  );

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'homework_id', v_attempt.homework_id,
    'homework_title', v_hw.title,
    'attempt_number', v_attempt.attempt_number,
    'status', v_attempt.status,
    'grading_status', v_attempt.grading_status,
    'score', v_attempt.score,
    'objective_earned', v_attempt.objective_earned,
    'essay_earned', v_attempt.essay_earned,
    'total_points', v_attempt.total_points,
    'submitted_at', v_attempt.submitted_at,
    'results_released', v_released,
    'show_answer_keys', v_show_keys,
    'answers', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'answer_id', ans.id,
          'question_id', ans.question_id,
          'question_type', ans.question_type_snapshot,
          'question_text', ans.question_text_snapshot,
          'points', ans.points_snapshot,
          'awarded_points', ans.awarded_points,
          'is_correct', CASE WHEN v_show_keys OR v_staff THEN ans.is_correct ELSE NULL END,
          'selected_option_text', (
            SELECT o.option_text FROM public.homework_options AS o
            WHERE o.id = ans.selected_option_id
          ),
          'correct_option_text', CASE
            WHEN v_show_keys THEN (
              SELECT o.option_text FROM public.homework_options AS o
              WHERE o.question_id = ans.question_id AND o.is_correct
              ORDER BY o.sort_order LIMIT 1
            )
            ELSE NULL
          END,
          'essay_text', ans.essay_text,
          'teacher_feedback', CASE
            WHEN v_released OR v_staff THEN ans.teacher_feedback
            ELSE NULL
          END,
          'model_answer', CASE
            WHEN v_staff THEN (
              SELECT g.model_answer FROM public.homework_question_guides AS g
              WHERE g.question_id = ans.question_id
            )
            ELSE NULL
          END
        )
        ORDER BY ans.sort_order_snapshot NULLS LAST, ans.id
      )
      FROM public.homework_answers AS ans
      WHERE ans.attempt_id = p_attempt_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_homework_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_homework_attempt(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_homework_essay_grades_draft(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_homework_grading(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_homework_attempt_review(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.start_homework_attempt(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_homework_attempt(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_homework_essay_grades_draft(uuid, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_homework_grading(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_homework_attempt_review(uuid) TO authenticated, service_role;

ALTER FUNCTION public.start_homework_attempt(uuid) OWNER TO postgres;
ALTER FUNCTION public.submit_homework_attempt(uuid, jsonb) OWNER TO postgres;
ALTER FUNCTION public.save_homework_essay_grades_draft(uuid, jsonb) OWNER TO postgres;
ALTER FUNCTION public.finalize_homework_grading(uuid) OWNER TO postgres;
ALTER FUNCTION public.get_homework_attempt_review(uuid) OWNER TO postgres;

NOTIFY pgrst, 'reload schema';

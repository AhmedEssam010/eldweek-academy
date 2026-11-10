CREATE TEMP TABLE IF NOT EXISTS diag_grading_verify (
  case_name text,
  ok boolean,
  sqlstate text,
  msg text
);

DELETE FROM diag_grading_verify;

DO $diag$
DECLARE
  v_err text;
  v_code text;
  v_payload jsonb;
  v_one uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'df5331d6-2237-4178-94d7-c2bc7493f4c7', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT a.id INTO v_one
  FROM public.exam_answers AS a
  WHERE a.attempt_id = '58fa7a1f-5af9-4181-aa31-a2c294c74f07'
    AND a.question_type_snapshot = 'essay'
  LIMIT 1;

  -- حالة 1: درجة أعلى من الحد → invalid_essay_points
  BEGIN
    PERFORM public.save_exam_essay_grades_draft(
      '58fa7a1f-5af9-4181-aa31-a2c294c74f07'::uuid,
      jsonb_build_array(jsonb_build_object(
        'answer_id', v_one,
        'awarded_points', 99,
        'teacher_feedback', 'too_high'
      ))
    );
    INSERT INTO diag_grading_verify VALUES ('over_max', true, '00000', 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_code = RETURNED_SQLSTATE;
    INSERT INTO diag_grading_verify VALUES ('over_max', false, v_code, v_err);
  END;

  -- حالة 2: درجات صحيحة → نجاح
  SELECT jsonb_agg(
    jsonb_build_object(
      'answer_id', a.id,
      'awarded_points', 0.5,
      'teacher_feedback', 'ok'
    )
  )
  INTO v_payload
  FROM public.exam_answers AS a
  WHERE a.attempt_id = '58fa7a1f-5af9-4181-aa31-a2c294c74f07'
    AND a.question_type_snapshot = 'essay';

  BEGIN
    PERFORM public.save_exam_essay_grades_draft(
      '58fa7a1f-5af9-4181-aa31-a2c294c74f07'::uuid,
      v_payload
    );
    INSERT INTO diag_grading_verify VALUES ('valid_draft', true, '00000', 'SUCCESS');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_code = RETURNED_SQLSTATE;
    INSERT INTO diag_grading_verify VALUES ('valid_draft', false, v_code, v_err);
  END;
END;
$diag$;

SELECT * FROM diag_grading_verify ORDER BY case_name;

SELECT grading_status, score
FROM public.exam_attempts
WHERE id = '58fa7a1f-5af9-4181-aa31-a2c294c74f07';

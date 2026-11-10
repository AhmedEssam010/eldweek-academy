-- تشخيص حفظ مسودة التصحيح — يعيد صف نتيجة بدل NOTICE
CREATE TEMP TABLE IF NOT EXISTS diag_grading_result (
  ok boolean,
  sqlstate text,
  msg text,
  uid uuid,
  is_admin boolean,
  grading_status text
);

DELETE FROM diag_grading_result;

DO $diag$
DECLARE
  v_err text;
  v_code text;
  v_payload jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'df5331d6-2237-4178-94d7-c2bc7493f4c7', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT jsonb_agg(
    jsonb_build_object(
      'answer_id', a.id,
      'awarded_points', 1,
      'teacher_feedback', 'diag'
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
    INSERT INTO diag_grading_result (ok, sqlstate, msg, uid, is_admin, grading_status)
    VALUES (
      true,
      '00000',
      'SUCCESS',
      auth.uid(),
      public.is_super_admin(),
      (SELECT ea.grading_status::text FROM public.exam_attempts ea WHERE ea.id = '58fa7a1f-5af9-4181-aa31-a2c294c74f07')
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_err = MESSAGE_TEXT,
      v_code = RETURNED_SQLSTATE;
    INSERT INTO diag_grading_result (ok, sqlstate, msg, uid, is_admin, grading_status)
    VALUES (
      false,
      v_code,
      v_err,
      auth.uid(),
      public.is_super_admin(),
      (SELECT ea.grading_status::text FROM public.exam_attempts ea WHERE ea.id = '58fa7a1f-5af9-4181-aa31-a2c294c74f07')
    );
  END;
END;
$diag$;

SELECT * FROM diag_grading_result;

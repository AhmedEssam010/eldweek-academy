CREATE TEMP TABLE IF NOT EXISTS diag_finalize_result (
  ok boolean,
  sqlstate text,
  msg text,
  score numeric,
  passed boolean
);

DELETE FROM diag_finalize_result;

DO $diag$
DECLARE
  v_err text;
  v_code text;
  v_score numeric;
  v_passed boolean;
  v_attempt_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'df5331d6-2237-4178-94d7-c2bc7493f4c7', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    SELECT f.attempt_id, f.score, f.passed
    INTO v_attempt_id, v_score, v_passed
    FROM public.finalize_exam_grading('58fa7a1f-5af9-4181-aa31-a2c294c74f07'::uuid) AS f;

    INSERT INTO diag_finalize_result (ok, sqlstate, msg, score, passed)
    VALUES (true, '00000', 'SUCCESS attempt=' || v_attempt_id::text, v_score, v_passed);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_err = MESSAGE_TEXT,
      v_code = RETURNED_SQLSTATE;
    INSERT INTO diag_finalize_result (ok, sqlstate, msg, score, passed)
    VALUES (false, v_code, v_err, NULL, NULL);
  END;
END;
$diag$;

SELECT * FROM diag_finalize_result;

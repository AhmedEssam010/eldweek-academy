WITH setup AS (
  SELECT
    set_config('request.jwt.claim.sub', '26569364-ff8a-4584-a444-44e1867e15bd', true) AS sub,
    set_config('request.jwt.claim.role', 'authenticated', true) AS role,
    auth.uid() AS uid
),
payload AS (
  SELECT
    (SELECT uid FROM setup) AS uid,
    jsonb_agg(
      CASE
        WHEN q.question_type = 'essay' THEN
          jsonb_build_object(
            'question_id', q.id,
            'selected_option_id', null,
            'essay_text', 'تشخيص'
          )
        ELSE
          jsonb_build_object(
            'question_id', q.id,
            'selected_option_id', (
              SELECT o.id
              FROM public.exam_options AS o
              WHERE o.question_id = q.id
              ORDER BY o.is_correct DESC, o.sort_order
              LIMIT 1
            ),
            'essay_text', null
          )
      END
    ) AS answers
  FROM public.exam_questions AS q
  WHERE q.exam_id = '4a562778-51ac-4856-8181-f011cb238641'
)
SELECT
  p.uid,
  jsonb_array_length(p.answers) AS answer_count,
  s.attempt_id,
  s.score,
  s.status,
  s.passed,
  s.grading_status
FROM payload AS p
CROSS JOIN LATERAL public.submit_exam_attempt(
  '58fa7a1f-5af9-4181-aa31-a2c294c74f07'::uuid,
  p.answers
) AS s;

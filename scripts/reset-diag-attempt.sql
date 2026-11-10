-- إعادة المحاولة لحالة قابلة للتصحيح بعد تشخيص غير مقصود
UPDATE public.exam_answers AS a
SET awarded_points = NULL,
    teacher_feedback = NULL,
    graded_at = NULL
WHERE a.attempt_id = '58fa7a1f-5af9-4181-aa31-a2c294c74f07'
  AND a.question_type_snapshot = 'essay';

UPDATE public.exam_attempts AS ea
SET grading_status = 'awaiting_essay',
    score = NULL,
    essay_earned = NULL,
    graded_at = NULL,
    graded_by = NULL,
    results_released_at = NULL
WHERE ea.id = '58fa7a1f-5af9-4181-aa31-a2c294c74f07';

SELECT id, status, grading_status, score, objective_earned, essay_earned
FROM public.exam_attempts
WHERE id = '58fa7a1f-5af9-4181-aa31-a2c294c74f07';

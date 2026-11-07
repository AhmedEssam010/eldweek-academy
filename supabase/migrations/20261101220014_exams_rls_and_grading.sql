-- =============================================================================
-- 20261101220014_exams_rls_and_grading.sql
-- سياسات RLS + تقويم آمن على الخادم + إخفاء is_correct عن الطلاب
-- =============================================================================

-- ---------------------------------------------------------------------------
-- سياسات exams
-- SELECT: مالك / أي تعيين على الكورس / طالب مستحق لامتحان منشور
-- الكتابة: مالك أو can_manage_exams فقط
-- INSERT يعتمد exam_course_id_from_scope(lesson_id, semester_id) وليس exam_course_id(id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS exams_staff_or_admin_all ON public.exams;
DROP POLICY IF EXISTS exams_staff_or_admin_select ON public.exams;
DROP POLICY IF EXISTS exams_staff_manage_write ON public.exams;
DROP POLICY IF EXISTS exams_staff_manage_insert ON public.exams;
DROP POLICY IF EXISTS exams_staff_manage_update ON public.exams;
DROP POLICY IF EXISTS exams_staff_manage_delete ON public.exams;
DROP POLICY IF EXISTS exams_enrolled_student_read_published ON public.exams;

CREATE POLICY exams_staff_or_admin_select
  ON public.exams
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.teacher_has_course_permission(
      public.exam_course_id_from_scope(lesson_id, semester_id),
      false,
      false,
      false
    )
  );

CREATE POLICY exams_enrolled_student_read_published
  ON public.exams
  FOR SELECT
  TO authenticated
  USING (
    is_published = true
    AND public.student_has_active_enrollment_for_exam(id)
  );

CREATE POLICY exams_staff_manage_insert
  ON public.exams
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.teacher_has_course_permission(
      public.exam_course_id_from_scope(lesson_id, semester_id),
      false,
      true,
      false
    )
  );

-- USING يتحقق من الكورس الحالي؛ WITH CHECK يمنع النقل لكورس غير مصرّح
CREATE POLICY exams_staff_manage_update
  ON public.exams
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.teacher_has_course_permission(
      public.exam_course_id(id),
      false,
      true,
      false
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.teacher_has_course_permission(
      public.exam_course_id_from_scope(lesson_id, semester_id),
      false,
      true,
      false
    )
  );

CREATE POLICY exams_staff_manage_delete
  ON public.exams
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.teacher_has_course_permission(
      public.exam_course_id(id),
      false,
      true,
      false
    )
  );

-- حماية إضافية لحالة النشر ونقل النطاق (حتى لو تغيّرت السياسات لاحقًا)
CREATE OR REPLACE FUNCTION public.protect_exam_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  jwt_role text := COALESCE(auth.jwt() ->> 'role', '');
  old_course uuid;
  new_course uuid;
BEGIN
  IF jwt_role = 'service_role' OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    new_course := public.exam_course_id_from_scope(NEW.lesson_id, NEW.semester_id);
    IF new_course IS NULL
       OR NOT public.teacher_has_course_permission(new_course, false, true, false)
    THEN
      RAISE EXCEPTION 'exam_create_forbidden' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  old_course := public.exam_course_id(OLD.id);
  new_course := public.exam_course_id_from_scope(NEW.lesson_id, NEW.semester_id);

  IF old_course IS NULL
     OR NOT public.teacher_has_course_permission(old_course, false, true, false)
  THEN
    RAISE EXCEPTION 'exam_update_forbidden' USING ERRCODE = '42501';
  END IF;

  IF new_course IS NULL
     OR NOT public.teacher_has_course_permission(new_course, false, true, false)
  THEN
    RAISE EXCEPTION 'exam_move_forbidden' USING ERRCODE = '42501';
  END IF;

  -- تغيير النشر محمي بنفس صلاحية إدارة الامتحانات (وليست can_edit_content وحدها)
  IF OLD.is_published IS DISTINCT FROM NEW.is_published
     AND NOT public.teacher_has_course_permission(old_course, false, true, false)
  THEN
    RAISE EXCEPTION 'exam_publish_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_exam_mutations() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_protect_exam_mutations ON public.exams;
CREATE TRIGGER trg_protect_exam_mutations
  BEFORE INSERT OR UPDATE ON public.exams
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_exam_mutations();

-- ---------------------------------------------------------------------------
-- سياسات questions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS exam_questions_staff_select ON public.exam_questions;
CREATE POLICY exam_questions_staff_select
  ON public.exam_questions
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.teacher_has_course_permission(
      public.exam_course_id(exam_id), false, false, false
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.exams AS e
        WHERE e.id = exam_id
          AND e.is_published = true
          AND public.student_has_active_enrollment_for_exam(e.id)
      )
    )
  );

DROP POLICY IF EXISTS exam_questions_staff_write ON public.exam_questions;
CREATE POLICY exam_questions_staff_write
  ON public.exam_questions
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.teacher_has_course_permission(
      public.exam_course_id(exam_id), false, true, false
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.teacher_has_course_permission(
      public.exam_course_id(exam_id), false, true, false
    )
  );

-- ---------------------------------------------------------------------------
-- سياسات options — الطلاب يقرؤون عبر عرض بدون is_correct
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS exam_options_staff_select ON public.exam_options;
CREATE POLICY exam_options_staff_select
  ON public.exam_options
  FOR SELECT
  TO authenticated
  USING (
    -- مفاتيح is_correct للطاقم المصرّح بإدارة الامتحانات فقط (وليس أي تعيين)
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

DROP POLICY IF EXISTS exam_options_staff_write ON public.exam_options;
CREATE POLICY exam_options_staff_write
  ON public.exam_options
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

-- عرض آمن: بدون is_correct، ومقيّد بامتحان منشور + استحقاق الطالب الحالي
CREATE OR REPLACE VIEW public.exam_options_for_taking
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  o.id,
  o.question_id,
  o.option_text,
  o.sort_order
FROM public.exam_options AS o
INNER JOIN public.exam_questions AS q ON q.id = o.question_id
INNER JOIN public.exams AS e ON e.id = q.exam_id
WHERE e.is_published = true
  AND public.student_has_active_enrollment_for_exam(e.id);

COMMENT ON VIEW public.exam_options_for_taking IS
  'خيارات الامتحان للطالب المستحق فقط، بدون عمود is_correct. يعمل بصلاحية مالك العرض مع security_barrier.';

ALTER VIEW public.exam_options_for_taking OWNER TO postgres;
REVOKE ALL ON public.exam_options_for_taking FROM PUBLIC;
REVOKE ALL ON public.exam_options_for_taking FROM anon;
GRANT SELECT ON public.exam_options_for_taking TO authenticated;

-- ---------------------------------------------------------------------------
-- محاولات وإجابات — القراءة فقط؛ الكتابة عبر RPC
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS exam_attempts_own_select ON public.exam_attempts;
CREATE POLICY exam_attempts_own_select
  ON public.exam_attempts
  FOR SELECT
  TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.is_super_admin()
    OR public.teacher_has_course_permission(
      public.exam_course_id(exam_id), false, false, true
    )
  );

DROP POLICY IF EXISTS exam_answers_own_select ON public.exam_answers;
CREATE POLICY exam_answers_own_select
  ON public.exam_answers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.exam_attempts AS a
      WHERE a.id = attempt_id
        AND (
          a.student_id = (SELECT auth.uid())
          OR public.is_super_admin()
          OR public.teacher_has_course_permission(
            public.exam_course_id(a.exam_id), false, false, true
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- صلاحيات الأعمدة
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.exam_options FROM PUBLIC;
REVOKE ALL ON TABLE public.exam_options FROM anon;
REVOKE ALL ON TABLE public.exam_options FROM authenticated;

-- لا سياسة SELECT للطلاب على الجدول؛ الطاقم فقط عبر RLS
GRANT SELECT (
  id,
  question_id,
  option_text,
  is_correct,
  sort_order
) ON public.exam_options TO authenticated;

GRANT INSERT (
  id,
  question_id,
  option_text,
  is_correct,
  sort_order
) ON public.exam_options TO authenticated;

GRANT UPDATE (
  option_text,
  is_correct,
  sort_order
) ON public.exam_options TO authenticated;

GRANT DELETE ON public.exam_options TO authenticated;
GRANT ALL ON TABLE public.exam_options TO postgres, service_role;

REVOKE ALL ON TABLE public.exam_attempts FROM PUBLIC;
REVOKE ALL ON TABLE public.exam_attempts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.exam_attempts FROM authenticated;
GRANT SELECT ON TABLE public.exam_attempts TO authenticated;
GRANT ALL ON TABLE public.exam_attempts TO postgres, service_role;

REVOKE ALL ON TABLE public.exam_answers FROM PUBLIC;
REVOKE ALL ON TABLE public.exam_answers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.exam_answers FROM authenticated;
GRANT SELECT (
  id,
  attempt_id,
  question_id,
  selected_option_id,
  awarded_points
) ON public.exam_answers TO authenticated;
GRANT ALL ON TABLE public.exam_answers TO postgres, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exam_questions TO authenticated;
GRANT ALL ON TABLE public.exams TO postgres, service_role;
GRANT ALL ON TABLE public.exam_questions TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- بدء محاولة — ساعة الخادم + تعامل تزامن المحاولة الواحدة
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_exam_attempt(p_exam_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_exam public.exams%ROWTYPE;
  v_count integer;
  v_attempt_id uuid;
  v_ends_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id FOR SHARE;
  IF NOT FOUND OR v_exam.is_published IS NOT TRUE THEN
    RAISE EXCEPTION 'exam_not_available' USING ERRCODE = '42501';
  END IF;

  IF NOT public.student_has_active_enrollment_for_exam(p_exam_id) THEN
    RAISE EXCEPTION 'exam_entitlement_required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.exam_attempts
  SET status = 'expired',
      submitted_at = COALESCE(submitted_at, timezone('utc', now())),
      score = COALESCE(score, 0)
  WHERE exam_id = p_exam_id
    AND student_id = v_uid
    AND status = 'in_progress'
    AND ends_at IS NOT NULL
    AND ends_at < timezone('utc', now());

  SELECT a.id INTO v_attempt_id
  FROM public.exam_attempts AS a
  WHERE a.exam_id = p_exam_id
    AND a.student_id = v_uid
    AND a.status = 'in_progress'
  LIMIT 1
  FOR UPDATE;

  IF v_attempt_id IS NOT NULL THEN
    RETURN v_attempt_id;
  END IF;

  IF v_exam.max_attempts IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.exam_attempts
    WHERE exam_id = p_exam_id
      AND student_id = v_uid
      AND status IN ('submitted', 'expired');

    IF v_count >= v_exam.max_attempts THEN
      RAISE EXCEPTION 'exam_max_attempts_reached' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_exam.duration_minutes IS NOT NULL THEN
    v_ends_at := timezone('utc', now()) + make_interval(mins => v_exam.duration_minutes);
  ELSE
    v_ends_at := NULL;
  END IF;

  BEGIN
    INSERT INTO public.exam_attempts (exam_id, student_id, ends_at, status)
    VALUES (p_exam_id, v_uid, v_ends_at, 'in_progress')
    RETURNING id INTO v_attempt_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT a.id INTO v_attempt_id
      FROM public.exam_attempts AS a
      WHERE a.exam_id = p_exam_id
        AND a.student_id = v_uid
        AND a.status = 'in_progress'
      LIMIT 1;

      IF v_attempt_id IS NULL THEN
        RAISE;
      END IF;
  END;

  RETURN v_attempt_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- تسليم وتقويم — رفض التكرار، قفل الصف، ساعة الخادم، بدون ثقة بمفاتيح العميل
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
  p_attempt_id uuid,
  p_answers jsonb
)
RETURNS TABLE (
  attempt_id uuid,
  score numeric,
  status public.exam_attempt_status,
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
  v_total_points numeric := 0;
  v_earned numeric := 0;
  v_score numeric := 0;
  v_item jsonb;
  v_question_id uuid;
  v_option_id uuid;
  v_points numeric;
  v_is_correct boolean;
  v_payload_count integer;
  v_distinct_count integer;
  v_seen uuid[] := ARRAY[]::uuid[];
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
        score = 0
    WHERE id = p_attempt_id;

    attempt_id := p_attempt_id;
    score := 0;
    status := 'expired';
    passed := false;
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

  DELETE FROM public.exam_answers WHERE attempt_id = p_attempt_id;

  FOR v_item IN
    SELECT * FROM jsonb_array_elements(COALESCE(p_answers, '[]'::jsonb))
  LOOP
    v_question_id := (v_item ->> 'question_id')::uuid;
    v_option_id := NULLIF(v_item ->> 'selected_option_id', '')::uuid;

    IF v_question_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'duplicate_question_answers' USING ERRCODE = '23505';
    END IF;
    v_seen := array_append(v_seen, v_question_id);

    IF NOT EXISTS (
      SELECT 1 FROM public.exam_questions
      WHERE id = v_question_id AND exam_id = v_attempt.exam_id
    ) THEN
      RAISE EXCEPTION 'answer_question_not_in_exam' USING ERRCODE = '23514';
    END IF;

    IF v_option_id IS NOT NULL THEN
      SELECT o.is_correct, q.points
      INTO v_is_correct, v_points
      FROM public.exam_options AS o
      INNER JOIN public.exam_questions AS q ON q.id = o.question_id
      WHERE o.id = v_option_id
        AND o.question_id = v_question_id
        AND q.exam_id = v_attempt.exam_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'selected_option_mismatch' USING ERRCODE = '23514';
      END IF;
    ELSE
      v_is_correct := false;
      SELECT points INTO v_points
      FROM public.exam_questions
      WHERE id = v_question_id;
    END IF;

    INSERT INTO public.exam_answers (
      attempt_id,
      question_id,
      selected_option_id,
      is_correct,
      awarded_points
    )
    VALUES (
      p_attempt_id,
      v_question_id,
      v_option_id,
      COALESCE(v_is_correct, false),
      CASE WHEN COALESCE(v_is_correct, false) THEN COALESCE(v_points, 0) ELSE 0 END
    );

    IF COALESCE(v_is_correct, false) THEN
      v_earned := v_earned + COALESCE(v_points, 0);
    END IF;
  END LOOP;

  v_score := round((v_earned / v_total_points) * 100, 2);

  UPDATE public.exam_attempts
  SET status = 'submitted',
      submitted_at = timezone('utc', now()),
      score = v_score
  WHERE id = p_attempt_id
    AND status = 'in_progress';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_already_closed' USING ERRCODE = '23514';
  END IF;

  attempt_id := p_attempt_id;
  score := v_score;
  status := 'submitted';
  passed := v_score >= v_exam.passing_score;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.start_exam_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb)
  TO authenticated, service_role;

ALTER FUNCTION public.start_exam_attempt(uuid) OWNER TO postgres;
ALTER FUNCTION public.submit_exam_attempt(uuid, jsonb) OWNER TO postgres;
ALTER FUNCTION public.exam_course_id(uuid) OWNER TO postgres;
ALTER FUNCTION public.exam_course_id_from_scope(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.student_has_active_enrollment_for_exam(uuid) OWNER TO postgres;
ALTER FUNCTION public.enforce_exam_scope_consistency() OWNER TO postgres;
ALTER FUNCTION public.protect_exam_mutations() OWNER TO postgres;

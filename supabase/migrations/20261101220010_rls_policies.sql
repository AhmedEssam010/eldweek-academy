-- =============================================================================
-- 20261101220010_rls_policies.sql
-- سياسات RLS: رفض افتراضي + أقل صلاحية ممكنة
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS profiles_update_own_safe_fields ON public.profiles;
CREATE POLICY profiles_update_own_safe_fields
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.is_super_admin()
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    OR public.is_super_admin()
  );

-- لا يوجد INSERT عام على profiles؛ يُنشأ عبر trigger التسجيل أو service_role
DROP POLICY IF EXISTS profiles_admin_insert ON public.profiles;
CREATE POLICY profiles_admin_insert
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

-- المدرّسون المعينون يمكنهم رؤية أسماء طلاب كورساتهم فقط عبر سياسة ضيقة؟
-- مؤجّل: تجنّب كشف بيانات شخصية واسعة. التقدم يُعرَض عبر views/functions لاحقًا.

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS courses_public_read_published ON public.courses;
CREATE POLICY courses_public_read_published
  ON public.courses
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS courses_staff_or_admin_read ON public.courses;
CREATE POLICY courses_staff_or_admin_read
  ON public.courses
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.teacher_has_course_permission(id, false, false, false)
    OR created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS courses_insert_authorized_drafts ON public.courses;
CREATE POLICY courses_insert_authorized_drafts
  ON public.courses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.can_create_course_drafts()
    AND status IN ('draft', 'pending_review')
  );

DROP POLICY IF EXISTS courses_update_admin_or_content_editor ON public.courses;
CREATE POLICY courses_update_admin_or_content_editor
  ON public.courses
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.teacher_has_course_permission(id, true, false, false)
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.teacher_has_course_permission(id, true, false, false)
      AND status IN ('draft', 'pending_review')
    )
  );

-- الحذف الإداري فقط
DROP POLICY IF EXISTS courses_delete_admin ON public.courses;
CREATE POLICY courses_delete_admin
  ON public.courses
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- course_staff_assignments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS staff_assignments_admin_all ON public.course_staff_assignments;
CREATE POLICY staff_assignments_admin_all
  ON public.course_staff_assignments
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS staff_assignments_teacher_read_own ON public.course_staff_assignments;
CREATE POLICY staff_assignments_teacher_read_own
  ON public.course_staff_assignments
  FOR SELECT
  TO authenticated
  USING (teacher_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- course_semesters
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS semesters_public_read_published_course ON public.course_semesters;
CREATE POLICY semesters_public_read_published_course
  ON public.course_semesters
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.courses AS c
      WHERE c.id = course_id
        AND c.status = 'published'
    )
  );

DROP POLICY IF EXISTS semesters_staff_or_admin_read ON public.course_semesters;
CREATE POLICY semesters_staff_or_admin_read
  ON public.course_semesters
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.teacher_has_course_permission(course_id, false, false, false)
  );

DROP POLICY IF EXISTS semesters_write_admin_or_editor ON public.course_semesters;
CREATE POLICY semesters_write_admin_or_editor
  ON public.course_semesters
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.teacher_has_course_permission(course_id, true, false, false)
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.teacher_has_course_permission(course_id, true, false, false)
  );

-- ---------------------------------------------------------------------------
-- lessons
-- anon يستخدم lessons_catalog فقط. لا منح SELECT لـ anon على الجدول.
-- video_asset_id محجوب بصلاحيات الأعمدة + get_lesson_playback_grant.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS lessons_public_metadata_published ON public.lessons;

DROP POLICY IF EXISTS lessons_enrolled_student_read ON public.lessons;
CREATE POLICY lessons_enrolled_student_read
  ON public.lessons
  FOR SELECT
  TO authenticated
  USING (
    is_published = true
    AND public.student_has_active_enrollment_for_lesson(id)
  );

DROP POLICY IF EXISTS lessons_staff_or_admin_read ON public.lessons;
CREATE POLICY lessons_staff_or_admin_read
  ON public.lessons
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.course_semesters AS s
      WHERE s.id = semester_id
        AND public.teacher_has_course_permission(s.course_id, false, false, false)
    )
  );

DROP POLICY IF EXISTS lessons_write_admin_or_editor ON public.lessons;
CREATE POLICY lessons_write_admin_or_editor
  ON public.lessons
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.course_semesters AS s
      WHERE s.id = semester_id
        AND public.teacher_has_course_permission(s.course_id, true, false, false)
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.course_semesters AS s
      WHERE s.id = semester_id
        AND public.teacher_has_course_permission(s.course_id, true, false, false)
    )
  );

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS products_public_read_active ON public.products;
CREATE POLICY products_public_read_active
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND (
      (
        product_type = 'full_course'
        AND EXISTS (
          SELECT 1 FROM public.courses AS c
          WHERE c.id = course_id AND c.status = 'published'
        )
      )
      OR (
        product_type = 'semester'
        AND EXISTS (
          SELECT 1
          FROM public.course_semesters AS s
          INNER JOIN public.courses AS c ON c.id = s.course_id
          WHERE s.id = semester_id AND c.status = 'published'
        )
      )
    )
  );

DROP POLICY IF EXISTS products_admin_manage ON public.products;
CREATE POLICY products_admin_manage
  ON public.products
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- payment_requests
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS payment_requests_student_select_own ON public.payment_requests;
CREATE POLICY payment_requests_student_select_own
  ON public.payment_requests
  FOR SELECT
  TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS payment_requests_student_insert_own ON public.payment_requests;
CREATE POLICY payment_requests_student_insert_own
  ON public.payment_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = (SELECT auth.uid())
    AND public.is_active_student()
    AND status = 'pending'
  );

-- لا سياسة UPDATE لـ payment_requests على authenticated.
-- الكتابة تتم فقط عبر SECURITY DEFINER (approve/reject) مع سحب GRANT UPDATE.

-- ---------------------------------------------------------------------------
-- enrollments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS enrollments_student_select_own ON public.enrollments;
CREATE POLICY enrollments_student_select_own
  ON public.enrollments
  FOR SELECT
  TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.is_super_admin()
    OR (
      public.is_active_teacher()
      AND EXISTS (
        SELECT 1
        FROM public.products AS p
        WHERE p.id = product_id
          AND (
            (
              p.product_type = 'full_course'
              AND public.teacher_has_course_permission(p.course_id, false, false, true)
            )
            OR (
              p.product_type = 'semester'
              AND EXISTS (
                SELECT 1
                FROM public.course_semesters AS s
                WHERE s.id = p.semester_id
                  AND public.teacher_has_course_permission(s.course_id, false, false, true)
              )
            )
          )
      )
    )
  );

-- لا سياسات INSERT/UPDATE لـ enrollments على authenticated.
-- الاعتماد على سحب المنح + دوال SECURITY DEFINER وليس على GUCs قابلة للضبط من العميل.
DROP POLICY IF EXISTS enrollments_update_via_secure_workflow ON public.enrollments;
DROP POLICY IF EXISTS enrollments_insert_via_secure_workflow ON public.enrollments;
DROP POLICY IF EXISTS payment_requests_update_via_secure_workflow ON public.payment_requests;

-- ---------------------------------------------------------------------------
-- lesson_progress
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_progress_own_select ON public.lesson_progress;
CREATE POLICY lesson_progress_own_select
  ON public.lesson_progress
  FOR SELECT
  TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.is_super_admin()
    OR (
      EXISTS (
        SELECT 1
        FROM public.lessons AS l
        INNER JOIN public.course_semesters AS s ON s.id = l.semester_id
        WHERE l.id = lesson_id
          AND public.teacher_has_course_permission(s.course_id, false, false, true)
      )
    )
  );

DROP POLICY IF EXISTS lesson_progress_own_insert ON public.lesson_progress;
CREATE POLICY lesson_progress_own_insert
  ON public.lesson_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = (SELECT auth.uid())
    AND public.is_active_student()
  );

DROP POLICY IF EXISTS lesson_progress_own_update ON public.lesson_progress;
CREATE POLICY lesson_progress_own_update
  ON public.lesson_progress
  FOR UPDATE
  TO authenticated
  USING (student_id = (SELECT auth.uid()))
  WITH CHECK (student_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS audit_logs_admin_select ON public.audit_logs;
CREATE POLICY audit_logs_admin_select
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

-- لا INSERT/UPDATE/DELETE عبر السياسات للمستخدمين العاديين

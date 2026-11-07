-- تحقق غير مدمّر من المخطط بعد تطبيق الهجرات
SELECT 'tables' AS section, c.relname AS name,
       c.relrowsecurity::text AS rls,
       c.relforcerowsecurity::text AS force_rls,
       NULL::text AS extra
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'profiles','courses','course_staff_assignments','course_semesters','lessons',
    'products','payment_requests','enrollments','lesson_progress','audit_logs',
    'exams','exam_questions','exam_options','exam_attempts','exam_answers'
  )

UNION ALL

SELECT 'policies', tablename, count(*)::text, NULL, NULL
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles','courses','course_staff_assignments','course_semesters','lessons',
    'products','payment_requests','enrollments','lesson_progress','audit_logs',
    'exams','exam_questions','exam_options','exam_attempts','exam_answers'
  )
GROUP BY tablename

UNION ALL

SELECT 'functions', p.proname, NULL, NULL, NULL
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'set_updated_at','is_super_admin','teacher_has_course_permission',
    'student_has_active_enrollment_for_course','student_has_active_enrollment_for_semester',
    'student_has_active_enrollment_for_lesson','student_has_active_enrollment_for_exam',
    'get_lesson_playback_grant','exam_course_id','exam_course_id_from_scope',
    'start_exam_attempt','submit_exam_attempt','protect_exam_mutations',
    'enforce_exam_scope_consistency'
  )

UNION ALL

SELECT 'triggers', event_object_table, trigger_name, NULL, NULL
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('exams','profiles','courses','lessons','payment_requests','lesson_progress')

UNION ALL

SELECT 'views', table_name, NULL, NULL, NULL
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('lessons_catalog','exam_options_for_taking')

ORDER BY 1, 2, 3;

SELECT 'super_admin_count' AS check_name, count(*)::int AS n
FROM public.profiles WHERE role = 'super_admin';

SELECT 'courses_count' AS check_name, count(*)::int AS n FROM public.courses;

SELECT 'payment_requests_count' AS check_name, count(*)::int AS n FROM public.payment_requests;

SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles', 'courses', 'payment_requests')
ORDER BY 1;

SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'authenticated'
  AND table_name IN ('profiles', 'courses', 'payment_requests')
ORDER BY table_name, privilege_type;

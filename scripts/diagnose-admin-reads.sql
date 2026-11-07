SELECT 'super_admin_count' AS check_name, count(*)::int AS n
FROM public.profiles
WHERE role = 'super_admin'
UNION ALL
SELECT 'courses_count', count(*)::int FROM public.courses
UNION ALL
SELECT 'payment_requests_count', count(*)::int FROM public.payment_requests;

SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles', 'courses', 'payment_requests')
ORDER BY 1;

SELECT pol.polname AS policy_name,
       c.relname AS table_name,
       CASE pol.polcmd
         WHEN 'r' THEN 'SELECT'
         WHEN 'a' THEN 'INSERT'
         WHEN 'w' THEN 'UPDATE'
         WHEN 'd' THEN 'DELETE'
         ELSE pol.polcmd::text
       END AS command
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles', 'courses', 'payment_requests')
ORDER BY c.relname, pol.polname;

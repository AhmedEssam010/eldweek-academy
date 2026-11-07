SELECT
  (SELECT count(*)::int FROM public.profiles WHERE role = 'super_admin') AS super_admin_count,
  (SELECT count(*)::int FROM public.profiles WHERE role = 'super_admin' AND is_active) AS active_super_admin_count,
  (SELECT count(*)::int FROM auth.users) AS auth_users_count,
  (SELECT count(*)::int FROM public.profiles) AS profiles_count;

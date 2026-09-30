-- Las funciones auxiliares de RLS solo las necesitan usuarios autenticados.
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.can_read_account(uuid) from public, anon;

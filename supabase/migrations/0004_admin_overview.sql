-- Resumen de todas las cuentas de WhatsApp para el panel de administrador.
create or replace function public.admin_accounts_overview()
returns table (
  account_id            uuid,
  org_name              text,
  owner_email           text,
  verified_name         text,
  display_phone_number  text,
  status                text,
  history_sync_status   text,
  history_progress      int,
  onboarded_at          timestamptz,
  conversations         bigint,
  messages              bigint,
  last_message_at       timestamptz,
  last_analysis_at      timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Solo administradores';
  end if;

  return query
  select
    a.id,
    o.name,
    (select p.email from public.memberships m join public.profiles p on p.id = m.user_id
      where m.org_id = a.org_id order by m.created_at limit 1),
    a.verified_name,
    a.display_phone_number,
    a.status,
    a.history_sync_status,
    a.history_progress,
    a.onboarded_at,
    (select count(*) from public.conversations c where c.account_id = a.id),
    (select count(*) from public.messages msg where msg.account_id = a.id),
    (select max(c.last_message_at) from public.conversations c where c.account_id = a.id),
    (select max(an.created_at) from public.analyses an where an.account_id = a.id and an.kind = 'summary')
  from public.whatsapp_accounts a
  join public.organizations o on o.id = a.org_id
  order by a.onboarded_at desc;
end;
$$;

revoke execute on function public.admin_accounts_overview() from public, anon;

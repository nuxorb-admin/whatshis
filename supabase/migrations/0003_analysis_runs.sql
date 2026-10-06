-- Ejecuciones del análisis con IA por cuenta (para mostrar progreso y errores).
create table public.analysis_runs (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid not null references public.whatsapp_accounts(id) on delete cascade,
  status               text not null default 'running' check (status in ('running', 'completed', 'failed')),
  conversations_total  int not null default 0,
  conversations_done   int not null default 0,
  error                text,
  started_at           timestamptz not null default now(),
  finished_at          timestamptz
);
create index on public.analysis_runs (account_id, started_at desc);

alter table public.analysis_runs enable row level security;
create policy "analysis runs read" on public.analysis_runs
  for select using (public.can_read_account(account_id));

-- Incrementa el contador de progreso de forma atómica (varias conversaciones en paralelo).
create or replace function public.bump_analysis_progress(p_run uuid)
returns void language sql security definer set search_path = public as $$
  update public.analysis_runs set conversations_done = conversations_done + 1 where id = p_run;
$$;
revoke execute on function public.bump_analysis_progress(uuid) from public, anon, authenticated;

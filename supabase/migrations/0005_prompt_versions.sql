-- Prompts del análisis editables por administradores, con historial de versiones.
-- La versión vigente de cada prompt es la más reciente; si no hay ninguna se usa la del código.
create table public.prompt_versions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null check (key in ('conversation', 'summary')),
  content     text not null check (length(content) between 1 and 20000),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  note        text
);
create index on public.prompt_versions (key, created_at desc);

alter table public.prompt_versions enable row level security;

create policy "admins read prompts" on public.prompt_versions
  for select using (public.is_admin());
create policy "admins add prompts" on public.prompt_versions
  for insert with check (public.is_admin() and created_by = auth.uid());

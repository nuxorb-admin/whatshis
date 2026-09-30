-- Esquema inicial: organizaciones (clientes), cuentas de WhatsApp conectadas,
-- contactos, conversaciones, mensajes, eventos de webhook crudos y análisis.

create extension if not exists pgcrypto;

-- ─── Organizaciones y usuarios ────────────────────────────────────────────

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.memberships (
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner', 'member')),
  created_at  timestamptz not null default now(),
  primary key (user_id, org_id)
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.memberships where org_id = p_org and user_id = auth.uid());
$$;

-- Al registrarse, cada usuario obtiene su perfil y su propia organización.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');

  insert into public.organizations (name)
  values (coalesce(new.raw_user_meta_data ->> 'business_name', new.email))
  returning id into v_org;

  insert into public.memberships (user_id, org_id, role) values (new.id, v_org, 'owner');
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── WhatsApp ─────────────────────────────────────────────────────────────

create table public.whatsapp_accounts (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  waba_id                text not null,
  phone_number_id        text not null unique,
  business_id            text,
  display_phone_number   text,
  verified_name          text,
  status                 text not null default 'onboarding'
                           check (status in ('onboarding', 'connected', 'error', 'disconnected')),
  onboarded_at           timestamptz not null default now(),
  contacts_sync_requested_at timestamptz,
  history_sync_requested_at  timestamptz,
  history_sync_status    text not null default 'pending'
                           check (history_sync_status in ('pending', 'requested', 'in_progress', 'completed', 'declined', 'failed')),
  history_progress       int not null default 0,
  last_error             text,
  created_at             timestamptz not null default now()
);
create index on public.whatsapp_accounts (org_id);

-- Tokens de acceso: sin políticas RLS => solo accesibles con la service role key.
create table public.whatsapp_credentials (
  account_id    uuid primary key references public.whatsapp_accounts(id) on delete cascade,
  access_token  text not null,
  updated_at    timestamptz not null default now()
);

create table public.contacts (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.whatsapp_accounts(id) on delete cascade,
  wa_id         text not null,
  full_name     text,
  first_name    text,
  updated_at    timestamptz not null default now(),
  unique (account_id, wa_id)
);

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.whatsapp_accounts(id) on delete cascade,
  contact_wa_id    text not null,
  first_message_at timestamptz,
  last_message_at  timestamptz,
  created_at       timestamptz not null default now(),
  unique (account_id, contact_wa_id)
);
create index on public.conversations (account_id, last_message_at desc);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.whatsapp_accounts(id) on delete cascade,
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  wamid            text not null,
  direction        text not null check (direction in ('inbound', 'outbound')),
  source           text not null check (source in ('history', 'live', 'echo', 'api')),
  type             text not null,
  body             text,
  sent_at          timestamptz not null,
  status           text,
  raw              jsonb not null,
  created_at       timestamptz not null default now(),
  unique (account_id, wamid)
);
create index on public.messages (conversation_id, sent_at);

-- Registro crudo de todo lo que llega de Meta, para reprocesar si algo falla.
create table public.webhook_events (
  id            bigint generated always as identity primary key,
  field         text,
  phone_number_id text,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text
);
create index on public.webhook_events (processed_at) where processed_at is null;

-- Recalcula primera/última fecha de las conversaciones tocadas por un lote de mensajes.
create or replace function public.refresh_conversation_bounds(p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update public.conversations c
     set first_message_at = b.first_at,
         last_message_at  = b.last_at
    from (select conversation_id, min(sent_at) first_at, max(sent_at) last_at
            from public.messages
           where conversation_id = any(p_ids)
           group by conversation_id) b
   where c.id = b.conversation_id;
$$;
revoke execute on function public.refresh_conversation_bounds(uuid[]) from public, anon, authenticated;

-- ─── Análisis ─────────────────────────────────────────────────────────────

create table public.analyses (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.whatsapp_accounts(id) on delete cascade,
  conversation_id  uuid references public.conversations(id) on delete cascade,
  kind             text not null,
  result           jsonb not null,
  created_at       timestamptz not null default now()
);
create index on public.analyses (account_id, kind, created_at desc);

-- ─── RLS ──────────────────────────────────────────────────────────────────

alter table public.organizations        enable row level security;
alter table public.profiles             enable row level security;
alter table public.memberships          enable row level security;
alter table public.whatsapp_accounts    enable row level security;
alter table public.whatsapp_credentials enable row level security;
alter table public.contacts             enable row level security;
alter table public.conversations        enable row level security;
alter table public.messages             enable row level security;
alter table public.webhook_events       enable row level security;
alter table public.analyses             enable row level security;

create policy "org read" on public.organizations
  for select using (public.is_org_member(id));

create policy "own profile" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "own memberships" on public.memberships
  for select using (user_id = auth.uid() or public.is_admin());

create policy "account read" on public.whatsapp_accounts
  for select using (public.is_org_member(org_id));

create or replace function public.can_read_account(p_account uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.whatsapp_accounts a
    where a.id = p_account and public.is_org_member(a.org_id)
  );
$$;

create policy "contacts read"      on public.contacts      for select using (public.can_read_account(account_id));
create policy "conversations read" on public.conversations for select using (public.can_read_account(account_id));
create policy "messages read"      on public.messages      for select using (public.can_read_account(account_id));
create policy "analyses read"      on public.analyses      for select using (public.can_read_account(account_id));
-- whatsapp_credentials y webhook_events: sin políticas (solo servidor).

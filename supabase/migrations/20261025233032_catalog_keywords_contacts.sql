create table if not exists public.keywords (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  created_at timestamptz not null default now(),
  constraint keywords_word_len check (char_length(word) between 1 and 80)
);

create unique index if not exists keywords_word_lower_idx
  on public.keywords (lower(word));

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  telegram_chat_id text,
  created_at timestamptz not null default now(),
  constraint contacts_name_len check (char_length(name) between 1 and 80),
  constraint contacts_phone_digits check (phone ~ '^[0-9]{8,15}$'),
  constraint contacts_telegram_format check (
    telegram_chat_id is null or telegram_chat_id ~ '^-?[0-9]{5,20}$'
  )
);

create unique index if not exists contacts_phone_idx
  on public.contacts (phone);

create unique index if not exists contacts_telegram_idx
  on public.contacts (telegram_chat_id)
  where telegram_chat_id is not null;

alter table public.keywords enable row level security;
alter table public.contacts enable row level security;

revoke all on table public.keywords from anon, authenticated;
revoke all on table public.contacts from anon, authenticated;
grant select, insert, update, delete on table public.keywords to service_role;
grant select, insert, update, delete on table public.contacts to service_role;

alter table public.alert_ingest
  add column if not exists trigger text not null default 'voice';

alter table public.alert_ingest
  drop constraint if exists alert_ingest_trigger_check;

alter table public.alert_ingest
  add constraint alert_ingest_trigger_check
  check (trigger in ('voice', 'manual'));

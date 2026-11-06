create extension if not exists "pgcrypto";

create table if not exists public.alert_ingest (
  client_alert_id text primary key,
  phrase text not null,
  confidence double precision,
  created_at timestamptz,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  status text not null default 'pending' check (status in ('pending', 'sent')),
  received_at timestamptz not null default now()
);

create table if not exists public.alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  client_alert_id text not null references public.alert_ingest (client_alert_id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'telegram')),
  destination text not null,
  status text not null check (status in ('sent', 'failed')),
  error text,
  updated_at timestamptz not null default now(),
  unique (client_alert_id, channel, destination)
);

alter table public.alert_ingest enable row level security;
alter table public.alert_deliveries enable row level security;

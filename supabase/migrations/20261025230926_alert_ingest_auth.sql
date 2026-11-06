create table if not exists public.alert_ingest_auth (
  id integer primary key check (id = 1),
  token_sha256 text not null
);

alter table public.alert_ingest_auth enable row level security;

revoke all on table public.alert_ingest_auth from anon, authenticated;
grant select on table public.alert_ingest_auth to service_role;

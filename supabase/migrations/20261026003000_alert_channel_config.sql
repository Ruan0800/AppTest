create table if not exists public.alert_channel_config (
  id integer primary key check (id = 1),
  telegram_bot_token text not null
);

alter table public.alert_channel_config enable row level security;

revoke all on table public.alert_channel_config from anon, authenticated;
grant select on table public.alert_channel_config to service_role;

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'alert_deliveries'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%channel%';

  if constraint_name is not null then
    execute format('alter table public.alert_deliveries drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.alert_deliveries
  add constraint alert_deliveries_channel_check
  check (channel in ('whatsapp', 'telegram', 'sms'));

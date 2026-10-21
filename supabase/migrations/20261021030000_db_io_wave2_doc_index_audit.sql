-- Disk IO wave 2a: thin document index and driver-audit watermark read.
-- Does not change work_mem.

create table if not exists private.kv_doc_index (
  kv_key text primary key,
  doc_kind text not null,
  organization_id text,
  driver_id text,
  vehicle_id text,
  week_key text,
  status text,
  amount numeric,
  doc_date date,
  updated_at timestamptz not null default now()
);

create index if not exists kv_doc_index_kind_driver_idx
  on private.kv_doc_index (doc_kind, driver_id);
create index if not exists kv_doc_index_kind_week_idx
  on private.kv_doc_index (doc_kind, week_key);
create index if not exists kv_doc_index_kind_vehicle_idx
  on private.kv_doc_index (doc_kind, vehicle_id);

create or replace function private.sync_kv_doc_index()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  k text;
  v jsonb;
  kind text;
  week text;
  driver text;
  amt numeric;
begin
  if tg_op = 'DELETE' then
    delete from private.kv_doc_index where kv_key = old.key;
    return old;
  end if;

  k := new.key;
  if not (starts_with(k, 'finalized_report:') or starts_with(k, 'dispute-refund:'))
     or starts_with(k, 'dispute-refund-dedup:') then
    delete from private.kv_doc_index where kv_key = k;
    return new;
  end if;

  v := new.value;
  if starts_with(k, 'finalized_report:') then
    kind := 'finalized_report';
    week := split_part(k, ':', 2);
    if week !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      week := left(coalesce(v->>'weekStart', ''), 10);
    end if;
    driver := coalesce(nullif(v->>'driverId', ''), nullif(split_part(k, ':', 3), ''));
  else
    kind := 'dispute_refund';
    driver := coalesce(nullif(v->>'driverId', ''), nullif(v->>'driver_id', ''));
    week := left(coalesce(v->>'weekStart', v->>'weekKey', v->>'date', ''), 10);
  end if;

  if coalesce(v->>'amount', '') ~ '^-?[0-9]+([.][0-9]+)?$' then
    amt := (v->>'amount')::numeric;
  else
    amt := null;
  end if;

  insert into private.kv_doc_index (
    kv_key, doc_kind, organization_id, driver_id, vehicle_id, week_key, status, amount, doc_date, updated_at
  ) values (
    k,
    kind,
    nullif(v->>'organizationId', ''),
    nullif(driver, ''),
    nullif(v->>'vehicleId', ''),
    nullif(week, ''),
    nullif(v->>'status', ''),
    amt,
    case when week ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then week::date else null end,
    now()
  )
  on conflict (kv_key) do update set
    doc_kind = excluded.doc_kind,
    organization_id = excluded.organization_id,
    driver_id = excluded.driver_id,
    vehicle_id = excluded.vehicle_id,
    week_key = excluded.week_key,
    status = excluded.status,
    amount = excluded.amount,
    doc_date = excluded.doc_date,
    updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists kv_doc_index_sync on public.kv_store_37f42386;
create trigger kv_doc_index_sync
  after insert or update or delete on public.kv_store_37f42386
  for each row execute function private.sync_kv_doc_index();

insert into private.kv_doc_index (
  kv_key, doc_kind, organization_id, driver_id, vehicle_id, week_key, status, amount, doc_date, updated_at
)
select
  k.key,
  case when starts_with(k.key, 'finalized_report:') then 'finalized_report' else 'dispute_refund' end,
  nullif(k.value->>'organizationId', ''),
  coalesce(
    nullif(k.value->>'driverId', ''),
    nullif(k.value->>'driver_id', ''),
    case when starts_with(k.key, 'finalized_report:') then nullif(split_part(k.key, ':', 3), '') else null end
  ),
  nullif(k.value->>'vehicleId', ''),
  nullif(
    case
      when starts_with(k.key, 'finalized_report:') and split_part(k.key, ':', 2) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then split_part(k.key, ':', 2)
      else left(coalesce(k.value->>'weekStart', k.value->>'weekKey', k.value->>'date', ''), 10)
    end,
    ''
  ),
  nullif(k.value->>'status', ''),
  case
    when coalesce(k.value->>'amount', '') ~ '^-?[0-9]+([.][0-9]+)?$' then (k.value->>'amount')::numeric
    else null
  end,
  case
    when (
      case
        when starts_with(k.key, 'finalized_report:') and split_part(k.key, ':', 2) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          then split_part(k.key, ':', 2)
        else left(coalesce(k.value->>'weekStart', k.value->>'date', ''), 10)
      end
    ) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then (
      case
        when starts_with(k.key, 'finalized_report:') and split_part(k.key, ':', 2) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          then split_part(k.key, ':', 2)
        else left(coalesce(k.value->>'weekStart', k.value->>'date', ''), 10)
      end
    )::date
    else null
  end,
  now()
from public.kv_store_37f42386 k
where starts_with(k.key, 'finalized_report:')
   or (starts_with(k.key, 'dispute-refund:') and not starts_with(k.key, 'dispute-refund-dedup:'))
on conflict (kv_key) do nothing;

create or replace function public.kv_doc_index_keys(
  p_kind text,
  p_driver_ids text[] default null,
  p_week_key text default null,
  p_vehicle_id text default null
)
returns table (kv_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.kv_key
  from private.kv_doc_index i
  where i.doc_kind = p_kind
    and (p_driver_ids is null or i.driver_id = any (p_driver_ids))
    and (p_week_key is null or i.week_key = p_week_key)
    and (p_vehicle_id is null or i.vehicle_id = p_vehicle_id);
$$;

revoke all on function public.kv_doc_index_keys(text, text[], text, text) from public, anon, authenticated;
grant execute on function public.kv_doc_index_keys(text, text[], text, text) to service_role;

-- ISO timestamps sort as text, and timestamptz casts are not immutable, so the
-- watermark query filters the driver_audit key range instead of an expression index.

create or replace function public.driver_audit_events_since(
  p_after timestamptz,
  p_after_key text,
  p_limit int
)
returns table (kv_key text, value jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.key, s.value
  from public.kv_store_37f42386 s
  where starts_with(s.key, 'driver_audit:')
    and (s.value->>'at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    and (
      p_after is null
      or (s.value->>'at')::timestamptz > p_after
      or (
        (s.value->>'at')::timestamptz = p_after
        and s.key > coalesce(p_after_key, '')
      )
    )
  order by (s.value->>'at')::timestamptz, s.key
  limit least(greatest(coalesce(p_limit, 500), 1), 500);
$$;

revoke all on function public.driver_audit_events_since(timestamptz, text, int) from public, anon, authenticated;
grant execute on function public.driver_audit_events_since(timestamptz, text, int) to service_role;

notify pgrst, 'reload schema';

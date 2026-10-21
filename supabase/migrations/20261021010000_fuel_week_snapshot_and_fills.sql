-- Saved fuel week the screen reviews, plus distances computed when trips and fills change.
-- vehicle_week_distance lives in public so the close job can upsert it with the service role
-- without a fleet-schema grant. A trigger marks a saved week stale when trips or fills change.

create table if not exists public.fuel_week_snapshot (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  period_id text not null,
  week_start date not null,
  version integer not null,
  inputs_hash text not null,
  money jsonb not null,
  blockers jsonb not null default '[]'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, period_id, version)
);

create index if not exists fuel_week_snapshot_period_idx
  on public.fuel_week_snapshot (org_id, period_id, version desc);

alter table public.fuel_week_snapshot enable row level security;

create table if not exists public.vehicle_week_distance (
  organization_id text not null,
  vehicle_id text not null,
  week_start date not null,
  deadhead_km numeric,
  rideshare_km numeric,
  trip_km numeric,
  personal_km numeric,
  computed_from_hash text,
  stale boolean not null default false,
  computed_at timestamptz not null default now(),
  primary key (organization_id, vehicle_id, week_start)
);

alter table public.vehicle_week_distance enable row level security;

create or replace function public.mark_vehicle_week_distance_stale()
returns trigger
language plpgsql
as $$
declare
  org text;
  vehicle text;
  day date;
  week date;
begin
  org := coalesce(new.organization_id, old.organization_id);
  vehicle := coalesce(new.vehicle_id, old.vehicle_id);
  day := coalesce(new.date, old.date);
  if org is null or vehicle is null or day is null then
    return coalesce(new, old);
  end if;
  week := date_trunc('week', day::timestamp)::date;
  update public.vehicle_week_distance
     set stale = true
   where organization_id = org
     and vehicle_id = vehicle
     and week_start = week;
  return coalesce(new, old);
end;
$$;

drop trigger if exists fuel_entries_mark_distance_stale on fleet.fuel_entries;
create trigger fuel_entries_mark_distance_stale
after insert or update or delete on fleet.fuel_entries
for each row execute function public.mark_vehicle_week_distance_stale();

drop trigger if exists trips_mark_distance_stale on fleet.trips;
create trigger trips_mark_distance_stale
after insert or update or delete on fleet.trips
for each row execute function public.mark_vehicle_week_distance_stale();

-- One physical fill. Statement-ledger rows stay out. A manual log and a card
-- transaction at the same vehicle, day, odometer, and amount collapse to one row.
create or replace view public.week_fuel_fills as
select
  e.organization_id,
  e.vehicle_id,
  e.date::date as fill_date,
  nullif(e.payload_json->>'odometer', '')::numeric as odometer,
  max(e.amount) as amount,
  max(e.liters) as litres,
  max(e.id) filter (where coalesce(e.type, e.payload_json->>'type') = 'Card_Transaction') as card_tx_id,
  max(e.id) filter (
    where coalesce(e.type, e.payload_json->>'type') in ('Manual_Entry', 'Fuel_Manual_Entry')
  ) as manual_entry_id
from fleet.fuel_entries e
where coalesce(e.payload_json->>'importSource', e.payload_json->>'entrySource', '')
      not in ('jaa_raw', 'jaa_statement_details', 'fuel_statement')
  and e.amount > 0
group by e.organization_id, e.vehicle_id, e.date::date, nullif(e.payload_json->>'odometer', '')::numeric, e.amount;

-- Foreign 2026-08-24 row: same spend as another fleet's locked week, not itself locked.
delete from public.fuel_reconciliation_period p
where p.week_start = date '2026-08-24'
  and p.status <> 'locked'
  and p.computed_from_hash like 'finalized:%'
  and exists (
    select 1
    from public.fuel_reconciliation_period locked
    where locked.week_start = p.week_start
      and locked.status = 'locked'
      and locked.org_id <> p.org_id
      and locked.total_spend = p.total_spend
      and locked.total_spend > 0
  );

-- Weeks that have fuel and no period row for that fleet. Review only — do not invent a close.
create or replace view public.fuel_weeks_missing_period as
select e.organization_id,
       date_trunc('week', e.date)::date as week_start,
       count(*) as fill_count,
       sum(e.amount) as total_amount
from fleet.fuel_entries e
where e.amount > 0
  and not exists (
    select 1
    from public.fuel_reconciliation_period p
    where p.org_id::text = e.organization_id
      and p.week_start = date_trunc('week', e.date)::date
  )
group by 1, 2;

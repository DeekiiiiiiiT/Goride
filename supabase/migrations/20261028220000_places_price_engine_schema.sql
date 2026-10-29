-- Fuel price engine intake. Reports are kept. Only the engine writes the public price.

create schema if not exists fuel;

create table if not exists fuel.petrojam_prices (
  id uuid primary key default gen_random_uuid(),
  price_date date not null,
  gasolene_87 numeric,
  gasolene_90 numeric,
  auto_diesel numeric,
  kerosene numeric,
  propane numeric,
  butane numeric,
  hfo numeric,
  asphalt numeric,
  ulsd numeric,
  source_url text not null default 'https://www.petrojam.com/price/',
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fuel_petrojam_prices_price_date_unique unique (price_date)
);

create table places.fleet_price_report (
  id uuid primary key default gen_random_uuid(),
  fuel_entry_id text unique not null,
  organization_id text not null,
  driver_id text,
  vehicle_id text,
  place_id text references places.place(id),
  grade text not null check (grade in ('e10_87', 'e10_90', 'diesel', 'ulsd', 'unknown')),
  grade_source text not null check (grade_source in ('vehicle', 'fill', 'statement', 'unknown')),
  litres numeric not null check (litres > 0),
  amount numeric not null check (amount > 0),
  price_per_litre numeric generated always as (round(amount / litres, 4)) stored,
  pump_photo_path text,
  station_state text,
  gps_accuracy_m numeric,
  reported_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table places.plug_price_report (
  id uuid primary key default gen_random_uuid(),
  fuel_log_id uuid unique not null,
  reporter_hash text not null,
  catalog_variant_id uuid,
  place_id text references places.place(id),
  grade text not null check (grade in ('e10_87', 'e10_90', 'diesel', 'ulsd', 'unknown')),
  grade_source text not null check (grade_source in ('vehicle_locked', 'user_changed', 'unknown')),
  litres numeric not null check (litres > 0),
  amount numeric not null check (amount > 0),
  price_per_litre numeric generated always as (round(amount / litres, 4)) stored,
  gps_accuracy_m numeric,
  mock_location boolean not null default false,
  station_match text not null check (station_match in ('auto', 'manual', 'new_place')),
  reported_at timestamptz not null,
  created_at timestamptz not null default now()
);

create view places.price_report as
  select
    'fleet'::text as source,
    id,
    place_id,
    grade,
    price_per_litre,
    reported_at,
    'fleet:' || coalesce(driver_id, organization_id) as reporter_key
  from places.fleet_price_report
  union all
  select
    'plug'::text,
    id,
    place_id,
    grade,
    price_per_litre,
    reported_at,
    'plug:' || reporter_hash
  from places.plug_price_report;

create table places.price_report_check (
  source text not null,
  report_id uuid not null,
  status text not null check (status in ('accepted', 'review', 'waiting_place', 'approved', 'rejected')),
  reasons text[] not null default '{}',
  detail jsonb not null default '{}',
  weight numeric not null,
  trust_applied boolean not null default false,
  checked_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  primary key (source, report_id)
);

create table places.price_reporter (
  reporter_key text primary key,
  source text not null,
  trust_weight numeric not null check (trust_weight between 0.1 and 3.0),
  reports int not null default 0,
  accepted int not null default 0,
  owner_rejected int not null default 0,
  last_report_at timestamptz,
  updated_at timestamptz not null default now()
);

create table places.published_fuel_price (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references places.place(id),
  grade text not null,
  price_per_litre numeric not null,
  report_count int not null,
  fleet_count int not null,
  plug_count int not null,
  spread_pct numeric,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  petrojam_week date not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  published_at timestamptz not null default now(),
  valid_until timestamptz not null
);

create table places.price_engine_settings (
  id int primary key default 1 check (id = 1),
  bounds_low numeric not null default 0.80,
  bounds_high numeric not null default 1.50,
  change_pct numeric not null default 0.12,
  mad_k numeric not null default 3.5,
  mad_min_reports int not null default 4,
  window_days int not null default 7,
  fleet_weight numeric not null default 2.0,
  plug_weight numeric not null default 1.0,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into places.price_engine_settings (id) values (1)
on conflict (id) do nothing;

alter table places.price_current
  add column if not exists confidence text,
  add column if not exists report_count int,
  add column if not exists fleet_count int,
  add column if not exists plug_count int,
  add column if not exists petrojam_week date,
  add column if not exists valid_until timestamptz,
  add column if not exists published_id uuid,
  add column if not exists outdated boolean not null default false;

create index fleet_price_report_place_idx
  on places.fleet_price_report (place_id, grade, reported_at desc);
create index plug_price_report_place_idx
  on places.plug_price_report (place_id, grade, reported_at desc);
create index price_report_check_status_idx
  on places.price_report_check (status);
create index published_fuel_price_place_idx
  on places.published_fuel_price (place_id, grade, published_at desc);

create trigger fleet_price_report_master_change
  after insert or delete or update on places.fleet_price_report
  for each row execute function fleet.log_master_change();

create trigger plug_price_report_master_change
  after insert or delete or update on places.plug_price_report
  for each row execute function fleet.log_master_change();

create trigger published_fuel_price_master_change
  after insert or delete or update on places.published_fuel_price
  for each row execute function fleet.log_master_change();

create or replace function places.map_fuel_grade(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null or btrim(raw) = '' then null
    when lower(raw) like '%ulsd%' then 'ulsd'
    when lower(raw) like '%diesel%' or lower(raw) like '%ado%' then 'diesel'
    when lower(raw) ~ '(^|[^0-9])9[013]([^0-9]|$)|e10.?90' then 'e10_90'
    when lower(raw) ~ '87|e10' then 'e10_87'
    else 'unknown'
  end
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'fleet_price_report', 'plug_price_report', 'price_report_check',
    'price_reporter', 'published_fuel_price', 'price_engine_settings'
  ]
  loop
    execute format('alter table places.%I enable row level security', tbl);
    execute format('revoke all on places.%I from public, anon, authenticated', tbl);
    execute format('grant select, insert, update, delete on places.%I to service_role', tbl);
  end loop;
end $$;

revoke all on places.price_report from public, anon, authenticated;
grant select on places.price_report to service_role;
revoke all on function places.map_fuel_grade(text) from public, anon, authenticated;
grant execute on function places.map_fuel_grade(text) to service_role;

-- Typed columns for Dominion master data. payload_json stays until every reader uses the columns.
-- organization_id is left in place until a check shows every row is still empty.

alter table fleet.stations
  add column if not exists brand text,
  add column if not exists status text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists address text,
  add column if not exists pcode text,
  add column if not exists publish_state text;

alter table fleet.toll_plazas
  add column if not exists status text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists publish_state text;

alter table fleet.platform_vendors
  add column if not exists status text,
  add column if not exists category text,
  add column if not exists publish_state text;

update fleet.stations
set
  brand = coalesce(brand, payload_json->>'brand'),
  status = coalesce(status, payload_json->>'status'),
  lat = coalesce(lat, nullif(payload_json->>'lat', '')::double precision),
  lng = coalesce(lng, nullif(payload_json->>'lng', '')::double precision),
  address = coalesce(address, payload_json->>'address'),
  pcode = coalesce(pcode, payload_json->>'pcode'),
  publish_state = case payload_json->>'status'
    when 'verified' then 'published'
    when 'resolved' then 'retired'
    else 'in_review'
  end
where payload_json is not null;

update fleet.toll_plazas
set
  status = coalesce(status, payload_json->>'status', 'published'),
  lat = coalesce(lat, nullif(payload_json->>'lat', '')::double precision),
  lng = coalesce(lng, nullif(payload_json->>'lng', '')::double precision),
  publish_state = 'published';

update fleet.platform_vendors
set
  status = coalesce(status, payload_json->>'status', 'published'),
  category = coalesce(category, payload_json->>'category'),
  publish_state = 'published';

create index if not exists stations_status_idx on fleet.stations (status);
create index if not exists toll_plazas_status_idx on fleet.toll_plazas (status);

create table if not exists fleet.master_change_log (
  id uuid primary key default gen_random_uuid(),
  dataset text not null,
  record_id text not null,
  action text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists master_change_log_created_idx
  on fleet.master_change_log (created_at desc);

create or replace function fleet.log_master_change()
returns trigger
language plpgsql
as $$
begin
  insert into fleet.master_change_log (dataset, record_id, action, before_json, after_json)
  values (
    tg_table_name,
    coalesce(new.id, old.id)::text,
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists stations_master_change on fleet.stations;
create trigger stations_master_change
  after insert or update or delete on fleet.stations
  for each row execute function fleet.log_master_change();

drop trigger if exists toll_plazas_master_change on fleet.toll_plazas;
create trigger toll_plazas_master_change
  after insert or update or delete on fleet.toll_plazas
  for each row execute function fleet.log_master_change();

drop trigger if exists platform_vendors_master_change on fleet.platform_vendors;
create trigger platform_vendors_master_change
  after insert or update or delete on fleet.platform_vendors
  for each row execute function fleet.log_master_change();

create or replace view fleet.station_quality as
select
  id,
  name,
  status,
  (lat is not null and lng is not null and pcode is not null and brand is not null) as complete
from fleet.stations;

revoke all on fleet.master_change_log from anon, authenticated;
revoke all on fleet.station_quality from anon, authenticated;

create table if not exists fleet.catalog_consumers (
  app_key text primary key,
  name text not null,
  site text,
  admin_url text,
  datasets text[] not null default '{}',
  last_sync_at timestamptz,
  last_error text
);

insert into fleet.catalog_consumers (app_key, name, site, admin_url, datasets)
values
  ('plug', 'Roam Plug', 'https://roamplug.app', 'https://roamplug.app', array['stations', 'places', 'tolls']),
  ('fleet', 'Roam Fleet', 'https://roamfleet.co', 'https://roamfleet.co/admin', array['stations', 'vehicles', 'tolls']),
  ('driver', 'Roam Driver', 'https://roamdriver.co', 'https://roamdriver.co/admin', array['vehicles', 'stations']),
  ('rides', 'Roam Rides', 'https://roam-s.co', 'https://roam-s.co/admin', array['tolls', 'places']),
  ('rush', 'Roam Rush', 'https://roamrush.app', 'https://roamrush.app/admin', array['places']),
  ('haul', 'Roam Haul', 'https://roamhaul.co', 'https://roamhaul.co/admin', array['places']),
  ('enterprise', 'Roam Enterprise', 'https://roamenterprise.co', 'https://roamenterprise.co/admin', array['vendors', 'tax'])
on conflict (app_key) do nothing;

revoke all on fleet.catalog_consumers from anon, authenticated;

create table if not exists fleet.dataset_quality (
  dataset text primary key,
  score int,
  failing int,
  checked_at timestamptz not null default now(),
  note text
);

create or replace function fleet.score_master_data()
returns void
language plpgsql
as $$
declare
  station_total int;
  station_fail int;
  station_score int;
begin
  select count(*) into station_total from fleet.stations;
  select count(*) into station_fail from fleet.station_quality where not coalesce(complete, false);
  if station_total = 0 then
    station_score := null;
  else
    station_score := ((station_total - station_fail) * 100) / station_total;
  end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('stations', station_score, station_fail, now(), case when station_total = 0 then 'Not scored yet' else null end)
  on conflict (dataset) do update
    set score = excluded.score,
        failing = excluded.failing,
        checked_at = excluded.checked_at,
        note = excluded.note;
end;
$$;

revoke all on fleet.dataset_quality from anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'dominion-score-master-data';

    perform cron.schedule(
      'dominion-score-master-data',
      '15 2 * * *',
      $cmd$select fleet.score_master_data();$cmd$
    );
  else
    raise notice 'pg_cron not available; schedule fleet.score_master_data nightly by hand.';
  end if;
exception
  when others then
    raise notice 'Could not schedule fleet.score_master_data: %', sqlerrm;
end
$cron$;

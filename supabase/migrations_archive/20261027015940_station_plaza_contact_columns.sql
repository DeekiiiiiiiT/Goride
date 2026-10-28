-- Contact, amenities, parish text, and plaza direction leave payload_json.
-- The blob stays until every reader uses these columns.

alter table fleet.stations
  add column if not exists parish text,
  add column if not exists phone text,
  add column if not exists website text,
  add column if not exists amenities text[];

alter table fleet.toll_plazas
  add column if not exists direction text,
  add column if not exists parish text;

update fleet.stations
set
  parish = coalesce(parish, nullif(payload_json->>'parish', '')),
  phone = coalesce(phone, nullif(payload_json#>>'{contactInfo,phone}', '')),
  website = coalesce(website, nullif(payload_json#>>'{contactInfo,website}', ''))
where payload_json is not null;

update fleet.stations
set amenities = coalesce(
  amenities,
  (
    select array_agg(item) from jsonb_array_elements_text(payload_json->'amenities') as item
  )
)
where payload_json is not null
  and jsonb_typeof(payload_json->'amenities') = 'array'
  and amenities is null;

update fleet.toll_plazas
set
  direction = coalesce(direction, nullif(payload_json->>'direction', '')),
  parish = coalesce(parish, nullif(payload_json->>'parish', ''))
where payload_json is not null;

drop view if exists public.fleet_stations;
create view public.fleet_stations
with (security_invoker = true) as
select * from fleet.stations;
revoke all on public.fleet_stations from public, anon;
grant select on public.fleet_stations to authenticated;
grant all on public.fleet_stations to service_role;

drop view if exists public.fleet_toll_plazas;
create view public.fleet_toll_plazas
with (security_invoker = true) as
select * from fleet.toll_plazas;
revoke all on public.fleet_toll_plazas from public, anon;
grant select on public.fleet_toll_plazas to authenticated;
grant all on public.fleet_toll_plazas to service_role;

notify pgrst, 'reload schema';

-- Dominion health reads and master saves stay off the fleet schema API.
-- Service role uses public views and wrappers. Signed-out visitors cannot run the score.

grant select on fleet.master_change_log to service_role;
grant select, update on fleet.catalog_consumers to service_role;
grant select on fleet.dataset_quality to service_role;

create or replace view public.fleet_master_changes
with (security_invoker = true) as
select id, dataset, record_id, action, actor, reason, created_at
from fleet.master_change_log;

revoke all on public.fleet_master_changes from public, anon, authenticated;
grant select on public.fleet_master_changes to service_role;

create or replace view public.fleet_catalog_consumers
with (security_invoker = true) as
select app_key, name, site, admin_url, datasets, last_sync_at, last_error
from fleet.catalog_consumers;

revoke all on public.fleet_catalog_consumers from public, anon, authenticated;
grant select, update on public.fleet_catalog_consumers to service_role;

create or replace view public.fleet_dataset_quality
with (security_invoker = true) as
select dataset, score, failing, checked_at, note
from fleet.dataset_quality;

revoke all on public.fleet_dataset_quality from public, anon, authenticated;
grant select on public.fleet_dataset_quality to service_role;

create or replace function public.fleet_upsert_master(
  p_table text,
  p_row jsonb,
  p_actor text,
  p_action text
) returns void
language plpgsql
security definer
set search_path = fleet, public
as $$
begin
  perform fleet.upsert_master(p_table, p_row, p_actor, p_action);
end;
$$;

revoke all on function public.fleet_upsert_master(text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.fleet_upsert_master(text, jsonb, text, text) to service_role;

create or replace function public.fleet_station_fill_summary()
returns table (station_id text, fill_count int, last_fill_at text)
language sql
stable
security definer
set search_path = fleet, public
as $$
  select station_id, fill_count, last_fill_at from fleet.station_fill_summary();
$$;

revoke all on function public.fleet_station_fill_summary() from public, anon, authenticated;
grant execute on function public.fleet_station_fill_summary() to service_role;

create or replace function fleet.score_master_data()
returns void
language plpgsql
security definer
set search_path = fleet, public, places, geo
as $$
declare
  total int;
  failing int;
  score int;
  note text;
  boundary_total int;
  boundary_fail int;
  place_total int;
  place_fail int;
begin
  select count(*) into total from fleet.stations;
  select count(*) into failing from fleet.station_quality where not coalesce(complete, false);
  if total = 0 then
    score := null; note := 'Not scored yet'; failing := 0;
  else
    score := ((total - failing) * 100) / total; note := null;
  end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('stations', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;

  select count(*) into total from fleet.toll_plazas;
  select count(*) into failing from fleet.toll_plazas
    where name is null or lat is null or lng is null;
  if total = 0 then score := null; note := 'Not scored yet'; failing := 0;
  else score := ((total - failing) * 100) / total; note := null; end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('tolls', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;

  select count(*) into total from fleet.platform_vendors;
  select count(*) into failing from fleet.platform_vendors
    where name is null or publish_state is null;
  if total = 0 then score := null; note := 'Not scored yet'; failing := 0;
  else score := ((total - failing) * 100) / total; note := null; end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('vendors', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;

  if to_regclass('public.vehicle_catalog') is null then
    total := 0;
  else
    execute 'select count(*) from public.vehicle_catalog' into total;
    execute 'select count(*) from public.vehicle_catalog where make is null or model is null' into failing;
  end if;
  if total = 0 then score := null; note := 'Not scored yet'; failing := 0;
  else score := ((total - failing) * 100) / total; note := null; end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('vehicles', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;

  -- World Maps: a boundary needs a published shape. A place needs a name and a pin.
  boundary_total := 0;
  boundary_fail := 0;
  place_total := 0;
  place_fail := 0;
  if to_regclass('geo.boundaries') is not null then
    select count(*) into boundary_total from geo.boundaries;
    select count(*) into boundary_fail
    from geo.boundaries b
    where not exists (
      select 1
      from geo.boundary_versions v
      where v.id = b.current_version_id
        and v.status = 'published'
        and v.geom is not null
    );
  end if;
  if to_regclass('geo.places') is not null then
    select count(*) into place_total from geo.places;
    select count(*) into place_fail from geo.places
      where name is null or lat is null or lng is null;
  end if;
  total := boundary_total + place_total;
  failing := boundary_fail + place_fail;
  if total = 0 then score := null; note := 'Not scored yet'; failing := 0;
  else score := ((total - failing) * 100) / total; note := null; end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('maps', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;

  if to_regclass('public.gct_rates') is null then
    total := 0; failing := 0;
  else
    execute 'select count(*) from public.gct_rates' into total;
    execute 'select count(*) from public.gct_rates where supply_class is null or rate_percent is null or effective_from is null' into failing;
  end if;
  if total = 0 then score := null; note := 'Not scored yet'; failing := 0;
  else score := ((total - failing) * 100) / total; note := null; end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('gct_rates', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;
end;
$$;

revoke all on function fleet.score_master_data() from public, anon, authenticated;

create or replace function public.fleet_delete_master(
  p_table text,
  p_id text,
  p_actor text
) returns void
language plpgsql
security definer
set search_path = fleet, public
as $$
begin
  if p_table not in ('stations', 'toll_plazas', 'platform_vendors') then
    raise exception 'unsupported master table %', p_table;
  end if;
  perform set_config('app.actor', coalesce(p_actor, ''), true);
  perform set_config('app.reason', 'deleted', true);
  execute format(
    'delete from fleet.%I where id = $1 or legacy_kv_id = $1',
    p_table
  ) using p_id;
end;
$$;

revoke all on function public.fleet_delete_master(text, text, text) from public, anon, authenticated;
grant execute on function public.fleet_delete_master(text, text, text) to service_role;

select fleet.score_master_data();

notify pgrst, 'reload schema';

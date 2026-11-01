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
  places_pin_fail int;
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

  select count(*) into total from places.place;
  select count(*) into failing
  from places.place p
  left join places.place_type t on t.slug = p.place_type
  where p.pin_state not in ('confirmed', 'offset')
     or nullif(btrim(p.pcode), '') is null
     or (coalesce(t.match_profile, '') = 'fuel' and p.brand_id is null);
  select count(*) into places_pin_fail
  from places.place
  where pin_state not in ('confirmed', 'offset');
  if total = 0 then
    score := null; note := 'Not scored yet'; failing := 0;
  else
    score := ((total - failing) * 100) / total;
    note := case when places_pin_fail > 0 then places_pin_fail || ' pins not checked' else null end;
  end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('places', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;
end;
$$;

revoke all on function fleet.score_master_data() from public, anon, authenticated;
grant execute on function fleet.score_master_data() to service_role;
select fleet.score_master_data();;

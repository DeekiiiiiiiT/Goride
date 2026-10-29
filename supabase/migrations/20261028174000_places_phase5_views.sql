-- Phase 5. Fleet saves go to the place register. The old station and toll
-- lists stay as views of the same shape, so current readers keep working.
-- The save RPC is updated in this same step, so a station edit does not
-- need a new app release to land in the register.

alter table places.place add column if not exists legacy_payload jsonb;

update places.place p
set legacy_payload = s.payload_json
from fleet.stations s
where s.id = p.id
  and p.legacy_payload is null;

update places.place p
set legacy_payload = t.payload_json
from fleet.toll_plazas t
where t.id = p.id
  and p.legacy_payload is null;

create or replace function places.apply_station_row(p_row jsonb)
returns void
language plpgsql
security definer
set search_path = places, public
as $$
declare
  v_id text := nullif(p_row->>'id', '');
  v_lat double precision := nullif(p_row->>'lat', '')::double precision;
  v_lng double precision := nullif(p_row->>'lng', '')::double precision;
  v_legacy text;
  v_status text;
  v_brand uuid;
  v_geofence int;
  v_plus text;
  v_origin text;
  v_payload jsonb := coalesce(p_row->'payload_json', '{}'::jsonb);
begin
  if v_id is null then
    raise exception 'station row needs an id';
  end if;
  v_legacy := coalesce(nullif(p_row->>'legacy_kv_id', ''), 'station:' || v_id);
  if v_legacy like 'unverified_vendor:%' or v_lat is null or v_lng is null then
    insert into places.place_legacy_archive (id, legacy_kv_id, reason, payload)
    values (v_id, v_legacy, 'not_a_place', v_payload)
    on conflict (id) do update set payload = excluded.payload, archived_at = now();
    delete from places.place where id = v_id;
    return;
  end if;

  v_status := case coalesce(p_row->>'status', v_payload->>'status')
    when 'verified' then 'verified'
    when 'learnt' then 'learnt'
    when 'unverified' then 'pending'
    when 'pending' then 'pending'
    when 'resolved' then 'closed'
    when 'closed' then 'closed'
    else 'pending'
  end;

  select b.id into v_brand
  from places.brand b
  where nullif(btrim(coalesce(p_row->>'brand', v_payload->>'brand')), '') is not null
    and (
      lower(btrim(coalesce(p_row->>'brand', v_payload->>'brand'))) = lower(b.name)
      or exists (
        select 1 from unnest(b.aliases) alias_name
        where lower(alias_name) = lower(btrim(coalesce(p_row->>'brand', v_payload->>'brand')))
      )
    )
  limit 1;

  v_geofence := null;
  if (v_payload->>'geofenceRadius') ~ '^[0-9]+(\.[0-9]+)?$' then
    v_geofence := round((v_payload->>'geofenceRadius')::numeric)::int;
    if v_geofence < 10 or v_geofence > 2000 then
      v_geofence := null;
    end if;
  end if;

  v_plus := nullif(btrim(v_payload->>'plusCode'), '');
  if v_plus is null then
    v_plus := places.encode_plus_code(v_lat, v_lng);
  end if;

  v_origin := coalesce(p_row->>'origin_app', v_payload->>'originApp', 'manual');
  if v_origin not in ('roam_fleet', 'roam_plug', 'manual') then
    v_origin := 'manual';
  end if;

  insert into places.place (
    id, place_type, name, brand_id, lat, lng, plus_code, pcode, address, parish,
    phone, website, status, pin_state, geofence_m, origin_app, legacy_kv_id,
    legacy_payload, updated_at
  ) values (
    v_id,
    'gas_station',
    coalesce(nullif(btrim(coalesce(p_row->>'name', v_payload->>'name')), ''), 'Gas station'),
    v_brand,
    v_lat,
    v_lng,
    v_plus,
    nullif(btrim(coalesce(p_row->>'pcode', v_payload->>'pcode', v_payload->>'parishPcode')), ''),
    nullif(btrim(coalesce(p_row->>'address', v_payload->>'address')), ''),
    nullif(btrim(coalesce(p_row->>'parish', v_payload->>'parish')), ''),
    nullif(btrim(coalesce(p_row->>'phone', v_payload#>>'{contactInfo,phone}')), ''),
    nullif(btrim(coalesce(p_row->>'website', v_payload#>>'{contactInfo,website}')), ''),
    v_status,
    case
      when v_payload->>'pinConfirmed' = 'false' then 'offset'
      when v_payload->>'pinConfirmed' = 'true' then 'confirmed'
      else 'unchecked'
    end,
    v_geofence,
    v_origin,
    v_legacy,
    v_payload,
    now()
  )
  on conflict (id) do update set
    name = excluded.name,
    brand_id = excluded.brand_id,
    lat = excluded.lat,
    lng = excluded.lng,
    plus_code = excluded.plus_code,
    pcode = excluded.pcode,
    address = excluded.address,
    parish = excluded.parish,
    phone = excluded.phone,
    website = excluded.website,
    status = excluded.status,
    pin_state = excluded.pin_state,
    geofence_m = excluded.geofence_m,
    origin_app = excluded.origin_app,
    legacy_kv_id = excluded.legacy_kv_id,
    legacy_payload = excluded.legacy_payload,
    updated_at = now();

  insert into places.place_facility (place_id, facility_type, source)
  select v_id, 'fuel_pump', 'fleet_evidence'
  where not exists (
    select 1 from places.place_facility f
    where f.place_id = v_id and f.facility_type = 'fuel_pump' and coalesce(f.label, '') = ''
  );
end;
$$;

create or replace function places.apply_toll_row(p_row jsonb)
returns void
language plpgsql
security definer
set search_path = places, public
as $$
declare
  v_id text := nullif(p_row->>'id', '');
  v_lat double precision := nullif(p_row->>'lat', '')::double precision;
  v_lng double precision := nullif(p_row->>'lng', '')::double precision;
  v_payload jsonb := coalesce(p_row->'payload_json', '{}'::jsonb);
  v_geofence int;
  v_plus text;
begin
  if v_id is null or v_lat is null or v_lng is null then
    return;
  end if;
  v_geofence := null;
  if (v_payload->>'geofenceRadius') ~ '^[0-9]+(\.[0-9]+)?$' then
    v_geofence := round((v_payload->>'geofenceRadius')::numeric)::int;
    if v_geofence < 10 or v_geofence > 2000 then
      v_geofence := null;
    end if;
  end if;
  v_plus := coalesce(nullif(btrim(v_payload->>'plusCode'), ''), places.encode_plus_code(v_lat, v_lng));

  insert into places.place (
    id, place_type, name, operator, lat, lng, plus_code, parish, address, status,
    pin_state, geofence_m, origin_app, legacy_kv_id, legacy_payload, attributes, updated_at
  ) values (
    v_id,
    'toll_plaza',
    coalesce(nullif(btrim(coalesce(p_row->>'name', v_payload->>'name')), ''), 'Toll plaza'),
    nullif(btrim(v_payload->>'operator'), ''),
    v_lat,
    v_lng,
    v_plus,
    nullif(btrim(coalesce(p_row->>'parish', v_payload->>'parish')), ''),
    nullif(btrim(v_payload->>'address'), ''),
    case when coalesce(p_row->>'status', v_payload->>'status') = 'verified' then 'verified' else 'pending' end,
    'unchecked',
    v_geofence,
    'manual',
    coalesce(nullif(p_row->>'legacy_kv_id', ''), 'toll_plaza:' || v_id),
    v_payload,
    jsonb_strip_nulls(jsonb_build_object(
      'highway', nullif(btrim(coalesce(p_row->>'highway', v_payload->>'highway')), ''),
      'direction', nullif(btrim(coalesce(p_row->>'direction', v_payload->>'direction')), '')
    )),
    now()
  )
  on conflict (id) do update set
    name = excluded.name,
    operator = excluded.operator,
    lat = excluded.lat,
    lng = excluded.lng,
    plus_code = excluded.plus_code,
    parish = excluded.parish,
    address = excluded.address,
    status = excluded.status,
    geofence_m = excluded.geofence_m,
    legacy_kv_id = excluded.legacy_kv_id,
    legacy_payload = excluded.legacy_payload,
    attributes = places.place.attributes || excluded.attributes,
    updated_at = now();

  insert into places.place_facility (place_id, facility_type, source)
  select v_id, facility, 'import'
  from (values ('toll_booth'), ('ttag_topup')) as needed(facility)
  where not exists (
    select 1 from places.place_facility f
    where f.place_id = v_id and f.facility_type = needed.facility and coalesce(f.label, '') = ''
  );
end;
$$;

create or replace function fleet.upsert_master(p_table text, p_row jsonb, p_actor text, p_action text)
returns void
language plpgsql
security definer
set search_path = fleet, places, public
as $_$
declare
  col text;
  cols text := 'id';
  selects text := 'r.id';
  sets text := '';
begin
  if p_table not in ('stations', 'toll_plazas', 'platform_vendors') then
    raise exception 'unsupported master table %', p_table;
  end if;
  if p_row is null or not (p_row ? 'id') then
    raise exception 'master row needs id';
  end if;

  perform set_config('app.actor', coalesce(p_actor, ''), true);
  perform set_config('app.reason', coalesce(p_action, ''), true);

  if p_table = 'stations' then
    perform places.apply_station_row(p_row);
    return;
  end if;
  if p_table = 'toll_plazas' then
    perform places.apply_toll_row(p_row);
    return;
  end if;

  for col in
    select c.column_name
    from information_schema.columns c
    where c.table_schema = 'fleet'
      and c.table_name = p_table
      and c.column_name <> 'id'
      and p_row ? c.column_name
  loop
    cols := cols || ', ' || quote_ident(col);
    selects := selects || ', r.' || quote_ident(col);
    if sets <> '' then
      sets := sets || ', ';
    end if;
    sets := sets || format('%I = excluded.%I', col, col);
  end loop;

  if sets = '' then
    execute format(
      'insert into fleet.%I (id) select r.id from jsonb_populate_record(null::fleet.%I, $1) as r on conflict (id) do nothing',
      p_table, p_table
    ) using p_row;
  else
    execute format(
      'insert into fleet.%I (%s) select %s from jsonb_populate_record(null::fleet.%I, $1) as r on conflict (id) do update set %s',
      p_table, cols, selects, p_table, sets
    ) using p_row;
  end if;
end;
$_$;

create or replace function places.station_match_candidates()
returns table (id text, name text, payload_json jsonb)
language sql
stable
security definer
set search_path = places, public
as $$
  select
    p.id,
    p.name,
    coalesce(p.legacy_payload, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'status', case p.status when 'pending' then 'unverified' else p.status end,
      'lat', p.lat,
      'lng', p.lng,
      'location', jsonb_build_object('lat', p.lat, 'lng', p.lng),
      'geofenceRadius', coalesce(p.geofence_m, 150),
      'plusCode', p.plus_code,
      'pinConfirmed', case when p.pin_state = 'offset' then false when p.pin_state = 'confirmed' then true else null end
    ))
  from places.place p
  where p.place_type = 'gas_station'
    and p.status in ('verified', 'learnt')
    and p.pin_state <> 'offset'
  order by p.updated_at desc
  limit 1000;
$$;

drop trigger if exists places_mirror_station on fleet.stations;
drop trigger if exists places_mirror_toll on fleet.toll_plazas;
drop trigger if exists sync_public_station on fleet.stations;

drop function if exists places.upsert_from_station(fleet.stations);
drop function if exists places.upsert_from_toll(fleet.toll_plazas);
drop function if exists places.mirror_station();
drop function if exists places.mirror_toll();

drop view if exists public.fleet_stations;
drop view if exists public.fleet_toll_plazas;
drop view if exists fleet.station_quality;
drop table if exists fleet.stations;
drop table if exists fleet.toll_plazas;

create view fleet.stations with (security_invoker = true) as
select
  p.id,
  null::text as organization_id,
  p.name,
  coalesce(p.legacy_kv_id, 'station:' || p.id) as legacy_kv_id,
  coalesce(p.legacy_payload, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'brand', coalesce(b.name, p.legacy_payload->>'brand'),
    'status', case p.status
      when 'pending' then 'unverified'
      when 'closed' then 'resolved'
      else p.status
    end,
    'address', p.address,
    'parish', p.parish,
    'lat', p.lat,
    'lng', p.lng,
    'plusCode', p.plus_code,
    'pcode', p.pcode,
    'originApp', p.origin_app,
    'geofenceRadius', coalesce(p.geofence_m, t.default_geofence_m, 150),
    'pinConfirmed', case
      when p.pin_state = 'offset' then false
      when p.pin_state = 'confirmed' then true
      else null
    end,
    'location', jsonb_build_object('lat', p.lat, 'lng', p.lng)
  )) as payload_json,
  p.created_at,
  p.updated_at,
  p.origin_app,
  coalesce(b.name, nullif(p.legacy_payload->>'brand', '')) as brand,
  case p.status
    when 'pending' then 'unverified'
    when 'closed' then 'resolved'
    else p.status
  end as status,
  p.lat,
  p.lng,
  p.address,
  p.pcode,
  case p.status
    when 'verified' then 'published'
    when 'closed' then 'retired'
    else 'in_review'
  end as publish_state,
  p.parish,
  p.phone,
  p.website,
  case
    when jsonb_typeof(p.legacy_payload->'amenities') = 'array'
      then array(select jsonb_array_elements_text(p.legacy_payload->'amenities'))
    else null::text[]
  end as amenities
from places.place p
join places.place_type t on t.slug = p.place_type
left join places.brand b on b.id = p.brand_id
where p.place_type = 'gas_station';

create view fleet.toll_plazas with (security_invoker = true) as
select
  p.id,
  null::text as organization_id,
  p.name,
  coalesce(p.attributes->>'highway', p.legacy_payload->>'highway') as highway,
  coalesce(p.legacy_kv_id, 'toll_plaza:' || p.id) as legacy_kv_id,
  coalesce(p.legacy_payload, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'status', case when p.status = 'verified' then 'verified' else p.status end,
    'highway', coalesce(p.attributes->>'highway', p.legacy_payload->>'highway'),
    'direction', coalesce(p.attributes->>'direction', p.legacy_payload->>'direction'),
    'parish', p.parish,
    'lat', p.lat,
    'lng', p.lng,
    'location', jsonb_build_object('lat', p.lat, 'lng', p.lng),
    'geofenceRadius', coalesce(p.geofence_m, 200),
    'plusCode', p.plus_code,
    'operator', p.operator
  )) as payload_json,
  p.created_at,
  p.updated_at,
  case when p.status = 'verified' then 'verified' else p.status end as status,
  p.lat,
  p.lng,
  'published'::text as publish_state,
  coalesce(p.attributes->>'direction', p.legacy_payload->>'direction') as direction,
  p.parish
from places.place p
where p.place_type = 'toll_plaza';

create view fleet.station_quality with (security_invoker = true) as
select
  id,
  name,
  status,
  (lat is not null and lng is not null and brand is not null and coalesce(nullif(pcode, ''), nullif(payload_json->>'parish', '')) is not null) as complete
from fleet.stations;

create view public.fleet_stations with (security_invoker = true) as
select
  id, organization_id, name, legacy_kv_id, payload_json, created_at, updated_at,
  origin_app, brand, status, lat, lng, address, pcode, publish_state, parish, phone, website, amenities
from fleet.stations;

create view public.fleet_toll_plazas with (security_invoker = true) as
select
  id, organization_id, name, highway, legacy_kv_id, payload_json, created_at, updated_at,
  status, lat, lng, publish_state, direction, parish
from fleet.toll_plazas;

create or replace function places.stations_view_write()
returns trigger
language plpgsql
security definer
set search_path = places, public
as $$
begin
  if tg_op = 'DELETE' then
    delete from places.place
    where place_type = 'gas_station'
      and (id = old.id or legacy_kv_id = old.legacy_kv_id);
    return old;
  end if;
  perform places.apply_station_row(jsonb_build_object(
    'id', new.id,
    'name', new.name,
    'brand', new.brand,
    'status', new.status,
    'lat', new.lat,
    'lng', new.lng,
    'address', new.address,
    'pcode', new.pcode,
    'parish', new.parish,
    'phone', new.phone,
    'website', new.website,
    'origin_app', new.origin_app,
    'legacy_kv_id', new.legacy_kv_id,
    'payload_json', new.payload_json
  ));
  return new;
end;
$$;

create or replace function places.tolls_view_write()
returns trigger
language plpgsql
security definer
set search_path = places, public
as $$
begin
  if tg_op = 'DELETE' then
    delete from places.place
    where place_type = 'toll_plaza'
      and (id = old.id or legacy_kv_id = old.legacy_kv_id);
    return old;
  end if;
  perform places.apply_toll_row(jsonb_build_object(
    'id', new.id,
    'name', new.name,
    'highway', new.highway,
    'direction', new.direction,
    'status', new.status,
    'lat', new.lat,
    'lng', new.lng,
    'parish', new.parish,
    'legacy_kv_id', new.legacy_kv_id,
    'payload_json', new.payload_json
  ));
  return new;
end;
$$;

create trigger stations_view_write
  instead of insert or delete or update on fleet.stations
  for each row execute function places.stations_view_write();

create trigger tolls_view_write
  instead of insert or delete or update on fleet.toll_plazas
  for each row execute function places.tolls_view_write();

revoke all on table fleet.stations from public, anon;
revoke all on table fleet.toll_plazas from public, anon;
grant select on table fleet.stations to authenticated;
grant select, insert, update, delete on table fleet.stations to service_role;
grant select on table fleet.toll_plazas to authenticated;
grant select, insert, update, delete on table fleet.toll_plazas to service_role;
grant select on table fleet.station_quality to service_role;
grant select on table public.fleet_stations to service_role, authenticated;
grant select on table public.fleet_toll_plazas to service_role, authenticated;

drop table if exists public.station_merchant_aliases cascade;

create view public.station_merchant_aliases with (security_invoker = true) as
select
  id,
  organization_id,
  issuer,
  raw_value as raw_name,
  normalized_value as normalized_name,
  place_id as station_id,
  source,
  confirmed_by,
  created_at
from places.place_alias
where kind = 'merchant_name';

create or replace function places.alias_view_write()
returns trigger
language plpgsql
security definer
set search_path = places, public
as $$
begin
  if tg_op = 'DELETE' then
    delete from places.place_alias where id = old.id;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    update places.place_alias
    set organization_id = new.organization_id,
        issuer = new.issuer,
        raw_value = new.raw_name,
        normalized_value = new.normalized_name,
        place_id = new.station_id,
        source = new.source,
        confirmed_by = new.confirmed_by
    where id = old.id;
    return new;
  end if;
  insert into places.place_alias (
    place_id, kind, organization_id, issuer, raw_value, normalized_value, source, confirmed_by
  ) values (
    new.station_id, 'merchant_name', new.organization_id, new.issuer, new.raw_name,
    new.normalized_name, coalesce(new.source, 'admin_link'), new.confirmed_by
  );
  return new;
end;
$$;

create trigger alias_view_write
  instead of insert or delete or update on public.station_merchant_aliases
  for each row execute function places.alias_view_write();

revoke all on table public.station_merchant_aliases from public, anon;
grant select on table public.station_merchant_aliases to authenticated, service_role;
grant insert, update, delete on table public.station_merchant_aliases to service_role;

create policy place_alias_org_select on places.place_alias
  for select to authenticated
  using (
    kind = 'merchant_name'
    and organization_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')
  );

create or replace view places.migration_health as
select 'fill_missing_place'::text as check_name, f.id as detail
from fleet.fuel_entries f
where coalesce(f.payload_json->>'matchedStationId', f.payload_json #>> '{metadata,matchedStationId}') is not null
  and not exists (
    select 1 from places.place p
    where p.id = coalesce(f.payload_json->>'matchedStationId', f.payload_json #>> '{metadata,matchedStationId}')
  )
union all
select 'public_gas_station_count', count(*)::text
from places.public_place
where place_type = 'gas_station'
having count(*) <> (
  select count(*) from places.place
  where place_type = 'gas_station' and status = 'verified' and pin_state <> 'offset'
)
union all
select 'place_type_without_category', slug
from places.place_type
where category_code not in (select code from places.category)
union all
select 'facility_without_category', slug
from places.facility_type
where category_code not in (select code from places.category)
union all
select 'inactive_type_in_use', p.id
from places.place p
join places.place_type t on t.slug = p.place_type
where not t.active
union all
select 'station_view_gap', s.id
from (
  select id from places.place where place_type = 'gas_station'
  except
  select id from fleet.stations
) s;

create or replace function places.assert_migration_health()
returns void
language plpgsql
security definer
set search_path = places, public
as $$
begin
  if exists (select 1 from places.migration_health) then
    raise exception 'places migration health is not empty';
  end if;
end;
$$;

revoke all on function places.assert_migration_health() from public, anon, authenticated;
grant execute on function places.assert_migration_health() to service_role;
revoke all on function places.apply_station_row(jsonb) from public, anon, authenticated;
grant execute on function places.apply_station_row(jsonb) to service_role;
revoke all on function places.apply_toll_row(jsonb) from public, anon, authenticated;
grant execute on function places.apply_toll_row(jsonb) to service_role;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('places-migration-health');
    exception when others then
      null;
    end;
    perform cron.schedule(
      'places-migration-health',
      '15 4 * * *',
      $job$select places.assert_migration_health()$job$
    );
  end if;
end
$cron$;

do $$
declare
  stations int;
  tolls int;
  health int;
begin
  select count(*) into stations from fleet.stations;
  select count(*) into tolls from fleet.toll_plazas;
  select count(*) into health from places.migration_health;
  if stations <> 204 or tolls <> 12 or health <> 0 then
    if exists (select 1 from places.place) then
      raise exception 'register views drifted: stations % tolls % health %', stations, tolls, health;
    end if;
  end if;
end $$;

-- Phase 3. Copy stations and tolls into the register. Fleet still writes the
-- old tables. A mirror copies each later save across.

create or replace function fleet.log_master_change()
returns trigger
language plpgsql
as $$
declare
  who text := nullif(current_setting('app.actor', true), '');
  why text := nullif(current_setting('app.reason', true), '');
begin
  if why is null then
    if tg_op = 'INSERT' then
      why := 'created';
    elsif tg_op = 'DELETE' then
      why := 'deleted';
    elsif tg_op = 'UPDATE' and tg_table_name in ('stations', 'place') then
      if new.status = 'verified' and old.status is distinct from 'verified' then
        why := 'verified';
      else
        why := 'updated';
      end if;
    else
      why := 'updated';
    end if;
  end if;

  insert into fleet.master_change_log (dataset, record_id, action, before_json, after_json, actor, reason)
  values (
    tg_table_name,
    coalesce(new.id, old.id)::text,
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) - 'payload_json' end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) - 'payload_json' end,
    who,
    why
  );
  return coalesce(new, old);
end;
$$;

create or replace function places.upsert_from_station(station fleet.stations)
returns void
language plpgsql
security definer
set search_path = places, public
as $$
declare
  next_status text;
  next_brand uuid;
  next_geofence int;
  next_plus text;
  alias jsonb;
begin
  if station.legacy_kv_id like 'unverified_vendor:%' or station.lat is null or station.lng is null then
    insert into places.place_legacy_archive (id, legacy_kv_id, reason, payload)
    values (station.id, station.legacy_kv_id, 'not_a_place', station.payload_json)
    on conflict (id) do update
      set payload = excluded.payload, archived_at = now();
    delete from places.place where id = station.id;
    return;
  end if;

  next_status := case station.status
    when 'verified' then 'verified'
    when 'learnt' then 'learnt'
    when 'unverified' then 'pending'
    when 'resolved' then 'closed'
    else 'pending'
  end;

  select b.id into next_brand
  from places.brand b
  where nullif(btrim(station.brand), '') is not null
    and (
      lower(btrim(station.brand)) = lower(b.name)
      or exists (
        select 1 from unnest(b.aliases) alias_name
        where lower(alias_name) = lower(btrim(station.brand))
      )
    )
  limit 1;

  next_geofence := null;
  if (station.payload_json->>'geofenceRadius') ~ '^[0-9]+(\.[0-9]+)?$' then
    next_geofence := round((station.payload_json->>'geofenceRadius')::numeric)::int;
    if next_geofence < 10 or next_geofence > 2000 then
      next_geofence := null;
    end if;
  end if;

  next_plus := nullif(btrim(station.payload_json->>'plusCode'), '');
  if next_plus is null then
    next_plus := places.encode_plus_code(station.lat, station.lng);
  end if;

  insert into places.place (
    id, place_type, name, brand_id, lat, lng, plus_code, pcode, address, parish,
    phone, website, status, pin_state, geofence_m, origin_app, legacy_kv_id,
    verified_at, attributes, updated_at
  ) values (
    station.id,
    'gas_station',
    coalesce(nullif(btrim(station.name), ''), 'Gas station'),
    next_brand,
    station.lat,
    station.lng,
    next_plus,
    nullif(btrim(station.pcode), ''),
    nullif(btrim(station.address), ''),
    nullif(btrim(station.parish), ''),
    nullif(btrim(station.phone), ''),
    nullif(btrim(station.website), ''),
    next_status,
    case
      when station.payload_json->>'pinConfirmed' = 'false' then 'offset'
      when station.payload_json->>'pinConfirmed' = 'true' then 'confirmed'
      else 'unchecked'
    end,
    next_geofence,
    case when station.origin_app in ('roam_fleet','roam_plug','manual') then station.origin_app else 'manual' end,
    station.legacy_kv_id,
    case when next_status = 'verified' then nullif(station.payload_json->>'verifiedAt', '')::timestamptz else null end,
    '{}'::jsonb,
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
    verified_at = excluded.verified_at,
    updated_at = now();

  insert into places.place_facility (place_id, facility_type, source)
  select station.id, 'fuel_pump', 'import'
  where not exists (
    select 1 from places.place_facility f
    where f.place_id = station.id and f.facility_type = 'fuel_pump' and coalesce(f.label, '') = ''
  );

  delete from places.place_alias
  where place_id = station.id and kind = 'gps' and source = 'import';

  if jsonb_typeof(station.payload_json->'gpsAliases') = 'array' then
    for alias in select value from jsonb_array_elements(station.payload_json->'gpsAliases')
    loop
      if (alias->>'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' and (alias->>'lng') ~ '^-?[0-9]+(\.[0-9]+)?$' then
        insert into places.place_alias (place_id, kind, lat, lng, source, raw_value)
        values (station.id, 'gps', (alias->>'lat')::double precision, (alias->>'lng')::double precision, 'import', alias->>'mergedAt');
      end if;
    end loop;
  end if;
end;
$$;

create or replace function places.upsert_from_toll(plaza fleet.toll_plazas)
returns void
language plpgsql
security definer
set search_path = places, public
as $$
declare
  next_geofence int;
  next_plus text;
begin
  if plaza.lat is null or plaza.lng is null then
    return;
  end if;
  next_geofence := null;
  if (plaza.payload_json->>'geofenceRadius') ~ '^[0-9]+(\.[0-9]+)?$' then
    next_geofence := round((plaza.payload_json->>'geofenceRadius')::numeric)::int;
    if next_geofence < 10 or next_geofence > 2000 then
      next_geofence := null;
    end if;
  end if;
  next_plus := nullif(btrim(plaza.payload_json->>'plusCode'), '');
  if next_plus is null then
    next_plus := places.encode_plus_code(plaza.lat, plaza.lng);
  end if;

  insert into places.place (
    id, place_type, name, operator, lat, lng, plus_code, parish, address, status,
    pin_state, geofence_m, origin_app, legacy_kv_id, attributes, updated_at
  ) values (
    plaza.id,
    'toll_plaza',
    coalesce(nullif(btrim(plaza.name), ''), 'Toll plaza'),
    nullif(btrim(plaza.payload_json->>'operator'), ''),
    plaza.lat,
    plaza.lng,
    next_plus,
    nullif(btrim(plaza.parish), ''),
    nullif(btrim(plaza.payload_json->>'address'), ''),
    case when plaza.status = 'verified' then 'verified' else 'pending' end,
    'unchecked',
    next_geofence,
    'manual',
    plaza.legacy_kv_id,
    jsonb_strip_nulls(jsonb_build_object(
      'highway', nullif(btrim(plaza.highway), ''),
      'direction', nullif(btrim(plaza.direction), '')
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
    attributes = places.place.attributes || excluded.attributes,
    updated_at = now();

  insert into places.place_facility (place_id, facility_type, source)
  select plaza.id, facility, 'import'
  from (values ('toll_booth'), ('ttag_topup')) as needed(facility)
  where not exists (
    select 1 from places.place_facility f
    where f.place_id = plaza.id and f.facility_type = needed.facility and coalesce(f.label, '') = ''
  );
end;
$$;

create or replace function places.mirror_station()
returns trigger
language plpgsql
security definer
set search_path = places, fleet, public
as $$
begin
  if tg_op = 'DELETE' then
    delete from places.place where id = old.id;
    return old;
  end if;
  perform places.upsert_from_station(new);
  return new;
end;
$$;

create or replace function places.mirror_toll()
returns trigger
language plpgsql
security definer
set search_path = places, fleet, public
as $$
begin
  if tg_op = 'DELETE' then
    delete from places.place where id = old.id;
    return old;
  end if;
  perform places.upsert_from_toll(new);
  return new;
end;
$$;

do $$
declare
  station fleet.stations;
  toll fleet.toll_plazas;
begin
  for station in select * from fleet.stations loop
    perform places.upsert_from_station(station);
  end loop;
  for toll in select * from fleet.toll_plazas loop
    perform places.upsert_from_toll(toll);
  end loop;
end $$;

insert into places.place_alias (
  place_id, kind, organization_id, issuer, raw_value, normalized_value, source, confirmed_by, created_at
)
select
  a.station_id,
  'merchant_name',
  a.organization_id,
  a.issuer,
  a.raw_name,
  a.normalized_name,
  case when a.source in ('admin_link','heal_auto','seed','import') then a.source else 'admin_link' end,
  a.confirmed_by,
  a.created_at
from public.station_merchant_aliases a
where exists (select 1 from places.place p where p.id = a.station_id)
  and not exists (
    select 1 from places.place_alias existing
    where existing.kind = 'merchant_name'
      and coalesce(existing.organization_id, '') = coalesce(a.organization_id, '')
      and coalesce(existing.issuer, '') = coalesce(a.issuer, '')
      and existing.normalized_value = a.normalized_name
  );

drop trigger if exists places_mirror_station on fleet.stations;
create trigger places_mirror_station
  after insert or delete or update on fleet.stations
  for each row execute function places.mirror_station();

drop trigger if exists places_mirror_toll on fleet.toll_plazas;
create trigger places_mirror_toll
  after insert or delete or update on fleet.toll_plazas
  for each row execute function places.mirror_toll();

revoke all on function places.upsert_from_station(fleet.stations) from public, anon, authenticated;
revoke all on function places.upsert_from_toll(fleet.toll_plazas) from public, anon, authenticated;
revoke all on function places.mirror_station() from public, anon, authenticated;
revoke all on function places.mirror_toll() from public, anon, authenticated;
grant execute on function places.upsert_from_station(fleet.stations) to service_role;
grant execute on function places.upsert_from_toll(fleet.toll_plazas) to service_role;
grant execute on function places.mirror_station() to service_role;
grant execute on function places.mirror_toll() to service_role;

do $$
declare
  missing int;
  fill_miss int;
  status_miss int;
begin
  select count(*) into missing
  from (
    select id from fleet.stations where legacy_kv_id like 'station:%'
    except
    select id from places.place
  ) gap;
  if missing <> 0 then
    raise exception 'stations missing from the register: %', missing;
  end if;

  select count(*) into fill_miss
  from fleet.fuel_entries f
  where coalesce(f.payload_json->>'matchedStationId', f.payload_json#>>'{metadata,matchedStationId}') is not null
    and not exists (
      select 1 from places.place p
      where p.id = coalesce(f.payload_json->>'matchedStationId', f.payload_json#>>'{metadata,matchedStationId}')
    );
  if fill_miss <> 0 then
    raise exception 'fuel fills point at a missing place: %', fill_miss;
  end if;

  select count(*) into status_miss
  from fleet.stations s
  join places.place p on p.id = s.id
  where s.legacy_kv_id like 'station:%'
    and p.status is distinct from (
      case s.status
        when 'verified' then 'verified'
        when 'learnt' then 'learnt'
        when 'unverified' then 'pending'
        when 'resolved' then 'closed'
        else 'pending'
      end
    );
  if status_miss <> 0 then
    raise exception 'status disagreement: %', status_miss;
  end if;
end $$;

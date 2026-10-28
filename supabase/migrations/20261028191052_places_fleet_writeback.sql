-- R2: a Fleet read must not invent a geofence. Null stays null so the type
-- default is not saved back as an override. A leftover radius in the old
-- payload is dropped in that case, or the next save would freeze it.
-- R3: rejected, duplicate and anomaly stay as they are. Anything else
-- unknown still becomes pending.

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
    when 'rejected' then 'rejected'
    when 'duplicate' then 'duplicate'
    when 'anomaly' then 'anomaly'
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

create or replace view fleet.stations with (security_invoker = true) as
select
  p.id,
  null::text as organization_id,
  p.name,
  coalesce(p.legacy_kv_id, 'station:' || p.id) as legacy_kv_id,
  (
    case
      when p.geofence_m is null then coalesce(p.legacy_payload, '{}'::jsonb) - 'geofenceRadius'
      else coalesce(p.legacy_payload, '{}'::jsonb)
    end
  ) || jsonb_strip_nulls(jsonb_build_object(
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
    'geofenceRadius', p.geofence_m,
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

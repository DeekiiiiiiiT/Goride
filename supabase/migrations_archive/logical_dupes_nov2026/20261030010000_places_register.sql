-- Places register: parish follows the pin, one list for every type, and a real merge.

create or replace function places.fill_place_pcode()
returns trigger
language plpgsql
security definer
set search_path = places, geo, public
as $$
declare
  parish_code text;
  parish_name text;
begin
  if new.pcode is null or btrim(new.pcode) = '' then
    begin
      new.pcode := places.parish_pcode(new.lat, new.lng);
    exception
      when undefined_function then
        null;
    end;
  end if;

  parish_code := left(nullif(btrim(new.pcode), ''), 4);
  if parish_code is null and new.lat is not null and new.lng is not null then
    begin
      parish_code := places.parish_pcode(new.lat, new.lng);
    exception
      when undefined_function then
        parish_code := null;
    end;
  end if;

  if parish_code is not null then
    select g.name into parish_name
    from geo.boundaries g
    where g.admin_level = 1
      and g.pcode = parish_code
    limit 1;
    if parish_name is not null then
      new.parish := parish_name;
    end if;
  end if;
  return new;
end;
$$;

create or replace function places.parish_name_at(p_lat double precision, p_lng double precision)
returns text
language sql
stable
security definer
set search_path = places, geo, public
as $$
  select g.name
  from geo.boundaries g
  where g.admin_level = 1
    and g.pcode = places.parish_pcode(p_lat, p_lng)
  limit 1;
$$;

revoke all on function places.parish_name_at(double precision, double precision) from public, anon, authenticated;
grant execute on function places.parish_name_at(double precision, double precision) to service_role;

update places.place p
set parish = g.name
from geo.boundaries g
where g.admin_level = 1
  and g.pcode = left(nullif(btrim(p.pcode), ''), 4)
  and g.name is not null
  and p.parish is distinct from g.name;

update places.place p
set parish = places.parish_name_at(p.lat, p.lng)
where p.parish is null
  and p.lat is not null
  and p.lng is not null
  and places.parish_name_at(p.lat, p.lng) is not null;

update places.place p
set parish = null
where p.parish is not null
  and not exists (
    select 1
    from geo.boundaries g
    where g.admin_level = 1
      and places.parish_text_key(g.name) = places.parish_text_key(p.parish)
  );

do $$
declare
  bad int;
begin
  select count(*) into bad
  from places.place p
  where p.parish is not null
    and not exists (
      select 1
      from geo.boundaries g
      where g.admin_level = 1
        and places.parish_text_key(g.name) = places.parish_text_key(p.parish)
    );
  if bad > 0 then
    raise exception 'parish backfill left % rows outside the parish list', bad;
  end if;
end $$;

create or replace view places.place_list_row with (security_invoker = true) as
select
  p.id,
  p.name,
  p.place_type,
  pt.label as type_label,
  pt.match_profile,
  pt.category_code,
  c.group_code,
  pt.default_geofence_m,
  p.address,
  p.plus_code,
  p.status,
  p.pin_state,
  p.geofence_m,
  (p.geofence_m is not null) as geofence_override,
  coalesce(p.geofence_m, pt.default_geofence_m) as geofence_display,
  p.phone,
  (p.phone is null or btrim(p.phone) = '') as no_phone,
  p.origin_app,
  p.updated_at,
  p.verified_at,
  p.lat,
  p.lng,
  p.brand_id,
  b.name as brand_name,
  (p.brand_id is null) as no_brand,
  left(p.pcode, 4) as pcode1,
  parish.name as parish_name,
  town_boundary.name as town_name,
  p.parish as parish_text,
  (
    parish.name is not null
    and p.parish is not null
    and places.parish_text_key(regexp_replace(btrim(p.parish), '\s+parish$', '', 'i'))
      is distinct from places.parish_text_key(parish.name)
  ) as parish_text_mismatch,
  (
    p.lat is null
    or p.lng is null
    or p.lat < 17.6
    or p.lat > 18.6
    or p.lng < -78.5
    or p.lng > -76.1
  ) as outside_jamaica,
  (p.pin_state = 'unchecked') as pin_unchecked,
  case
    when coalesce(p.legacy_payload->>'dataSource', '') = 'import' then 'import'
    when p.origin_app = 'roam_fleet' then 'fleet'
    when p.origin_app = 'roam_plug' then 'plug'
    else 'manual'
  end as source,
  (
    select count(*)::int
    from places.place_facility f
    where f.place_id = p.id
  ) as facility_count
from places.place p
left join places.place_type pt on pt.slug = p.place_type
left join places.category c on c.code = pt.category_code
left join places.brand b on b.id = p.brand_id
left join geo.boundaries loc on loc.pcode = p.pcode
left join geo.boundaries town_boundary on town_boundary.pcode = case
  when loc.admin_level = 2 then loc.pcode
  when loc.admin_level = 3 then loc.parent_pcode
  else null
end
left join geo.boundaries parish
  on parish.admin_level = 1
 and parish.pcode = left(p.pcode, 4);

revoke all on places.place_list_row from public, anon, authenticated;
grant select on places.place_list_row to service_role;

create or replace function places.merge_place(
  p_keep text,
  p_drop text,
  p_reason text,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = places, public
as $$
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'Choose two different places';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required';
  end if;
  if not exists (select 1 from places.place where id = p_keep) then
    raise exception 'Place not found';
  end if;
  if not exists (select 1 from places.place where id = p_drop) then
    raise exception 'Place not found';
  end if;

  perform set_config('app.actor', coalesce(p_actor, ''), true);
  perform set_config('app.reason', btrim(p_reason), true);

  insert into places.place_alias (place_id, kind, raw_value, normalized_value, lat, lng, source)
  select p_keep, a.kind, a.raw_value, a.normalized_value, a.lat, a.lng, 'import'
  from places.place_alias a
  where a.place_id = p_drop
    and not exists (
      select 1
      from places.place_alias kept
      where kept.place_id = p_keep
        and kept.kind is not distinct from a.kind
        and kept.normalized_value is not distinct from a.normalized_value
    );

  insert into places.place_facility (place_id, facility_type, label, attributes, source)
  select p_keep, f.facility_type, f.label, f.attributes, 'admin'
  from places.place_facility f
  where f.place_id = p_drop
    and not exists (
      select 1
      from places.place_facility kept
      where kept.place_id = p_keep
        and kept.facility_type = f.facility_type
        and kept.label is not distinct from f.label
    );

  update places.place
  set status = 'duplicate',
      duplicate_of = p_keep,
      updated_at = now()
  where id = p_drop;

  perform places.refresh_public_place(p_keep);
  perform places.refresh_public_place(p_drop);
end;
$$;

revoke all on function places.merge_place(text, text, text, text) from public, anon, authenticated;
grant execute on function places.merge_place(text, text, text, text) to service_role;

create or replace function places.save_register_update(
  p_id text,
  p_patch jsonb,
  p_facilities jsonb,
  p_actor text,
  p_reason text,
  p_add_alias jsonb default null,
  p_remove_alias uuid default null
)
returns void
language plpgsql
security definer
set search_path = places, public
as $$
declare
  k text;
  allowed text[] := array[
    'place_type','name','lat','lng','address','parish','phone','website',
    'brand_id','geofence_m','attributes','pin_state','plus_code','status',
    'duplicate_of','verified_at','verified_by'
  ];
  facility_slug text;
  facility_item record;
  facility_row jsonb;
begin
  if p_id is null or btrim(p_id) = '' then
    raise exception 'Place id is required';
  end if;
  if not exists (select 1 from places.place where id = p_id) then
    raise exception 'Place not found';
  end if;

  perform set_config('app.actor', coalesce(p_actor, ''), true);
  perform set_config('app.reason', coalesce(p_reason, ''), true);

  if p_patch is not null and p_patch <> '{}'::jsonb then
    for k in select jsonb_object_keys(p_patch)
    loop
      if not (k = any (allowed)) then
        raise exception 'Unknown field %', k;
      end if;
    end loop;

    update places.place set
      place_type = case when p_patch ? 'place_type' then p_patch->>'place_type' else place_type end,
      name = case when p_patch ? 'name' then p_patch->>'name' else name end,
      lat = case when p_patch ? 'lat' then (p_patch->>'lat')::double precision else lat end,
      lng = case when p_patch ? 'lng' then (p_patch->>'lng')::double precision else lng end,
      address = case when p_patch ? 'address' then nullif(p_patch->>'address', '') else address end,
      parish = case when p_patch ? 'parish' then nullif(p_patch->>'parish', '') else parish end,
      phone = case when p_patch ? 'phone' then nullif(p_patch->>'phone', '') else phone end,
      website = case when p_patch ? 'website' then nullif(p_patch->>'website', '') else website end,
      brand_id = case when p_patch ? 'brand_id' then nullif(p_patch->>'brand_id', '')::uuid else brand_id end,
      geofence_m = case when p_patch ? 'geofence_m' then nullif(p_patch->>'geofence_m', '')::int else geofence_m end,
      attributes = case when p_patch ? 'attributes' then coalesce(p_patch->'attributes', '{}'::jsonb) else attributes end,
      pin_state = case when p_patch ? 'pin_state' then p_patch->>'pin_state' else pin_state end,
      plus_code = case when p_patch ? 'plus_code' then nullif(p_patch->>'plus_code', '') else plus_code end,
      status = case when p_patch ? 'status' then p_patch->>'status' else status end,
      duplicate_of = case when p_patch ? 'duplicate_of' then nullif(p_patch->>'duplicate_of', '') else duplicate_of end,
      verified_by = case when p_patch ? 'verified_by' then nullif(p_patch->>'verified_by', '') else verified_by end,
      verified_at = case
        when p_patch ? 'verified_at' and (p_patch->'verified_at' = 'null'::jsonb or nullif(p_patch->>'verified_at', '') is null) then null
        when p_patch ? 'verified_at' then (p_patch->>'verified_at')::timestamptz
        else verified_at
      end,
      updated_at = now()
    where id = p_id;
  end if;

  if p_facilities is not null then
    delete from places.place_facility
    where place_id = p_id and facility_type <> 'fuel_pump';
    for facility_item in
      select value as item from jsonb_array_elements(p_facilities)
    loop
      facility_row := facility_item.item;
      facility_slug := case
        when jsonb_typeof(facility_row) = 'string' then facility_row #>> '{}'
        else coalesce(facility_row->>'type', facility_row->>'facility_type')
      end;
      if facility_slug is null or facility_slug = '' or facility_slug = 'fuel_pump' then
        continue;
      end if;
      if exists (
        select 1 from places.place_facility existing
        where existing.place_id = p_id
          and existing.facility_type = facility_slug
          and existing.label is not distinct from nullif(facility_row->>'label', '')
      ) then
        continue;
      end if;
      insert into places.place_facility (place_id, facility_type, label, attributes, source)
      values (
        p_id,
        facility_slug,
        nullif(facility_row->>'label', ''),
        case when jsonb_typeof(facility_row) = 'object' then coalesce(facility_row->'attributes', '{}'::jsonb) else '{}'::jsonb end,
        'admin'
      );
    end loop;
  end if;

  if p_add_alias is not null then
    insert into places.place_alias (place_id, kind, raw_value, normalized_value, lat, lng, source)
    values (
      p_id,
      'gps',
      nullif(p_add_alias->>'raw', ''),
      lower(nullif(p_add_alias->>'raw', '')),
      nullif(p_add_alias->>'lat', '')::double precision,
      nullif(p_add_alias->>'lng', '')::double precision,
      'admin_link'
    );
  end if;

  if p_remove_alias is not null then
    delete from places.place_alias where id = p_remove_alias and place_id = p_id;
  end if;
end;
$$;

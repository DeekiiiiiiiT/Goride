-- Station database: keep amenities, list one row per station, and patch without wiping fields.

create or replace function places.station_name_key(p_name text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '', 'g'), '');
$$;

-- S9. Move legacy amenity labels onto place_facility. Unmatched labels stay on the place.
do $$
declare
  rec record;
  amen text;
  matched_slug text;
  unmapped text[];
begin
  for rec in
    select id, legacy_payload->'amenities' as amenities
    from places.place
    where place_type = 'gas_station'
      and jsonb_typeof(legacy_payload->'amenities') = 'array'
      and jsonb_array_length(legacy_payload->'amenities') > 0
  loop
    unmapped := '{}';
    for amen in select jsonb_array_elements_text(rec.amenities)
    loop
      matched_slug := case lower(btrim(amen))
        when 'convenience_store' then 'convenience_store'
        when 'convenience store' then 'convenience_store'
        when 'restrooms' then 'restroom'
        when 'restroom' then 'restroom'
        when 'food' then 'food'
        when 'hot food / restaurant' then 'food'
        when 'wifi' then 'wifi'
        when 'wi-fi' then 'wifi'
        when 'free wi-fi' then 'wifi'
        when 'air' then 'air_water'
        when 'air / vacuum' then 'air_water'
        when 'air_water' then 'air_water'
        else null
      end;
      if matched_slug is null then
        select f.slug into matched_slug
        from places.facility_type f
        where lower(f.slug) = lower(btrim(amen))
           or lower(f.label) = lower(btrim(amen))
        limit 1;
      end if;
      if matched_slug is null or not exists (select 1 from places.facility_type f where f.slug = matched_slug) then
        unmapped := array_append(unmapped, amen);
      else
        insert into places.place_facility (place_id, facility_type, source)
        select rec.id, matched_slug, 'import'
        where not exists (
          select 1 from places.place_facility existing
          where existing.place_id = rec.id
            and existing.facility_type = matched_slug
            and existing.label is null
        );
      end if;
    end loop;
    if cardinality(unmapped) > 0 then
      update places.place
      set attributes = coalesce(attributes, '{}'::jsonb)
        || jsonb_build_object('unmapped_amenities', to_jsonb(unmapped))
      where id = rec.id;
    end if;
  end loop;
end $$;

do $$
declare
  missing int;
begin
  select count(*) into missing
  from places.place p
  where p.place_type = 'gas_station'
    and jsonb_typeof(p.legacy_payload->'amenities') = 'array'
    and jsonb_array_length(p.legacy_payload->'amenities') > 0
    and not exists (
      select 1 from places.place_facility f
      where f.place_id = p.id and f.facility_type <> 'fuel_pump'
    )
    and coalesce(jsonb_array_length(p.attributes->'unmapped_amenities'), 0) = 0;
  if missing > 0 then
    raise exception 'amenities migration left % stations with nothing kept', missing;
  end if;
end $$;

create or replace view places.station_list_row with (security_invoker = true) as
select
  base.id,
  base.name,
  base.address,
  base.status,
  base.pin_state,
  base.geofence_m,
  base.plus_code,
  base.origin_app,
  base.updated_at,
  base.verified_at,
  base.brand_id,
  base.brand_name,
  base.pcode1,
  base.parish_name,
  base.parish_text,
  base.parish_text_mismatch,
  base.source,
  base.possible_duplicate_ids,
  base.company_style_name,
  base.price_e10_87,
  base.price_outdated,
  (
    (case when cardinality(base.possible_duplicate_ids) > 0 then 1 else 0 end)
    + (case when base.brand_id is null then 1 else 0 end)
    + (case when base.parish_text_mismatch then 1 else 0 end)
    + (case when base.pin_state = 'unchecked' then 1 else 0 end)
    + (case when base.company_style_name then 1 else 0 end)
    + (case when base.status is distinct from 'verified' then 1 else 0 end)
  )::int as issue_count,
  cardinality(base.possible_duplicate_ids) > 0 as possible_duplicate,
  base.brand_id is null as no_brand,
  base.pin_state = 'unchecked' as pin_unchecked,
  base.status is distinct from 'verified' as not_verified
from (
  select
    p.id,
    p.name,
    p.address,
    p.status,
    p.pin_state,
    p.geofence_m,
    p.plus_code,
    p.origin_app,
    p.updated_at,
    p.verified_at,
    p.brand_id,
    b.name as brand_name,
    left(p.pcode, 4) as pcode1,
    g.name as parish_name,
    p.parish as parish_text,
    (
      g.name is not null
      and p.parish is not null
      and places.parish_text_key(regexp_replace(btrim(p.parish), '\s+parish$', '', 'i'))
        is distinct from places.parish_text_key(g.name)
    ) as parish_text_mismatch,
    case
      when coalesce(p.legacy_payload->>'dataSource', '') = 'import' then 'import'
      when p.origin_app = 'roam_fleet' then 'fleet'
      when p.origin_app = 'roam_plug' then 'plug'
      else 'manual'
    end as source,
    coalesce((
      select array_agg(o.id order by o.name)
      from places.place o
      where o.id <> p.id
        and o.place_type = 'gas_station'
        and o.status in ('pending', 'verified', 'learnt')
        and (
          public.st_dwithin(p.geog, o.geog, 60)
          or (
            places.station_name_key(p.name) = places.station_name_key(o.name)
            and places.station_name_key(p.name) is not null
            and public.st_dwithin(p.geog, o.geog, 2000)
          )
        )
    ), '{}'::text[]) as possible_duplicate_ids,
    (p.name ~ '\m(LTD|LIMITED|T/A|SRL|CO\.)\M') as company_style_name,
    (
      select pc.price_per_litre
      from places.price_current pc
      where pc.place_id = p.id and pc.grade = 'e10_87'
      limit 1
    ) as price_e10_87,
    coalesce((
      select pc.outdated
      from places.price_current pc
      where pc.place_id = p.id and pc.grade = 'e10_87'
      limit 1
    ), false) as price_outdated
  from places.place p
  left join places.brand b on b.id = p.brand_id
  left join geo.boundaries g
    on g.admin_level = 1
   and g.pcode = left(p.pcode, 4)
  where p.place_type = 'gas_station'
) base;

revoke all on places.station_list_row from public, anon, authenticated;
grant select on places.station_list_row to service_role;

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
    'duplicate_of','verified_at'
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

revoke all on function places.save_register_update(text, jsonb, jsonb, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function places.save_register_update(text, jsonb, jsonb, text, text, jsonb, uuid) to service_role;

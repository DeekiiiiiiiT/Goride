-- Station drawer "Save changes" failed for every place with
-- "CASE types uuid and text cannot be matched": verified_by is a uuid column
-- but the update wrote text into it. Only change: cast verified_by to uuid.
CREATE OR REPLACE FUNCTION places.save_register_update(p_id text, p_patch jsonb, p_facilities jsonb, p_actor text, p_reason text, p_add_alias jsonb DEFAULT NULL::jsonb, p_remove_alias uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'places', 'public'
AS $function$
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
      verified_by = case when p_patch ? 'verified_by' then nullif(p_patch->>'verified_by', '')::uuid else verified_by end,
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
$function$;

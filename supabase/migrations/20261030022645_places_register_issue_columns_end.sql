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
  ) as facility_count,
  (p.status = 'verified' and p.pin_state = 'unchecked') as verified_pin_unchecked,
  (coalesce(loc.admin_level, 1) <= 1) as area_parish_only
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

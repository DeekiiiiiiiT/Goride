-- Health checks stay on places. They no longer read the fleet.stations compatibility view.

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
select 'public_place_gap', missing.id
from (
  select id from places.place
  where place_type = 'gas_station' and status = 'verified' and pin_state <> 'offset'
  except
  select id from places.public_place
  where place_type = 'gas_station'
) missing;

revoke all on table places.migration_health from public, anon, authenticated;
grant select on table places.migration_health to service_role;

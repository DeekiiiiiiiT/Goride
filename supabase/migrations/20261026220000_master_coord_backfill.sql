-- Pins live under location, not the top-level lat the first backfill copied.
-- A station with a pin, a brand, and a parish name is complete even when it has no parish code.
-- The change log stays quiet: this is a copy, not a person saving a row.

alter table fleet.stations disable trigger stations_master_change;
alter table fleet.toll_plazas disable trigger toll_plazas_master_change;

update fleet.stations
set
  lat = coalesce(lat, case
    when payload_json #>> '{location,lat}' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (payload_json #>> '{location,lat}')::double precision
  end),
  lng = coalesce(lng, case
    when payload_json #>> '{location,lng}' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (payload_json #>> '{location,lng}')::double precision
  end),
  pcode = coalesce(nullif(pcode, ''), nullif(payload_json->>'pcode', ''), nullif(payload_json->>'parishPcode', ''))
where payload_json is not null;

update fleet.toll_plazas
set
  lat = coalesce(lat, case
    when payload_json #>> '{location,lat}' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (payload_json #>> '{location,lat}')::double precision
  end),
  lng = coalesce(lng, case
    when payload_json #>> '{location,lng}' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (payload_json #>> '{location,lng}')::double precision
  end)
where payload_json is not null;

alter table fleet.stations enable trigger stations_master_change;
alter table fleet.toll_plazas enable trigger toll_plazas_master_change;

create or replace view fleet.station_quality as
select
  id,
  name,
  status,
  (
    lat is not null
    and lng is not null
    and brand is not null
    and coalesce(nullif(pcode, ''), nullif(payload_json->>'parish', '')) is not null
  ) as complete
from fleet.stations;

revoke all on fleet.station_quality from anon, authenticated;

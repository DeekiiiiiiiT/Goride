-- Locked. Readers of stations and tolls now use places.place.
-- Do not run this until fleet.stations, fleet.toll_plazas,
-- places.public_station, and public.station_merchant_aliases have had
-- no reads for 14 days after that deploy. The raise below stops the rest of the file
-- when it is run as one script.

do $$
begin
  raise exception
    'Places retirement is locked. The compatibility views are still the live read path. Drop them only after 14 days with no reads.';
end $$;

-- drop view if exists public.fleet_stations;
-- drop view if exists public.fleet_toll_plazas;
-- drop view if exists places.public_station;
-- drop view if exists public.station_merchant_aliases;
-- drop view if exists fleet.stations;
-- drop view if exists fleet.toll_plazas;
-- drop table if exists places.place_capability;

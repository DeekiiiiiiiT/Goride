-- New station columns never appeared on the public view.
-- Postgres freezes select * at the moment the view is created.

drop view if exists public.fleet_stations;

create view public.fleet_stations
with (security_invoker = true) as
select * from fleet.stations;

revoke all on public.fleet_stations from public, anon;
grant select on public.fleet_stations to authenticated;
grant all on public.fleet_stations to service_role;

notify pgrst, 'reload schema';

-- Station rows have no company id, so the company read rule hides all of them.
-- This count runs as the database owner and is only callable by the service role.

create or replace function public.fleet_station_counts()
returns table (total int, verified int)
language sql
stable
security definer
set search_path = fleet, public
as $$
  select
    count(*)::int,
    count(*) filter (where status = 'verified')::int
  from fleet.stations;
$$;

revoke all on function public.fleet_station_counts() from public, anon, authenticated;
grant execute on function public.fleet_station_counts() to service_role;

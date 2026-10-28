-- Section G. Run in the SQL editor. Replace the station id after a GPS-matched fill.
-- Safe to read. Does not change data.

-- 1. After the next GPS-matched fill. All of these must match the row from before the fill.
--    geofence_m must still be null if it was null before.
select name, brand_id, address, parish, phone, pin_state, geofence_m
from places.place
where id = '<matchedStationId>';

-- 2. After 2026-10-29 04:15 UTC. Expect zero rows.
select * from places.migration_health;

-- 3. Coverage after refresh_coverage. Expect about 56 verified fuel, 12 verified toll, 148 pending fuel.
select kind,
  sum(verified_count) as verified,
  sum(pending_count) as pending
from places.coverage_count
group by kind
order by kind;

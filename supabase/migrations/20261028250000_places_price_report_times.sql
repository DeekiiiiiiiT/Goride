-- Backfill stored the fill date at midnight, so same-day fills looked like duplicates.
-- Use the real save time, then check and publish again. Owner decisions are left alone.

update places.fleet_price_report r
set reported_at = f.created_at
from fleet.fuel_entries f
where f.id = r.fuel_entry_id
  and f.created_at is not null
  and r.reported_at is distinct from f.created_at;

do $$
declare
  rec record;
begin
  for rec in
    select id
    from places.fleet_price_report
  loop
    perform places.price_engine_check('fleet', rec.id);
  end loop;

  for rec in
    select distinct place_id, grade
    from places.fleet_price_report
    where place_id is not null
      and grade <> 'unknown'
  loop
    perform places.price_engine_publish(rec.place_id, rec.grade);
  end loop;
end $$;

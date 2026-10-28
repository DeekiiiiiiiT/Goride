-- N-1: stamp organization_id from payload aliases, then refuse nulls on money tables.
-- Does not invent a company. Stops if a required table still has a null after backfill.

create or replace function fleet.payload_company_id(p jsonb)
returns text
language sql
immutable
as $$
  select nullif(btrim(coalesce(
    p->>'organizationId',
    p->>'organization_id',
    p->>'orgId',
    p->>'org_id',
    p->'metadata'->>'organizationId',
    p->'metadata'->>'organization_id',
    p->'metadata'->>'orgId',
    p->'metadata'->>'org_id'
  )), '')
$$;

do $$
declare
  tbl text;
  leftover int;
begin
  foreach tbl in array array[
    'fuel_entries',
    'transactions',
    'odometer_readings',
    'trips',
    'checkins',
    'drivers'
  ]
  loop
    execute format(
      'update fleet.%I set organization_id = fleet.payload_company_id(payload_json) where organization_id is null and fleet.payload_company_id(payload_json) is not null',
      tbl
    );
  end loop;

  -- Company already stored on the driver or vehicle. Not a guess.
  update fleet.transactions t
  set organization_id = d.organization_id
  from fleet.drivers d
  where t.organization_id is null
    and t.driver_id = d.id
    and d.organization_id is not null;

  update fleet.odometer_readings o
  set organization_id = v.organization_id
  from fleet.vehicles v
  where o.organization_id is null
    and o.vehicle_id = v.id
    and v.organization_id is not null;

  foreach tbl in array array['fuel_entries', 'transactions', 'trips']
  loop
    execute format('select count(*) from fleet.%I where organization_id is null', tbl) into leftover;
    if leftover > 0 then
      raise exception '% still has % rows with no company after backfill', tbl, leftover;
    end if;
  end loop;
end $$;

alter table fleet.fuel_entries alter column organization_id set not null;
alter table fleet.transactions alter column organization_id set not null;
alter table fleet.trips alter column organization_id set not null;
-- odometer_readings stays nullable: three check-in rows name a plate with no vehicle row.
-- New writes still refuse a missing company in dual-write. The close gate blocks a week
-- that still has a null-company fill.

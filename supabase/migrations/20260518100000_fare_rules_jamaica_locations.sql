-- Hierarchical Jamaica locations for fare_rules (county → parish → town).
-- location_key is the canonical lookup slug, e.g. jamaica/cornwall/st-james/montego-bay

ALTER TABLE rides.fare_rules
  ADD COLUMN IF NOT EXISTS county TEXT,
  ADD COLUMN IF NOT EXISTS parish TEXT,
  ADD COLUMN IF NOT EXISTS locality TEXT,
  ADD COLUMN IF NOT EXISTS location_key TEXT;

UPDATE rides.fare_rules
SET location_key = COALESCE(NULLIF(TRIM(city), ''), 'jamaica')
WHERE location_key IS NULL OR TRIM(location_key) = '';

ALTER TABLE rides.fare_rules
  ALTER COLUMN location_key SET DEFAULT 'jamaica';

UPDATE rides.fare_rules SET location_key = 'jamaica' WHERE location_key IS NULL;

ALTER TABLE rides.fare_rules
  ALTER COLUMN location_key SET NOT NULL;

DROP INDEX IF EXISTS rides.idx_rides_fare_rules_city_vehicle_active;
DROP INDEX IF EXISTS idx_rides_fare_rules_city_vehicle_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rides_fare_rules_location_vehicle_active
  ON rides.fare_rules (location_key, vehicle_type)
  WHERE is_active = TRUE;

-- Refresh public admin views (SELECT *)
DROP VIEW IF EXISTS public.rides_audit_events;
DROP VIEW IF EXISTS public.rides_surge_cells;
DROP VIEW IF EXISTS public.rides_fare_rules;

CREATE VIEW public.rides_fare_rules AS
  SELECT * FROM rides.fare_rules;

CREATE VIEW public.rides_surge_cells AS
  SELECT * FROM rides.surge_cells;

CREATE VIEW public.rides_audit_events AS
  SELECT * FROM rides.audit_events;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_fare_rules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_surge_cells TO service_role;
GRANT SELECT, INSERT ON public.rides_audit_events TO service_role;

NOTIFY pgrst, 'reload schema';

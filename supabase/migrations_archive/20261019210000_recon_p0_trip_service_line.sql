-- Week Reconciliation P0: backfill fleet.trips.service_line and enforce NOT NULL.
-- See WEEK_RECONCILIATION_WIZARD_AUDIT.md §WR-C2 / P0 Foundations.

UPDATE fleet.trips
SET
  service_line = CASE
    WHEN platform = 'Roam Rush' THEN 'rush_delivery'
    ELSE 'rideshare'
  END,
  payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object(
    'service_line', CASE
      WHEN platform = 'Roam Rush' THEN 'rush_delivery'
      ELSE 'rideshare'
    END,
    'serviceLine', CASE
      WHEN platform = 'Roam Rush' THEN 'rush_delivery'
      ELSE 'rideshare'
    END
  )
WHERE service_line IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM fleet.trips
    WHERE service_line IS NOT NULL
      AND service_line NOT IN ('rideshare', 'rush_delivery')
  ) THEN
    RAISE EXCEPTION 'fleet.trips has invalid service_line values; fix before NOT NULL';
  END IF;
END $$;

ALTER TABLE fleet.trips
  ALTER COLUMN service_line SET DEFAULT 'rideshare';

ALTER TABLE fleet.trips
  ALTER COLUMN service_line SET NOT NULL;

COMMENT ON COLUMN fleet.trips.service_line IS
  'rideshare | rush_delivery. Backfilled from platform (Roam Rush → rush_delivery); default rideshare.';

-- Stale public.fleet_* views reject new columns on PostgREST upsert (see 20260902160000).
CREATE OR REPLACE VIEW public.fleet_trips
WITH (security_invoker = true) AS
  SELECT * FROM fleet.trips;

GRANT SELECT ON public.fleet_trips TO authenticated;
GRANT ALL ON public.fleet_trips TO service_role;

NOTIFY pgrst, 'reload schema';

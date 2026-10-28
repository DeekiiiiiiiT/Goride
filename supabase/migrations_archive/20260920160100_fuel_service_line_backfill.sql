-- Phase 0 backfill: attribute fuel/expense rows via vehicle single-line (T3),
-- stamp legacy non-null lines as trip, mark remainder unattributed.
-- Never overwrites service_line_source = 'explicit'.
-- Idempotent. See FUEL_SERVICE_LINE_SPLIT_AUDIT.md §3.1 / Phase 0.
--
-- Heal: 20260913180000_fleet_vehicles_service_lines never applied on GoRide prod,
-- so fleet.vehicles.service_lines was missing. Ensure it before T3 backfill.

ALTER TABLE fleet.vehicles
  ADD COLUMN IF NOT EXISTS service_lines text[] NOT NULL DEFAULT ARRAY['rideshare']::text[];

COMMENT ON COLUMN fleet.vehicles.service_lines IS
  'Platforms this vehicle serves: rideshare and/or rush_delivery. Empty not allowed; default rideshare.';

UPDATE fleet.vehicles
SET service_lines = (
  SELECT COALESCE(
    array_agg(DISTINCT x),
    ARRAY['rideshare']::text[]
  )
  FROM unnest(
    CASE
      WHEN jsonb_typeof(payload_json->'serviceLines') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(payload_json->'serviceLines'))
      WHEN jsonb_typeof(payload_json->'service_lines') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(payload_json->'service_lines'))
      ELSE ARRAY['rideshare']::text[]
    END
  ) AS x
  WHERE x IN ('rideshare', 'rush_delivery')
)
WHERE payload_json ? 'serviceLines'
   OR payload_json ? 'service_lines';

CREATE OR REPLACE VIEW public.fleet_vehicles AS
  SELECT * FROM fleet.vehicles;

GRANT SELECT ON public.fleet_vehicles TO authenticated;
GRANT ALL ON public.fleet_vehicles TO service_role;

-- Legacy trip-stamped rows (service_line set, source missing) → source trip.
UPDATE fleet.fuel_entries
SET
  service_line_source = 'trip',
  payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object(
    'service_line', service_line,
    'serviceLine', service_line,
    'service_line_source', 'trip',
    'serviceLineSource', 'trip'
  )
WHERE service_line IN ('rideshare', 'rush_delivery')
  AND service_line_source IS NULL;

UPDATE fleet.expense_journal
SET
  service_line_source = 'trip',
  payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object(
    'service_line', service_line,
    'serviceLine', service_line,
    'service_line_source', 'trip',
    'serviceLineSource', 'trip'
  )
WHERE service_line IN ('rideshare', 'rush_delivery')
  AND service_line_source IS NULL;

-- T3: exactly one vehicle service_line → attribute (fills that are still null).
UPDATE fleet.fuel_entries fe
SET
  service_line = v.service_lines[1],
  service_line_source = 'vehicle',
  payload_json = COALESCE(fe.payload_json, '{}'::jsonb) || jsonb_build_object(
    'service_line', v.service_lines[1],
    'serviceLine', v.service_lines[1],
    'service_line_source', 'vehicle',
    'serviceLineSource', 'vehicle'
  )
FROM fleet.vehicles v
WHERE fe.vehicle_id IS NOT NULL
  AND fe.vehicle_id = v.id
  AND fe.service_line IS NULL
  AND COALESCE(fe.service_line_source, '') IS DISTINCT FROM 'explicit'
  AND cardinality(v.service_lines) = 1
  AND v.service_lines[1] IN ('rideshare', 'rush_delivery');

-- Remaining null lines → unattributed (visible bucket, not a failure).
UPDATE fleet.fuel_entries
SET
  service_line_source = 'unattributed',
  payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object(
    'service_line_source', 'unattributed',
    'serviceLineSource', 'unattributed'
  )
WHERE service_line IS NULL
  AND COALESCE(service_line_source, '') IS DISTINCT FROM 'explicit'
  AND (service_line_source IS NULL OR service_line_source <> 'unattributed');

UPDATE fleet.expense_journal
SET
  service_line_source = 'unattributed',
  payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object(
    'service_line_source', 'unattributed',
    'serviceLineSource', 'unattributed'
  )
WHERE service_line IS NULL
  AND COALESCE(service_line_source, '') IS DISTINCT FROM 'explicit'
  AND (service_line_source IS NULL OR service_line_source <> 'unattributed');

NOTIFY pgrst, 'reload schema';

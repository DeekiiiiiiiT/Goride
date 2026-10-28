-- Idempotent odometer ledger backfill from fuel / check-in / service sources.
-- Safe to re-run: skips rows that already have a non-voided projection.

-- Fuel → ledger
INSERT INTO fleet.odometer_readings (
  id, organization_id, vehicle_id, reading, reading_date, legacy_kv_id, payload_json,
  source, reference_id, reference_type, recorded_at, is_hard, is_verified, is_voided, is_anomaly, driver_id, created_at, updated_at
)
SELECT
  left(regexp_replace('fuel_' || f.id, '[^a-zA-Z0-9_-]', '_', 'g'), 180),
  f.organization_id,
  f.vehicle_id,
  f.odometer,
  COALESCE(NULLIF(f.payload_json->>'date','')::date, f.created_at::date, CURRENT_DATE),
  'odometer_reading:' || f.vehicle_id || ':' || left(regexp_replace('fuel_' || f.id, '[^a-zA-Z0-9_-]', '_', 'g'), 180),
  jsonb_build_object(
    'id', left(regexp_replace('fuel_' || f.id, '[^a-zA-Z0-9_-]', '_', 'g'), 180),
    'vehicleId', f.vehicle_id,
    'value', f.odometer,
    'source', 'fuel',
    'referenceId', f.id,
    'backfilled', true
  ),
  'fuel',
  f.id,
  'fuel_entry',
  COALESCE(NULLIF(f.payload_json->>'date','')::timestamptz, f.created_at, now()),
  true, true, false, false,
  COALESCE(f.payload_json->>'driverId', NULL),
  now(), now()
FROM fleet.fuel_entries f
WHERE f.odometer IS NOT NULL AND f.odometer > 0
  AND f.vehicle_id IS NOT NULL AND f.vehicle_id <> 'unknown'
  AND f.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM fleet.odometer_readings o
    WHERE o.vehicle_id = f.vehicle_id
      AND o.source = 'fuel'
      AND o.reference_id = f.id
      AND o.is_voided = false
  );

-- Check-ins → ledger
INSERT INTO fleet.odometer_readings (
  id, organization_id, vehicle_id, reading, reading_date, legacy_kv_id, payload_json,
  source, reference_id, reference_type, recorded_at, is_hard, is_verified, is_voided, is_anomaly, driver_id, created_at, updated_at
)
SELECT
  left(regexp_replace('checkin_' || c.id, '[^a-zA-Z0-9_-]', '_', 'g'), 180),
  c.organization_id,
  c.vehicle_id,
  COALESCE(c.odometer, NULLIF(c.payload_json->>'odometer','')::numeric),
  COALESCE(c.week_start, NULLIF(c.payload_json->>'weekStart','')::date, NULLIF(c.payload_json->>'timestamp','')::date, c.created_at::date, CURRENT_DATE),
  'odometer_reading:' || c.vehicle_id || ':' || left(regexp_replace('checkin_' || c.id, '[^a-zA-Z0-9_-]', '_', 'g'), 180),
  jsonb_build_object(
    'id', left(regexp_replace('checkin_' || c.id, '[^a-zA-Z0-9_-]', '_', 'g'), 180),
    'vehicleId', c.vehicle_id,
    'value', COALESCE(c.odometer, NULLIF(c.payload_json->>'odometer','')::numeric),
    'source', 'checkin',
    'referenceId', c.id,
    'backfilled', true
  ),
  'checkin',
  c.id,
  'checkin',
  COALESCE(NULLIF(c.payload_json->>'timestamp','')::timestamptz, c.created_at, now()),
  true,
  COALESCE((c.payload_json->>'verified')::boolean, false)
    OR COALESCE(c.payload_json->>'reviewStatus','') IN ('approved','auto_approved'),
  false, false,
  COALESCE(c.driver_id, c.payload_json->>'driverId'),
  now(), now()
FROM fleet.checkins c
WHERE COALESCE(c.odometer, NULLIF(c.payload_json->>'odometer','')::numeric) > 0
  AND c.vehicle_id IS NOT NULL AND c.vehicle_id <> 'unknown'
  AND c.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM fleet.odometer_readings o
    WHERE o.vehicle_id = c.vehicle_id
      AND o.source = 'checkin'
      AND o.reference_id = c.id
      AND o.is_voided = false
  );

-- Refresh vehicle odometer cache from ledger MAX(hard, not voided)
UPDATE fleet.vehicles v
SET payload_json =
  jsonb_set(
    jsonb_set(
      COALESCE(v.payload_json, '{}'::jsonb),
      '{metrics,odometer}',
      to_jsonb(c.current_km),
      true
    ),
    '{currentOdometer}',
    to_jsonb(c.current_km),
    true
  ),
  updated_at = now()
FROM (
  SELECT vehicle_id, MAX(reading) AS current_km
  FROM fleet.odometer_readings
  WHERE is_voided = false AND is_hard = true
  GROUP BY vehicle_id
) c
WHERE v.id = c.vehicle_id;

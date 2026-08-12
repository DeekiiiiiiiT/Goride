-- Odometer ledger: evolve fleet.odometer_readings into canonical mileage event log.
-- Also promote odometer/driver/week fields on fuel_entries + checkins for query safety.

-- ---------------------------------------------------------------------------
-- fleet.odometer_readings → ledger columns
-- ---------------------------------------------------------------------------
ALTER TABLE fleet.odometer_readings
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS reference_id text,
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_hard boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_voided boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_anomaly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS driver_id text;

-- Backfill ledger metadata from existing payload / columns
UPDATE fleet.odometer_readings
SET
  source = COALESCE(
    NULLIF(source, ''),
    CASE
      WHEN lower(COALESCE(payload_json->>'source', '')) LIKE '%import%' THEN 'import'
      WHEN lower(COALESCE(payload_json->>'source', '')) LIKE '%fuel%' THEN 'fuel'
      WHEN lower(COALESCE(payload_json->>'source', '')) LIKE '%check%' THEN 'checkin'
      WHEN lower(COALESCE(payload_json->>'source', '')) LIKE '%service%' THEN 'service'
      ELSE 'manual'
    END
  ),
  reference_id = COALESCE(NULLIF(reference_id, ''), NULLIF(payload_json->>'referenceId', ''), id),
  reference_type = COALESCE(
    NULLIF(reference_type, ''),
    CASE
      WHEN lower(COALESCE(payload_json->>'source', '')) LIKE '%fuel%' THEN 'fuel_entry'
      WHEN lower(COALESCE(payload_json->>'source', '')) LIKE '%check%' THEN 'checkin'
      WHEN lower(COALESCE(payload_json->>'source', '')) LIKE '%service%' THEN 'maintenance_log'
      WHEN lower(COALESCE(payload_json->>'source', '')) LIKE '%import%' THEN 'import_batch'
      ELSE 'manual'
    END
  ),
  recorded_at = COALESCE(
    recorded_at,
    NULLIF(payload_json->>'createdAt', '')::timestamptz,
    NULLIF(payload_json->>'timestamp', '')::timestamptz,
    (reading_date::text || 'T12:00:00Z')::timestamptz,
    created_at,
    now()
  ),
  is_verified = COALESCE(
    is_verified,
    COALESCE((payload_json->>'isVerified')::boolean, false)
      OR COALESCE((payload_json->>'isManagerVerified')::boolean, false)
      OR COALESCE((payload_json->>'verified')::boolean, false)
  ),
  driver_id = COALESCE(NULLIF(driver_id, ''), NULLIF(payload_json->>'driverId', '')),
  reading = COALESCE(
    reading,
    NULLIF(payload_json->>'reading', '')::numeric,
    NULLIF(payload_json->>'odometer', '')::numeric,
    NULLIF(payload_json->>'value', '')::numeric,
    NULLIF(payload_json->>'odo', '')::numeric
  )
WHERE true;

ALTER TABLE fleet.odometer_readings
  ALTER COLUMN source SET DEFAULT 'manual',
  ALTER COLUMN recorded_at SET DEFAULT now();

UPDATE fleet.odometer_readings SET source = 'manual' WHERE source IS NULL;
UPDATE fleet.odometer_readings SET recorded_at = COALESCE(created_at, now()) WHERE recorded_at IS NULL;

ALTER TABLE fleet.odometer_readings
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN recorded_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fleet_odometer_ledger_proj_uidx
  ON fleet.odometer_readings (organization_id, vehicle_id, source, reference_id)
  WHERE reference_id IS NOT NULL AND is_voided = false;

CREATE INDEX IF NOT EXISTS fleet_odometer_ledger_vehicle_reading_idx
  ON fleet.odometer_readings (vehicle_id, reading DESC)
  WHERE is_voided = false AND is_hard = true;

CREATE INDEX IF NOT EXISTS fleet_odometer_ledger_vehicle_recorded_idx
  ON fleet.odometer_readings (vehicle_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS fleet_odometer_ledger_vehicle_flags_idx
  ON fleet.odometer_readings (vehicle_id, is_voided, is_hard);

CREATE INDEX IF NOT EXISTS fleet_odometer_ledger_anomaly_idx
  ON fleet.odometer_readings (vehicle_id, is_anomaly)
  WHERE is_anomaly = true AND is_voided = false;

-- ---------------------------------------------------------------------------
-- Source table promotions
-- ---------------------------------------------------------------------------
ALTER TABLE fleet.fuel_entries
  ADD COLUMN IF NOT EXISTS odometer numeric;

UPDATE fleet.fuel_entries
SET odometer = COALESCE(
  odometer,
  NULLIF(payload_json->>'odometer', '')::numeric
)
WHERE odometer IS NULL
  AND NULLIF(payload_json->>'odometer', '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS fleet_fuel_entries_vehicle_odo_idx
  ON fleet.fuel_entries (vehicle_id, odometer)
  WHERE odometer IS NOT NULL AND odometer > 0;

ALTER TABLE fleet.checkins
  ADD COLUMN IF NOT EXISTS odometer numeric,
  ADD COLUMN IF NOT EXISTS driver_id text,
  ADD COLUMN IF NOT EXISTS week_start date;

UPDATE fleet.checkins
SET
  odometer = COALESCE(odometer, NULLIF(payload_json->>'odometer', '')::numeric),
  driver_id = COALESCE(NULLIF(driver_id, ''), NULLIF(payload_json->>'driverId', '')),
  week_start = COALESCE(
    week_start,
    NULLIF(payload_json->>'weekStart', '')::date
  )
WHERE true;

CREATE INDEX IF NOT EXISTS fleet_checkins_driver_week_idx
  ON fleet.checkins (driver_id, week_start);

CREATE INDEX IF NOT EXISTS fleet_checkins_vehicle_odo_idx
  ON fleet.checkins (vehicle_id, odometer)
  WHERE odometer IS NOT NULL AND odometer > 0;

-- Refresh PostgREST views so new columns are exposed
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['odometer_readings', 'fuel_entries', 'checkins']
  LOOP
    EXECUTE format('CREATE OR REPLACE VIEW public.fleet_%I AS SELECT * FROM fleet.%I;', t, t);
    EXECUTE format('GRANT SELECT ON public.fleet_%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.fleet_%I TO service_role;', t);
  END LOOP;
END $$;

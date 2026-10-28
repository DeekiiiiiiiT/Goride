-- Vehicle custody lifecycle (assignment ≠ physical possession)
-- none → assigned → handed_over → in_custody

ALTER TABLE fleet.vehicles
  ADD COLUMN IF NOT EXISTS custody_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS handed_over_at timestamptz,
  ADD COLUMN IF NOT EXISTS handed_over_by text,
  ADD COLUMN IF NOT EXISTS custody_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS custody_confirmed_by text;

ALTER TABLE fleet.vehicles
  DROP CONSTRAINT IF EXISTS fleet_vehicles_custody_status_check;

ALTER TABLE fleet.vehicles
  ADD CONSTRAINT fleet_vehicles_custody_status_check
  CHECK (custody_status IN ('none', 'assigned', 'handed_over', 'in_custody'));

-- Assigned vehicles without custody metadata start as 'assigned'
UPDATE fleet.vehicles
SET custody_status = 'assigned'
WHERE current_driver_id IS NOT NULL
  AND nullif(trim(current_driver_id), '') IS NOT NULL
  AND custody_status = 'none';

-- Backfill: if this vehicle+driver pair already has a check-in, treat as in_custody
-- so active fleets are not locked behind the new two-step flow on deploy.
UPDATE fleet.vehicles v
SET
  custody_status = 'in_custody',
  custody_confirmed_at = COALESCE(v.custody_confirmed_at, now()),
  handed_over_at = COALESCE(v.handed_over_at, now())
WHERE v.current_driver_id IS NOT NULL
  AND nullif(trim(v.current_driver_id), '') IS NOT NULL
  AND v.custody_status IN ('none', 'assigned', 'handed_over')
  AND EXISTS (
    SELECT 1
    FROM fleet.checkins c
    WHERE c.vehicle_id = v.id
      AND (
        c.driver_id = v.current_driver_id
        OR c.payload_json->>'driverId' = v.current_driver_id
      )
  );

-- Mirror into payload_json for KV readers
UPDATE fleet.vehicles
SET payload_json = coalesce(payload_json, '{}'::jsonb)
  || jsonb_build_object(
    'custodyStatus', custody_status,
    'handedOverAt', to_jsonb(handed_over_at),
    'handedOverBy', to_jsonb(handed_over_by),
    'custodyConfirmedAt', to_jsonb(custody_confirmed_at),
    'custodyConfirmedBy', to_jsonb(custody_confirmed_by)
  );

COMMENT ON COLUMN fleet.vehicles.custody_status IS
  'Vehicle possession lifecycle: none | assigned | handed_over | in_custody. Forced weekly check-in requires in_custody.';

-- public.fleet_vehicles was created with an explicit column list; refresh so
-- dual-write (PostgREST) can upsert the new custody columns.
CREATE OR REPLACE VIEW public.fleet_vehicles AS
  SELECT * FROM fleet.vehicles;

GRANT SELECT ON public.fleet_vehicles TO authenticated;
GRANT ALL ON public.fleet_vehicles TO service_role;

NOTIFY pgrst, 'reload schema';

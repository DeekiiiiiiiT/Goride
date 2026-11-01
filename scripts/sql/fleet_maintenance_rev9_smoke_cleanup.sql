-- Rev 9 / enterprise audit smoke-test cleanup (O-05).
-- Run preflight queries first, then the transaction block.
-- Keeps historical fleet.maintenance_audit_log rows; cancels fake WOs and unblocks the vehicle.

-- Preflight: smoke work orders
SELECT id, status, source, provider, vehicle_id
FROM public.maintenance_work_orders
WHERE id IN (
  'b77896d9-e72f-4d9d-935f-59c0fd461128'::uuid,
  '1fbbfba0-846a-433b-a4ad-8a4987be1f32'::uuid
);

-- Preflight: vehicle do-not-drive (1505LM Honda Fit)
SELECT id, license_plate, do_not_drive, do_not_drive_reason
FROM fleet.vehicles
WHERE id = '1505LM';

-- Preflight: false driver notification
SELECT id, event_type, title, body, vehicle_id, created_at
FROM fleet.driver_maintenance_notifications
WHERE vehicle_id = '1505LM'
  AND event_type = 'do_not_drive'
ORDER BY created_at DESC;

BEGIN;

UPDATE public.maintenance_work_orders
SET status = 'cancelled',
    cancel_reason = 'Rev 9 smoke test',
    updated_at = now()
WHERE id IN (
  'b77896d9-e72f-4d9d-935f-59c0fd461128'::uuid,
  '1fbbfba0-846a-433b-a4ad-8a4987be1f32'::uuid
);

UPDATE fleet.vehicles
SET do_not_drive = false,
    do_not_drive_reason = null,
    do_not_drive_set_at = null
WHERE id = '1505LM';

DELETE FROM fleet.driver_maintenance_notifications
WHERE id = '38085680-232a-4933-89eb-99b559b1eb54'::uuid;

COMMIT;

-- Post-verify
SELECT id, status, cancel_reason FROM public.maintenance_work_orders
WHERE id IN (
  'b77896d9-e72f-4d9d-935f-59c0fd461128'::uuid,
  '1fbbfba0-846a-433b-a4ad-8a4987be1f32'::uuid
);
SELECT id, do_not_drive FROM fleet.vehicles WHERE id = '1505LM';

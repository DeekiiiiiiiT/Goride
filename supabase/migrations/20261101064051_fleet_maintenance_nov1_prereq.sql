ALTER TABLE fleet.organization_settings
  ADD COLUMN IF NOT EXISTS due_soon_km integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS due_soon_days integer NOT NULL DEFAULT 14;

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS void_reason text;

ALTER TABLE public.vehicle_component_schedule
  ADD COLUMN IF NOT EXISTS baseline_source text,
  ADD COLUMN IF NOT EXISTS baseline_odometer numeric,
  ADD COLUMN IF NOT EXISTS baseline_date date;

CREATE OR REPLACE VIEW fleet.vehicle_current_odometer_v AS
SELECT DISTINCT ON (r.vehicle_id)
  r.vehicle_id,
  r.organization_id,
  r.reading,
  r.recorded_at,
  r.source,
  r.reading_date
FROM fleet.odometer_readings r
WHERE r.is_voided = false
  AND r.is_anomaly = false
  AND r.reading > 0
ORDER BY r.vehicle_id, r.recorded_at DESC, r.reading DESC;;

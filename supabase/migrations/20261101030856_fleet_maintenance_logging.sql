-- Fleet maintenance logging program (audit Rev 2): odometer trust, derived schedules, nightly job, events.

-- ---------------------------------------------------------------------------
-- 1. Org + L-15 columns
-- ---------------------------------------------------------------------------
ALTER TABLE fleet.organization_settings
  ADD COLUMN IF NOT EXISTS due_soon_km integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS due_soon_days integer NOT NULL DEFAULT 14;

ALTER TABLE fleet.vehicles
  ADD COLUMN IF NOT EXISTS fleet_unit_id text,
  ADD COLUMN IF NOT EXISTS home_base text;

ALTER TABLE fleet.odometer_readings
  ADD COLUMN IF NOT EXISTS anomaly_reason text,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE public.maintenance_service_categories
  ADD COLUMN IF NOT EXISTS overdue_effect text;

ALTER TABLE public.maintenance_task_templates
  ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT false;

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS log_number text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS void_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mwo_log_number
  ON public.maintenance_work_orders (log_number)
  WHERE log_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mwo_org_idempotency
  ON public.maintenance_work_orders (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.vehicle_component_schedule
  ADD COLUMN IF NOT EXISTS baseline_source text,
  ADD COLUMN IF NOT EXISTS baseline_odometer numeric,
  ADD COLUMN IF NOT EXISTS baseline_date date;

CREATE SEQUENCE IF NOT EXISTS fleet.maintenance_log_number_seq START 1;

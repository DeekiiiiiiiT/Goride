-- UTF-8 successor for 20260417140000 (that file is UTF-16LE-BOM; keep history intact).
-- Idempotent: column may already exist from the earlier migration.
ALTER TABLE public.vehicle_maintenance_schedule
  ADD COLUMN IF NOT EXISTS next_due_miles_max integer;

COMMENT ON COLUMN public.vehicle_maintenance_schedule.next_due_miles_max IS
  'Upper bound of acceptable odometer window for this due event; null when template has no interval_miles_max.';

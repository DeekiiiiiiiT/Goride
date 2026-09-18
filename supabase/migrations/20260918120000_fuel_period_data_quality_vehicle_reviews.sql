-- Cash-desk lock: per-vehicle data-quality acknowledgements (Amber/Red / odometer incomplete).
ALTER TABLE public.fuel_reconciliation_period
  ADD COLUMN IF NOT EXISTS data_quality_vehicle_reviews jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.fuel_reconciliation_period.data_quality_vehicle_reviews IS
  'Array of { vehicleId, at, by?, note? } — operator marked flagged DQ vehicles reviewed for Continue gate.';

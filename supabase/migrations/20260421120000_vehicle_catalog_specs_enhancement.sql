-- Extend platform motor catalog: variant identity (generation_code), brakes, tires, fluid capacities.
-- Uniqueness: one row per (make, model, year, trim_series, generation_code) after normalization.
-- NULL trim_series / generation_code are treated as empty string for uniqueness (legacy rows may need deduping before index applies).

ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS generation_code text;

COMMENT ON COLUMN public.vehicle_catalog.generation_code IS 'OEM generation / chassis code (e.g. M900A). Distinct from numeric generation.';

ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS front_brake_type text,
  ADD COLUMN IF NOT EXISTS rear_brake_type text,
  ADD COLUMN IF NOT EXISTS brake_size_mm numeric;

COMMENT ON COLUMN public.vehicle_catalog.front_brake_type IS 'disc | drum (or free text)';
COMMENT ON COLUMN public.vehicle_catalog.rear_brake_type IS 'disc | drum (or free text)';
COMMENT ON COLUMN public.vehicle_catalog.brake_size_mm IS 'Optional rotor/drum reference size';

ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS tire_size text,
  ADD COLUMN IF NOT EXISTS bolt_pattern text,
  ADD COLUMN IF NOT EXISTS wheel_offset_mm numeric;

COMMENT ON COLUMN public.vehicle_catalog.tire_size IS 'e.g. 185/60R15';
COMMENT ON COLUMN public.vehicle_catalog.bolt_pattern IS 'e.g. 5x114.3';
COMMENT ON COLUMN public.vehicle_catalog.wheel_offset_mm IS 'Wheel offset (mm)';

ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS engine_oil_capacity_l numeric,
  ADD COLUMN IF NOT EXISTS coolant_capacity_l numeric;

COMMENT ON COLUMN public.vehicle_catalog.engine_oil_capacity_l IS 'Engine oil fill capacity (liters)';
COMMENT ON COLUMN public.vehicle_catalog.coolant_capacity_l IS 'Cooling system capacity (liters)';

-- Backfill generation_code from legacy model_code when present (both optional OEM-style strings)
UPDATE public.vehicle_catalog
SET generation_code = trim(model_code)
WHERE generation_code IS NULL
  AND model_code IS NOT NULL
  AND trim(model_code) <> '';

-- Prevent duplicate variants (normalized). Fails if existing data has duplicates — resolve duplicates then re-apply.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_catalog_variant_identity
  ON public.vehicle_catalog (
    lower(trim(both from make)),
    lower(trim(both from model)),
    year,
    lower(coalesce(trim_series, '')),
    lower(coalesce(generation_code, ''))
  );
-- CSV-aligned catalog: PIM fields from import sheet, exterior_color removed, variant identity index rebuilt.

-- 1) New business columns (nullable text unless noted)
ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS full_model_code text,
  ADD COLUMN IF NOT EXISTS catalog_trim text,
  ADD COLUMN IF NOT EXISTS emissions_prefix text,
  ADD COLUMN IF NOT EXISTS trim_suffix_code text,
  ADD COLUMN IF NOT EXISTS fuel_category text,
  ADD COLUMN IF NOT EXISTS fuel_grade text;

COMMENT ON COLUMN public.vehicle_catalog.full_model_code IS 'OEM full model / frame code string from import (e.g. DBA-M900A-GBME)';
COMMENT ON COLUMN public.vehicle_catalog.catalog_trim IS 'Market trim / grade label (e.g. Custom G)';
COMMENT ON COLUMN public.vehicle_catalog.emissions_prefix IS 'Emissions / frame prefix (e.g. DBA, 5BA)';
COMMENT ON COLUMN public.vehicle_catalog.trim_suffix_code IS 'Trim suffix / package code (e.g. GBME)';
COMMENT ON COLUMN public.vehicle_catalog.fuel_category IS 'Fuel category (e.g. Gas, Hybrid)';
COMMENT ON COLUMN public.vehicle_catalog.fuel_grade IS 'Fuel grade / octane label (e.g. 87)';

-- Backfill full_model_code from legacy model_code when empty
UPDATE public.vehicle_catalog
SET full_model_code = trim(model_code)
WHERE (full_model_code IS NULL OR trim(full_model_code) = '')
  AND model_code IS NOT NULL
  AND trim(model_code) <> '';

-- 2) Drop legacy column not used in CSV
ALTER TABLE public.vehicle_catalog DROP COLUMN IF EXISTS exterior_color;

-- 3) Pending requests: mirror new proposed fields for fleet parity
ALTER TABLE public.vehicle_catalog_pending_requests
  ADD COLUMN IF NOT EXISTS proposed_full_model_code text,
  ADD COLUMN IF NOT EXISTS proposed_catalog_trim text,
  ADD COLUMN IF NOT EXISTS proposed_emissions_prefix text,
  ADD COLUMN IF NOT EXISTS proposed_trim_suffix_code text,
  ADD COLUMN IF NOT EXISTS proposed_fuel_category text,
  ADD COLUMN IF NOT EXISTS proposed_fuel_grade text;

-- 4) Rebuild variant uniqueness (includes PIM identity fields)
DROP INDEX IF EXISTS idx_vehicle_catalog_variant_identity;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_catalog_variant_identity
  ON public.vehicle_catalog (
    lower(trim(both from make)),
    lower(trim(both from model)),
    lower(coalesce(trim_series, '')),
    lower(coalesce(full_model_code, '')),
    lower(coalesce(catalog_trim, '')),
    lower(coalesce(emissions_prefix, '')),
    lower(coalesce(trim_suffix_code, '')),
    lower(coalesce(chassis_code, '')),
    lower(coalesce(engine_code, '')),
    lower(coalesce(engine_type, '')),
    production_start_year,
    coalesce(production_start_month, 1),
    coalesce(production_end_year, 9999),
    coalesce(production_end_month, 12),
    lower(coalesce(drivetrain, '')),
    lower(coalesce(fuel_type, '')),
    lower(coalesce(fuel_category, '')),
    lower(coalesce(fuel_grade, '')),
    lower(coalesce(transmission, ''))
  );

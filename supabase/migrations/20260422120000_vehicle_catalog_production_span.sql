-- Variant catalog: production year span, chassis_code, engine_induction; remove single model year column.

-- 1) vehicle_catalog: new columns
ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS production_start_year integer,
  ADD COLUMN IF NOT EXISTS production_end_year integer,
  ADD COLUMN IF NOT EXISTS chassis_code text,
  ADD COLUMN IF NOT EXISTS engine_induction text;

COMMENT ON COLUMN public.vehicle_catalog.production_start_year IS 'First calendar year this variant was produced.';
COMMENT ON COLUMN public.vehicle_catalog.production_end_year IS 'Last calendar year (inclusive); NULL = still in production.';
COMMENT ON COLUMN public.vehicle_catalog.chassis_code IS 'Primary technical index (e.g. M900A).';
COMMENT ON COLUMN public.vehicle_catalog.engine_induction IS 'na | turbo | supercharged | other';

ALTER TABLE public.vehicle_catalog
  DROP CONSTRAINT IF EXISTS vehicle_catalog_engine_induction_check;

ALTER TABLE public.vehicle_catalog
  ADD CONSTRAINT vehicle_catalog_engine_induction_check
  CHECK (engine_induction IS NULL OR engine_induction IN ('na', 'turbo', 'supercharged', 'other'));

-- Backfill span from legacy year
UPDATE public.vehicle_catalog
SET
  production_start_year = year,
  production_end_year = year
WHERE production_start_year IS NULL;

UPDATE public.vehicle_catalog
SET chassis_code = NULLIF(trim(both from coalesce(generation_code, '')), '')
WHERE chassis_code IS NULL;

ALTER TABLE public.vehicle_catalog
  ALTER COLUMN production_start_year SET NOT NULL;

ALTER TABLE public.vehicle_catalog
  DROP CONSTRAINT IF EXISTS vehicle_catalog_production_span_check;

ALTER TABLE public.vehicle_catalog
  ADD CONSTRAINT vehicle_catalog_production_span_check
  CHECK (
    production_end_year IS NULL
    OR (production_end_year >= production_start_year AND production_end_year <= 2100)
  );

ALTER TABLE public.vehicle_catalog
  ADD CONSTRAINT vehicle_catalog_production_start_year_bounds
  CHECK (production_start_year >= 1900 AND production_start_year <= 2100);

-- 2) Replace uniqueness (no longer keyed by calendar year alone)
DROP INDEX IF EXISTS idx_vehicle_catalog_variant_identity;

DROP INDEX IF EXISTS idx_vehicle_catalog_make_model_year;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_catalog_variant_identity
  ON public.vehicle_catalog (
    lower(trim(both from make)),
    lower(trim(both from model)),
    lower(coalesce(trim_series, '')),
    lower(coalesce(chassis_code, '')),
    production_start_year,
    coalesce(production_end_year, 9999),
    lower(coalesce(drivetrain, '')),
    lower(coalesce(fuel_type, '')),
    lower(coalesce(transmission, ''))
  );

CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_make_model_span
  ON public.vehicle_catalog (make, model, production_start_year DESC);

-- 3) Drop legacy year column
ALTER TABLE public.vehicle_catalog DROP COLUMN IF EXISTS year;

-- 4) Pending requests: production span
ALTER TABLE public.vehicle_catalog_pending_requests
  ADD COLUMN IF NOT EXISTS proposed_production_start_year integer,
  ADD COLUMN IF NOT EXISTS proposed_production_end_year integer;

UPDATE public.vehicle_catalog_pending_requests
SET
  proposed_production_start_year = proposed_year,
  proposed_production_end_year = proposed_year
WHERE proposed_production_start_year IS NULL
  AND proposed_year IS NOT NULL;

UPDATE public.vehicle_catalog_pending_requests
SET proposed_production_start_year = EXTRACT(YEAR FROM CURRENT_DATE)::integer
WHERE proposed_production_start_year IS NULL;

ALTER TABLE public.vehicle_catalog_pending_requests
  ALTER COLUMN proposed_production_start_year SET NOT NULL;

ALTER TABLE public.vehicle_catalog_pending_requests
  DROP CONSTRAINT IF EXISTS vehicle_catalog_pending_proposed_span_check;

ALTER TABLE public.vehicle_catalog_pending_requests
  ADD CONSTRAINT vehicle_catalog_pending_proposed_span_check
  CHECK (
    proposed_production_end_year IS NULL
    OR (
      proposed_production_end_year >= proposed_production_start_year
      AND proposed_production_end_year <= 2100
    )
  );

ALTER TABLE public.vehicle_catalog_pending_requests
  ADD CONSTRAINT vehicle_catalog_pending_proposed_start_bounds
  CHECK (proposed_production_start_year >= 1900 AND proposed_production_start_year <= 2100);

DROP INDEX IF EXISTS idx_vcpending_proposed_mmy;

ALTER TABLE public.vehicle_catalog_pending_requests DROP COLUMN IF EXISTS proposed_year;

CREATE INDEX IF NOT EXISTS idx_vcpending_proposed_mmy
  ON public.vehicle_catalog_pending_requests (proposed_make, proposed_model, proposed_production_start_year);

-- Month-precision production window, engine_code, text generation, rename engine_induction -> engine_type, rebuild variant uniqueness.

-- 1) Drop uniqueness before structural changes
DROP INDEX IF EXISTS idx_vehicle_catalog_variant_identity;

-- 2) vehicle_catalog: new columns
ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS production_start_month smallint,
  ADD COLUMN IF NOT EXISTS production_end_month smallint,
  ADD COLUMN IF NOT EXISTS engine_code text;

COMMENT ON COLUMN public.vehicle_catalog.production_start_month IS '1-12; NULL treated as January for ordering/uniqueness coalesce';
COMMENT ON COLUMN public.vehicle_catalog.production_end_month IS '1-12; NULL when production_end_year is NULL (ongoing)';
COMMENT ON COLUMN public.vehicle_catalog.engine_code IS 'OEM engine code (e.g. 1KR-FE)';

-- 3) Rename engine_induction -> engine_type
ALTER TABLE public.vehicle_catalog RENAME COLUMN engine_induction TO engine_type;

ALTER TABLE public.vehicle_catalog
  DROP CONSTRAINT IF EXISTS vehicle_catalog_engine_induction_check;

ALTER TABLE public.vehicle_catalog
  ADD CONSTRAINT vehicle_catalog_engine_type_check
  CHECK (engine_type IS NULL OR engine_type IN ('na', 'turbo', 'supercharged', 'other'));

COMMENT ON COLUMN public.vehicle_catalog.engine_type IS 'na | turbo | supercharged | other';

-- 4) generation: integer -> text
ALTER TABLE public.vehicle_catalog
  ALTER COLUMN generation TYPE text USING (
    CASE WHEN generation IS NULL THEN NULL ELSE trim(generation::text) END
  );

-- 5) Month bounds
ALTER TABLE public.vehicle_catalog
  DROP CONSTRAINT IF EXISTS vehicle_catalog_production_start_month_check;

ALTER TABLE public.vehicle_catalog
  ADD CONSTRAINT vehicle_catalog_production_start_month_check
  CHECK (production_start_month IS NULL OR (production_start_month >= 1 AND production_start_month <= 12));

ALTER TABLE public.vehicle_catalog
  DROP CONSTRAINT IF EXISTS vehicle_catalog_production_end_month_check;

ALTER TABLE public.vehicle_catalog
  ADD CONSTRAINT vehicle_catalog_production_end_month_check
  CHECK (production_end_month IS NULL OR (production_end_month >= 1 AND production_end_month <= 12));

ALTER TABLE public.vehicle_catalog
  DROP CONSTRAINT IF EXISTS vehicle_catalog_production_end_month_when_ongoing;

ALTER TABLE public.vehicle_catalog
  ADD CONSTRAINT vehicle_catalog_production_end_month_when_ongoing
  CHECK (
    production_end_year IS NOT NULL
    OR production_end_month IS NULL
  );

ALTER TABLE public.vehicle_catalog
  DROP CONSTRAINT IF EXISTS vehicle_catalog_production_span_check;

ALTER TABLE public.vehicle_catalog
  ADD CONSTRAINT vehicle_catalog_production_span_check
  CHECK (
    production_end_year IS NULL
    OR (
      production_end_year <= 2100
      AND (production_start_year * 12 + coalesce(production_start_month, 1))
          <= (production_end_year * 12 + coalesce(production_end_month, 12))
    )
  );

-- 6) Backfill months for existing rows
UPDATE public.vehicle_catalog
SET production_start_month = 1
WHERE production_start_month IS NULL;

UPDATE public.vehicle_catalog
SET production_end_month = CASE
  WHEN production_end_year IS NULL THEN NULL
  ELSE 12
END
WHERE production_end_month IS NULL;

-- 7) Variant identity (normalized + engine + month-precision start/end sentinels for ongoing)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_catalog_variant_identity
  ON public.vehicle_catalog (
    lower(trim(both from make)),
    lower(trim(both from model)),
    lower(coalesce(trim_series, '')),
    lower(coalesce(chassis_code, '')),
    lower(coalesce(engine_code, '')),
    lower(coalesce(engine_type, '')),
    production_start_year,
    coalesce(production_start_month, 1),
    coalesce(production_end_year, 9999),
    coalesce(production_end_month, 12),
    lower(coalesce(drivetrain, '')),
    lower(coalesce(fuel_type, '')),
    lower(coalesce(transmission, ''))
  );

-- 8) Pending requests: parity columns
ALTER TABLE public.vehicle_catalog_pending_requests
  ADD COLUMN IF NOT EXISTS proposed_production_start_month smallint,
  ADD COLUMN IF NOT EXISTS proposed_production_end_month smallint,
  ADD COLUMN IF NOT EXISTS proposed_engine_code text;

UPDATE public.vehicle_catalog_pending_requests
SET
  proposed_production_start_month = 1,
  proposed_production_end_month = CASE
    WHEN proposed_production_end_year IS NULL THEN NULL
    ELSE 12
  END
WHERE proposed_production_start_month IS NULL;

ALTER TABLE public.vehicle_catalog_pending_requests
  DROP CONSTRAINT IF EXISTS vehicle_catalog_pending_proposed_start_month_check;

ALTER TABLE public.vehicle_catalog_pending_requests
  ADD CONSTRAINT vehicle_catalog_pending_proposed_start_month_check
  CHECK (proposed_production_start_month IS NULL OR (proposed_production_start_month >= 1 AND proposed_production_start_month <= 12));

ALTER TABLE public.vehicle_catalog_pending_requests
  DROP CONSTRAINT IF EXISTS vehicle_catalog_pending_proposed_end_month_check;

ALTER TABLE public.vehicle_catalog_pending_requests
  ADD CONSTRAINT vehicle_catalog_pending_proposed_end_month_check
  CHECK (proposed_production_end_month IS NULL OR (proposed_production_end_month >= 1 AND proposed_production_end_month <= 12));

ALTER TABLE public.vehicle_catalog_pending_requests
  DROP CONSTRAINT IF EXISTS vehicle_catalog_pending_proposed_end_month_when_ongoing;

ALTER TABLE public.vehicle_catalog_pending_requests
  ADD CONSTRAINT vehicle_catalog_pending_proposed_end_month_when_ongoing
  CHECK (
    proposed_production_end_year IS NOT NULL
    OR proposed_production_end_month IS NULL
  );

ALTER TABLE public.vehicle_catalog_pending_requests
  DROP CONSTRAINT IF EXISTS vehicle_catalog_pending_proposed_span_check;

ALTER TABLE public.vehicle_catalog_pending_requests
  ADD CONSTRAINT vehicle_catalog_pending_proposed_span_check
  CHECK (
    proposed_production_end_year IS NULL
    OR (
      proposed_production_end_year <= 2100
      AND (proposed_production_start_year * 12 + coalesce(proposed_production_start_month, 1))
          <= (proposed_production_end_year * 12 + coalesce(proposed_production_end_month, 12))
    )
  );

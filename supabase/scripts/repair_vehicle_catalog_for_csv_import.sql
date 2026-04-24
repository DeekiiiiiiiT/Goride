-- One-shot repair for motor catalog CSV import (run in Supabase SQL Editor for your project).
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS guards.
-- After: Dashboard → Settings → API → "Reload schema" (or wait ~1 min) so PostgREST picks up new columns.

-- Legacy rename: some databases still have engine_induction instead of engine_type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicle_catalog' AND column_name = 'engine_induction'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicle_catalog' AND column_name = 'engine_type'
  ) THEN
    ALTER TABLE public.vehicle_catalog RENAME COLUMN engine_induction TO engine_type;
  END IF;
END $$;

-- If neither exists (rare), add engine_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicle_catalog'
      AND column_name IN ('engine_type', 'engine_induction')
  ) THEN
    ALTER TABLE public.vehicle_catalog ADD COLUMN engine_type text;
  END IF;
END $$;

ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS production_start_month smallint,
  ADD COLUMN IF NOT EXISTS production_end_month smallint,
  ADD COLUMN IF NOT EXISTS engine_code text,
  ADD COLUMN IF NOT EXISTS full_model_code text,
  ADD COLUMN IF NOT EXISTS catalog_trim text,
  ADD COLUMN IF NOT EXISTS emissions_prefix text,
  ADD COLUMN IF NOT EXISTS trim_suffix_code text,
  ADD COLUMN IF NOT EXISTS fuel_category text,
  ADD COLUMN IF NOT EXISTS fuel_grade text;

ALTER TABLE public.vehicle_catalog
  DROP CONSTRAINT IF EXISTS vehicle_catalog_engine_type_check;

COMMENT ON COLUMN public.vehicle_catalog.engine_type IS 'Free-text engine / induction label (e.g. Turbo, N/A)';

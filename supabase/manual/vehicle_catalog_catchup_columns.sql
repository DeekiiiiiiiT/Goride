-- ---------------------------------------------------------------------------
-- Motor catalog: add missing columns (safe to re-run)
-- Run in Supabase Dashboard → SQL → New query → Run
-- Use when imports fail with "Could not find the '…' column … in the schema cache"
-- ---------------------------------------------------------------------------

-- OEM / variant identity
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS model_code text;
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS generation_code text;

-- Brakes / wheels / fluids (spec pack)
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS front_brake_type text;
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS rear_brake_type text;
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS brake_size_mm numeric;
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS tire_size text;
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS bolt_pattern text;
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS wheel_offset_mm numeric;
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS engine_oil_capacity_l numeric;
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS coolant_capacity_l numeric;

-- Production span + chassis + engine (if not already migrated from single `year`)
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS production_start_year integer;
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS production_end_year integer;
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS chassis_code text;
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS production_start_month smallint;
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS production_end_month smallint;
ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS engine_code text;

-- engine_type: prefer column name used by the app; rename legacy engine_induction if present
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

ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS engine_type text;

-- Allow free-text engine labels (drops old enum-style check if present)
ALTER TABLE public.vehicle_catalog DROP CONSTRAINT IF EXISTS vehicle_catalog_engine_type_check;
ALTER TABLE public.vehicle_catalog DROP CONSTRAINT IF EXISTS vehicle_catalog_engine_induction_check;

COMMENT ON COLUMN public.vehicle_catalog.generation_code IS 'OEM generation / chassis code (e.g. M900A). Distinct from numeric generation.';
COMMENT ON COLUMN public.vehicle_catalog.engine_type IS 'Free-text engine / induction label (e.g. Turbo, Hybrid, N/A)';

-- Optional: if `generation` is still integer from the original table, widen to text for labels like "1st Gen"
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicle_catalog'
      AND column_name = 'generation' AND data_type = 'integer'
  ) THEN
    ALTER TABLE public.vehicle_catalog
      ALTER COLUMN generation TYPE text USING (
        CASE WHEN generation IS NULL THEN NULL ELSE trim(generation::text) END
      );
  END IF;
END $$;

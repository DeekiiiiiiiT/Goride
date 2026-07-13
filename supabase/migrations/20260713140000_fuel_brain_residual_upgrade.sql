-- Fuel Brain residual upgrade: deadhead policy tunables; drop sessions + unknown reviews

-- Drop dependent views before altering / dropping columns
DROP VIEW IF EXISTS public.fuel_unknown_reviews;
DROP VIEW IF EXISTS public.fuel_driving_sessions;
DROP VIEW IF EXISTS public.fuel_brain_policies;

-- Expand brain_policies with odo-first / fallback tunables
ALTER TABLE fuel.brain_policies
  ADD COLUMN IF NOT EXISTS industry_fallback_pct NUMERIC NOT NULL DEFAULT 35
    CHECK (industry_fallback_pct BETWEEN 0 AND 80),
  ADD COLUMN IF NOT EXISTS cross_validation_pp NUMERIC NOT NULL DEFAULT 20
    CHECK (cross_validation_pp BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS prefer_odo_gaps BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ambiguous_deadhead_split_pct NUMERIC NOT NULL DEFAULT 60
    CHECK (ambiguous_deadhead_split_pct BETWEEN 0 AND 100);

-- Align personal gap default with engine (90 min)
UPDATE fuel.brain_policies
SET personal_gap_min_minutes = 90
WHERE personal_gap_min_minutes = 120;

-- Drop unknown finalize thresholds (Unknown purpose removed)
ALTER TABLE fuel.brain_policies
  DROP COLUMN IF EXISTS unknown_finalize_threshold_km,
  DROP COLUMN IF EXISTS unknown_finalize_threshold_pct;

-- Drop session evidence + unknown review queue
DROP TABLE IF EXISTS fuel.unknown_reviews;
DROP TABLE IF EXISTS fuel.driving_sessions;

-- Refresh public policy view
CREATE OR REPLACE VIEW public.fuel_brain_policies AS
  SELECT * FROM fuel.brain_policies;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_brain_policies TO service_role;
GRANT SELECT ON public.fuel_brain_policies TO authenticated;

-- Data safety structured state for Roam Rides Play Store tracker.

ALTER TABLE rides.play_store_launch
  ADD COLUMN IF NOT EXISTS data_safety_rows JSONB,
  ADD COLUMN IF NOT EXISTS data_safety_imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_safety_source_hash TEXT,
  ADD COLUMN IF NOT EXISTS data_safety_template_version TEXT;

COMMENT ON COLUMN rides.play_store_launch.data_safety_rows IS 'Full Google Play Data safety CSV row snapshots.';

DROP VIEW IF EXISTS public.rides_play_store_launch;
CREATE VIEW public.rides_play_store_launch AS
  SELECT * FROM rides.play_store_launch;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_play_store_launch TO service_role;

NOTIFY pgrst, 'reload schema';

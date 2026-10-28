-- Data safety structured state for Roam Driver Play Store tracker.

ALTER TABLE public.driver_play_store_launch
  ADD COLUMN IF NOT EXISTS data_safety_rows JSONB,
  ADD COLUMN IF NOT EXISTS data_safety_imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_safety_source_hash TEXT,
  ADD COLUMN IF NOT EXISTS data_safety_template_version TEXT;

COMMENT ON COLUMN public.driver_play_store_launch.data_safety_rows IS 'Full Google Play Data safety CSV row snapshots.';

NOTIFY pgrst, 'reload schema';

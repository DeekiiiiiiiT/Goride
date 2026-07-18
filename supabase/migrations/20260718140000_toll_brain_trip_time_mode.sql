-- Toll Brain: trip time resolution dial (match clock trust)
-- Fixes overnight matching misses from auto-reinterpret of correct Uber UTC.

ALTER TABLE toll.brain_policies
  ADD COLUMN IF NOT EXISTS trip_time_mode TEXT NOT NULL DEFAULT 'trust_utc'
  CHECK (trip_time_mode IN ('trust_utc', 'legacy_reinterpret'));

COMMENT ON COLUMN toll.brain_policies.trip_time_mode IS
  'trust_utc = use stored Z timestamps as real UTC (Uber/InDrive). legacy_reinterpret = recover wall-clock from old UTC-browser CSV imports. Fleet IANA timezone remains platform settings.';

-- Refresh public view so new column is visible
CREATE OR REPLACE VIEW public.toll_brain_policies AS
SELECT * FROM toll.brain_policies;

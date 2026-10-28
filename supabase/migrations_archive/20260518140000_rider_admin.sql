-- Rider admin: account status, internal notes, directory stats for ops console.

ALTER TABLE rides.rider_profiles
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended', 'banned')),
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_rides_rider_profiles_status
  ON rides.rider_profiles(account_status);

CREATE TABLE IF NOT EXISTS rides.rider_admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL CHECK (char_length(trim(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rides_rider_admin_notes_rider
  ON rides.rider_admin_notes(rider_user_id, created_at DESC);

ALTER TABLE rides.rider_admin_notes ENABLE ROW LEVEL SECURITY;

-- No authenticated policies — Edge service_role only.

CREATE OR REPLACE VIEW rides.rider_directory_stats AS
SELECT
  rider_user_id,
  COUNT(*)::INTEGER AS total_trips,
  COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_trips,
  COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_trips,
  MAX(created_at) AS last_ride_at,
  COALESCE(
    SUM(COALESCE(fare_final_minor, fare_estimate_minor)),
    0
  )::BIGINT AS lifetime_spend_minor
FROM rides.ride_requests
GROUP BY rider_user_id;

CREATE OR REPLACE VIEW public.rides_rider_profiles AS
  SELECT * FROM rides.rider_profiles;

CREATE OR REPLACE VIEW public.rides_rider_admin_notes AS
  SELECT * FROM rides.rider_admin_notes;

CREATE OR REPLACE VIEW public.rides_rider_directory_stats AS
  SELECT * FROM rides.rider_directory_stats;

CREATE OR REPLACE VIEW public.rides_ride_requests AS
  SELECT * FROM rides.ride_requests;

GRANT SELECT, INSERT, UPDATE ON public.rides_rider_profiles TO service_role;
GRANT SELECT, INSERT ON public.rides_rider_admin_notes TO service_role;
GRANT SELECT ON public.rides_rider_directory_stats TO service_role;
GRANT SELECT ON public.rides_ride_requests TO service_role;

NOTIFY pgrst, 'reload schema';

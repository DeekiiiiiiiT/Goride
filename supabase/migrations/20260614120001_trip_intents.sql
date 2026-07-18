-- Trip Intent v2: Open Roam / Shadow Roam on booking_requests + ride_requests

ALTER TABLE rides.booking_requests
  ADD COLUMN IF NOT EXISTS roam_mode TEXT NOT NULL DEFAULT 'open_roam'
    CHECK (roam_mode IN ('open_roam', 'shadow_roam'));

ALTER TABLE rides.booking_requests
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'any_booker'
    CHECK (audience IN ('any_booker', 'targeted'));

ALTER TABLE rides.booking_requests
  ADD COLUMN IF NOT EXISTS target_booker_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE rides.booking_requests
  ADD COLUMN IF NOT EXISTS target_booker_phone_e164 TEXT;

ALTER TABLE rides.booking_requests
  ADD COLUMN IF NOT EXISTS quote_token TEXT;

ALTER TABLE rides.booking_requests
  ADD COLUMN IF NOT EXISTS fare_estimate_minor TEXT;

ALTER TABLE rides.booking_requests
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'JMD';

ALTER TABLE rides.booking_requests
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE rides.ride_requests
  ADD COLUMN IF NOT EXISTS roam_mode TEXT
    CHECK (roam_mode IS NULL OR roam_mode IN ('open_roam', 'shadow_roam'));

ALTER TABLE rides.booking_requests
  DROP CONSTRAINT IF EXISTS booking_requests_status_check;

ALTER TABLE rides.booking_requests
  ADD CONSTRAINT booking_requests_status_check
  CHECK (status IN (
    'draft', 'published', 'pending', 'claimed', 'booked', 'consumed', 'expired', 'cancelled'
  ));

UPDATE rides.booking_requests
SET
  status = 'published',
  published_at = COALESCE(published_at, created_at),
  roam_mode = COALESCE(roam_mode, 'open_roam')
WHERE status = 'pending' AND published_at IS NULL;

DROP INDEX IF EXISTS rides.idx_booking_requests_one_active_per_requester;

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_requests_one_active_per_requester
  ON rides.booking_requests (requester_user_id)
  WHERE status IN ('draft', 'published', 'claimed') AND requester_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_booking_requests_published_requester
  ON rides.booking_requests (requester_user_id)
  WHERE status IN ('published', 'claimed');

CREATE INDEX IF NOT EXISTS idx_booking_requests_target_booker
  ON rides.booking_requests (target_booker_user_id)
  WHERE status = 'published';

-- PostgREST reads public.rides_booking_requests; refresh after new columns.
CREATE OR REPLACE VIEW public.rides_booking_requests AS SELECT * FROM rides.booking_requests;

NOTIFY pgrst, 'reload schema';

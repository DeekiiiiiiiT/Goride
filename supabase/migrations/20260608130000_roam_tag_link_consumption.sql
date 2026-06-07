-- Roam Tag booking links: 12h TTL, consumed on digital payment (not cash).

ALTER TABLE rides.booking_requests
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;

ALTER TABLE rides.booking_requests
  DROP CONSTRAINT IF EXISTS booking_requests_status_check;

ALTER TABLE rides.booking_requests
  ADD CONSTRAINT booking_requests_status_check
  CHECK (status IN (
    'pending', 'claimed', 'booked', 'consumed', 'expired', 'cancelled'
  ));

-- One active (non-consumed, non-expired) link per requester at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_requests_one_active_per_requester
  ON rides.booking_requests (requester_user_id)
  WHERE status IN ('pending', 'claimed') AND requester_user_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- Indexes for rider incoming pickup location request queries.

CREATE INDEX IF NOT EXISTS idx_pickup_location_requests_rider_user_pending
  ON rides.pickup_location_requests (rider_user_id, status, expires_at)
  WHERE status = 'pending' AND rider_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pickup_location_requests_rider_phone_pending
  ON rides.pickup_location_requests (rider_phone_e164, status, expires_at)
  WHERE status = 'pending';

NOTIFY pgrst, 'reload schema';

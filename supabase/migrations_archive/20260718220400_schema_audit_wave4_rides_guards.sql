-- Schema audit Wave 4: ride completed/pin/audience guards + active-ride indexes

-- Demote invalid targeted bookings (no booker identity) so CHECK can validate
UPDATE rides.booking_requests
SET audience = 'any_booker'
WHERE audience = 'targeted'
  AND target_booker_user_id IS NULL
  AND COALESCE(target_booker_phone_e164, '') = '';

ALTER TABLE rides.ride_requests
  DROP CONSTRAINT IF EXISTS ride_requests_completed_fields_check;
ALTER TABLE rides.ride_requests
  ADD CONSTRAINT ride_requests_completed_fields_check
  CHECK (
    status <> 'completed'
    OR (
      fare_final_minor IS NOT NULL
      AND payment_method IS NOT NULL
      AND completed_at IS NOT NULL
    )
  );

ALTER TABLE rides.ride_requests
  DROP CONSTRAINT IF EXISTS ride_requests_verification_pin_check;
ALTER TABLE rides.ride_requests
  ADD CONSTRAINT ride_requests_verification_pin_check
  CHECK (verification_pin IS NULL OR verification_pin ~ '^[0-9]{4}$');

ALTER TABLE rides.ride_requests
  DROP CONSTRAINT IF EXISTS ride_requests_surge_multiplier_check;
ALTER TABLE rides.ride_requests
  ADD CONSTRAINT ride_requests_surge_multiplier_check
  CHECK (surge_multiplier IS NULL OR surge_multiplier > 0);

ALTER TABLE rides.ride_requests
  DROP CONSTRAINT IF EXISTS ride_requests_wait_time_fee_minor_check;
ALTER TABLE rides.ride_requests
  ADD CONSTRAINT ride_requests_wait_time_fee_minor_check
  CHECK (wait_time_fee_minor IS NULL OR wait_time_fee_minor >= 0);

ALTER TABLE rides.booking_requests
  DROP CONSTRAINT IF EXISTS booking_requests_targeted_audience_check;
ALTER TABLE rides.booking_requests
  ADD CONSTRAINT booking_requests_targeted_audience_check
  CHECK (
    audience IS DISTINCT FROM 'targeted'
    OR target_booker_user_id IS NOT NULL
    OR COALESCE(target_booker_phone_e164, '') <> ''
  );

CREATE INDEX IF NOT EXISTS idx_rides_requests_rider_active
  ON rides.ride_requests (rider_user_id, status)
  WHERE status IN (
    'scheduled', 'matching', 'driver_assigned', 'driver_en_route_pickup',
    'driver_arrived_pickup', 'on_trip', 'awaiting_cash_settlement'
  );

CREATE INDEX IF NOT EXISTS idx_rides_requests_driver_active
  ON rides.ride_requests (assigned_driver_user_id, status)
  WHERE status IN (
    'scheduled', 'matching', 'driver_assigned', 'driver_en_route_pickup',
    'driver_arrived_pickup', 'on_trip', 'awaiting_cash_settlement'
  );

-- Schema audit Wave 0: stop CASCADE that erases trips / money / debt
-- Account closure for users with history must soft-ban, not hard-delete.

ALTER TABLE rides.ride_requests
  DROP CONSTRAINT IF EXISTS ride_requests_rider_user_id_fkey;
ALTER TABLE rides.ride_requests
  ADD CONSTRAINT ride_requests_rider_user_id_fkey
  FOREIGN KEY (rider_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE rides.payment_obligations
  DROP CONSTRAINT IF EXISTS payment_obligations_driver_user_id_fkey;
ALTER TABLE rides.payment_obligations
  ADD CONSTRAINT payment_obligations_driver_user_id_fkey
  FOREIGN KEY (driver_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE rides.ledger_lines
  DROP CONSTRAINT IF EXISTS ledger_lines_ride_request_id_fkey;
ALTER TABLE rides.ledger_lines
  ADD CONSTRAINT ledger_lines_ride_request_id_fkey
  FOREIGN KEY (ride_request_id) REFERENCES rides.ride_requests(id) ON DELETE RESTRICT;

ALTER TABLE rides.driver_offers
  DROP CONSTRAINT IF EXISTS driver_offers_driver_user_id_fkey;
ALTER TABLE rides.driver_offers
  ADD CONSTRAINT driver_offers_driver_user_id_fkey
  FOREIGN KEY (driver_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

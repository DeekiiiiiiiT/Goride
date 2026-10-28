-- Trips with a directed payer must use audience=targeted so payers see them in Active trips.
UPDATE rides.booking_requests
SET audience = 'targeted',
    updated_at = NOW()
WHERE audience = 'any_booker'
  AND (target_booker_user_id IS NOT NULL OR target_booker_phone_e164 IS NOT NULL)
  AND status IN ('draft', 'published', 'claimed');

CREATE OR REPLACE VIEW public.rides_booking_requests AS SELECT * FROM rides.booking_requests;

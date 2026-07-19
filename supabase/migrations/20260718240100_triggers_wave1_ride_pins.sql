-- Triggers audit Wave 1: move verification PIN off Realtime-broadcasting ride_requests

CREATE TABLE IF NOT EXISTS rides.ride_pins (
  ride_request_id UUID PRIMARY KEY
    REFERENCES rides.ride_requests(id) ON DELETE CASCADE,
  verification_pin TEXT NOT NULL
    CHECK (verification_pin ~ '^[0-9]{4}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rides.ride_pins IS
  'Rider PIN codes — kept off ride_requests so Realtime REPLICA IDENTITY FULL never broadcasts them to drivers.';

ALTER TABLE rides.ride_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ride_pins_rider_select ON rides.ride_pins;
CREATE POLICY ride_pins_rider_select ON rides.ride_pins
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rides.ride_requests r
      WHERE r.id = ride_request_id
        AND (
          r.rider_user_id = auth.uid()
          OR r.passenger_user_id = auth.uid()
        )
    )
  );

REVOKE ALL ON TABLE rides.ride_pins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE rides.ride_pins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rides.ride_pins TO service_role;

-- Backfill existing pins
INSERT INTO rides.ride_pins (ride_request_id, verification_pin)
SELECT id, verification_pin
FROM rides.ride_requests
WHERE verification_pin IS NOT NULL
  AND verification_pin ~ '^[0-9]{4}$'
ON CONFLICT (ride_request_id) DO NOTHING;

-- Drop format CHECK on ride_requests if present, then drop column
ALTER TABLE rides.ride_requests
  DROP CONSTRAINT IF EXISTS ride_requests_verification_pin_check;

ALTER TABLE rides.ride_requests
  DROP COLUMN IF EXISTS verification_pin;

-- Recreate public view without the dropped column
DROP VIEW IF EXISTS public.rides_ride_requests;
DROP VIEW IF EXISTS rides.rides_ride_requests;

ALTER TABLE rides.ride_requests
  DROP CONSTRAINT IF EXISTS ride_requests_verification_pin_check;

ALTER TABLE rides.ride_requests
  DROP COLUMN IF EXISTS verification_pin;

CREATE VIEW public.rides_ride_requests
  WITH (security_invoker = true)
AS
  SELECT * FROM rides.ride_requests;

GRANT SELECT ON public.rides_ride_requests TO service_role;
GRANT SELECT ON public.rides_ride_requests TO authenticated;

NOTIFY pgrst, 'reload schema';

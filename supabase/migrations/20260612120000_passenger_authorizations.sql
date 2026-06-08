-- Pre-book passenger authorization (invite before ride create).

CREATE TABLE IF NOT EXISTS rides.passenger_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  booker_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL CHECK (char_length(trim(recipient_name)) > 0),
  phone_e164 TEXT NOT NULL CHECK (char_length(trim(phone_e164)) > 0),
  passenger_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'claimed', 'consumed', 'expired', 'cancelled'
  )),
  draft_trip_json JSONB,
  ride_request_id UUID REFERENCES rides.ride_requests(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passenger_authorizations_booker
  ON rides.passenger_authorizations(booker_user_id);

CREATE INDEX IF NOT EXISTS idx_passenger_authorizations_token
  ON rides.passenger_authorizations(token);

CREATE OR REPLACE VIEW public.rides_passenger_authorizations AS
  SELECT * FROM rides.passenger_authorizations;

GRANT SELECT, INSERT, UPDATE ON public.rides_passenger_authorizations TO service_role;

NOTIFY pgrst, 'reload schema';

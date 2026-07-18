-- Consent-based pickup location requests (Book for Someone Else).

CREATE TABLE IF NOT EXISTS rides.pickup_location_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  booker_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rider_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rider_name TEXT NOT NULL CHECK (char_length(trim(rider_name)) > 0),
  rider_phone_e164 TEXT NOT NULL CHECK (char_length(trim(rider_phone_e164)) > 0),
  rider_source TEXT NOT NULL CHECK (rider_source IN ('roam_tag', 'roam_contact', 'phone_contact')),
  rider_contact_id UUID REFERENCES rides.rider_contacts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'shared', 'declined', 'expired', 'cancelled', 'consumed'
  )),
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  pickup_address TEXT,
  accuracy_meters DOUBLE PRECISION,
  shared_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pickup_location_requests_booker
  ON rides.pickup_location_requests(booker_user_id);

CREATE INDEX IF NOT EXISTS idx_pickup_location_requests_token
  ON rides.pickup_location_requests(token);

CREATE INDEX IF NOT EXISTS idx_pickup_location_requests_status_expires
  ON rides.pickup_location_requests(status, expires_at);

CREATE OR REPLACE VIEW public.rides_pickup_location_requests AS
  SELECT * FROM rides.pickup_location_requests;

GRANT SELECT, INSERT, UPDATE ON public.rides_pickup_location_requests TO service_role;

NOTIFY pgrst, 'reload schema';

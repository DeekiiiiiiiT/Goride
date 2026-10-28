-- Trusted contacts sharing: profile prefs, contact last_shared_at, trip share tokens.

ALTER TABLE rides.rider_profiles
  ADD COLUMN IF NOT EXISTS default_sharing_preference TEXT NOT NULL DEFAULT 'all'
    CHECK (default_sharing_preference IN ('all', 'night', 'manual'));

ALTER TABLE rides.rider_profiles
  ADD COLUMN IF NOT EXISTS share_all_trips BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS night_trips_only BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE rides.rider_contacts
  ADD COLUMN IF NOT EXISTS last_shared_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS rides.ride_trip_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID REFERENCES rides.ride_requests(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES rides.rider_contacts(id) ON DELETE SET NULL,
  group_id UUID REFERENCES rides.rider_contact_groups(id) ON DELETE SET NULL,
  phone_e164 TEXT NOT NULL CHECK (char_length(trim(phone_e164)) > 0),
  token TEXT NOT NULL UNIQUE,
  share_kind TEXT NOT NULL DEFAULT 'manual' CHECK (share_kind IN ('manual', 'auto', 'emergency', 'test')),
  message TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_trip_shares_ride
  ON rides.ride_trip_shares(ride_request_id);

CREATE INDEX IF NOT EXISTS idx_ride_trip_shares_token
  ON rides.ride_trip_shares(token);

CREATE INDEX IF NOT EXISTS idx_ride_trip_shares_owner
  ON rides.ride_trip_shares(owner_user_id);

CREATE TABLE IF NOT EXISTS rides.ride_trip_share_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_share_id UUID NOT NULL REFERENCES rides.ride_trip_shares(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  sms_sent BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_trip_share_events_share
  ON rides.ride_trip_share_events(trip_share_id);

CREATE OR REPLACE VIEW public.rides_rider_profiles AS
  SELECT * FROM rides.rider_profiles;

CREATE OR REPLACE VIEW public.rides_ride_trip_shares AS
  SELECT * FROM rides.ride_trip_shares;

CREATE OR REPLACE VIEW public.rides_ride_trip_share_events AS
  SELECT * FROM rides.ride_trip_share_events;

GRANT SELECT, INSERT, UPDATE ON public.rides_rider_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.rides_ride_trip_shares TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.rides_ride_trip_share_events TO service_role;

NOTIFY pgrst, 'reload schema';

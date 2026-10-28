-- Roam Contacts + delegated booking schema (contacts, passenger model, invites, Roam Tag).

-- ---------------------------------------------------------------------------
-- Roam Contacts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rides.rider_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(trim(display_name)) > 0),
  phone_e164 TEXT NOT NULL CHECK (char_length(trim(phone_e164)) > 0),
  relation TEXT NOT NULL DEFAULT 'friend' CHECK (relation IN (
    'father', 'mother', 'sibling', 'spouse', 'friend', 'colleague', 'other'
  )),
  relation_custom TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'device_import', 'roam_user')),
  linked_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  bookable BOOLEAN NOT NULL DEFAULT true,
  trusted_for_safety BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rider_contacts_relation_custom_chk CHECK (
    relation <> 'other' OR (relation_custom IS NOT NULL AND char_length(trim(relation_custom)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rider_contacts_owner_phone
  ON rides.rider_contacts(owner_user_id, phone_e164);

CREATE INDEX IF NOT EXISTS idx_rider_contacts_owner
  ON rides.rider_contacts(owner_user_id);

CREATE TABLE IF NOT EXISTS rides.rider_contact_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rider_contact_groups_owner_name
  ON rides.rider_contact_groups(owner_user_id, lower(trim(name)));

CREATE TABLE IF NOT EXISTS rides.rider_contact_group_members (
  group_id UUID NOT NULL REFERENCES rides.rider_contact_groups(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES rides.rider_contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, contact_id)
);

CREATE TABLE IF NOT EXISTS rides.rider_contact_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES rides.rider_contacts(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(trim(label)) > 0),
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_contact_places_contact
  ON rides.rider_contact_places(contact_id);

ALTER TABLE rides.rider_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.rider_contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.rider_contact_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.rider_contact_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rider_contacts_owner ON rides.rider_contacts;
CREATE POLICY rider_contacts_owner ON rides.rider_contacts
  FOR ALL USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS rider_contact_groups_owner ON rides.rider_contact_groups;
CREATE POLICY rider_contact_groups_owner ON rides.rider_contact_groups
  FOR ALL USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS rider_contact_group_members_owner ON rides.rider_contact_group_members;
CREATE POLICY rider_contact_group_members_owner ON rides.rider_contact_group_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM rides.rider_contact_groups g
      WHERE g.id = group_id AND g.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS rider_contact_places_owner ON rides.rider_contact_places;
CREATE POLICY rider_contact_places_owner ON rides.rider_contact_places
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM rides.rider_contacts c
      WHERE c.id = contact_id AND c.owner_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Delegated ride extensions
-- ---------------------------------------------------------------------------

ALTER TABLE rides.ride_requests
  ADD COLUMN IF NOT EXISTS passenger_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rider_contact_id UUID REFERENCES rides.rider_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_request_id UUID;

CREATE INDEX IF NOT EXISTS idx_ride_requests_passenger
  ON rides.ride_requests(passenger_user_id);

-- ---------------------------------------------------------------------------
-- Passenger invites (share link after booking)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rides.ride_passenger_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL REFERENCES rides.ride_requests(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  phone_e164 TEXT NOT NULL,
  claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_passenger_invites_ride
  ON rides.ride_passenger_invites(ride_request_id);

-- ---------------------------------------------------------------------------
-- Roam Tag (reverse booking requests)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rides.booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  public_code TEXT NOT NULL,
  requester_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requester_name TEXT NOT NULL,
  requester_phone TEXT NOT NULL,
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  pickup_address TEXT,
  dropoff_lat DOUBLE PRECISION,
  dropoff_lng DOUBLE PRECISION,
  dropoff_address TEXT,
  vehicle_option TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'claimed', 'booked', 'expired', 'cancelled'
  )),
  claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ride_request_id UUID REFERENCES rides.ride_requests(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_requests_public_code
  ON rides.booking_requests(public_code);

ALTER TABLE rides.ride_requests
  DROP CONSTRAINT IF EXISTS ride_requests_booking_request_id_fkey;

ALTER TABLE rides.ride_requests
  ADD CONSTRAINT ride_requests_booking_request_id_fkey
  FOREIGN KEY (booking_request_id) REFERENCES rides.booking_requests(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Public views for edge / service role
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.rides_rider_contacts AS SELECT * FROM rides.rider_contacts;
CREATE OR REPLACE VIEW public.rides_rider_contact_groups AS SELECT * FROM rides.rider_contact_groups;
CREATE OR REPLACE VIEW public.rides_rider_contact_group_members AS SELECT * FROM rides.rider_contact_group_members;
CREATE OR REPLACE VIEW public.rides_rider_contact_places AS SELECT * FROM rides.rider_contact_places;
CREATE OR REPLACE VIEW public.rides_ride_passenger_invites AS SELECT * FROM rides.ride_passenger_invites;
CREATE OR REPLACE VIEW public.rides_booking_requests AS SELECT * FROM rides.booking_requests;

DROP VIEW IF EXISTS public.rides_ride_requests;
CREATE VIEW public.rides_ride_requests AS SELECT * FROM rides.ride_requests;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_rider_contacts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_rider_contact_groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_rider_contact_group_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_rider_contact_places TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.rides_ride_passenger_invites TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.rides_booking_requests TO service_role;
GRANT SELECT ON public.rides_ride_requests TO authenticated, service_role;

-- Update ride create RPC for new columns
CREATE OR REPLACE FUNCTION public.rides_create_ride_request(p_row JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  rec rides.ride_requests;
BEGIN
  INSERT INTO rides.ride_requests (
    rider_user_id,
    status,
    pickup_lat,
    pickup_lng,
    pickup_address,
    dropoff_lat,
    dropoff_lng,
    dropoff_address,
    vehicle_option,
    fare_estimate_minor,
    surge_multiplier,
    currency,
    distance_estimate_km,
    duration_estimate_minutes,
    eta_pickup_seconds_estimate,
    quote_token_hash,
    fare_breakdown,
    idempotency_key,
    driver_offer_timeout_seconds,
    matching_wave,
    route_polyline_encoded,
    verification_pin,
    payment_method,
    guest_passenger_name,
    guest_passenger_phone,
    booking_purpose,
    passenger_user_id,
    rider_contact_id,
    booking_request_id
  )
  VALUES (
    (p_row->>'rider_user_id')::UUID,
    COALESCE(p_row->>'status', 'matching'),
    (p_row->>'pickup_lat')::DOUBLE PRECISION,
    (p_row->>'pickup_lng')::DOUBLE PRECISION,
    NULLIF(p_row->>'pickup_address', ''),
    (p_row->>'dropoff_lat')::DOUBLE PRECISION,
    (p_row->>'dropoff_lng')::DOUBLE PRECISION,
    NULLIF(p_row->>'dropoff_address', ''),
    COALESCE(p_row->>'vehicle_option', 'standard'),
    (p_row->>'fare_estimate_minor')::BIGINT,
    COALESCE((p_row->>'surge_multiplier')::NUMERIC, 1),
    COALESCE(p_row->>'currency', 'USD'),
    NULLIF(p_row->>'distance_estimate_km', '')::NUMERIC,
    NULLIF(p_row->>'duration_estimate_minutes', '')::NUMERIC,
    NULLIF(p_row->>'eta_pickup_seconds_estimate', '')::INTEGER,
    NULLIF(p_row->>'quote_token_hash', ''),
    p_row->'fare_breakdown',
    NULLIF(p_row->>'idempotency_key', ''),
    COALESCE((p_row->>'driver_offer_timeout_seconds')::INTEGER, 15),
    COALESCE((p_row->>'matching_wave')::INTEGER, 0),
    NULLIF(p_row->>'route_polyline_encoded', ''),
    NULLIF(p_row->>'verification_pin', ''),
    NULLIF(p_row->>'payment_method', ''),
    NULLIF(p_row->>'guest_passenger_name', ''),
    NULLIF(p_row->>'guest_passenger_phone', ''),
    NULLIF(p_row->>'booking_purpose', ''),
    NULLIF(p_row->>'passenger_user_id', '')::UUID,
    NULLIF(p_row->>'rider_contact_id', '')::UUID,
    NULLIF(p_row->>'booking_request_id', '')::UUID
  )
  RETURNING * INTO rec;

  RETURN to_jsonb(rec);
END;
$$;

NOTIFY pgrst, 'reload schema';

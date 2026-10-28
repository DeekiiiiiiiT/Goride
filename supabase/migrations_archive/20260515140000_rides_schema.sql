-- Rides bounded context: passenger requests, driver offers, presence, surge (v1 grid), audit.
-- See docs/passenger-rides/RIDES_SPEC.md

CREATE SCHEMA IF NOT EXISTS rides;

GRANT USAGE ON SCHEMA rides TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS rides.rider_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS rides.driver_locations (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL CHECK (lat >= -90 AND lat <= 90),
  lng DOUBLE PRECISION NOT NULL CHECK (lng >= -180 AND lng <= 180),
  heading_degrees DOUBLE PRECISION,
  available_for_rides BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rides.ride_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'matching' CHECK (status IN (
    'matching',
    'driver_assigned',
    'driver_en_route_pickup',
    'driver_arrived_pickup',
    'on_trip',
    'completed',
    'cancelled'
  )),
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  pickup_address TEXT,
  dropoff_lat DOUBLE PRECISION NOT NULL,
  dropoff_lng DOUBLE PRECISION NOT NULL,
  dropoff_address TEXT,
  vehicle_option TEXT NOT NULL DEFAULT 'standard',
  fare_estimate_minor BIGINT NOT NULL,
  fare_final_minor BIGINT,
  surge_multiplier NUMERIC(12, 4) NOT NULL DEFAULT 1,
  currency TEXT NOT NULL DEFAULT 'USD',
  distance_estimate_km NUMERIC(14, 6),
  eta_pickup_seconds_estimate INTEGER,
  assigned_driver_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  cancel_reason TEXT,
  cancelled_by TEXT CHECK (cancelled_by IS NULL OR cancelled_by IN ('rider', 'driver', 'system')),
  driver_offer_timeout_seconds INTEGER NOT NULL DEFAULT 15,
  matching_wave INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rides_requests_rider ON rides.ride_requests(rider_user_id);
CREATE INDEX IF NOT EXISTS idx_rides_requests_status ON rides.ride_requests(status);
CREATE INDEX IF NOT EXISTS idx_rides_requests_assigned_driver ON rides.ride_requests(assigned_driver_user_id);
CREATE INDEX IF NOT EXISTS idx_rides_requests_created ON rides.ride_requests(created_at DESC);

CREATE TABLE IF NOT EXISTS rides.driver_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL REFERENCES rides.ride_requests(id) ON DELETE CASCADE,
  driver_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'accepted',
    'declined',
    'expired',
    'superseded'
  )),
  wave INTEGER NOT NULL DEFAULT 1,
  rank_score NUMERIC(14, 6),
  distance_km NUMERIC(14, 6),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ride_request_id, driver_user_id, wave)
);

CREATE INDEX IF NOT EXISTS idx_rides_offers_ride ON rides.driver_offers(ride_request_id);
CREATE INDEX IF NOT EXISTS idx_rides_offers_driver_pending
  ON rides.driver_offers(driver_user_id, status)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS rides.audit_events (
  id BIGSERIAL PRIMARY KEY,
  ride_request_id UUID REFERENCES rides.ride_requests(id) ON DELETE SET NULL,
  actor_user_id UUID,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rides_audit_ride ON rides.audit_events(ride_request_id);

CREATE TABLE IF NOT EXISTS rides.surge_cells (
  cell_key TEXT PRIMARY KEY,
  surge_multiplier NUMERIC(12, 4) NOT NULL DEFAULT 1,
  open_requests INTEGER NOT NULL DEFAULT 0,
  available_drivers INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Touch timestamps (reuse global helper if present)
DROP TRIGGER IF EXISTS update_rides_rider_profiles_updated_at ON rides.rider_profiles;
CREATE TRIGGER update_rides_rider_profiles_updated_at
  BEFORE UPDATE ON rides.rider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_rides_ride_requests_updated_at ON rides.ride_requests;
CREATE TRIGGER update_rides_ride_requests_updated_at
  BEFORE UPDATE ON rides.ride_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE rides.rider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.ride_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.driver_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.surge_cells ENABLE ROW LEVEL SECURITY;

-- rider_profiles
DROP POLICY IF EXISTS rides_rider_profiles_own_select ON rides.rider_profiles;
CREATE POLICY rides_rider_profiles_own_select ON rides.rider_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS rides_rider_profiles_own_insert ON rides.rider_profiles;
CREATE POLICY rides_rider_profiles_own_insert ON rides.rider_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS rides_rider_profiles_own_update ON rides.rider_profiles;
CREATE POLICY rides_rider_profiles_own_update ON rides.rider_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- driver_locations (drivers publish own presence only)
DROP POLICY IF EXISTS rides_driver_locations_own_select ON rides.driver_locations;
CREATE POLICY rides_driver_locations_own_select ON rides.driver_locations
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS rides_driver_locations_own_mutate ON rides.driver_locations;
CREATE POLICY rides_driver_locations_own_mutate ON rides.driver_locations
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- ride_requests visible to rider or assigned driver
DROP POLICY IF EXISTS rides_requests_passenger_select ON rides.ride_requests;
CREATE POLICY rides_requests_passenger_select ON rides.ride_requests
  FOR SELECT TO authenticated
  USING (rider_user_id = auth.uid() OR assigned_driver_user_id = auth.uid());

-- driver_offers visible to targeted driver or owning rider (Realtime subscriptions)
DROP POLICY IF EXISTS rides_offers_select ON rides.driver_offers;
CREATE POLICY rides_offers_select ON rides.driver_offers
  FOR SELECT TO authenticated
  USING (
    driver_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM rides.ride_requests r
      WHERE r.id = ride_request_id AND r.rider_user_id = auth.uid()
    )
  );

-- audit: participant-only read (minimal)
DROP POLICY IF EXISTS rides_audit_select ON rides.audit_events;
CREATE POLICY rides_audit_select ON rides.audit_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rides.ride_requests r
      WHERE r.id = ride_request_id
        AND (r.rider_user_id = auth.uid() OR r.assigned_driver_user_id = auth.uid())
    )
  );

-- surge cells: read-only for signed-in clients (multipliers shown in-app)
DROP POLICY IF EXISTS rides_surge_select ON rides.surge_cells;
CREATE POLICY rides_surge_select ON rides.surge_cells
  FOR SELECT TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE ON rides.rider_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rides.driver_locations TO authenticated;
GRANT SELECT ON rides.ride_requests TO authenticated;
GRANT SELECT ON rides.driver_offers TO authenticated;
GRANT SELECT ON rides.audit_events TO authenticated;
GRANT SELECT ON rides.surge_cells TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA rides TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA rides TO service_role;

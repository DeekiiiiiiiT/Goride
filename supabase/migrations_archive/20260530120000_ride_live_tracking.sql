-- In-trip live tracking: lifecycle timestamps, location audit, geofence settings, realtime.

-- A. Lifecycle + denormalized driver location on ride_requests
ALTER TABLE rides.ride_requests
  ADD COLUMN IF NOT EXISTS en_route_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrived_pickup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trip_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS route_polyline_encoded TEXT,
  ADD COLUMN IF NOT EXISTS transition_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_driver_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_driver_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_driver_heading DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_driver_location_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS complete_suggested_at TIMESTAMPTZ;

-- B. Append-only location audit
CREATE TABLE IF NOT EXISTS rides.ride_location_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL REFERENCES rides.ride_requests(id) ON DELETE CASCADE,
  driver_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  heading_degrees DOUBLE PRECISION,
  speed_mps DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_seq BIGINT NOT NULL,
  UNIQUE (ride_request_id, client_seq)
);

CREATE INDEX IF NOT EXISTS idx_ride_location_updates_ride_time
  ON rides.ride_location_updates (ride_request_id, recorded_at DESC);

-- C. Per-ride geofence dwell state
CREATE TABLE IF NOT EXISTS rides.ride_live_state (
  ride_request_id UUID PRIMARY KEY REFERENCES rides.ride_requests(id) ON DELETE CASCADE,
  pickup_dwell_started_at TIMESTAMPTZ,
  dropoff_dwell_started_at TIMESTAMPTZ,
  distance_to_target_m DOUBLE PRECISION,
  target TEXT CHECK (target IS NULL OR target IN ('pickup', 'dropoff')),
  last_lat DOUBLE PRECISION,
  last_lng DOUBLE PRECISION,
  last_speed_mps DOUBLE PRECISION,
  last_accuracy_m DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- D. Dispatch automation knobs
ALTER TABLE rides.dispatch_settings
  ADD COLUMN IF NOT EXISTS trip_location_interval_seconds INTEGER NOT NULL DEFAULT 4
    CHECK (trip_location_interval_seconds BETWEEN 2 AND 30),
  ADD COLUMN IF NOT EXISTS pickup_geofence_radius_m INTEGER NOT NULL DEFAULT 80
    CHECK (pickup_geofence_radius_m BETWEEN 20 AND 500),
  ADD COLUMN IF NOT EXISTS dropoff_geofence_radius_m INTEGER NOT NULL DEFAULT 100
    CHECK (dropoff_geofence_radius_m BETWEEN 20 AND 500),
  ADD COLUMN IF NOT EXISTS arrival_dwell_seconds INTEGER NOT NULL DEFAULT 15
    CHECK (arrival_dwell_seconds BETWEEN 0 AND 120),
  ADD COLUMN IF NOT EXISTS max_speed_mps_for_arrival NUMERIC NOT NULL DEFAULT 4
    CHECK (max_speed_mps_for_arrival >= 0 AND max_speed_mps_for_arrival <= 20),
  ADD COLUMN IF NOT EXISTS auto_en_route_on_accept BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS auto_arrive_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS auto_complete_suggest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS no_show_cancel_minutes INTEGER NOT NULL DEFAULT 5
    CHECK (no_show_cancel_minutes BETWEEN 0 AND 60),
  ADD COLUMN IF NOT EXISTS gps_max_accuracy_m_for_arrival INTEGER NOT NULL DEFAULT 50
    CHECK (gps_max_accuracy_m_for_arrival BETWEEN 10 AND 200),
  ADD COLUMN IF NOT EXISTS no_show_auto_cancel_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON TABLE rides.ride_location_updates IS 'Append-only GPS fixes during active rides (audit + geofence input).';
COMMENT ON TABLE rides.ride_live_state IS 'Geofence dwell timers and latest proximity metrics per active ride.';

-- E. Realtime on ride_requests
ALTER TABLE rides.ride_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'rides'
        AND tablename = 'ride_requests'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE rides.ride_requests;
    END IF;
  END IF;
END $$;

-- F. Extend patch RPC for lifecycle fields
CREATE OR REPLACE FUNCTION public.rides_patch_ride_request(p_id UUID, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  rec rides.ride_requests;
  bump_version BOOLEAN := FALSE;
BEGIN
  IF p_patch ? 'status' THEN
    bump_version := TRUE;
  END IF;

  UPDATE rides.ride_requests SET
    status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE status END,
    matching_wave = CASE WHEN p_patch ? 'matching_wave' THEN (p_patch->>'matching_wave')::INTEGER ELSE matching_wave END,
    updated_at = CASE WHEN p_patch ? 'updated_at' THEN (p_patch->>'updated_at')::TIMESTAMPTZ ELSE NOW() END,
    cancelled_by = CASE WHEN p_patch ? 'cancelled_by' THEN p_patch->>'cancelled_by' ELSE cancelled_by END,
    cancel_reason = CASE WHEN p_patch ? 'cancel_reason' THEN p_patch->>'cancel_reason' ELSE cancel_reason END,
    assigned_driver_user_id = CASE
      WHEN p_patch ? 'assigned_driver_user_id' THEN NULLIF(p_patch->>'assigned_driver_user_id', '')::UUID
      ELSE assigned_driver_user_id
    END,
    fare_final_minor = CASE
      WHEN p_patch ? 'fare_final_minor' THEN (p_patch->>'fare_final_minor')::BIGINT
      ELSE fare_final_minor
    END,
    payment_method = CASE
      WHEN p_patch ? 'payment_method' THEN NULLIF(p_patch->>'payment_method', '')
      ELSE payment_method
    END,
    completed_at = CASE
      WHEN p_patch ? 'completed_at' THEN (p_patch->>'completed_at')::TIMESTAMPTZ
      ELSE completed_at
    END,
    fare_final_breakdown = CASE
      WHEN p_patch ? 'fare_final_breakdown' THEN p_patch->'fare_final_breakdown'
      ELSE fare_final_breakdown
    END,
    platform_fee_minor = CASE
      WHEN p_patch ? 'platform_fee_minor' THEN (p_patch->>'platform_fee_minor')::BIGINT
      ELSE platform_fee_minor
    END,
    tip_minor = CASE
      WHEN p_patch ? 'tip_minor' THEN (p_patch->>'tip_minor')::BIGINT
      ELSE tip_minor
    END,
    driver_net_minor = CASE
      WHEN p_patch ? 'driver_net_minor' THEN (p_patch->>'driver_net_minor')::BIGINT
      ELSE driver_net_minor
    END,
    en_route_at = CASE
      WHEN p_patch ? 'en_route_at' THEN (p_patch->>'en_route_at')::TIMESTAMPTZ
      ELSE en_route_at
    END,
    arrived_pickup_at = CASE
      WHEN p_patch ? 'arrived_pickup_at' THEN (p_patch->>'arrived_pickup_at')::TIMESTAMPTZ
      ELSE arrived_pickup_at
    END,
    trip_started_at = CASE
      WHEN p_patch ? 'trip_started_at' THEN (p_patch->>'trip_started_at')::TIMESTAMPTZ
      ELSE trip_started_at
    END,
    route_polyline_encoded = CASE
      WHEN p_patch ? 'route_polyline_encoded' THEN p_patch->>'route_polyline_encoded'
      ELSE route_polyline_encoded
    END,
    transition_version = CASE
      WHEN bump_version THEN transition_version + 1
      WHEN p_patch ? 'transition_version' THEN (p_patch->>'transition_version')::INTEGER
      ELSE transition_version
    END,
    last_driver_lat = CASE
      WHEN p_patch ? 'last_driver_lat' THEN (p_patch->>'last_driver_lat')::DOUBLE PRECISION
      ELSE last_driver_lat
    END,
    last_driver_lng = CASE
      WHEN p_patch ? 'last_driver_lng' THEN (p_patch->>'last_driver_lng')::DOUBLE PRECISION
      ELSE last_driver_lng
    END,
    last_driver_heading = CASE
      WHEN p_patch ? 'last_driver_heading' THEN (p_patch->>'last_driver_heading')::DOUBLE PRECISION
      ELSE last_driver_heading
    END,
    last_driver_location_at = CASE
      WHEN p_patch ? 'last_driver_location_at' THEN (p_patch->>'last_driver_location_at')::TIMESTAMPTZ
      ELSE last_driver_location_at
    END,
    complete_suggested_at = CASE
      WHEN p_patch ? 'complete_suggested_at' THEN (p_patch->>'complete_suggested_at')::TIMESTAMPTZ
      ELSE complete_suggested_at
    END
  WHERE id = p_id
  RETURNING * INTO rec;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(rec);
END;
$$;

-- Insert location + update denormalized ride fields atomically
CREATE OR REPLACE FUNCTION public.rides_insert_location_update(
  p_ride_id UUID,
  p_driver_user_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_heading DOUBLE PRECISION,
  p_speed_mps DOUBLE PRECISION,
  p_accuracy_m DOUBLE PRECISION,
  p_recorded_at TIMESTAMPTZ,
  p_client_seq BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  ride_rec rides.ride_requests;
BEGIN
  SELECT * INTO ride_rec FROM rides.ride_requests WHERE id = p_ride_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF ride_rec.assigned_driver_user_id IS DISTINCT FROM p_driver_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF ride_rec.status NOT IN (
    'driver_assigned', 'driver_en_route_pickup', 'driver_arrived_pickup', 'on_trip'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ride_not_active');
  END IF;

  INSERT INTO rides.ride_location_updates (
    ride_request_id, driver_user_id, lat, lng, heading_degrees,
    speed_mps, accuracy_m, recorded_at, client_seq
  ) VALUES (
    p_ride_id, p_driver_user_id, p_lat, p_lng, p_heading,
    p_speed_mps, p_accuracy_m, p_recorded_at, p_client_seq
  )
  ON CONFLICT (ride_request_id, client_seq) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'ride_id', p_ride_id);
  END IF;

  UPDATE rides.ride_requests SET
    last_driver_lat = p_lat,
    last_driver_lng = p_lng,
    last_driver_heading = p_heading,
    last_driver_location_at = COALESCE(p_recorded_at, NOW()),
    updated_at = NOW()
  WHERE id = p_ride_id;

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'ride_id', p_ride_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rides_insert_location_update FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_insert_location_update TO service_role;

-- Extend create ride for route polyline
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
    rider_user_id, status, pickup_lat, pickup_lng, pickup_address,
    dropoff_lat, dropoff_lng, dropoff_address, vehicle_option,
    fare_estimate_minor, surge_multiplier, currency, distance_estimate_km,
    duration_estimate_minutes, eta_pickup_seconds_estimate, quote_token_hash,
    fare_breakdown, idempotency_key, driver_offer_timeout_seconds, matching_wave,
    route_polyline_encoded
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
    NULLIF(p_row->>'route_polyline_encoded', '')
  )
  RETURNING * INTO rec;

  RETURN to_jsonb(rec);
END;
$$;

DROP VIEW IF EXISTS public.rides_ride_requests;
CREATE OR REPLACE VIEW public.rides_ride_requests AS
  SELECT * FROM rides.ride_requests;

GRANT SELECT ON public.rides_ride_requests TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

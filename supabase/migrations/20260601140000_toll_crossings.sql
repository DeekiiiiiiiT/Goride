-- Toll Crossings System
-- Tracks toll plaza geofence crossings during trips for fare adjustment

-- Create toll crossings table to record each toll crossed during a trip
CREATE TABLE IF NOT EXISTS rides.ride_toll_crossings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL REFERENCES rides.ride_requests(id) ON DELETE CASCADE,
  toll_plaza_id TEXT NOT NULL,
  toll_plaza_name TEXT,
  toll_amount_minor BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'JMD',
  crossed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  driver_lat NUMERIC(10, 7),
  driver_lng NUMERIC(10, 7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_toll_crossings_ride_id ON rides.ride_toll_crossings(ride_request_id);
CREATE INDEX IF NOT EXISTS idx_toll_crossings_toll_id ON rides.ride_toll_crossings(toll_plaza_id);

COMMENT ON TABLE rides.ride_toll_crossings IS 
  'Records each toll plaza crossed during a trip for actual toll calculation';
COMMENT ON COLUMN rides.ride_toll_crossings.toll_plaza_id IS 
  'KV store toll_plaza:{id} reference';
COMMENT ON COLUMN rides.ride_toll_crossings.toll_amount_minor IS 
  'Toll amount charged in minor units (cents)';

-- Add actual tolls column to ride_requests
ALTER TABLE rides.ride_requests
  ADD COLUMN IF NOT EXISTS actual_tolls_minor BIGINT DEFAULT 0
    CHECK (actual_tolls_minor >= 0),
  ADD COLUMN IF NOT EXISTS dropoff_arrived_at TIMESTAMPTZ;

COMMENT ON COLUMN rides.ride_requests.actual_tolls_minor IS 
  'Sum of actual tolls detected via geofence crossings during trip';
COMMENT ON COLUMN rides.ride_requests.dropoff_arrived_at IS 
  'Timestamp when driver reached dropoff geofence';

-- Add toll settings to dispatch_settings
ALTER TABLE rides.dispatch_settings
  ADD COLUMN IF NOT EXISTS toll_detection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS toll_geofence_radius_m INTEGER NOT NULL DEFAULT 100
    CHECK (toll_geofence_radius_m BETWEEN 50 AND 500);

COMMENT ON COLUMN rides.dispatch_settings.toll_detection_enabled IS 
  'Enable real-time toll detection via geofence crossing during trips';
COMMENT ON COLUMN rides.dispatch_settings.toll_geofence_radius_m IS 
  'Radius around toll plaza for geofence detection (default 100m)';

-- Update the public view
DROP VIEW IF EXISTS public.rides_dispatch_settings;
CREATE VIEW public.rides_dispatch_settings AS
  SELECT * FROM rides.dispatch_settings;

GRANT SELECT, UPDATE ON public.rides_dispatch_settings TO service_role;
GRANT SELECT, INSERT ON rides.ride_toll_crossings TO service_role;

NOTIFY pgrst, 'reload schema';

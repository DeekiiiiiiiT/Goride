-- Ensure the RPC function has the correct signature with all parameters
DROP FUNCTION IF EXISTS public.rides_upsert_driver_presence(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.rides_upsert_driver_presence(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.rides_upsert_driver_presence(
  p_user_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_heading_degrees DOUBLE PRECISION DEFAULT NULL,
  p_available_for_rides BOOLEAN DEFAULT TRUE,
  p_body_type_slug TEXT DEFAULT NULL,
  p_h3_cell TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
BEGIN
  INSERT INTO rides.driver_locations (
    user_id, lat, lng, heading_degrees, available_for_rides, body_type_slug, h3_cell, updated_at
  ) VALUES (
    p_user_id, p_lat, p_lng, p_heading_degrees, p_available_for_rides, p_body_type_slug, p_h3_cell, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    heading_degrees = COALESCE(EXCLUDED.heading_degrees, rides.driver_locations.heading_degrees),
    available_for_rides = EXCLUDED.available_for_rides,
    body_type_slug = COALESCE(EXCLUDED.body_type_slug, rides.driver_locations.body_type_slug),
    h3_cell = COALESCE(EXCLUDED.h3_cell, rides.driver_locations.h3_cell),
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.rides_upsert_driver_presence TO service_role;
NOTIFY pgrst, 'reload schema';

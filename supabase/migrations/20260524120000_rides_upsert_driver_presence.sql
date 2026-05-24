-- Writable driver presence on hosted PostgREST (rides schema often not exposed to API).

CREATE OR REPLACE FUNCTION public.rides_upsert_driver_presence(
  p_user_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_heading_degrees DOUBLE PRECISION,
  p_available_for_rides BOOLEAN,
  p_body_type_slug TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = rides, public
AS $$
  INSERT INTO rides.driver_locations (
    user_id,
    lat,
    lng,
    heading_degrees,
    available_for_rides,
    body_type_slug,
    updated_at
  )
  VALUES (
    p_user_id,
    p_lat,
    p_lng,
    p_heading_degrees,
    p_available_for_rides,
    p_body_type_slug,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    heading_degrees = EXCLUDED.heading_degrees,
    available_for_rides = EXCLUDED.available_for_rides,
    body_type_slug = EXCLUDED.body_type_slug,
    updated_at = EXCLUDED.updated_at;
$$;

REVOKE ALL ON FUNCTION public.rides_upsert_driver_presence(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_upsert_driver_presence(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

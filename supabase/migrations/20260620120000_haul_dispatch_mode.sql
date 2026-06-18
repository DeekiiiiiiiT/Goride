-- Haul vs rideshare dispatch separation on driver presence.

ALTER TABLE rides.driver_locations
  ADD COLUMN IF NOT EXISTS dispatch_mode TEXT
  CHECK (dispatch_mode IS NULL OR dispatch_mode IN ('haulage', 'rideshare'));

COMMENT ON COLUMN rides.driver_locations.dispatch_mode IS
  'When set, driver only receives matching offers for that product mode (haulage vs rideshare). NULL = legacy rideshare.';

DROP FUNCTION IF EXISTS public.rides_upsert_driver_presence(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.rides_upsert_driver_presence(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.rides_upsert_driver_presence(
  p_user_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_heading_degrees DOUBLE PRECISION DEFAULT NULL,
  p_available_for_rides BOOLEAN DEFAULT TRUE,
  p_body_type_slug TEXT DEFAULT NULL,
  p_h3_cell TEXT DEFAULT NULL,
  p_dispatch_mode TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
BEGIN
  IF p_dispatch_mode IS NOT NULL AND p_dispatch_mode NOT IN ('haulage', 'rideshare') THEN
    RAISE EXCEPTION 'invalid_dispatch_mode';
  END IF;

  INSERT INTO rides.driver_locations (
    user_id,
    lat,
    lng,
    heading_degrees,
    available_for_rides,
    body_type_slug,
    h3_cell,
    dispatch_mode,
    updated_at
  ) VALUES (
    p_user_id,
    p_lat,
    p_lng,
    p_heading_degrees,
    p_available_for_rides,
    p_body_type_slug,
    p_h3_cell,
    p_dispatch_mode,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    heading_degrees = COALESCE(EXCLUDED.heading_degrees, rides.driver_locations.heading_degrees),
    available_for_rides = EXCLUDED.available_for_rides,
    body_type_slug = COALESCE(EXCLUDED.body_type_slug, rides.driver_locations.body_type_slug),
    h3_cell = COALESCE(EXCLUDED.h3_cell, rides.driver_locations.h3_cell),
    dispatch_mode = COALESCE(EXCLUDED.dispatch_mode, rides.driver_locations.dispatch_mode),
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.rides_upsert_driver_presence TO service_role;

DROP VIEW IF EXISTS public.rides_driver_locations;
CREATE VIEW public.rides_driver_locations AS
  SELECT * FROM rides.driver_locations;

GRANT SELECT ON public.rides_driver_locations TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

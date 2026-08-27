-- Rides Phase 6 adopt: h3_res on driver_locations + bounded H3 supply RPC
ALTER TABLE rides.driver_locations
  ADD COLUMN IF NOT EXISTS h3_res SMALLINT;

UPDATE rides.driver_locations
SET h3_res = 7
WHERE h3_cell IS NOT NULL AND h3_res IS NULL;

CREATE INDEX IF NOT EXISTS idx_driver_locations_h3_res_available
ON rides.driver_locations (h3_res, h3_cell)
WHERE available_for_rides = TRUE AND h3_cell IS NOT NULL;

CREATE OR REPLACE FUNCTION public.rides_drivers_in_h3_cells(
  p_h3_cells TEXT[],
  p_fresh_since TIMESTAMPTZ,
  p_h3_res SMALLINT DEFAULT 7,
  p_limit INT DEFAULT 500
)
RETURNS TABLE (
  user_id UUID,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  updated_at TIMESTAMPTZ,
  body_type_slug TEXT,
  h3_cell TEXT,
  h3_res SMALLINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
BEGIN
  IF p_h3_cells IS NULL OR cardinality(p_h3_cells) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_h3_cells) > 2000 THEN
    RAISE EXCEPTION 'h3_cell_array_too_large' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 500;
  END IF;
  p_limit := LEAST(p_limit, 500);

  RETURN QUERY
  SELECT
    dl.user_id,
    dl.lat,
    dl.lng,
    dl.updated_at,
    dl.body_type_slug,
    dl.h3_cell,
    dl.h3_res
  FROM rides.driver_locations dl
  WHERE dl.h3_cell = ANY (p_h3_cells)
    AND (p_h3_res IS NULL OR dl.h3_res IS NULL OR dl.h3_res = p_h3_res)
    AND dl.available_for_rides = TRUE
    AND dl.updated_at >= p_fresh_since
  ORDER BY dl.updated_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rides_drivers_in_h3_cells TO service_role;

DROP VIEW IF EXISTS public.rides_driver_locations;
CREATE VIEW public.rides_driver_locations
WITH (security_invoker = true) AS
  SELECT
    user_id,
    lat,
    lng,
    heading_degrees,
    available_for_rides,
    body_type_slug,
    h3_cell,
    h3_res,
    dispatch_mode,
    updated_at
  FROM rides.driver_locations;

GRANT SELECT ON public.rides_driver_locations TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.rides_upsert_driver_presence(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.rides_upsert_driver_presence(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rides_upsert_driver_presence(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.rides_upsert_driver_presence(
  p_user_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_heading_degrees DOUBLE PRECISION DEFAULT NULL,
  p_available_for_rides BOOLEAN DEFAULT TRUE,
  p_body_type_slug TEXT DEFAULT NULL,
  p_h3_cell TEXT DEFAULT NULL,
  p_dispatch_mode TEXT DEFAULT NULL,
  p_h3_res SMALLINT DEFAULT NULL
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
    h3_res,
    dispatch_mode,
    updated_at
  ) VALUES (
    p_user_id,
    p_lat,
    p_lng,
    p_heading_degrees,
    p_available_for_rides,
    p_body_type_slug,
    NULLIF(trim(p_h3_cell), ''),
    p_h3_res,
    p_dispatch_mode,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    heading_degrees = COALESCE(EXCLUDED.heading_degrees, rides.driver_locations.heading_degrees),
    available_for_rides = EXCLUDED.available_for_rides,
    body_type_slug = COALESCE(EXCLUDED.body_type_slug, rides.driver_locations.body_type_slug),
    h3_cell = EXCLUDED.h3_cell,
    h3_res = EXCLUDED.h3_res,
    dispatch_mode = COALESCE(EXCLUDED.dispatch_mode, rides.driver_locations.dispatch_mode),
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.rides_upsert_driver_presence TO service_role;

NOTIFY pgrst, 'reload schema';

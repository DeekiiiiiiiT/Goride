-- H3 Supply Index for efficient driver lookups
-- Adds H3 cell column to driver_locations and updates presence RPC.

--------------------------------------------------------------------------------
-- 1. Add h3_cell column to driver_locations
--------------------------------------------------------------------------------

ALTER TABLE rides.driver_locations 
ADD COLUMN IF NOT EXISTS h3_cell TEXT;

COMMENT ON COLUMN rides.driver_locations.h3_cell IS 
  'H3 cell index for efficient spatial queries. Computed from lat/lng at policy resolution.';

-- Partial index for available drivers with H3 cell
CREATE INDEX IF NOT EXISTS idx_driver_locations_h3_available
ON rides.driver_locations (h3_cell)
WHERE available_for_rides = TRUE AND h3_cell IS NOT NULL;

--------------------------------------------------------------------------------
-- 2. Update presence upsert RPC to accept h3_cell
-- Drop old function signatures first to avoid ambiguity
--------------------------------------------------------------------------------

-- Drop existing function overloads (different parameter counts)
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
    user_id,
    lat,
    lng,
    heading_degrees,
    available_for_rides,
    body_type_slug,
    h3_cell,
    updated_at
  ) VALUES (
    p_user_id,
    p_lat,
    p_lng,
    p_heading_degrees,
    p_available_for_rides,
    p_body_type_slug,
    p_h3_cell,
    NOW()
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

--------------------------------------------------------------------------------
-- 3. Update public view to include h3_cell
--------------------------------------------------------------------------------

DROP VIEW IF EXISTS public.rides_driver_locations;
CREATE OR REPLACE VIEW public.rides_driver_locations AS
  SELECT 
    user_id,
    lat,
    lng,
    heading_degrees,
    available_for_rides,
    body_type_slug,
    h3_cell,
    updated_at
  FROM rides.driver_locations;

GRANT SELECT ON public.rides_driver_locations TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 4. H3 cell lookup function for supply queries
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rides_drivers_in_h3_cells(
  p_h3_cells TEXT[],
  p_fresh_since TIMESTAMPTZ
)
RETURNS TABLE (
  user_id UUID,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  updated_at TIMESTAMPTZ,
  body_type_slug TEXT,
  h3_cell TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dl.user_id,
    dl.lat,
    dl.lng,
    dl.updated_at,
    dl.body_type_slug,
    dl.h3_cell
  FROM rides.driver_locations dl
  WHERE dl.h3_cell = ANY(p_h3_cells)
    AND dl.available_for_rides = TRUE
    AND dl.updated_at >= p_fresh_since;
END;
$$;

COMMENT ON FUNCTION public.rides_drivers_in_h3_cells IS 
  'Query available drivers within specified H3 cells.';

GRANT EXECUTE ON FUNCTION public.rides_drivers_in_h3_cells TO service_role;

--------------------------------------------------------------------------------
-- 5. Backfill script placeholder
-- Run this after deploying Edge function with H3 computation:
-- 
-- UPDATE rides.driver_locations
-- SET h3_cell = NULL
-- WHERE h3_cell IS NULL AND updated_at > NOW() - INTERVAL '1 hour';
--
-- The Edge function will populate h3_cell on next presence update.
--------------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

-- Phase 1 H3 safety: presence invariant + surge upsert race + PostGIS
-- See docs/adr/0013-rush-coverage-precedence-h3.md and H3 Spatial Master Plan.

CREATE EXTENSION IF NOT EXISTS postgis;

--------------------------------------------------------------------------------
-- 1. Presence: never COALESCE-preserve a stale h3_cell
--------------------------------------------------------------------------------

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

  -- Derived spatial key must not outlive lat/lng: write NULL when compute failed.
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
    NULLIF(trim(p_h3_cell), ''),
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
    dispatch_mode = COALESCE(EXCLUDED.dispatch_mode, rides.driver_locations.dispatch_mode),
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.rides_upsert_driver_presence TO service_role;

--------------------------------------------------------------------------------
-- 2. Surge upsert: INSERT … ON CONFLICT (no FOR UPDATE insert race)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rides_upsert_surge_cell(
  p_cell_key TEXT,
  p_h3_cell_key TEXT DEFAULT NULL,
  p_delta INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  v_row rides.surge_cells%ROWTYPE;
  v_next_requests INTEGER;
  v_next_mult NUMERIC;
BEGIN
  IF p_delta <= 0 THEN
    UPDATE rides.surge_cells
    SET
      open_requests = GREATEST(0, COALESCE(open_requests, 0) + p_delta),
      surge_multiplier = CASE
        WHEN GREATEST(0, COALESCE(open_requests, 0) + p_delta) <= 2
          THEN GREATEST(1.0, COALESCE(surge_multiplier, 1.0) - 0.02)
        ELSE COALESCE(surge_multiplier, 1.0)
      END,
      h3_cell_key = COALESCE(p_h3_cell_key, h3_cell_key),
      updated_at = NOW()
    WHERE cell_key = p_cell_key
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', true, 'action', 'skip', 'reason', 'negative_delta_no_row');
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'action', 'update',
      'cell_key', v_row.cell_key,
      'h3_cell_key', v_row.h3_cell_key,
      'open_requests', v_row.open_requests,
      'surge_multiplier', v_row.surge_multiplier
    );
  END IF;

  INSERT INTO rides.surge_cells (
    cell_key,
    h3_cell_key,
    open_requests,
    surge_multiplier,
    updated_at
  ) VALUES (
    p_cell_key,
    p_h3_cell_key,
    GREATEST(0, p_delta),
    1.0,
    NOW()
  )
  ON CONFLICT (cell_key) DO UPDATE SET
    open_requests = GREATEST(0, COALESCE(rides.surge_cells.open_requests, 0) + p_delta),
    surge_multiplier = CASE
      WHEN GREATEST(0, COALESCE(rides.surge_cells.open_requests, 0) + p_delta) >= 8
        THEN LEAST(2.5, COALESCE(rides.surge_cells.surge_multiplier, 1.0) + 0.05)
      WHEN GREATEST(0, COALESCE(rides.surge_cells.open_requests, 0) + p_delta) <= 2
        THEN GREATEST(1.0, COALESCE(rides.surge_cells.surge_multiplier, 1.0) - 0.02)
      ELSE COALESCE(rides.surge_cells.surge_multiplier, 1.0)
    END,
    h3_cell_key = COALESCE(EXCLUDED.h3_cell_key, rides.surge_cells.h3_cell_key),
    updated_at = NOW()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'upsert',
    'cell_key', v_row.cell_key,
    'h3_cell_key', v_row.h3_cell_key,
    'open_requests', v_row.open_requests,
    'surge_multiplier', v_row.surge_multiplier
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rides_upsert_surge_cell TO service_role;

NOTIFY pgrst, 'reload schema';

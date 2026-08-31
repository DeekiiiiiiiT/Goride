-- Phase 1 H3 remediation: courier presence RPC + online H3 CHECK invariant
-- Bug #10: derived h3_cell must never outlive lat/lng on online rows.

--------------------------------------------------------------------------------
-- 1. Force-offline any online row missing a cell (do not guess H3 in SQL)
--------------------------------------------------------------------------------

UPDATE delivery.courier_availability
SET is_online = FALSE,
    updated_at = NOW()
WHERE is_online = TRUE
  AND (
    h3_cell IS NULL
    OR NULLIF(trim(h3_cell), '') IS NULL
    OR h3_res IS NULL
  );

--------------------------------------------------------------------------------
-- 2. Unique driver_id for ON CONFLICT upsert (dedupe keep newest)
--------------------------------------------------------------------------------

DELETE FROM delivery.courier_availability a
USING delivery.courier_availability b
WHERE a.driver_id = b.driver_id
  AND a.id <> b.id
  AND (
    COALESCE(a.last_location_update, a.updated_at, a.created_at) <
      COALESCE(b.last_location_update, b.updated_at, b.created_at)
    OR (
      COALESCE(a.last_location_update, a.updated_at, a.created_at) =
        COALESCE(b.last_location_update, b.updated_at, b.created_at)
      AND a.id < b.id
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS courier_availability_driver_id_uidx
  ON delivery.courier_availability (driver_id);

--------------------------------------------------------------------------------
-- 3. Online rows must carry h3_cell + h3_res
--------------------------------------------------------------------------------

ALTER TABLE delivery.courier_availability
  DROP CONSTRAINT IF EXISTS courier_availability_online_h3_check;

ALTER TABLE delivery.courier_availability
  ADD CONSTRAINT courier_availability_online_h3_check
  CHECK (
    NOT COALESCE(is_online, FALSE)
    OR (
      h3_cell IS NOT NULL
      AND NULLIF(trim(h3_cell), '') IS NOT NULL
      AND h3_res IS NOT NULL
    )
  );

--------------------------------------------------------------------------------
-- 4. Presence RPC — hard-assign cell (never COALESCE to prior cell)
--------------------------------------------------------------------------------

-- p_h3_res is INTEGER (not smallint) so PostgREST matches JSON numbers; cast to smallint for the column.
CREATE OR REPLACE FUNCTION public.delivery_courier_upsert_presence(
  p_driver_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_h3_cell TEXT,
  p_h3_res INTEGER,
  p_is_online BOOLEAN DEFAULT TRUE,
  p_active_order_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, public
AS $$
DECLARE
  v_cell TEXT := NULLIF(trim(p_h3_cell), '');
  v_res SMALLINT := CASE WHEN p_h3_res IS NULL THEN NULL ELSE p_h3_res::SMALLINT END;
BEGIN
  IF p_driver_id IS NULL THEN
    RAISE EXCEPTION 'driver_id_required' USING ERRCODE = '22023';
  END IF;

  IF p_is_online IS TRUE THEN
    IF p_lat IS NULL OR p_lng IS NULL THEN
      RAISE EXCEPTION 'location_required' USING ERRCODE = '22023';
    END IF;
    IF v_cell IS NULL OR v_res IS NULL THEN
      RAISE EXCEPTION 'presence_h3_required' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO delivery.courier_availability (
    driver_id,
    current_lat,
    current_lng,
    h3_cell,
    h3_res,
    is_online,
    active_order_id,
    last_location_update,
    updated_at
  ) VALUES (
    p_driver_id,
    p_lat,
    p_lng,
    v_cell,
    v_res,
    COALESCE(p_is_online, FALSE),
    p_active_order_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (driver_id) DO UPDATE SET
    current_lat = COALESCE(EXCLUDED.current_lat, delivery.courier_availability.current_lat),
    current_lng = COALESCE(EXCLUDED.current_lng, delivery.courier_availability.current_lng),
    -- Hard assign: derived key must not outlive coordinates
    h3_cell = CASE
      WHEN EXCLUDED.current_lat IS NOT NULL AND EXCLUDED.current_lng IS NOT NULL
        THEN EXCLUDED.h3_cell
      ELSE delivery.courier_availability.h3_cell
    END,
    h3_res = CASE
      WHEN EXCLUDED.current_lat IS NOT NULL AND EXCLUDED.current_lng IS NOT NULL
        THEN EXCLUDED.h3_res
      ELSE delivery.courier_availability.h3_res
    END,
    is_online = EXCLUDED.is_online,
    active_order_id = COALESCE(EXCLUDED.active_order_id, delivery.courier_availability.active_order_id),
    last_location_update = NOW(),
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.delivery_courier_upsert_presence TO service_role;

--------------------------------------------------------------------------------
-- 5. Tighten Rides H3 lookup — strict res match (Phase 4)
--------------------------------------------------------------------------------

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
  IF p_h3_res IS NULL THEN
    p_h3_res := 7;
  END IF;

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
    AND dl.h3_res = p_h3_res
    AND dl.available_for_rides = TRUE
    AND dl.updated_at >= p_fresh_since
  ORDER BY dl.updated_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rides_drivers_in_h3_cells TO service_role;

NOTIFY pgrst, 'reload schema';

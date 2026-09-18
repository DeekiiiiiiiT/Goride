-- M8: guard first-sighting orphan offline (v_prev NULL + available=false).
-- Only write a transition when previous state is known OR the driver is going online.

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
SET search_path = rides, fleet, public
AS $$
DECLARE
  v_prev boolean;
BEGIN
  IF p_dispatch_mode IS NOT NULL AND p_dispatch_mode NOT IN ('haulage', 'rideshare') THEN
    RAISE EXCEPTION 'invalid_dispatch_mode';
  END IF;

  SELECT available_for_rides INTO v_prev
  FROM rides.driver_locations
  WHERE user_id = p_user_id;

  INSERT INTO rides.driver_locations (
    user_id, lat, lng, heading_degrees, available_for_rides,
    body_type_slug, h3_cell, h3_res, dispatch_mode, updated_at
  ) VALUES (
    p_user_id, p_lat, p_lng, p_heading_degrees, p_available_for_rides,
    p_body_type_slug, NULLIF(trim(p_h3_cell), ''), p_h3_res, p_dispatch_mode, NOW()
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

  -- Transition-only; skip orphan offline on first sighting (v_prev NULL + offline)
  IF (v_prev IS NOT NULL OR COALESCE(p_available_for_rides, FALSE))
     AND v_prev IS DISTINCT FROM p_available_for_rides THEN
    PERFORM fleet.append_presence_transition(
      p_user_id,
      'roam_rides',
      COALESCE(p_available_for_rides, FALSE),
      'app_toggle',
      NULL,
      '{}'::jsonb
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rides_upsert_driver_presence(
  uuid, double precision, double precision, double precision, boolean, text, text, text, smallint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rides_upsert_driver_presence(
  uuid, double precision, double precision, double precision, boolean, text, text, text, smallint
) TO service_role;

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
SET search_path = delivery, fleet, public
AS $$
DECLARE
  v_cell TEXT := NULLIF(trim(p_h3_cell), '');
  v_res SMALLINT := CASE WHEN p_h3_res IS NULL THEN NULL ELSE p_h3_res::SMALLINT END;
  v_prev boolean;
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

  SELECT is_online INTO v_prev
  FROM delivery.courier_availability
  WHERE driver_id = p_driver_id;

  INSERT INTO delivery.courier_availability (
    driver_id, current_lat, current_lng, h3_cell, h3_res,
    is_online, active_order_id, last_location_update, updated_at
  ) VALUES (
    p_driver_id, p_lat, p_lng, v_cell, v_res,
    COALESCE(p_is_online, FALSE), p_active_order_id, NOW(), NOW()
  )
  ON CONFLICT (driver_id) DO UPDATE SET
    current_lat = COALESCE(EXCLUDED.current_lat, delivery.courier_availability.current_lat),
    current_lng = COALESCE(EXCLUDED.current_lng, delivery.courier_availability.current_lng),
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

  IF (v_prev IS NOT NULL OR COALESCE(p_is_online, FALSE))
     AND v_prev IS DISTINCT FROM COALESCE(p_is_online, FALSE) THEN
    PERFORM fleet.append_presence_transition(
      p_driver_id,
      'roam_rush',
      COALESCE(p_is_online, FALSE),
      'app_toggle',
      NULL,
      '{}'::jsonb
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_courier_upsert_presence(
  uuid, double precision, double precision, text, integer, boolean, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_courier_upsert_presence(
  uuid, double precision, double precision, text, integer, boolean, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION delivery.delivery_courier_upsert_presence(
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
SET search_path = delivery, fleet, public
AS $$
BEGIN
  PERFORM public.delivery_courier_upsert_presence(
    p_driver_id, p_lat, p_lng, p_h3_cell, p_h3_res, p_is_online, p_active_order_id
  );
END;
$$;

REVOKE ALL ON FUNCTION delivery.delivery_courier_upsert_presence(
  uuid, double precision, double precision, text, integer, boolean, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery.delivery_courier_upsert_presence(
  uuid, double precision, double precision, text, integer, boolean, uuid
) TO service_role;

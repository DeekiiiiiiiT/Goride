-- Fix PostgREST 404 on delivery_courier_upsert_presence (edge go-online).
-- Prefer integer for p_h3_res (JSON numbers) and force schema-cache reload.

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

-- Drop old smallint overload if it remains beside the new signature
DROP FUNCTION IF EXISTS public.delivery_courier_upsert_presence(uuid, double precision, double precision, text, smallint, boolean, uuid);

GRANT EXECUTE ON FUNCTION public.delivery_courier_upsert_presence(uuid, double precision, double precision, text, integer, boolean, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

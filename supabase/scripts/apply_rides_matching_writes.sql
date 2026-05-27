-- Run in Supabase SQL editor if migration 20260524140000 was not applied via CLI.

CREATE OR REPLACE FUNCTION public.rides_patch_ride_request(p_id UUID, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  rec rides.ride_requests;
BEGIN
  UPDATE rides.ride_requests SET
    status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE status END,
    matching_wave = CASE WHEN p_patch ? 'matching_wave' THEN (p_patch->>'matching_wave')::INTEGER ELSE matching_wave END,
    updated_at = CASE WHEN p_patch ? 'updated_at' THEN (p_patch->>'updated_at')::TIMESTAMPTZ ELSE NOW() END,
    cancelled_by = CASE WHEN p_patch ? 'cancelled_by' THEN p_patch->>'cancelled_by' ELSE cancelled_by END,
    cancel_reason = CASE WHEN p_patch ? 'cancel_reason' THEN p_patch->>'cancel_reason' ELSE cancel_reason END,
    assigned_driver_user_id = CASE
      WHEN p_patch ? 'assigned_driver_user_id' THEN NULLIF(p_patch->>'assigned_driver_user_id', '')::UUID
      ELSE assigned_driver_user_id
    END,
    fare_final_minor = CASE
      WHEN p_patch ? 'fare_final_minor' THEN (p_patch->>'fare_final_minor')::BIGINT
      ELSE fare_final_minor
    END,
    payment_method = CASE
      WHEN p_patch ? 'payment_method' THEN NULLIF(p_patch->>'payment_method', '')
      ELSE payment_method
    END,
    completed_at = CASE
      WHEN p_patch ? 'completed_at' THEN (p_patch->>'completed_at')::TIMESTAMPTZ
      ELSE completed_at
    END
  WHERE id = p_id
  RETURNING * INTO rec;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(rec);
END;
$$;

CREATE OR REPLACE FUNCTION public.rides_insert_driver_offer(p_row JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  rec rides.driver_offers;
BEGIN
  INSERT INTO rides.driver_offers (
    ride_request_id,
    driver_user_id,
    wave,
    rank_score,
    distance_km,
    status,
    expires_at
  )
  VALUES (
    (p_row->>'ride_request_id')::UUID,
    (p_row->>'driver_user_id')::UUID,
    COALESCE((p_row->>'wave')::INTEGER, 1),
    NULLIF(p_row->>'rank_score', '')::NUMERIC,
    NULLIF(p_row->>'distance_km', '')::NUMERIC,
    COALESCE(p_row->>'status', 'pending'),
    (p_row->>'expires_at')::TIMESTAMPTZ
  )
  RETURNING * INTO rec;

  RETURN to_jsonb(rec);
END;
$$;

CREATE OR REPLACE FUNCTION public.rides_patch_driver_offer(p_id UUID, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  rec rides.driver_offers;
BEGIN
  UPDATE rides.driver_offers SET
    status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE status END
  WHERE id = p_id
  RETURNING * INTO rec;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(rec);
END;
$$;

CREATE OR REPLACE FUNCTION public.rides_expire_pending_offers(p_ride_id UUID, p_now TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = rides, public
AS $$
  WITH updated AS (
    UPDATE rides.driver_offers
    SET status = 'expired'
    WHERE ride_request_id = p_ride_id
      AND status = 'pending'
      AND expires_at <= p_now
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER FROM updated;
$$;

REVOKE ALL ON FUNCTION public.rides_patch_ride_request(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_patch_ride_request(UUID, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.rides_insert_driver_offer(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_insert_driver_offer(JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.rides_patch_driver_offer(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_patch_driver_offer(UUID, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.rides_expire_pending_offers(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_expire_pending_offers(UUID, TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION public.rides_supersede_pending_offers(
  p_ride_id UUID,
  p_except_offer_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = rides, public
AS $$
  WITH updated AS (
    UPDATE rides.driver_offers
    SET status = 'superseded'
    WHERE ride_request_id = p_ride_id
      AND status = 'pending'
      AND (p_except_offer_id IS NULL OR id <> p_except_offer_id)
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER FROM updated;
$$;

CREATE OR REPLACE FUNCTION public.rides_expire_driver_pending_offers(
  p_driver_user_id UUID,
  p_now TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = rides, public
AS $$
  WITH updated AS (
    UPDATE rides.driver_offers
    SET status = 'expired'
    WHERE driver_user_id = p_driver_user_id
      AND status = 'pending'
      AND expires_at <= p_now
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER FROM updated;
$$;

REVOKE ALL ON FUNCTION public.rides_supersede_pending_offers(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_supersede_pending_offers(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.rides_expire_driver_pending_offers(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_expire_driver_pending_offers(UUID, TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION public.rides_cancel_ride_request(
  p_id UUID,
  p_cancelled_by TEXT DEFAULT 'rider',
  p_cancel_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  rec rides.ride_requests;
BEGIN
  IF p_cancelled_by IS NOT NULL AND p_cancelled_by NOT IN ('rider', 'driver', 'system') THEN
    RAISE EXCEPTION 'invalid_cancelled_by';
  END IF;

  UPDATE rides.ride_requests SET
    status = 'cancelled',
    cancelled_by = COALESCE(p_cancelled_by, 'rider'),
    cancel_reason = p_cancel_reason,
    updated_at = NOW()
  WHERE id = p_id
    AND status NOT IN ('completed', 'cancelled')
  RETURNING * INTO rec;

  IF NOT FOUND THEN
    SELECT * INTO rec FROM rides.ride_requests WHERE id = p_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN to_jsonb(rec);
END;
$$;

REVOKE ALL ON FUNCTION public.rides_cancel_ride_request(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_cancel_ride_request(UUID, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

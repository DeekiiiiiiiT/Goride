-- Quick fix: run in Supabase SQL Editor when rider cancel returns "Could not cancel ride".
-- Full patch (offers, matching writes): apply_rides_matching_writes.sql

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
    END
  WHERE id = p_id
  RETURNING * INTO rec;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(rec);
END;
$$;

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

REVOKE ALL ON FUNCTION public.rides_patch_ride_request(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_patch_ride_request(UUID, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.rides_cancel_ride_request(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_cancel_ride_request(UUID, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

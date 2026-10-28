-- Dedicated cancel RPC for hosted PostgREST (rides schema often not writable via API).

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

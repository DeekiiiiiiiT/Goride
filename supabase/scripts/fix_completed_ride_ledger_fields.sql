-- Run in Supabase SQL Editor (fixes half-completed rides + prevents recurrence).
-- See migration: 20260527100000_rides_patch_ride_request_ledger_fields.sql

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

UPDATE rides.ride_requests
SET
  payment_method = COALESCE(payment_method, 'cash'),
  completed_at = COALESCE(completed_at, updated_at, created_at)
WHERE status = 'completed'
  AND (payment_method IS NULL OR completed_at IS NULL);

NOTIFY pgrst, 'reload schema';

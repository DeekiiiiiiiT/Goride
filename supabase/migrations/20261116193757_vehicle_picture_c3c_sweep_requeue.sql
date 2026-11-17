-- C3c: edge-callable stuck sweep + atomic requeue with attempt given back

CREATE OR REPLACE FUNCTION public.vehicle_picture_sweep_stuck()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  SELECT private.vehicle_picture_sweep_stuck();
$$;

ALTER FUNCTION public.vehicle_picture_sweep_stuck() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.vehicle_picture_sweep_stuck() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_picture_sweep_stuck() TO service_role;

CREATE OR REPLACE FUNCTION public.vehicle_picture_requeue_give_back_attempt(
  p_id uuid,
  p_next_attempt_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.vehicle_picture
  SET
    status = 'queued',
    attempts = GREATEST(0, attempts - 1),
    next_attempt_at = p_next_attempt_at,
    lease_until = NULL,
    updated_at = now()
  WHERE id = p_id;
$$;

ALTER FUNCTION public.vehicle_picture_requeue_give_back_attempt(uuid, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.vehicle_picture_requeue_give_back_attempt(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_picture_requeue_give_back_attempt(uuid, timestamptz) TO service_role;
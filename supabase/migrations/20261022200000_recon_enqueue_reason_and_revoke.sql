-- Nightly recomputes carry a reason so they can be compared to the last result.
-- Also lock the background functions to service_role. Editing the already-applied
-- 20261022150000 file does not re-run on production.

DROP FUNCTION IF EXISTS public.recon_enqueue_unit(text, text, date, text, text);
DROP FUNCTION IF EXISTS recon.enqueue_unit(text, text, date, text, text);

CREATE FUNCTION recon.enqueue_unit(
  p_org text,
  p_kind text,
  p_week date,
  p_driver text,
  p_vehicle text,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, pgmq, public
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_org IS NULL OR p_week IS NULL OR p_kind IS NULL THEN
    RETURN;
  END IF;

  SELECT status INTO v_status
  FROM recon.projection_state
  WHERE organization_id = p_org
    AND unit_kind = p_kind
    AND week_key = p_week
    AND driver_id IS NOT DISTINCT FROM p_driver
    AND vehicle_id IS NOT DISTINCT FROM p_vehicle
  FOR UPDATE;

  IF v_status = 'pending' THEN
    RETURN;
  END IF;

  INSERT INTO recon.projection_state (
    organization_id, unit_kind, week_key, driver_id, vehicle_id, status, updated_at
  ) VALUES (
    p_org, p_kind, p_week, p_driver, p_vehicle, 'pending', now()
  )
  ON CONFLICT (organization_id, unit_kind, week_key, driver_id, vehicle_id)
  DO UPDATE SET status = 'pending', last_error = NULL, updated_at = now();

  PERFORM pgmq.send(
    'recon_recompute',
    jsonb_build_object(
      'organizationId', p_org,
      'unitKind', p_kind,
      'weekKey', to_char(p_week, 'YYYY-MM-DD'),
      'driverId', p_driver,
      'vehicleId', p_vehicle,
      'reason', NULLIF(p_reason, '')
    )
  );
END;
$$;

CREATE FUNCTION public.recon_enqueue_unit(
  p_org text,
  p_kind text,
  p_week date,
  p_driver text,
  p_vehicle text,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, pgmq, public
AS $$
BEGIN
  PERFORM recon.enqueue_unit(p_org, p_kind, p_week, p_driver, p_vehicle, p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.recon_enqueue_unit(text, text, date, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recon_enqueue_unit(text, text, date, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.recon_mark_week_pending(text, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recon_read_recompute_batch(int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recon_archive_recompute(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recon_queue_health() FROM PUBLIC, anon, authenticated;

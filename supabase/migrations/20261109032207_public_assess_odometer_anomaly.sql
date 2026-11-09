-- Maintenance logging V-01 finding: the server calls rpc("assess_odometer_anomaly"), but the
-- function only exists in the fleet schema, which the API cannot see. The "Check reading"
-- warning never showed, and saved services never flagged odd mileage.
-- Also: fleet.assess_odometer_anomaly itself failed on every call ("column reference is_anomaly
-- is ambiguous": its output column has the same name as the table column). Columns are now
-- table-qualified. Same rules, same signature.
-- Public doorway for the server only (service_role); anon and signed-in users cannot call it.

CREATE OR REPLACE FUNCTION fleet.assess_odometer_anomaly(
  p_vehicle_id text,
  p_reading numeric,
  p_recorded_at timestamptz
)
RETURNS TABLE (
  is_anomaly boolean,
  anomaly_reason text,
  prior_reading numeric,
  prior_recorded_at timestamptz,
  next_reading numeric,
  next_recorded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_prior record;
  v_next record;
  v_reason text;
  v_anom boolean := false;
  v_km_tol constant numeric := 50;
  v_daily_tol constant numeric := 1500;
BEGIN
  SELECT r.reading, r.recorded_at INTO v_prior
  FROM fleet.odometer_readings r
  WHERE r.vehicle_id = p_vehicle_id
    AND r.is_voided = false
    AND r.is_anomaly = false
    AND r.recorded_at <= p_recorded_at
  ORDER BY r.recorded_at DESC, r.reading DESC
  LIMIT 1;

  SELECT r.reading, r.recorded_at INTO v_next
  FROM fleet.odometer_readings r
  WHERE r.vehicle_id = p_vehicle_id
    AND r.is_voided = false
    AND r.is_anomaly = false
    AND r.recorded_at > p_recorded_at
  ORDER BY r.recorded_at ASC, r.reading ASC
  LIMIT 1;

  IF v_prior.reading IS NOT NULL AND p_reading < v_prior.reading - v_km_tol THEN
    v_anom := true;
    v_reason := coalesce(v_reason || '; ', '') || 'Below prior reading by more than 50 km';
  END IF;

  IF v_next.reading IS NOT NULL AND p_reading > v_next.reading + v_km_tol THEN
    v_anom := true;
    v_reason := coalesce(v_reason || '; ', '') || 'Above next reading by more than 50 km';
  END IF;

  IF v_prior.reading IS NOT NULL AND v_prior.recorded_at IS NOT NULL THEN
    IF abs(p_reading - v_prior.reading) / greatest(1, extract(epoch FROM (p_recorded_at - v_prior.recorded_at)) / 86400.0) > v_daily_tol THEN
      v_anom := true;
      v_reason := coalesce(v_reason || '; ', '') || 'Implausible km/day vs prior reading';
    END IF;
  END IF;

  IF v_next.reading IS NOT NULL AND v_next.recorded_at IS NOT NULL THEN
    IF abs(v_next.reading - p_reading) / greatest(1, extract(epoch FROM (v_next.recorded_at - p_recorded_at)) / 86400.0) > v_daily_tol THEN
      v_anom := true;
      v_reason := coalesce(v_reason || '; ', '') || 'Implausible km/day vs next reading';
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_anom,
    v_reason,
    v_prior.reading,
    v_prior.recorded_at,
    v_next.reading,
    v_next.recorded_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_assess_odometer_anomaly(
  p_vehicle_id text,
  p_reading numeric,
  p_recorded_at timestamptz
)
RETURNS TABLE (
  is_anomaly boolean,
  anomaly_reason text,
  prior_reading numeric,
  prior_recorded_at timestamptz,
  next_reading numeric,
  next_recorded_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM fleet.assess_odometer_anomaly(p_vehicle_id, p_reading, p_recorded_at);
$$;

REVOKE ALL ON FUNCTION public.fleet_assess_odometer_anomaly(text, numeric, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fleet_assess_odometer_anomaly(text, numeric, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_assess_odometer_anomaly(text, numeric, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';

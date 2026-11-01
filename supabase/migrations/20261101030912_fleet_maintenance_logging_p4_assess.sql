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
  SELECT reading, recorded_at INTO v_prior
  FROM fleet.odometer_readings
  WHERE vehicle_id = p_vehicle_id
    AND is_voided = false
    AND is_anomaly = false
    AND recorded_at <= p_recorded_at
  ORDER BY recorded_at DESC, reading DESC
  LIMIT 1;

  SELECT reading, recorded_at INTO v_next
  FROM fleet.odometer_readings
  WHERE vehicle_id = p_vehicle_id
    AND is_voided = false
    AND is_anomaly = false
    AND recorded_at > p_recorded_at
  ORDER BY recorded_at ASC, reading ASC
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
$$;;

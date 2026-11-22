-- F-03: the fuel lines writer, reversal and read, as service-role-only functions in public
-- (the fuel schema is not exposed to PostgREST). Lines are written before the week locks
-- (F-05); a reopen marks them reversed, never edits or deletes them.

-- Write one period's lines. Runs before the lock flip, so the sealed-week guard allows it.
-- Lines left by an earlier failed attempt (not reversed, period still open) are replaced.
CREATE OR REPLACE FUNCTION public.fuel_write_week_lines(
  p_org text,
  p_period_id text,
  p_week_start date,
  p_lines jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_org IS NULL OR p_period_id IS NULL OR p_week_start IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'FUEL_LINES_BAD_INPUT', ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING MESSAGE = 'FUEL_LINES_BAD_INPUT', ERRCODE = 'P0001';
  END IF;

  DELETE FROM fuel.week_lines
  WHERE org_id = p_org AND period_id = p_period_id AND reversed_by IS NULL;

  INSERT INTO fuel.week_lines (
    org_id, period_id, week_start, vehicle_id, driver_id, purpose, km, cost_per_km_minor,
    driver_pct, driver_amount_minor, company_amount_minor, policy_version_id, engine_version
  )
  SELECT
    p_org, p_period_id, p_week_start, l.vehicle_id, l.driver_id, l.purpose, l.km,
    l.cost_per_km_minor, l.driver_pct, l.driver_amount_minor, l.company_amount_minor,
    l.policy_version_id, l.engine_version
  FROM jsonb_to_recordset(p_lines) AS l(
    vehicle_id text,
    driver_id text,
    purpose text,
    km numeric,
    cost_per_km_minor numeric,
    driver_pct numeric,
    driver_amount_minor bigint,
    company_amount_minor bigint,
    policy_version_id uuid,
    engine_version text
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Reopen: mark the period's current lines reversed (one reversal id for the batch). The period
-- is still locked here, so the seal writer is switched on for this transaction only.
CREATE OR REPLACE FUNCTION public.fuel_reverse_week_lines(
  p_org text,
  p_period_id text,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reversal uuid := gen_random_uuid();
  v_count integer;
BEGIN
  PERFORM fuel_system.seal_writer_on('reverse:' || p_period_id || ':' || v_reversal::text);
  UPDATE fuel.week_lines
  SET reversed_by = v_reversal,
      reversed_at = now(),
      reversal_reason = NULLIF(trim(coalesce(p_reason, '')), '')
  WHERE org_id = p_org AND period_id = p_period_id AND reversed_by IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM fuel_system.seal_writer_off();
  RETURN v_count;
END;
$$;

-- Read a period's lines (current and reversed), optionally for one driver, for statements,
-- Driver Settlements (Stitch screens 13–14) and checks.
CREATE OR REPLACE FUNCTION public.fuel_week_lines_list(
  p_org text,
  p_period_id text,
  p_driver_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    jsonb_agg(to_jsonb(l) ORDER BY l.reversed_at NULLS FIRST, l.created_at, l.vehicle_id, l.purpose),
    '[]'::jsonb
  )
  FROM fuel.week_lines l
  WHERE l.org_id = p_org
    AND l.period_id = p_period_id
    AND (p_driver_id IS NULL OR l.driver_id = p_driver_id);
$$;

REVOKE ALL ON FUNCTION public.fuel_write_week_lines(text, text, date, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fuel_reverse_week_lines(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fuel_week_lines_list(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fuel_write_week_lines(text, text, date, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fuel_reverse_week_lines(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fuel_week_lines_list(text, text, text) TO service_role;

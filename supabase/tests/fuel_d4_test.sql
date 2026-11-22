-- D4 (F-15): fuel.week_lines sealed-week guard (rolled back).
-- A line in a locked period can't be inserted, changed, moved out or deleted; the same week's
-- other service line (still open) is not blocked; the seal writer can write.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp._fuel_d4_expect(p_code text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $e$
DECLARE m text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
    IF m IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 'expected % got %', p_code, m;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected % but statement succeeded', p_code;
END;
$e$;

DO $$
DECLARE
  v_org uuid := 'f4111111-1111-4111-8111-111111111101';
  v_week date := '2026-11-16';
  v_line uuid;
  n int;
BEGIN
  INSERT INTO public.fuel_reconciliation_period (id, org_id, week_start, week_end, status, total_spend, service_line)
  VALUES ('period-d4-ride', v_org, v_week, v_week + 6, 'open', 1000, 'rideshare'),
         ('period-d4-del',  v_org, v_week, v_week + 6, 'open', 1000, 'rush_delivery');

  INSERT INTO fuel.week_lines (
    org_id, period_id, week_start, vehicle_id, driver_id, purpose,
    km, cost_per_km_minor, driver_pct, driver_amount_minor, company_amount_minor, engine_version
  ) VALUES (
    v_org::text, 'period-d4-ride', v_week, 'v1', 'd1', 'uber_trips',
    50, 10000, 20, 100000, 400000, 'fuel-chain-v3'
  ) RETURNING id INTO v_line;

  UPDATE public.fuel_reconciliation_period
  SET status = 'locked', locked_at = now()
  WHERE id = 'period-d4-ride';

  -- Insert into the locked period: refused.
  PERFORM pg_temp._fuel_d4_expect('SEALED_WEEK_LOCKED', format($q$
    INSERT INTO fuel.week_lines (org_id, period_id, week_start, vehicle_id, driver_id, purpose,
      km, cost_per_km_minor, driver_pct, driver_amount_minor, company_amount_minor, engine_version)
    VALUES (%L, 'period-d4-ride', %L, 'v1', 'd1', 'to_pickups', 60, 10000, 50, 300000, 300000, 'fuel-chain-v3')
  $q$, v_org::text, v_week));

  -- Change a locked line: refused.
  PERFORM pg_temp._fuel_d4_expect('SEALED_WEEK_LOCKED',
    format('UPDATE fuel.week_lines SET km = 51 WHERE id = %L', v_line));

  -- Move a locked line to the open Delivery period: refused.
  PERFORM pg_temp._fuel_d4_expect('SEALED_WEEK_LOCKED',
    format('UPDATE fuel.week_lines SET period_id = %L WHERE id = %L', 'period-d4-del', v_line));

  -- Delete a locked line: refused.
  PERFORM pg_temp._fuel_d4_expect('SEALED_WEEK_LOCKED',
    format('DELETE FROM fuel.week_lines WHERE id = %L', v_line));

  -- Same week, Delivery still open: allowed.
  INSERT INTO fuel.week_lines (
    org_id, period_id, week_start, vehicle_id, driver_id, purpose,
    km, cost_per_km_minor, driver_pct, driver_amount_minor, company_amount_minor, engine_version
  ) VALUES (
    v_org::text, 'period-d4-del', v_week, 'v2', 'd2', 'uber_trips',
    40, 10000, 20, 80000, 320000, 'fuel-chain-v3'
  );

  -- The seal writer may write into the locked period.
  PERFORM fuel_system.seal_writer_on('d4-bypass-test');
  INSERT INTO fuel.week_lines (
    org_id, period_id, week_start, vehicle_id, driver_id, purpose,
    km, cost_per_km_minor, driver_pct, driver_amount_minor, company_amount_minor, engine_version
  ) VALUES (
    v_org::text, 'period-d4-ride', v_week, 'v1', 'd1', 'personal',
    10, 10000, 100, 100000, 10000, 'fuel-chain-v3'
  );
  PERFORM fuel_system.seal_writer_off();

  SELECT count(*) INTO n FROM fuel.week_lines WHERE org_id = v_org::text;
  IF n <> 3 THEN
    RAISE EXCEPTION 'expected 3 lines, got %', n;
  END IF;
END;
$$;

ROLLBACK;

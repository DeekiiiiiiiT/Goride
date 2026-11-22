-- F-03 (done-test 11): fuel lines writer, reversal and read (rolled back).
-- Write before the lock (a retry replaces unreversed lines); nothing writes a locked week except
-- the reversal; a reopen keeps the old lines reversed and a re-lock adds new ones.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp._expect(p_code text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $e$
DECLARE m text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
    IF m IS DISTINCT FROM p_code THEN RAISE EXCEPTION 'expected % got %', p_code, m; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected % but statement succeeded', p_code;
END;
$e$;

DO $$
DECLARE
  v_org uuid := 'f7111111-1111-4111-8111-111111111101';
  v_week date := '2026-11-16';
  v_lines jsonb := jsonb_build_array(
    jsonb_build_object('vehicle_id', '5179KZ', 'driver_id', 'kenny', 'purpose', 'uber_trips', 'km', 1320,
      'cost_per_km_minor', 1630.0732, 'driver_pct', 20, 'driver_amount_minor', 430339,
      'company_amount_minor', 1721358, 'engine_version', 'fuel-chain-v3'),
    jsonb_build_object('vehicle_id', '5179KZ', 'driver_id', 'kenny', 'purpose', 'commute', 'km', 18,
      'cost_per_km_minor', 1630.0732, 'driver_pct', 0, 'driver_amount_minor', 0,
      'company_amount_minor', 29341, 'engine_version', 'fuel-chain-v3'),
    jsonb_build_object('vehicle_id', '5179KZ', 'driver_id', 'kenny', 'purpose', 'no_odometer_fills', 'km', 0,
      'cost_per_km_minor', NULL, 'driver_pct', 50, 'driver_amount_minor', 50000,
      'company_amount_minor', 50000, 'engine_version', 'fuel-chain-v3')
  );
  n int;
  v_list jsonb;
BEGIN
  INSERT INTO public.fuel_reconciliation_period (id, org_id, week_start, week_end, status, total_spend, service_line)
  VALUES ('period-lw', v_org, v_week, v_week + 6, 'ready', 25500, 'rideshare');

  -- Write before the lock; a retry replaces the unreversed lines (no duplicates).
  n := public.fuel_write_week_lines(v_org::text, 'period-lw', v_week, v_lines);
  IF n <> 3 THEN RAISE EXCEPTION 'expected 3 lines written, got %', n; END IF;
  n := public.fuel_write_week_lines(v_org::text, 'period-lw', v_week, v_lines);
  SELECT count(*) INTO n FROM fuel.week_lines WHERE period_id = 'period-lw';
  IF n <> 3 THEN RAISE EXCEPTION 'a retry must replace, not add: % lines', n; END IF;

  -- Lock. Now nothing may write the week: not the writer, not a direct update.
  UPDATE public.fuel_reconciliation_period SET status = 'locked', locked_at = now() WHERE id = 'period-lw';
  PERFORM pg_temp._expect('SEALED_WEEK_LOCKED',
    format('SELECT public.fuel_write_week_lines(%L, %L, %L, %L::jsonb)', v_org::text, 'period-lw', v_week, v_lines::text));
  PERFORM pg_temp._expect('SEALED_WEEK_LOCKED',
    'UPDATE fuel.week_lines SET km = km + 1 WHERE period_id = ''period-lw''');

  -- Reopen: the reversal is the only writer allowed on the locked week; lines are kept.
  n := public.fuel_reverse_week_lines(v_org::text, 'period-lw', 'Odometer corrected on 19 Nov');
  IF n <> 3 THEN RAISE EXCEPTION 'expected 3 lines reversed, got %', n; END IF;
  SELECT count(*) INTO n FROM fuel.week_lines
  WHERE period_id = 'period-lw' AND reversed_by IS NOT NULL AND reversed_at IS NOT NULL
    AND reversal_reason = 'Odometer corrected on 19 Nov';
  IF n <> 3 THEN RAISE EXCEPTION 'reversal must stamp all 3 lines, got %', n; END IF;
  UPDATE public.fuel_reconciliation_period SET status = 'reopened', locked_at = NULL WHERE id = 'period-lw';

  -- Re-lock writes new lines beside the reversed ones; the reversed ones are never deleted.
  n := public.fuel_write_week_lines(v_org::text, 'period-lw', v_week, v_lines - 2);
  SELECT count(*) INTO n FROM fuel.week_lines WHERE period_id = 'period-lw';
  IF n <> 5 THEN RAISE EXCEPTION 'expected 3 reversed + 2 new lines, got %', n; END IF;

  v_list := public.fuel_week_lines_list(v_org::text, 'period-lw', 'kenny');
  IF jsonb_array_length(v_list) <> 5 THEN RAISE EXCEPTION 'list should return 5 lines'; END IF;
  IF (v_list -> 0 ->> 'reversed_at') IS NOT NULL THEN
    RAISE EXCEPTION 'current lines come first in the list';
  END IF;
END;
$$;

-- Only the server may call these.
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.fuel_write_week_lines(text, text, date, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fuel_reverse_week_lines(text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fuel_week_lines_list(text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fuel lines functions must be service_role only';
  END IF;
END;
$$;

ROLLBACK;

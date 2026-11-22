-- D5 (F-16): fuel_system.nightly_checks (rolled back).
-- Clean v3 week with lines → passes; lines missing → fails; shares ≠ spend → fails;
-- a snapshot re-worked after the lock → fails; a v2.2 week at 109% is never failed.

BEGIN;

DO $$
DECLARE
  v_org text := 'f5111111-1111-4111-8111-111111111101';
  v_org_uuid uuid := 'f5111111-1111-4111-8111-111111111101';
  v_week date := '2026-11-16';
  v_failed int;
  v_ok int;
BEGIN
  -- A clean v3 week: spend 10,000 = company 8,000 + driver 2,000, and its lines say the same.
  INSERT INTO public.fuel_reconciliation_period (
    id, org_id, week_start, week_end, status, locked_at,
    total_spend, company_share, driver_share
  ) VALUES (
    'period-d5', v_org_uuid, v_week, v_week + 6, 'locked', now() - interval '1 hour',
    10000, 8000, 2000
  );
  INSERT INTO public.fuel_week_snapshot (
    org_id, period_id, week_start, version, inputs_hash, money, provenance, created_at
  ) VALUES (
    v_org, 'period-d5', v_week, 1, 'hash-abc',
    jsonb_build_object('reports', '[]'::jsonb, 'totalSpend', 10000),
    jsonb_build_object('engineVersion', 'fuel-chain-v3.0'),
    now() - interval '2 hours'
  );

  -- No lines yet: the lines check must fail.
  SELECT count(*) INTO v_failed
  FROM fuel_system.nightly_checks(v_org)
  WHERE NOT ok AND name = 'v3_lines_vs_week_shares';
  IF v_failed <> 1 THEN
    RAISE EXCEPTION 'a v3 week with no lines must fail v3_lines_vs_week_shares';
  END IF;

  PERFORM fuel_system.seal_writer_on('d5-lines');
  INSERT INTO fuel.week_lines (
    org_id, period_id, week_start, vehicle_id, driver_id, purpose,
    km, cost_per_km_minor, driver_pct, driver_amount_minor, company_amount_minor, engine_version
  ) VALUES
    (v_org, 'period-d5', v_week, 'v1', 'd1', 'uber_trips', 500, 1600, 20, 160000, 640000, 'fuel-chain-v3.0'),
    (v_org, 'period-d5', v_week, 'v1', 'd1', 'commute',    100, 1600, 0,  0,      160000, 'fuel-chain-v3.0'),
    (v_org, 'period-d5', v_week, 'v1', 'd1', 'personal',    25, 1600, 100, 40000, 0,      'fuel-chain-v3.0');
  PERFORM fuel_system.seal_writer_off();

  SELECT count(*) FILTER (WHERE NOT ok), count(*) FILTER (WHERE ok)
  INTO v_failed, v_ok
  FROM fuel_system.nightly_checks(v_org);
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'clean v3 week should pass nightly checks, failed %', v_failed;
  END IF;
  IF v_ok < 3 THEN
    RAISE EXCEPTION 'expected the shares, statements and lines checks to report ok, got %', v_ok;
  END IF;

  -- A snapshot with a different hash written after the lock: check 0 fails.
  INSERT INTO public.fuel_week_snapshot (
    org_id, period_id, week_start, version, inputs_hash, money, provenance, created_at
  ) VALUES (
    v_org, 'period-d5', v_week, 2, 'hash-changed',
    jsonb_build_object('reports', '[]'::jsonb, 'totalSpend', 10000),
    jsonb_build_object('engineVersion', 'fuel-chain-v3.0'),
    now()
  );
  SELECT count(*) INTO v_failed
  FROM fuel_system.nightly_checks(v_org)
  WHERE NOT ok AND name = 'locked_week_recomputed_after_lock';
  IF v_failed <> 1 THEN
    RAISE EXCEPTION 'a week re-worked after its lock must fail locked_week_recomputed_after_lock';
  END IF;
  DELETE FROM public.fuel_week_snapshot WHERE period_id = 'period-d5' AND version = 2;

  -- Shares no longer add up to spend: fails.
  UPDATE public.fuel_reconciliation_period SET company_share = 5000 WHERE id = 'period-d5';
  SELECT count(*) INTO v_failed
  FROM fuel_system.nightly_checks(v_org)
  WHERE NOT ok AND name = 'v3_shares_vs_spend';
  IF v_failed < 1 THEN
    RAISE EXCEPTION 'broken shares should fail v3_shares_vs_spend';
  END IF;

  -- A v2.2 week at 109.4% (like 9 Nov) is history, never a failure.
  INSERT INTO public.fuel_reconciliation_period (
    id, org_id, week_start, week_end, status, locked_at,
    total_spend, company_share, driver_share
  ) VALUES (
    'period-d5-old', v_org_uuid, '2026-11-09', '2026-11-15', 'locked', now() - interval '1 day',
    28800, 27430.70, 4081.36
  );
  INSERT INTO public.fuel_week_snapshot (
    org_id, period_id, week_start, version, inputs_hash, money, provenance, created_at
  ) VALUES (
    v_org, 'period-d5-old', '2026-11-09', 1, 'hash-old',
    jsonb_build_object('reports', '[]'::jsonb, 'totalSpend', 28800),
    jsonb_build_object('engineVersion', 'fuel-chain-v2.2'),
    now() - interval '2 days'
  );
  SELECT count(*) INTO v_failed
  FROM fuel_system.nightly_checks(v_org)
  WHERE NOT ok AND (detail ->> 'period_id') = 'period-d5-old';
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'a v2.2 week must never fail the v3 checks';
  END IF;
END;
$$;

ROLLBACK;

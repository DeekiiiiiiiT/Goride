-- WRA-72: cash_tolls self-resolve from toll.charges (driver_cash). Rolls back.

BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_org_text text;
  v_week date := date '2026-11-09';
  v_cov jsonb;
  v_ok boolean;
  v_vol record;
BEGIN
  v_org_text := v_org::text;

  DELETE FROM recon.source_attestations
  WHERE organization_id = v_org_text AND source_id = 'cash_tolls';
  DELETE FROM toll.charges WHERE organization_id = v_org;

  SELECT * INTO v_vol FROM recon.cash_tolls_week_volume(v_org_text, v_week);
  RAISE NOTICE 'empty week volume: %',
    CASE WHEN v_vol.charge_count = 0 AND v_vol.amount_minor = 0 THEN 'PASS' ELSE 'FAIL' END;

  v_cov := recon.compute_source_coverage(v_org_text, 'rideshare', 'cash_tolls', v_week);
  SELECT bool_and((v_cov ->> to_char(d::date, 'YYYY-MM-DD')) = 'covered')
    INTO v_ok
    FROM generate_series(v_week, v_week + 6, interval '1 day') d;
  RAISE NOTICE 'empty week all covered: %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL ' || v_cov::text END;

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, vehicle_id, driver_id, plaza_id
  ) VALUES (
    v_org, timestamptz '2026-11-15 10:00:00-05', v_week, 'exact', 27500,
    'cash', 'driver_cash', 'wra72-cash-1', 'v1', 'd1', 'pz1'
  );

  v_cov := recon.compute_source_coverage(v_org_text, 'rideshare', 'cash_tolls', v_week);
  RAISE NOTICE 'one cash toll day: %',
    CASE WHEN v_cov ->> '2026-11-15' = 'covered'
           AND recon._day_has_daily_rows(v_org_text, 'rideshare', 'cash_tolls', date '2026-11-15')
         THEN 'PASS' ELSE 'FAIL ' || v_cov::text END;

  SELECT * INTO v_vol FROM recon.cash_tolls_week_volume(v_org_text, v_week);
  RAISE NOTICE 'volume after insert: %',
    CASE WHEN v_vol.charge_count = 1 AND v_vol.amount_minor = 27500 THEN 'PASS' ELSE 'FAIL' END;

  INSERT INTO recon.source_attestations (
    organization_id, service_line, week_key, source_id, day, kind, reason, actor
  ) VALUES (
    v_org_text, 'rideshare', v_week, 'cash_tolls', date '2026-11-10', 'attest_none',
    'No activity', 'proof'
  );

  v_cov := recon.compute_source_coverage(v_org_text, 'rideshare', 'cash_tolls', v_week);
  SELECT bool_and((v_cov ->> to_char(d::date, 'YYYY-MM-DD')) = 'covered')
    INTO v_ok
    FROM generate_series(v_week, v_week + 6, interval '1 day') d;
  RAISE NOTICE 'attest ignored for cash_tolls: %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL ' || v_cov::text END;
END;
$$;

ROLLBACK;
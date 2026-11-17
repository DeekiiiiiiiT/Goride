-- WRA-72(b): data beats "No activity" attest. Rolls back.

BEGIN;

DO $$
DECLARE
  v_org text := 'wra72-attest-data-org';
  v_week date := date '2026-11-09';
  v_cov jsonb;
BEGIN
  DELETE FROM recon.source_attestations WHERE organization_id = v_org;
  DELETE FROM fleet.import_batches WHERE organization_id = v_org;
  DELETE FROM fleet.trips WHERE organization_id = v_org;

  -- Statement: full-week attest + import batch for same week → covered_over_attest
  FOR i IN 0..6 LOOP
    INSERT INTO recon.source_attestations (
      organization_id, service_line, week_key, source_id, day, kind, reason, actor
    ) VALUES (
      v_org, 'rideshare', v_week, 'toll_topup', v_week + i, 'attest_none', 'none', 'proof'
    );
  END LOOP;

  INSERT INTO fleet.import_batches (
    id, organization_id, file_name, status, type,
    legacy_kv_id, payload_json, source_id, week_keys,
    coverage_start, coverage_end
  ) VALUES (
    'wra72-topup-batch', v_org, 'topup.csv', 'completed', 'merged_import',
    'wra72-topup-kv', '{}'::jsonb, 'toll_topup',
    ARRAY[v_week]::date[],
    v_week, v_week + 6
  );

  v_cov := recon.compute_source_coverage(v_org, 'rideshare', 'toll_topup', v_week);
  RAISE NOTICE 'stmt attest + data: %',
    CASE WHEN v_cov ->> 'week' = 'covered_over_attest' THEN 'PASS' ELSE 'FAIL ' || v_cov::text END;

  -- Daily: attest on one day + trips that day → covered_over_attest that day
  DELETE FROM fleet.import_batches WHERE id = 'wra72-topup-batch';
  DELETE FROM recon.source_attestations WHERE organization_id = v_org AND source_id = 'toll_topup';

  INSERT INTO fleet.trips (
    id, organization_id, date, platform, service_line, amount, legacy_kv_id, payload_json
  ) VALUES (
    'wra72-indrive', v_org, date '2026-11-15', 'InDrive', 'rideshare', 500,
    'wra72-kv', '{}'::jsonb
  );

  INSERT INTO recon.source_attestations (
    organization_id, service_line, week_key, source_id, day, kind, reason, actor
  ) VALUES (
    v_org, 'rideshare', v_week, 'indrive_trips', date '2026-11-15', 'attest_none', 'none', 'proof'
  );

  v_cov := recon.compute_source_coverage(v_org, 'rideshare', 'indrive_trips', v_week);
  RAISE NOTICE 'daily attest + rows: %',
    CASE WHEN v_cov ->> '2026-11-15' = 'covered_over_attest' THEN 'PASS' ELSE 'FAIL ' || v_cov::text END;
END;
$$;

ROLLBACK;
-- WRA-71: indrive_trips per-day coverage (logged rows + export batch). Rolls back.

BEGIN;

DO $$
DECLARE
  v_org text := 'wra71-indrive-cov-org';
  v_week date := date '2026-11-09';
  v_cov jsonb;
  v_ok boolean;
BEGIN
  DELETE FROM recon.source_attestations
  WHERE organization_id = v_org AND source_id = 'indrive_trips';
  DELETE FROM fleet.import_batches WHERE organization_id = v_org;
  DELETE FROM fleet.trips WHERE organization_id = v_org;

  -- Logged trips on Sun 15 only → that day covered, rest missing.
  INSERT INTO fleet.trips (
    id, organization_id, date, platform, service_line, amount, legacy_kv_id, payload_json
  )
  SELECT
    'wra71-trip-' || g,
    v_org,
    date '2026-11-15',
    'InDrive',
    'rideshare',
    1200 + g,
    'wra71-kv-' || g,
    '{}'::jsonb
  FROM generate_series(1, 8) g;

  v_cov := recon.compute_source_coverage(v_org, 'rideshare', 'indrive_trips', v_week);
  RAISE NOTICE 'logged Sun only: %',
    CASE WHEN v_cov ->> '2026-11-15' = 'covered'
      AND v_cov ->> '2026-11-09' = 'missing'
      AND v_cov ->> '2026-11-14' = 'missing'
         THEN 'PASS' ELSE 'FAIL ' || v_cov::text END;

  -- Export batch Mon–Sun → all days covered (no logged rows).
  DELETE FROM fleet.trips WHERE organization_id = v_org;
  INSERT INTO fleet.import_batches (
    id, organization_id, file_name, status, type,
    legacy_kv_id, payload_json, source_id, week_keys,
    coverage_start, coverage_end
  ) VALUES (
    'wra71-indrive-batch', v_org, 'indrive-week.csv', 'completed', 'merged_import',
    'wra71-indrive-batch-kv', '{}'::jsonb, 'indrive_trips',
    ARRAY[v_week]::date[],
    v_week, v_week + 6
  );

  v_cov := recon.compute_source_coverage(v_org, 'rideshare', 'indrive_trips', v_week);
  SELECT bool_and((v_cov ->> to_char(d::date, 'YYYY-MM-DD')) = 'covered')
    INTO v_ok
    FROM generate_series(v_week, v_week + 6, interval '1 day') d;
  RAISE NOTICE 'export batch covers week: %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL ' || v_cov::text END;

  -- Trips on Sun + attest_none on Mon → Mon zero_attested, Sun still covered.
  DELETE FROM fleet.import_batches WHERE id = 'wra71-indrive-batch';
  INSERT INTO fleet.trips (
    id, organization_id, date, platform, service_line, amount, legacy_kv_id, payload_json
  ) VALUES (
    'wra71-trip-single', v_org, date '2026-11-15', 'indrive', 'rideshare', 500,
    'wra71-kv-single', '{}'::jsonb
  );
  INSERT INTO recon.source_attestations (
    organization_id, service_line, week_key, source_id, day, kind, reason, actor
  ) VALUES (
    v_org, 'rideshare', v_week, 'indrive_trips', date '2026-11-10', 'attest_none',
    'No activity', 'proof'
  );

  v_cov := recon.compute_source_coverage(v_org, 'rideshare', 'indrive_trips', v_week);
  RAISE NOTICE 'attest empty Mon only: %',
    CASE WHEN v_cov ->> '2026-11-10' = 'zero_attested'
      AND v_cov ->> '2026-11-15' = 'covered'
      AND v_cov ->> '2026-11-09' = 'missing'
         THEN 'PASS' ELSE 'FAIL ' || v_cov::text END;
END;
$$;

ROLLBACK;
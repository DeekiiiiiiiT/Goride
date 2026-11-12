-- Local proofs for Round 1 data layer. Expect failures when run against empty DB.
BEGIN;

-- publish_week_desk rolls back on error (invalid requirement).
DO $$
DECLARE
  v_org text := 'wr1-proof-org';
  v_run_id uuid;
  v_ver bigint;
  v_snap jsonb;
BEGIN
  INSERT INTO recon.week_runs (
    organization_id, service_line, week_key, state, version, main_line
  ) VALUES (
    v_org, 'rideshare', date '2026-10-05', 'collecting', 1, 'rideshare'
  ) RETURNING id INTO v_run_id;

  BEGIN
    PERFORM recon.publish_week_desk(
      v_run_id,
      'hash-bad',
      '{"deskReady": true}'::jsonb,
      '[{"source_id":"uber_bundle","requirement":"not_a_valid_req","status":"missing","coverage":{}}]'::jsonb,
      '[{"step_id":"sources","actionable":0,"informational":0}]'::jsonb,
      '[]'::jsonb
    );
    RAISE EXCEPTION 'expected publish_week_desk to fail';
  EXCEPTION
    WHEN check_violation OR not_null_violation OR others THEN
      NULL;
  END;

  SELECT version, desk_snapshot INTO v_ver, v_snap
  FROM recon.week_runs WHERE id = v_run_id;

  IF v_ver <> 1 OR v_snap IS NOT NULL THEN
    RAISE EXCEPTION 'publish_week_desk wrote partial state';
  END IF;
END $$;

-- run_events: service_role may approve pending row; other updates refused.
DO $$
DECLARE
  v_run_id uuid;
  v_event_id bigint;
BEGIN
  INSERT INTO recon.week_runs (
    organization_id, service_line, week_key, state, version, main_line
  ) VALUES (
    'wr1-proof-org', 'rideshare', date '2026-10-12', 'collecting', 1, 'rideshare'
  ) RETURNING id INTO v_run_id;

  INSERT INTO recon.run_events (run_id, actor, kind, status)
  VALUES (v_run_id, 'tester', 'waive_test', 'pending_approval')
  RETURNING id INTO v_event_id;

  UPDATE recon.run_events
  SET status = 'approved', approved_by = 'approver'
  WHERE id = v_event_id;

  BEGIN
    UPDATE recon.run_events SET actor = 'hacker' WHERE id = v_event_id;
    RAISE EXCEPTION 'expected actor update to be blocked';
  EXCEPTION
    WHEN others THEN
      NULL;
  END;

  BEGIN
    DELETE FROM recon.run_events WHERE id = v_event_id;
    RAISE EXCEPTION 'expected delete to be blocked';
  EXCEPTION
    WHEN others THEN
      NULL;
  END;
END $$;

-- ensure_ended_week_runs: four weeks (2 closed, 1 open period, 1 no period); idempotent second call.
DO $$
DECLARE
  v_org uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
  v_org_txt text := v_org::text;
  v_w1 date := date '2026-09-07';
  v_w2 date := date '2026-09-14';
  v_w3 date := date '2026-09-21';
  v_closed1 timestamptz := timestamptz '2026-09-13 18:00:00+00';
  v_closed2 timestamptz := timestamptz '2026-09-20 18:00:00+00';
  v_run_ct int;
  v_step_ct int;
  v_evt_ct int;
  v_st text;
  v_cat timestamptz;
  v_wk date;
BEGIN
  DELETE FROM recon.run_events re
  USING recon.week_runs wr
  WHERE re.run_id = wr.id AND wr.organization_id = v_org_txt;

  DELETE FROM recon.run_steps rs
  USING recon.week_runs wr
  WHERE rs.run_id = wr.id AND wr.organization_id = v_org_txt;

  DELETE FROM recon.week_publish_holds h
  USING recon.week_runs wr
  WHERE h.run_id = wr.id AND wr.organization_id = v_org_txt;

  DELETE FROM recon.week_runs WHERE organization_id = v_org_txt;

  DELETE FROM public.driver_financial_periods
  WHERE organization_id = v_org
    AND period_anchor IN (v_w1, v_w2, v_w3);

  INSERT INTO public.driver_financial_periods (
    organization_id, driver_id, period_anchor, period_end,
    status, closed_at, metadata
  ) VALUES
    (
      v_org, 'wr1-proof-drv', v_w1, v_w1 + 6,
      'closed', v_closed1, '{"rideshareTripCount": 1}'::jsonb
    ),
    (
      v_org, 'wr1-proof-drv', v_w2, v_w2 + 6,
      'closed', v_closed2, '{"rideshareTripCount": 1}'::jsonb
    ),
    (
      v_org, 'wr1-proof-drv', v_w3, v_w3 + 6,
      'open', NULL, '{"rideshareTripCount": 1}'::jsonb
    );

  PERFORM recon.ensure_ended_week_runs(v_org_txt);

  FOREACH v_wk IN ARRAY ARRAY[v_w1, v_w2, v_w3, date '2026-09-28']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM recon.week_runs wr
      WHERE wr.organization_id = v_org_txt
        AND wr.service_line = 'rideshare'
        AND wr.week_key = v_wk
    ) THEN
      RAISE EXCEPTION 'ensure_ended_week_runs: missing run for %', v_wk;
    END IF;
  END LOOP;

  SELECT state, closed_at INTO v_st, v_cat
  FROM recon.week_runs
  WHERE organization_id = v_org_txt AND week_key = date '2026-09-07';

  IF v_st <> 'closed' OR v_cat IS DISTINCT FROM v_closed1 THEN
    RAISE EXCEPTION 'ensure_ended_week_runs: W1 adopt failed (% %)', v_st, v_cat;
  END IF;

  SELECT state, closed_at INTO v_st, v_cat
  FROM recon.week_runs
  WHERE organization_id = v_org_txt AND week_key = date '2026-09-14';

  IF v_st <> 'closed' OR v_cat IS DISTINCT FROM v_closed2 THEN
    RAISE EXCEPTION 'ensure_ended_week_runs: W2 adopt failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM recon.week_runs
    WHERE organization_id = v_org_txt
      AND week_key IN (v_w3, date '2026-09-28')
      AND state = 'closed'
  ) THEN
    RAISE EXCEPTION 'ensure_ended_week_runs: open/no-period week must stay open';
  END IF;

  SELECT count(*) INTO v_evt_ct
  FROM recon.run_events re
  JOIN recon.week_runs wr ON wr.id = re.run_id
  WHERE wr.organization_id = v_org_txt
    AND re.kind = 'adopt_period_close'
    AND wr.week_key IN (date '2026-09-07', date '2026-09-14');

  IF v_evt_ct <> 2 THEN
    RAISE EXCEPTION 'ensure_ended_week_runs: expected 2 adopt_period_close, got %', v_evt_ct;
  END IF;

  SELECT count(*) INTO v_run_ct FROM recon.week_runs WHERE organization_id = v_org_txt;
  SELECT count(*) INTO v_step_ct
  FROM recon.run_steps rs
  JOIN recon.week_runs wr ON wr.id = rs.run_id
  WHERE wr.organization_id = v_org_txt;

  PERFORM recon.ensure_ended_week_runs(v_org_txt);

  IF (SELECT count(*) FROM recon.week_runs WHERE organization_id = v_org_txt) <> v_run_ct THEN
    RAISE EXCEPTION 'ensure_ended_week_runs: duplicate runs on second call';
  END IF;

  IF (
    SELECT count(*) FROM recon.run_steps rs
    JOIN recon.week_runs wr ON wr.id = rs.run_id
    WHERE wr.organization_id = v_org_txt
  ) <> v_step_ct THEN
    RAISE EXCEPTION 'ensure_ended_week_runs: duplicate steps on second call';
  END IF;

  IF (
    SELECT count(*) FROM recon.run_events re
    JOIN recon.week_runs wr ON wr.id = re.run_id
    WHERE wr.organization_id = v_org_txt AND re.kind = 'adopt_period_close'
  ) <> v_evt_ct THEN
    RAISE EXCEPTION 'ensure_ended_week_runs: duplicate adopt events on second call';
  END IF;
END $$;

-- compute_source_coverage: 2-week uber batch covers only week_keys[1].
DO $$
DECLARE
  v_org text := 'wr1-cov-org';
  v_cov jsonb;
BEGIN
  DELETE FROM fleet.import_batches
  WHERE id = 'wr1-proof-uber-2wk';

  INSERT INTO fleet.import_batches (
    id, organization_id, file_name, status, type,
    legacy_kv_id, payload_json, source_id, week_keys,
    coverage_start, coverage_end
  ) VALUES (
    'wr1-proof-uber-2wk', v_org, 'proof.csv', 'completed', 'merged_import',
    'wr1-proof-uber-2wk-kv', '{}'::jsonb, 'uber_bundle',
    ARRAY[date '2026-02-16', date '2026-02-23']::date[],
    date '2026-02-10', date '2026-02-23'
  );

  v_cov := recon.compute_source_coverage(v_org, 'rideshare', 'uber_bundle', date '2026-02-16');
  IF v_cov <> '{"week": "covered"}'::jsonb AND v_cov <> '{"week":"covered"}'::jsonb THEN
    RAISE EXCEPTION 'coverage W16: expected covered, got %', v_cov;
  END IF;

  v_cov := recon.compute_source_coverage(v_org, 'rideshare', 'uber_bundle', date '2026-02-23');
  IF v_cov <> '{"week": "missing"}'::jsonb AND v_cov <> '{"week":"missing"}'::jsonb THEN
    RAISE EXCEPTION 'coverage W23: expected missing, got %', v_cov;
  END IF;
END $$;

-- Uber batch restamp + undo on three seeded batches.
DO $$
DECLARE
  v_org text := 'wr1-stamp-org';
  v_mon_a date := date '2026-03-02';
  v_a_start date := date '2026-03-03';
  v_a_end date := date '2026-03-15';
  v_b_mon date := date '2026-03-09';
  v_c_start date := date '2026-02-10';
  v_c_end date := date '2026-02-23';
  rec record;
BEGIN
  ALTER TABLE fleet.import_batches
    ADD COLUMN IF NOT EXISTS coverage_start_before date,
    ADD COLUMN IF NOT EXISTS coverage_end_before date;

  DELETE FROM fleet.import_batches
  WHERE id IN ('wr1-stamp-a', 'wr1-stamp-b', 'wr1-stamp-c');

  INSERT INTO fleet.import_batches (
    id, organization_id, file_name, status, type,
    legacy_kv_id, payload_json, source_id, week_keys,
    coverage_start, coverage_end
  ) VALUES
    (
      'wr1-stamp-a', v_org, 'a.csv', 'completed', 'merged_import',
      'wr1-stamp-a-kv', '{}'::jsonb, 'uber_bundle',
      ARRAY[v_mon_a]::date[], v_a_start, v_a_end
    ),
    (
      'wr1-stamp-b', v_org, 'b.csv', 'completed', 'merged_import',
      'wr1-stamp-b-kv', '{}'::jsonb, 'uber_bundle',
      ARRAY[v_b_mon]::date[], v_b_mon, v_b_mon + 6
    ),
    (
      'wr1-stamp-c', v_org, 'c.csv', 'completed', 'merged_import',
      'wr1-stamp-c-kv', '{}'::jsonb, 'uber_bundle',
      ARRAY[date '2026-02-16', date '2026-02-23']::date[],
      v_c_start, v_c_end
    );

  UPDATE fleet.import_batches b
  SET
    coverage_start_before = b.coverage_start,
    coverage_end_before = b.coverage_end
  WHERE b.id IN ('wr1-stamp-a', 'wr1-stamp-b', 'wr1-stamp-c');

  UPDATE fleet.import_batches b
  SET
    coverage_start = b.week_keys[1],
    coverage_end = b.week_keys[1] + 6
  WHERE b.id IN ('wr1-stamp-a', 'wr1-stamp-b')
    AND b.source_id = 'uber_bundle'
    AND b.status = 'completed'
    AND cardinality(b.week_keys) = 1;

  UPDATE fleet.import_batches b
  SET
    coverage_start = date '2026-02-16',
    coverage_end = date '2026-02-22'
  WHERE b.id = 'wr1-stamp-c'
    AND cardinality(b.week_keys) > 1;

  FOR rec IN
    SELECT id, coverage_start, coverage_end, week_keys
    FROM fleet.import_batches
    WHERE id IN ('wr1-stamp-a', 'wr1-stamp-b', 'wr1-stamp-c')
  LOOP
    IF rec.coverage_start IS DISTINCT FROM rec.week_keys[1]
      OR rec.coverage_end IS DISTINCT FROM (
        CASE WHEN cardinality(rec.week_keys) > 1
          THEN date '2026-02-22'
          ELSE rec.week_keys[1] + 6
        END
      ) THEN
      RAISE EXCEPTION 'restamp failed for %', rec.id;
    END IF;
  END LOOP;

  UPDATE fleet.import_batches b
  SET
    coverage_start = b.coverage_start_before,
    coverage_end = b.coverage_end_before
  WHERE b.id IN ('wr1-stamp-a', 'wr1-stamp-b', 'wr1-stamp-c')
    AND b.coverage_start_before IS NOT NULL;

  FOR rec IN
    SELECT id, coverage_start, coverage_end,
      coverage_start_before AS want_start,
      coverage_end_before AS want_end
    FROM fleet.import_batches
    WHERE id IN ('wr1-stamp-a', 'wr1-stamp-b', 'wr1-stamp-c')
  LOOP
    IF rec.coverage_start IS DISTINCT FROM rec.want_start
      OR rec.coverage_end IS DISTINCT FROM rec.want_end THEN
      RAISE EXCEPTION 'undo failed for %', rec.id;
    END IF;
  END LOOP;
END $$;

ROLLBACK;

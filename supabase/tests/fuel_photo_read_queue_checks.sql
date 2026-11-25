-- Fuel log offline-first S6 queue checks (docs/fuel-log-offline-first-audit.md).
-- Local test copy only. Made-up ids. Each row: check_name, ok.
BEGIN;

CREATE TEMP TABLE _q_checks (check_name text PRIMARY KEY, ok boolean NOT NULL);

INSERT INTO _q_checks VALUES ('table_exists_rls', EXISTS (
  SELECT 1 FROM pg_tables WHERE schemaname = 'fleet' AND tablename = 'fuel_photo_read_queue' AND rowsecurity
));

INSERT INTO _q_checks VALUES ('no_anon_authenticated_table_grants', NOT EXISTS (
  SELECT 1 FROM information_schema.role_table_grants g
  WHERE g.grantee IN ('anon', 'authenticated', 'PUBLIC')
    AND g.table_schema = 'fleet' AND g.table_name = 'fuel_photo_read_queue'
));

INSERT INTO _q_checks VALUES ('functions_server_only', NOT EXISTS (
  SELECT 1
  FROM unnest(ARRAY['anon', 'authenticated']) AS role_name,
       unnest(ARRAY[
         'public.fuel_photo_read_enqueue(text, text)',
         'public.fuel_photo_read_claim(int)',
         'public.fuel_photo_read_finish(text, text, text, timestamptz)',
         'private.invoke_fuel_photo_read()'
       ]) AS fn
  WHERE has_function_privilege(role_name, fn, 'EXECUTE')
));

INSERT INTO _q_checks VALUES ('service_role_runs_queue_not_cron_door',
  has_function_privilege('service_role', 'public.fuel_photo_read_claim(int)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.fuel_photo_read_enqueue(text, text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.fuel_photo_read_finish(text, text, text, timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'private.invoke_fuel_photo_read()', 'EXECUTE')
);

DO $$
DECLARE
  n int;
  a int;
  r record;
BEGIN
  PERFORM public.fuel_photo_read_enqueue('zz-tx-q1', 'zz-org-q');
  PERFORM public.fuel_photo_read_enqueue('zz-tx-q2', 'zz-org-q');
  -- enqueue twice = one row
  PERFORM public.fuel_photo_read_enqueue('zz-tx-q1', 'zz-org-q');
  SELECT count(*) INTO n FROM fleet.fuel_photo_read_queue WHERE transaction_id LIKE 'zz-tx-q%';
  INSERT INTO _q_checks VALUES ('enqueue_twice_one_row', n = 2);

  -- claim takes both, counts the try, pushes them 15 minutes ahead
  SELECT count(*) INTO n FROM public.fuel_photo_read_claim(5) c WHERE c.transaction_id LIKE 'zz-tx-q%';
  INSERT INTO _q_checks VALUES ('claim_takes_due', n = 2);
  SELECT attempts INTO a FROM fleet.fuel_photo_read_queue WHERE transaction_id = 'zz-tx-q1';
  INSERT INTO _q_checks VALUES ('claim_counts_try', a = 1);

  -- a second run right away takes nothing (no double reading)
  SELECT count(*) INTO n FROM public.fuel_photo_read_claim(5) c WHERE c.transaction_id LIKE 'zz-tx-q%';
  INSERT INTO _q_checks VALUES ('claimed_not_taken_again', n = 0);

  -- finish with an outcome closes it; null outcome sets the next try
  PERFORM public.fuel_photo_read_finish('zz-tx-q1', 'read', NULL, NULL);
  PERFORM public.fuel_photo_read_finish('zz-tx-q2', NULL, 'photo 404', now() - interval '1 minute');
  SELECT * INTO r FROM fleet.fuel_photo_read_queue WHERE transaction_id = 'zz-tx-q1';
  INSERT INTO _q_checks VALUES ('finish_read_closes', r.done_at IS NOT NULL AND r.outcome = 'read');
  SELECT * INTO r FROM fleet.fuel_photo_read_queue WHERE transaction_id = 'zz-tx-q2';
  INSERT INTO _q_checks VALUES ('finish_retry_keeps_open', r.done_at IS NULL AND r.last_error = 'photo 404');
  SELECT count(*) INTO n FROM public.fuel_photo_read_claim(5) c WHERE c.transaction_id = 'zz-tx-q2';
  INSERT INTO _q_checks VALUES ('retry_due_again', n = 1);

  -- re-enqueue (driver sent a new pump photo) reopens a closed fill with a fresh count
  PERFORM public.fuel_photo_read_enqueue('zz-tx-q1', NULL);
  SELECT * INTO r FROM fleet.fuel_photo_read_queue WHERE transaction_id = 'zz-tx-q1';
  INSERT INTO _q_checks VALUES ('reenqueue_reopens', r.done_at IS NULL AND r.attempts = 0 AND r.outcome IS NULL AND r.organization_id = 'zz-org-q');

  -- limit is capped at 20
  FOR i IN 1..25 LOOP
    PERFORM public.fuel_photo_read_enqueue('zz-tx-cap-' || i, 'zz-org-q');
  END LOOP;
  SELECT count(*) INTO n FROM public.fuel_photo_read_claim(500);
  INSERT INTO _q_checks VALUES ('claim_capped_at_20', n = 20);
END $$;

DO $$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    UPDATE fleet.fuel_photo_read_queue SET outcome = 'maybe' WHERE transaction_id = 'zz-tx-q1';
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  INSERT INTO _q_checks VALUES ('bad_outcome_rejected', rejected);
END $$;

SELECT check_name, ok FROM _q_checks ORDER BY check_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _q_checks WHERE NOT ok) THEN
    RAISE EXCEPTION 'fuel_photo_read_queue_checks failed: %',
      (SELECT string_agg(check_name, ', ' ORDER BY check_name) FROM _q_checks WHERE NOT ok);
  END IF;
END $$;

ROLLBACK;

-- Fuel log offline-first, Data layer D1/D2 checks (docs/fuel-log-offline-first-audit.md).
-- Local test copy only. Made-up ids that can never match real records. Each row: check_name, ok.
BEGIN;

CREATE TEMP TABLE _outbox_checks (
  check_name text PRIMARY KEY,
  ok boolean NOT NULL
);

-- D1: table exists with RLS on
INSERT INTO _outbox_checks VALUES ('table_exists_rls', EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'fleet' AND tablename = 'driver_phone_outbox' AND rowsecurity
));

-- Server-only: no anon / authenticated rights on table, view or report function
INSERT INTO _outbox_checks VALUES ('no_anon_authenticated_table_view_grants', NOT EXISTS (
  SELECT 1 FROM information_schema.role_table_grants g
  WHERE g.grantee IN ('anon', 'authenticated', 'PUBLIC')
    AND ((g.table_schema = 'fleet' AND g.table_name = 'driver_phone_outbox')
      OR (g.table_schema = 'public' AND g.table_name = 'fleet_driver_phone_outbox'))
));

INSERT INTO _outbox_checks VALUES ('report_fn_not_callable_by_anon_authenticated',
  NOT has_function_privilege('anon',
    'public.driver_phone_outbox_report(text, text, text, text, int, timestamptz, text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'public.driver_phone_outbox_report(text, text, text, text, int, timestamptz, text)', 'EXECUTE')
  AND has_function_privilege('service_role',
    'public.driver_phone_outbox_report(text, text, text, text, int, timestamptz, text)', 'EXECUTE')
);

INSERT INTO _outbox_checks VALUES ('service_role_can_read_view',
  has_table_privilege('service_role', 'public.fleet_driver_phone_outbox', 'SELECT')
);

-- D2: the public view carries every table column (explicit-column rule)
INSERT INTO _outbox_checks VALUES ('view_has_every_table_column', NOT EXISTS (
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'fleet' AND table_name = 'driver_phone_outbox'
  EXCEPT
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'fleet_driver_phone_outbox'
));

INSERT INTO _outbox_checks VALUES ('view_is_security_invoker', EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'fleet_driver_phone_outbox'
    AND 'security_invoker=true' = ANY (c.reloptions)
));

-- Behaviour of the report (S1 shape)
DO $$
DECLARE
  r public.fleet_driver_phone_outbox;
  r2 public.fleet_driver_phone_outbox;
  n int;
  bad_rejected boolean := false;
  empty_driver_rejected boolean := false;
BEGIN
  -- first report: 2 waiting since 7:03
  r := public.driver_phone_outbox_report(
    'zz-test-org-outbox', 'zz-test-driver-outbox', 'zz-test-device-0001', '1.0.30',
    2, '2026-11-25 12:03:00+00', 'no signal');
  INSERT INTO _outbox_checks VALUES
    ('first_report_stores_count', r.pending_count = 2),
    ('first_report_stores_oldest', r.oldest_pending_at = '2026-11-25 12:03:00+00'),
    ('first_report_stores_version', r.app_version = '1.0.30');

  -- second report from the same phone updates the same row
  r2 := public.driver_phone_outbox_report(
    'zz-test-org-outbox', 'zz-test-driver-outbox', 'zz-test-device-0001', NULL,
    1, '2026-11-25 12:30:00+00', 'timed out');
  SELECT count(*) INTO n FROM fleet.driver_phone_outbox
  WHERE driver_id = 'zz-test-driver-outbox' AND device_id = 'zz-test-device-0001';
  INSERT INTO _outbox_checks VALUES
    ('same_phone_one_row', n = 1 AND r2.id = r.id),
    ('second_report_updates_count', r2.pending_count = 1),
    ('missing_version_keeps_old_one', r2.app_version = '1.0.30');

  -- all sent: count 0 clears oldest time and last error
  r2 := public.driver_phone_outbox_report(
    'zz-test-org-outbox', 'zz-test-driver-outbox', 'zz-test-device-0001', '1.0.30',
    0, '2026-11-25 12:30:00+00', 'old error');
  INSERT INTO _outbox_checks VALUES
    ('zero_count_clears_oldest', r2.pending_count = 0 AND r2.oldest_pending_at IS NULL),
    ('zero_count_clears_error', r2.last_error IS NULL);

  -- negative count is stored as 0
  r2 := public.driver_phone_outbox_report(
    'zz-test-org-outbox', 'zz-test-driver-outbox', 'zz-test-device-0001', '1.0.30', -3, NULL, NULL);
  INSERT INTO _outbox_checks VALUES ('negative_count_stored_as_zero', r2.pending_count = 0);

  -- a waiting count with no time gets a time (never shown as "since nothing")
  r2 := public.driver_phone_outbox_report(
    'zz-test-org-outbox', 'zz-test-driver-outbox', 'zz-test-device-0001', '1.0.30', 1, NULL, NULL);
  INSERT INTO _outbox_checks VALUES ('count_without_time_gets_time', r2.oldest_pending_at IS NOT NULL);

  -- second phone for the same driver is its own row
  PERFORM public.driver_phone_outbox_report(
    'zz-test-org-outbox', 'zz-test-driver-outbox', 'zz-test-device-0002', '1.0.30', 3,
    '2026-11-24 02:15:00+00', NULL);
  SELECT count(*) INTO n FROM fleet.driver_phone_outbox WHERE driver_id = 'zz-test-driver-outbox';
  INSERT INTO _outbox_checks VALUES ('two_phones_two_rows', n = 2);

  -- the table itself refuses a count without a time
  BEGIN
    INSERT INTO fleet.driver_phone_outbox (organization_id, driver_id, device_id, pending_count, oldest_pending_at)
    VALUES ('zz-test-org-outbox', 'zz-test-driver-outbox', 'zz-test-device-0003', 2, NULL);
  EXCEPTION WHEN check_violation THEN
    bad_rejected := true;
  END;
  INSERT INTO _outbox_checks VALUES ('table_rejects_count_without_time', bad_rejected);

  -- report needs a driver
  BEGIN
    PERFORM public.driver_phone_outbox_report(
      'zz-test-org-outbox', '  ', 'zz-test-device-0004', '1.0.30', 1, now(), NULL);
  EXCEPTION WHEN invalid_parameter_value THEN
    empty_driver_rejected := true;
  END;
  INSERT INTO _outbox_checks VALUES ('report_needs_driver', empty_driver_rejected);
END $$;

-- The Fleet card's read: waiting phones for one company, oldest first
INSERT INTO _outbox_checks VALUES ('org_waiting_read_oldest_first', (
  SELECT array_agg(device_id ORDER BY oldest_pending_at) = ARRAY['zz-test-device-0002', 'zz-test-device-0001']
  FROM public.fleet_driver_phone_outbox
  WHERE organization_id = 'zz-test-org-outbox' AND pending_count > 0
));

SELECT check_name, ok FROM _outbox_checks ORDER BY check_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _outbox_checks WHERE NOT ok) THEN
    RAISE EXCEPTION 'driver_phone_outbox_checks failed: %',
      (SELECT string_agg(check_name, ', ' ORDER BY check_name) FROM _outbox_checks WHERE NOT ok);
  END IF;
END $$;

ROLLBACK;

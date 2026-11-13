-- Toll v2 P2-R4b: take-backs and corrections (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
VALUES ('f0411111-1111-4111-8111-111111111111'::uuid, 'toll-fc-owner@example.com')
ON CONFLICT DO NOTHING;

INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES (
  'f4111111-1111-4111-8111-111111111101',
  'f0411111-1111-4111-8111-111111111111',
  'Toll Fact Corrections',
  'toll-fc',
  'fleet',
  'active'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO toll.switch_state (organization_id, tolls_v2)
VALUES ('f4111111-1111-4111-8111-111111111101', true)
ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = EXCLUDED.tolls_v2;

SELECT toll_system.ensure_accounts('f4111111-1111-4111-8111-111111111101');

CREATE OR REPLACE FUNCTION pg_temp._fc_as(p_user uuid, p_org uuid) RETURNS void
LANGUAGE plpgsql AS $a$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user::text, 'role', 'authenticated',
    'app_metadata', json_build_object('organizationId', p_org::text)
  )::text, true);
  SET LOCAL ROLE authenticated;
END;
$a$;

CREATE OR REPLACE FUNCTION pg_temp._fc_cmd(p_intent text, p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $c$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp._fc_as(
    current_setting('fc.test_user', true)::uuid,
    current_setting('fc.test_org', true)::uuid
  );
  r := public.toll_v2_command(p_intent, p_body);
  RESET ROLE;
  RETURN r;
END;
$c$;

CREATE OR REPLACE FUNCTION pg_temp._fc_refused(p_intent text, p_body jsonb, p_code text) RETURNS void
LANGUAGE plpgsql AS $r$
DECLARE m text;
BEGIN
  BEGIN
    PERFORM pg_temp._fc_cmd(p_intent, p_body);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
    RESET ROLE;
    IF m IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 'fc expected % got %', p_code, m;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'fc expected % but command succeeded', p_code;
END;
$r$;

CREATE OR REPLACE FUNCTION pg_temp._fc_ch(p_org uuid, p_ref text) RETURNS toll.charges
LANGUAGE sql AS $ch$
  SELECT * FROM toll.charges WHERE organization_id = p_org AND source_ref = p_ref;
$ch$;

CREATE OR REPLACE FUNCTION pg_temp._fc_pb(p_org uuid, p_ref text) RETURNS toll.paybacks
LANGUAGE sql AS $pb$
  SELECT * FROM toll.paybacks WHERE organization_id = p_org AND reference = p_ref;
$pb$;

CREATE OR REPLACE FUNCTION pg_temp._fc_slices(p_org uuid, p_ref text) RETURNS text
LANGUAGE sql AS $s$
  SELECT coalesce(string_agg(a.bearer || '=' || a.amount_minor, ' ' ORDER BY a.bearer, a.amount_minor), '-')
  FROM toll.allocations a
  JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
  WHERE c.organization_id = p_org AND c.source_ref = p_ref AND a.reversed_by IS NULL;
$s$;

CREATE OR REPLACE FUNCTION pg_temp._fc_nightly(p_org uuid, p_label text) RETURNS void
LANGUAGE plpgsql AS $n$
DECLARE x record;
BEGIN
  RESET ROLE;
  FOR x IN SELECT * FROM toll_system.nightly_checks(p_org) LOOP
    IF NOT x.ok THEN
      RAISE EXCEPTION '% nightly % % failed: %', p_label, x.check_no, x.name, x.detail;
    END IF;
  END LOOP;
END;
$n$;

CREATE OR REPLACE FUNCTION pg_temp._fc_check3_week(p_org uuid, p_week date) RETURNS void
LANGUAGE plpgsql AS $c3$
DECLARE x record;
BEGIN
  RESET ROLE;
  SELECT * INTO x FROM toll_system.nightly_checks(p_org) c
  WHERE c.check_no = 3 AND c.name = 'week_flow:' || p_week::text;
  IF NOT FOUND OR NOT x.ok THEN
    RAISE EXCEPTION 'check3 week % failed: %', p_week, x.detail;
  END IF;
END;
$c3$;

-- Pre-R4b check-3 payback_unallocated expected for one week (v_active_paybacks only).
CREATE OR REPLACE FUNCTION pg_temp._fc_unalloc_old(p_org uuid, p_week date) RETURNS bigint
LANGUAGE sql AS $o$
  SELECT coalesce(sum(p.amount_minor - p.allocated_minor), 0)
  FROM toll.v_active_paybacks p
  WHERE p.organization_id = p_org AND p.week_key = p_week;
$o$;

-- Ledger P4/P5/P6 flow for payback legs counted in that week.
CREATE OR REPLACE FUNCTION pg_temp._fc_unalloc_flow(p_org uuid, p_week date) RETURNS bigint
LANGUAGE sql AS $f$
  WITH legs AS (
    SELECT CASE WHEN (e.metadata ->> 'reverse')::boolean THEN -e.amount_minor ELSE e.amount_minor END AS amt,
           e.metadata ->> 'toll_rule' AS rule,
           coalesce((e.metadata ->> 'reversing_payback_id')::uuid, (e.metadata ->> 'payback_id')::uuid) AS payback_id
    FROM ledger.entries e
    WHERE e.organization_id = p_org AND e.reference_type = 'toll'
  ),
  pl AS (
    SELECT l.*, p.week_key AS wk FROM legs l
    JOIN toll.paybacks p ON p.organization_id = p_org AND p.id = l.payback_id
  )
  SELECT coalesce(sum(CASE WHEN rule ~ '^(P4_|P5_)' THEN amt WHEN rule ~ '^P6_' THEN -amt ELSE 0 END), 0)
  FROM pl WHERE pl.wk = p_week;
$f$;

CREATE OR REPLACE FUNCTION pg_temp._fc_assert_i4_charge(p_org uuid, p_ch uuid) RETURNS void
LANGUAGE plpgsql AS $i4c$
DECLARE v_amt bigint; v_alloc bigint;
BEGIN
  SELECT amount_minor INTO v_amt FROM toll.charges WHERE organization_id = p_org AND id = p_ch;
  SELECT coalesce(sum(amount_minor), 0) INTO v_alloc FROM toll.allocations
  WHERE organization_id = p_org AND charge_id = p_ch AND reversed_by IS NULL;
  IF v_alloc > v_amt THEN RAISE EXCEPTION 'I4 charge % alloc % > amt %', p_ch, v_alloc, v_amt; END IF;
END;
$i4c$;

CREATE OR REPLACE FUNCTION pg_temp._fc_assert_i4_pb(p_org uuid, p_pb uuid) RETURNS void
LANGUAGE plpgsql AS $i4p$
DECLARE v_amt bigint; v_used bigint;
BEGIN
  SELECT amount_minor INTO v_amt FROM toll.paybacks WHERE organization_id = p_org AND id = p_pb;
  SELECT coalesce(sum(a.amount_minor), 0) + coalesce((
    SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
    WHERE u.organization_id = p_org AND u.payback_id = p_pb AND u.reversed_by IS NULL), 0)
  INTO v_used
  FROM toll.allocations a
  WHERE a.organization_id = p_org AND a.payback_id = p_pb AND a.reversed_by IS NULL;
  IF v_used > v_amt THEN RAISE EXCEPTION 'I4 payback % used % > amt %', p_pb, v_used, v_amt; END IF;
END;
$i4p$;

DO $$
DECLARE
  v_owner uuid := 'f0411111-1111-4111-8111-111111111111';
  v_org   uuid := 'f4111111-1111-4111-8111-111111111101';
  v_w     date := '2024-10-07';
  v_w1    date := '2024-10-14';
  r       jsonb;
  v_j     jsonb;
  c       toll.charges;
  p       toll.paybacks;
  v_rev   uuid;
  v_cnt   int;
  v_flow  bigint;
  v_old   bigint;
  v_ids   uuid[];
  v_msg   text;
BEGIN
  PERFORM set_config('fc.test_user', v_owner::text, true);
  PERFORM set_config('fc.test_org', v_org::text, true);

  PERFORM public.toll_sys_import(v_org, 'uber', '[
    {"row_type":"trip","platform_trip_id":"t1","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-08T14:00:00-05:00","dropoff_at":"2024-10-08T14:50:00-05:00","payment_method":"card","toll_payback_minor":50000},
    {"row_type":"trip","platform_trip_id":"t2","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-09T14:00:00-05:00","dropoff_at":"2024-10-09T14:50:00-05:00","payment_method":"card","toll_payback_minor":50000},
    {"row_type":"trip","platform_trip_id":"t3","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-10T14:00:00-05:00","dropoff_at":"2024-10-10T14:50:00-05:00","payment_method":"cash","toll_payback_minor":20000},
    {"row_type":"trip","platform_trip_id":"t4","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-08T11:00:00-05:00","dropoff_at":"2024-10-08T11:40:00-05:00","payment_method":"card","toll_payback_minor":34000},
    {"row_type":"trip","platform_trip_id":"t6","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-08T16:00:00-05:00","dropoff_at":"2024-10-08T16:40:00-05:00","payment_method":"card","toll_payback_minor":50000},
    {"row_type":"trip","platform_trip_id":"t7","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-08T12:00:00-05:00","dropoff_at":"2024-10-08T12:50:00-05:00","payment_method":"card","toll_payback_minor":70000},
    {"row_type":"trip","platform_trip_id":"t8","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-09T11:00:00-05:00","dropoff_at":"2024-10-09T11:40:00-05:00","payment_method":"card","toll_payback_minor":50000},
    {"row_type":"trip","platform_trip_id":"t9","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-09T16:00:00-05:00","dropoff_at":"2024-10-09T16:40:00-05:00","payment_method":"card","toll_payback_minor":34000}
  ]'::jsonb, 'fc-imp-uber', 'smoke');
  PERFORM public.toll_sys_import(v_org, 'tag_statement', '[
    {"source_ref":"c1","occurred_at":"2024-10-08T14:20:00-05:00","amount_minor":34000,"plaza_id":"pzA","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c2","occurred_at":"2024-10-09T14:20:00-05:00","amount_minor":34000,"plaza_id":"pzB","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c3","occurred_at":"2024-10-10T14:20:00-05:00","amount_minor":50000,"plaza_id":"pzC","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c4","occurred_at":"2024-10-11T09:00:00-05:00","amount_minor":50000,"plaza_id":"pzD","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"fc-full","occurred_at":"2024-10-08T11:30:00-05:00","amount_minor":34000,"plaza_id":"pzA","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"fc-du1","occurred_at":"2024-10-08T12:10:00-05:00","amount_minor":34000,"plaza_id":"pzB","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"fc-du2","occurred_at":"2024-10-08T12:30:00-05:00","amount_minor":36000,"plaza_id":"pzC","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"fc-nolv","occurred_at":"2024-10-09T11:30:00-05:00","amount_minor":34000,"plaza_id":"pzD","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"fc-pend","occurred_at":"2024-10-08T15:00:00-05:00","amount_minor":10000,"plaza_id":"pzA","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"fc-2pb","occurred_at":"2024-10-09T10:00:00-05:00","amount_minor":50000,"plaza_id":"pzE","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'fc-imp-tag', 'smoke');
  PERFORM public.toll_sys_import(v_org, 'driver_cash', '[
    {"source_ref":"fc-unver","occurred_at":"2024-10-08T08:00:00-05:00","amount_minor":15000,"plaza_id":"pzU","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"u"}},
    {"source_ref":"fc-cash","occurred_at":"2024-10-09T09:00:00-05:00","amount_minor":20000,"plaza_id":"pzV","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"v"}}
  ]'::jsonb, 'fc-imp-cash', 'smoke');

  -- C3 proportional down (before other mutations touch c4)
  c := pg_temp._fc_ch(v_org, 'c4');
  r := pg_temp._fc_cmd('driver_pays', jsonb_build_object(
    'command_id', 'fc-s6-d1', 'charge_id', c.id, 'expected_charge_version', c.version, 'amount_minor', 30000));
  c := pg_temp._fc_ch(v_org, 'c4');
  r := pg_temp._fc_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'fc-s6-d2', 'charge_id', c.id,
    'expected_charge_version', (r->>'charge_version')::bigint));
  c := pg_temp._fc_ch(v_org, 'c4');
  r := pg_temp._fc_cmd('correct_charge_amount', jsonb_build_object(
    'command_id', 'fc-s6-dn', 'charge_id', c.id,
    'expected_charge_version', (pg_temp._fc_ch(v_org, 'c4')).version,
    'amount_minor', 30000, 'reason_code', 'statement_fix'));
  IF pg_temp._fc_slices(v_org, 'c4') <> 'driver=18000 fleet=12000' THEN
    RAISE EXCEPTION '6b driver+fleet split %', pg_temp._fc_slices(v_org, 'c4');
  END IF;

  -- ── 1. reverse_payback same week ──
  -- (a) fully allocated
  c := pg_temp._fc_ch(v_org, 'fc-full');
  p := pg_temp._fc_pb(v_org, 'trip:t4');
  r := pg_temp._fc_cmd('link_payback', jsonb_build_object(
    'command_id', 'fc-s1a', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  p := pg_temp._fc_pb(v_org, 'trip:t4');
  r := pg_temp._fc_cmd('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s1a-r', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'tb-s1a', 'paid_on', '2024-10-08'));
  SELECT id INTO v_rev FROM toll.paybacks WHERE organization_id = v_org AND reference = 'tb-s1a';
  IF v_rev IS NULL THEN RAISE EXCEPTION '1a missing reversing payback'; END IF;
  IF toll_system.charge_state(v_org, c.id) <> 'pending' THEN RAISE EXCEPTION '1a charge pending'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.allocations a
    WHERE a.organization_id = v_org AND a.charge_id = c.id AND a.reversed_by = v_rev
  ) THEN RAISE EXCEPTION '1a reversed_by reversing pb'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ledger.entries e
    WHERE e.organization_id = v_org AND e.metadata ->> 'toll_rule' = 'P4_payback_fleet'
      AND e.metadata ->> 'reversing_payback_id' = v_rev::text AND (e.metadata ->> 'reverse')::boolean
  ) THEN RAISE EXCEPTION '1a P4 reverse'; END IF;

  -- (b) part allocated + unlinked leftover
  c := pg_temp._fc_ch(v_org, 'c1');
  p := pg_temp._fc_pb(v_org, 'trip:t6');
  PERFORM pg_temp._fc_cmd('link_payback', jsonb_build_object(
    'command_id', 'fc-s1b', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  p := pg_temp._fc_pb(v_org, 'trip:t6');
  PERFORM pg_temp._fc_cmd('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'fc-s1b-u', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'excess'));
  p := pg_temp._fc_pb(v_org, 'trip:t6');
  r := pg_temp._fc_cmd('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s1b-r', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'tb-s1b', 'paid_on', '2024-10-09'));
  IF NOT EXISTS (
    SELECT 1 FROM toll.payback_unlinked_decisions u
    WHERE u.organization_id = v_org AND u.payback_id = p.id AND u.reversed_by = (
      SELECT id FROM toll.paybacks WHERE organization_id = v_org AND reference = 'tb-s1b')
  ) THEN RAISE EXCEPTION '1b unlinked reversed'; END IF;

  -- (c) two charges one payback
  c := pg_temp._fc_ch(v_org, 'fc-du1');
  p := pg_temp._fc_pb(v_org, 'trip:t7');
  PERFORM pg_temp._fc_cmd('link_payback', jsonb_build_object(
    'command_id', 'fc-s1c1', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  p := pg_temp._fc_pb(v_org, 'trip:t7');
  c := pg_temp._fc_ch(v_org, 'fc-du2');
  PERFORM pg_temp._fc_cmd('link_payback', jsonb_build_object(
    'command_id', 'fc-s1c2', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  p := pg_temp._fc_pb(v_org, 'trip:t7');
  r := pg_temp._fc_cmd('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s1c-r', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'tb-s1c', 'paid_on', '2024-10-10'));
  IF toll_system.charge_state(v_org, (pg_temp._fc_ch(v_org, 'fc-du1')).id) <> 'pending'
     OR toll_system.charge_state(v_org, (pg_temp._fc_ch(v_org, 'fc-du2')).id) <> 'pending' THEN
    RAISE EXCEPTION '1c both charges pending';
  END IF;

  v_j := toll_system.week_result(v_org, v_w);
  IF coalesce((v_j -> 'paybacks' ->> 'takenBackMinor')::bigint, 0) < 134000 THEN
    RAISE EXCEPTION '1 takenBackMinor low %', v_j -> 'paybacks' ->> 'takenBackMinor';
  END IF;
  PERFORM pg_temp._fc_nightly(v_org, 's1');

  -- ── 2. cross-week take-back (PB4) ──
  c := pg_temp._fc_ch(v_org, 'c2');
  p := pg_temp._fc_pb(v_org, 'trip:t2');
  PERFORM pg_temp._fc_cmd('link_payback', jsonb_build_object(
    'command_id', 'fc-s2a', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  p := pg_temp._fc_pb(v_org, 'trip:t2');
  IF toll_system.payback_open_minor(v_org, p.id) <> 16000 THEN
    RAISE EXCEPTION '2 t2 leftover before take-back %', toll_system.payback_open_minor(v_org, p.id);
  END IF;
  r := pg_temp._fc_cmd('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s2a-r', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'tb-s2a', 'paid_on', '2024-10-16'));
  v_j := toll_system.week_result(v_org, v_w1);
  IF (v_j -> 'paybacks' ->> 'takenBackMinor')::bigint <> 50000 THEN
    RAISE EXCEPTION '2 takenBack W+1 got %', v_j -> 'paybacks' ->> 'takenBackMinor';
  END IF;
  v_flow := pg_temp._fc_unalloc_flow(v_org, v_w);
  v_old := pg_temp._fc_unalloc_old(v_org, v_w);
  IF v_flow = v_old THEN RAISE EXCEPTION '2 PB4: old formula should disagree with flow on W'; END IF;
  PERFORM pg_temp._fc_check3_week(v_org, v_w);
  PERFORM pg_temp._fc_check3_week(v_org, v_w1);

  c := pg_temp._fc_ch(v_org, 'fc-nolv');
  p := pg_temp._fc_pb(v_org, 'trip:t9');
  PERFORM pg_temp._fc_cmd('link_payback', jsonb_build_object(
    'command_id', 'fc-s2b', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  p := pg_temp._fc_pb(v_org, 'trip:t9');
  PERFORM pg_temp._fc_cmd('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s2b-r', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'tb-s2b', 'paid_on', '2024-10-17'));
  PERFORM pg_temp._fc_nightly(v_org, 's2');

  -- ── 3. reverse_payback refusals ──
  PERFORM public.toll_sys_import(v_org, 'uber', '[
    {"row_type":"trip","platform_trip_id":"t-ref","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-08T17:00:00-05:00","dropoff_at":"2024-10-08T17:40:00-05:00","payment_method":"card","toll_payback_minor":10000}
  ]'::jsonb, 'fc-ref-uber', 'smoke');
  PERFORM public.toll_sys_import(v_org, 'tag_statement', '[
    {"source_ref":"fc-ref-c","occurred_at":"2024-10-08T17:10:00-05:00","amount_minor":10000,"plaza_id":"pzR","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'fc-ref-tag', 'smoke');
  c := pg_temp._fc_ch(v_org, 'fc-ref-c');
  p := pg_temp._fc_pb(v_org, 'trip:t-ref');
  r := pg_temp._fc_cmd('link_payback', jsonb_build_object(
    'command_id', 'fc-s3-pre', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  p := pg_temp._fc_pb(v_org, 'trip:t-ref');
  PERFORM pg_temp._fc_refused('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s3-part', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'tb-s3p', 'paid_on', '2024-10-09', 'amount_minor', 5000), 'PARTIAL_TAKE_BACK');
  PERFORM pg_temp._fc_refused('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s3-bad', 'payback_id', p.id, 'expected_payback_version', p.version), 'BAD_REQUEST');
  p := pg_temp._fc_pb(v_org, 'trip:t-ref');
  r := pg_temp._fc_cmd('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s3-r', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'tb-s3r', 'paid_on', '2024-10-09'));
  p := pg_temp._fc_pb(v_org, 'trip:t-ref');
  PERFORM pg_temp._fc_refused('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s3-dupref', 'payback_id', p.id,
    'expected_payback_version', (pg_temp._fc_pb(v_org, 'trip:t-ref')).version,
    'reference', 'tb-s3r', 'paid_on', '2024-10-10'), 'WRONG_STATE');
  p := pg_temp._fc_pb(v_org, 'trip:t-ref');
  PERFORM pg_temp._fc_refused('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s3-rev', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'tb-s3x', 'paid_on', '2024-10-10'), 'WRONG_STATE');
  SELECT id INTO v_rev FROM toll.paybacks WHERE organization_id = v_org AND reference = 'tb-s3r';
  PERFORM pg_temp._fc_refused('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s3-rev2', 'payback_id', v_rev,
    'expected_payback_version', (SELECT version FROM toll.paybacks WHERE id = v_rev),
    'reference', 'tb-s3y', 'paid_on', '2024-10-10'), 'WRONG_STATE');
  PERFORM pg_temp._fc_refused('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s3-stale', 'payback_id', p.id, 'expected_payback_version', p.version - 1,
    'reference', 'tb-s3z', 'paid_on', '2024-10-10'), 'VERSION_CHANGED');

  RESET ROLE;
  PERFORM toll_system.native_ride_charge(v_org, jsonb_build_object(
    'ride_id', 'fc-ride-nat', 'payment_method', 'card', 'driver_id', 'd1', 'vehicle_id', 'v1',
    'ended_at', '2024-10-08T18:00:00-05:00', 'estimated_tolls_minor', 800,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', 'nat1', 'plaza_id', 'pzN', 'amount_minor', 800,
      'crossed_at', '2024-10-08T18:00:00-05:00', 'paid_by', 'tag'))));
  SELECT * INTO p FROM toll.paybacks
  WHERE organization_id = v_org AND reference = 'roam:fc-ride-nat';
  IF p.kind <> 'native' THEN RAISE EXCEPTION 's3 native payback missing'; END IF;
  PERFORM set_config('fc.test_user', v_owner::text, true);
  PERFORM pg_temp._fc_refused('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s3-nat', 'payback_id', p.id,
    'expected_payback_version', (SELECT version FROM toll.paybacks WHERE id = p.id),
    'reference', 'tb-nat', 'paid_on', '2024-10-09'), 'WRONG_STATE');

  PERFORM public.toll_sys_import(v_org, 'uber', '[
    {"row_type":"trip","platform_trip_id":"t-seal","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-15T19:00:00-05:00","dropoff_at":"2024-10-15T19:40:00-05:00","payment_method":"card","toll_payback_minor":7000}
  ]'::jsonb, 'fc-seal-uber', 'smoke');
  PERFORM public.toll_sys_import(v_org, 'tag_statement', '[
    {"source_ref":"fc-seal-c","occurred_at":"2024-10-15T19:10:00-05:00","amount_minor":7000,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'fc-seal-tag', 'smoke');
  c := pg_temp._fc_ch(v_org, 'fc-seal-c');
  p := pg_temp._fc_pb(v_org, 'trip:t-seal');
  PERFORM pg_temp._fc_cmd('link_payback', jsonb_build_object(
    'command_id', 'fc-s3-seal-l', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  r := pg_temp._fc_cmd('seal_week', jsonb_build_object(
    'command_id', 'fc-s3-seal', 'week_key', v_w1,
    'expected_week_version', toll_system.week_version(v_org, v_w1)));
  p := pg_temp._fc_pb(v_org, 'trip:t-seal');
  PERFORM pg_temp._fc_refused('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s3-sealed', 'payback_id', p.id,
    'expected_payback_version', (pg_temp._fc_pb(v_org, 'trip:t-seal')).version,
    'reference', 'tb-seal', 'paid_on', '2024-10-18'), 'WEEK_SEALED');
  PERFORM pg_temp._fc_cmd('reopen_week', jsonb_build_object(
    'command_id', 'fc-s3-reopen', 'week_key', v_w1,
    'expected_week_version', (r->'weeks'->0->>'week_version')::bigint, 'reason', 'fc test'));
  PERFORM pg_temp._fc_nightly(v_org, 's3');

  -- ── 4. after take-back ──
  p := pg_temp._fc_pb(v_org, 'trip:t6');
  PERFORM pg_temp._fc_refused('link_payback', jsonb_build_object(
    'command_id', 'fc-s4-l', 'charge_id', (pg_temp._fc_ch(v_org, 'c1')).id, 'payback_id', p.id,
    'expected_charge_version', (pg_temp._fc_ch(v_org, 'c1')).version,
    'expected_payback_version', (pg_temp._fc_pb(v_org, 'trip:t6')).version), 'WRONG_STATE');
  SELECT id INTO v_rev FROM toll.paybacks WHERE organization_id = v_org AND reference = 'tb-s1b';
  PERFORM pg_temp._fc_refused('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'fc-s4-u', 'payback_id', v_rev,
    'expected_payback_version', (SELECT version FROM toll.paybacks WHERE id = v_rev),
    'reason_code', 'nope'), 'WRONG_STATE');
  c := pg_temp._fc_ch(v_org, 'c1');
  PERFORM pg_temp._fc_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'fc-s4-decide', 'charge_id', c.id, 'expected_charge_version', c.version));
  PERFORM pg_temp._fc_nightly(v_org, 's4');

  -- ── 5. correct_charge_amount up ──
  c := pg_temp._fc_ch(v_org, 'fc-pend');
  r := pg_temp._fc_cmd('correct_charge_amount', jsonb_build_object(
    'command_id', 'fc-s5-tag', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 12000, 'reason_code', 'fix'));
  IF toll_system.rule_net(v_org, 'P16_up_tag', 'charge_id', c.id::text) <> 2000 THEN
    RAISE EXCEPTION '5 P16_up_tag'; END IF;
  c := pg_temp._fc_ch(v_org, 'fc-cash');
  PERFORM pg_temp._fc_cmd('verify_cash_receipt', jsonb_build_object(
    'command_id', 'fc-s5-ver', 'charge_id', c.id, 'expected_charge_version', c.version));
  c := pg_temp._fc_ch(v_org, 'fc-cash');
  r := pg_temp._fc_cmd('correct_charge_amount', jsonb_build_object(
    'command_id', 'fc-s5-cash', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 21000, 'reason_code', 'fix'));
  IF toll_system.rule_net(v_org, 'P16_up_cash', 'charge_id', c.id::text) <> 1000 THEN
    RAISE EXCEPTION '5 P16_up_cash'; END IF;
  c := pg_temp._fc_ch(v_org, 'fc-unver');
  r := pg_temp._fc_cmd('correct_charge_amount', jsonb_build_object(
    'command_id', 'fc-s5-unver', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 16000, 'reason_code', 'fix'));
  IF toll_system.rule_net(v_org, 'P16_%', 'charge_id', c.id::text) <> 0 THEN
    RAISE EXCEPTION '5 unverified must not post P16'; END IF;
  PERFORM pg_temp._fc_nightly(v_org, 's5');

  c := pg_temp._fc_ch(v_org, 'fc-unver');
  PERFORM pg_temp._fc_cmd('correct_charge_week', jsonb_build_object(
    'command_id', 'fc-s8-unver', 'charge_id', c.id, 'expected_charge_version', c.version,
    'occurred_at', '2024-10-16T10:00:00-05:00', 'reason_code', 'wrong_date'));

  -- ── 6. correct_charge_amount down ──
  RESET ROLE;
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org, '2024-10-09 10:00:00+00', v_w, 'exact', 50000,
    'tag', 'manual', 'fc-round', 'verified', 'd1'
  );
  PERFORM toll_system.post(v_org, 'P2_tag_crossing', 50000, '2024-10-09 10:00:00+00',
    'fc-round-p2', 1, jsonb_build_object('charge_id', (pg_temp._fc_ch(v_org, 'fc-round')).id::text));
  c := pg_temp._fc_ch(v_org, 'fc-round');
  PERFORM set_config('fc.test_user', v_owner::text, true);
  PERFORM pg_temp._fc_cmd('driver_pays', jsonb_build_object(
    'command_id', 'fc-s6-r1', 'charge_id', c.id, 'expected_charge_version', c.version, 'amount_minor', 20100));
  c := pg_temp._fc_ch(v_org, 'fc-round');
  PERFORM pg_temp._fc_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'fc-s6-r2', 'charge_id', c.id, 'expected_charge_version', c.version));
  c := pg_temp._fc_ch(v_org, 'fc-round');
  PERFORM pg_temp._fc_cmd('correct_charge_amount', jsonb_build_object(
    'command_id', 'fc-s6-r3', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 33000, 'reason_code', 'fix'));
  IF pg_temp._fc_slices(v_org, 'fc-round') NOT LIKE '%driver=%' THEN
    RAISE EXCEPTION '6b rounding case'; END IF;

  c := pg_temp._fc_ch(v_org, 'c3');
  p := pg_temp._fc_pb(v_org, 'trip:t3');
  PERFORM pg_temp._fc_cmd('link_payback', jsonb_build_object(
    'command_id', 'fc-s6-plat', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  c := pg_temp._fc_ch(v_org, 'c3');
  r := pg_temp._fc_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'fc-s6-fleet', 'charge_id', c.id, 'expected_charge_version', c.version));
  c := pg_temp._fc_ch(v_org, 'c3');
  r := pg_temp._fc_cmd('correct_charge_amount', jsonb_build_object(
    'command_id', 'fc-s6-plat-dn', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 25000, 'reason_code', 'statement_fix'));
  IF pg_temp._fc_slices(v_org, 'c3') <> 'fleet=15000 platform=10000'
     OR toll_system.payback_open_minor(v_org, p.id) <> 10000 THEN
    RAISE EXCEPTION '6c platform leftover'; END IF;

  PERFORM public.toll_sys_import(v_org, 'uber', '[
    {"row_type":"trip","platform_trip_id":"t-pb2","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-09T08:00:00-05:00","dropoff_at":"2024-10-09T08:40:00-05:00","payment_method":"card","toll_payback_minor":30000},
    {"row_type":"trip","platform_trip_id":"t-pb1","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-09T08:30:00-05:00","dropoff_at":"2024-10-09T09:10:00-05:00","payment_method":"card","toll_payback_minor":20000}
  ]'::jsonb, 'fc-2pb-uber', 'smoke');
  c := pg_temp._fc_ch(v_org, 'fc-2pb');
  p := pg_temp._fc_pb(v_org, 'trip:t-pb1');
  PERFORM pg_temp._fc_cmd('link_payback', jsonb_build_object(
    'command_id', 'fc-s6-2p1', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  p := pg_temp._fc_pb(v_org, 'trip:t-pb2');
  c := pg_temp._fc_ch(v_org, 'fc-2pb');
  PERFORM pg_temp._fc_cmd('link_payback', jsonb_build_object(
    'command_id', 'fc-s6-2p2', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  SELECT array_agg(id ORDER BY created_at DESC) INTO v_ids FROM toll.allocations
  WHERE organization_id = v_org AND charge_id = c.id AND bearer = 'platform' AND reversed_by IS NULL;
  c := pg_temp._fc_ch(v_org, 'fc-2pb');
  r := pg_temp._fc_cmd('correct_charge_amount', jsonb_build_object(
    'command_id', 'fc-s6-2p-dn', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 42000, 'reason_code', 'fix'));
  IF toll_system.payback_open_minor(v_org, (pg_temp._fc_pb(v_org, 'trip:t-pb2')).id)
       + toll_system.payback_open_minor(v_org, (pg_temp._fc_pb(v_org, 'trip:t-pb1')).id) <> 8000 THEN
    RAISE EXCEPTION '6c platform payback leftover total';
  END IF;

  PERFORM pg_temp._fc_nightly(v_org, 's6');

  -- ── 7. correct_charge_amount refusals ──
  c := pg_temp._fc_ch(v_org, 'fc-round');
  PERFORM pg_temp._fc_refused('correct_charge_amount', jsonb_build_object(
    'command_id', 'fc-s7-noreas', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 32000), 'BAD_REQUEST');
  PERFORM pg_temp._fc_refused('correct_charge_amount', jsonb_build_object(
    'command_id', 'fc-s7-same', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 33000, 'reason_code', 'x'), 'BAD_REQUEST');
  c := pg_temp._fc_ch(v_org, 'fc-unver');
  r := pg_temp._fc_cmd('reject_cash_receipt', jsonb_build_object(
    'command_id', 'fc-s7-rej', 'charge_id', c.id, 'expected_charge_version', c.version,
    'reason_code', 'bad'));
  c := pg_temp._fc_ch(v_org, 'fc-unver');
  PERFORM pg_temp._fc_refused('correct_charge_amount', jsonb_build_object(
    'command_id', 'fc-s7-rej2', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 10000, 'reason_code', 'x'), 'WRONG_STATE');

  FOR c IN SELECT ch.* FROM toll.charges ch
    WHERE ch.organization_id = v_org
      AND toll_system.charge_counted_week(v_org, ch.id, ch.week_key) = v_w
      AND toll_system.charge_state(v_org, ch.id) = 'pending'
      AND ch.evidence_status = 'verified' AND NOT ch.after_seal
  LOOP
    PERFORM pg_temp._fc_cmd('fleet_absorbs', jsonb_build_object(
      'command_id', 'fc-s7-abs-' || c.source_ref, 'charge_id', c.id,
      'expected_charge_version', (pg_temp._fc_ch(v_org, c.source_ref)).version));
  END LOOP;
  FOR p IN SELECT pb.* FROM toll.paybacks pb
    WHERE pb.organization_id = v_org AND pb.week_key = v_w
      AND pb.reversal_of IS NULL AND pb.kind <> 'native'
      AND toll_system.payback_open_minor(v_org, pb.id) > 0
      AND NOT EXISTS (SELECT 1 FROM toll.paybacks r WHERE r.organization_id = v_org AND r.reversal_of = pb.id)
  LOOP
    PERFORM pg_temp._fc_cmd('leave_payback_unlinked', jsonb_build_object(
      'command_id', 'fc-s7-ul-' || p.reference, 'payback_id', p.id,
      'expected_payback_version', (pg_temp._fc_pb(v_org, p.reference)).version,
      'reason_code', 'seal'));
  END LOOP;
  r := pg_temp._fc_cmd('seal_week', jsonb_build_object(
    'command_id', 'fc-s7-seal', 'week_key', v_w,
    'expected_week_version', toll_system.week_version(v_org, v_w)));
  PERFORM pg_temp._fc_refused('correct_charge_amount', jsonb_build_object(
    'command_id', 'fc-s7-ws', 'charge_id', (pg_temp._fc_ch(v_org, 'c4')).id,
    'expected_charge_version', (pg_temp._fc_ch(v_org, 'c4')).version,
    'amount_minor', 29000, 'reason_code', 'x'), 'WEEK_SEALED');
  PERFORM pg_temp._fc_nightly(v_org, 's7');
  PERFORM pg_temp._fc_cmd('reopen_week', jsonb_build_object(
    'command_id', 'fc-s7-reopen', 'week_key', v_w,
    'expected_week_version', (r->'weeks'->0->>'week_version')::bigint,
    'reason', 'fc s7 reopen'));

  -- ── 8. correct_charge_week ──
  c := pg_temp._fc_ch(v_org, 'fc-2pb');
  SELECT array_agg(id ORDER BY created_at) INTO v_ids FROM toll.allocations
  WHERE organization_id = v_org AND charge_id = c.id AND reversed_by IS NULL;
  r := pg_temp._fc_cmd('correct_charge_week', jsonb_build_object(
    'command_id', 'fc-s8-move', 'charge_id', c.id, 'expected_charge_version', c.version,
    'occurred_at', '2024-10-16T09:00:00-05:00', 'reason_code', 'wrong_date'));
  IF NOT EXISTS (
    SELECT 1 FROM toll.allocations a
    WHERE a.organization_id = v_org AND a.charge_id = c.id AND a.reversed_by IS NULL
      AND a.id = ANY (v_ids)
  ) THEN RAISE EXCEPTION '8 slice ids preserved'; END IF;
  PERFORM pg_temp._fc_check3_week(v_org, v_w);
  PERFORM pg_temp._fc_check3_week(v_org, v_w1);
  IF NOT EXISTS (
    SELECT 1 FROM toll.match_queue q
    WHERE q.organization_id = v_org AND q.record_kind = 'charge' AND q.record_id = c.id
  ) THEN RAISE EXCEPTION '8 match queue'; END IF;
  PERFORM pg_temp._fc_refused('correct_charge_week', jsonb_build_object(
    'command_id', 'fc-s8-same', 'charge_id', c.id,
    'expected_charge_version', (pg_temp._fc_ch(v_org, 'fc-2pb')).version,
    'occurred_at', '2024-10-16T09:00:00-05:00', 'reason_code', 'x'), 'BAD_REQUEST');
  PERFORM pg_temp._fc_refused('correct_charge_week', jsonb_build_object(
    'command_id', 'fc-s8-stale', 'charge_id', c.id, 'expected_charge_version', c.version - 1,
    'occurred_at', '2024-10-17T09:00:00-05:00', 'reason_code', 'x'), 'VERSION_CHANGED');
  PERFORM pg_temp._fc_nightly(v_org, 's8');

  -- ── 9. replay ──
  PERFORM public.toll_sys_import(v_org, 'uber', '[
    {"row_type":"trip","platform_trip_id":"t-rep","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-10T11:00:00-05:00","dropoff_at":"2024-10-10T11:40:00-05:00","payment_method":"card","toll_payback_minor":8000}
  ]'::jsonb, 'fc-rep-uber', 'smoke');
  PERFORM public.toll_sys_import(v_org, 'tag_statement', '[
    {"source_ref":"fc-rep","occurred_at":"2024-10-10T11:10:00-05:00","amount_minor":8000,"plaza_id":"pzX","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'fc-rep-tag', 'smoke');
  c := pg_temp._fc_ch(v_org, 'fc-rep');
  p := pg_temp._fc_pb(v_org, 'trip:t-rep');
  PERFORM pg_temp._fc_cmd('link_payback', jsonb_build_object(
    'command_id', 'fc-s9-pre', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  p := pg_temp._fc_pb(v_org, 'trip:t-rep');
  r := pg_temp._fc_cmd('reverse_payback', jsonb_build_object(
    'command_id', 'fc-s9-rev', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'tb-s9', 'paid_on', '2024-10-11'));
  IF (pg_temp._fc_cmd('reverse_payback', jsonb_build_object('command_id', 'fc-s9-rev')) ->> 'replay') <> 'true' THEN
    RAISE EXCEPTION '9 reverse replay'; END IF;
  SELECT count(*) INTO v_cnt FROM toll.paybacks WHERE organization_id = v_org AND reference = 'tb-s9';
  IF v_cnt <> 1 THEN RAISE EXCEPTION '9 reverse replay wrote rows'; END IF;
  c := pg_temp._fc_ch(v_org, 'fc-rep');
  r := pg_temp._fc_cmd('correct_charge_amount', jsonb_build_object(
    'command_id', 'fc-s9-amt', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 7500, 'reason_code', 'fix'));
  IF (pg_temp._fc_cmd('correct_charge_amount', jsonb_build_object('command_id', 'fc-s9-amt')) ->> 'replay') <> 'true' THEN
    RAISE EXCEPTION '9 amount replay'; END IF;
  c := pg_temp._fc_ch(v_org, 'fc-rep');
  r := pg_temp._fc_cmd('correct_charge_week', jsonb_build_object(
    'command_id', 'fc-s9-wk', 'charge_id', c.id, 'expected_charge_version', (r->>'charge_version')::bigint,
    'occurred_at', '2024-10-17T11:00:00-05:00', 'reason_code', 'wk'));
  IF (pg_temp._fc_cmd('correct_charge_week', jsonb_build_object('command_id', 'fc-s9-wk')) ->> 'replay') <> 'true' THEN
    RAISE EXCEPTION '9 week replay'; END IF;
  PERFORM pg_temp._fc_nightly(v_org, 's9');

  -- ── 10. I4 on touched records ──
  PERFORM pg_temp._fc_assert_i4_charge(v_org, (pg_temp._fc_ch(v_org, 'c3')).id);
  PERFORM pg_temp._fc_assert_i4_charge(v_org, (pg_temp._fc_ch(v_org, 'fc-2pb')).id);
  PERFORM pg_temp._fc_assert_i4_pb(v_org, (pg_temp._fc_pb(v_org, 'trip:t3')).id);
  BEGIN
    INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, decision_id)
    SELECT v_org, (pg_temp._fc_ch(v_org, 'fc-rep')).id, 'fleet',
      (pg_temp._fc_ch(v_org, 'fc-rep')).amount_minor + 1,
      (SELECT id FROM toll.decisions WHERE organization_id = v_org AND command_id = 'fc-s9-amt' LIMIT 1);
    RAISE EXCEPTION 'I4 probe allowed over-alloc';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'ALLOCATIONS_EXCEED_AMOUNT' THEN RAISE; END IF;
  END;

  -- AFTER_SEAL (Claude, R4b check): an after_seal charge can't be corrected by a person. Self-undoing probe, so the
  -- stand-in row never reaches nightly check 5.
  BEGIN
    INSERT INTO toll.charges (organization_id, vehicle_id, driver_id, plaza_id, occurred_at, week_key, time_precision,
                              amount_minor, paid_by, source, source_ref, evidence_status, after_seal)
    VALUES (v_org, 'v-as', 'd-as', 'pz-as', '2024-01-02 15:00+00', ledger.jamaica_week_start('2024-01-02 15:00+00'),
            'minute', 1000, 'tag', 'tag_statement', 'fc-after-seal-probe', 'verified', true);
    PERFORM pg_temp._fc_refused('correct_charge_amount', jsonb_build_object('command_id', 'fc-as-probe',
      'charge_id', (pg_temp._fc_ch(v_org, 'fc-after-seal-probe')).id,
      'expected_charge_version', (pg_temp._fc_ch(v_org, 'fc-after-seal-probe')).version,
      'amount_minor', 900, 'reason_code', 'probe'), 'AFTER_SEAL');
    RAISE EXCEPTION 'fc_after_seal_probe_ok';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'fc_after_seal_probe_ok' THEN RAISE; END IF;
  END;
  RESET ROLE;
  PERFORM pg_temp._fc_nightly(v_org, 's10');

  RAISE NOTICE 'toll_v2_fact_corrections: ok';
END;
$$;

ROLLBACK;

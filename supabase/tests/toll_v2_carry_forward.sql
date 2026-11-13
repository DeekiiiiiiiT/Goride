-- Toll v2 P2-R4c: carry_forward (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
VALUES ('f0411111-1111-4111-8111-111111111112'::uuid, 'toll-cf-owner@example.com')
ON CONFLICT DO NOTHING;

INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES (
  'f4111111-1111-4111-8111-111111111102',
  'f0411111-1111-4111-8111-111111111112',
  'Toll Carry Forward',
  'toll-cf',
  'fleet',
  'active'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO toll.switch_state (organization_id, tolls_v2)
VALUES ('f4111111-1111-4111-8111-111111111102', true)
ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = EXCLUDED.tolls_v2;

SELECT toll_system.ensure_accounts('f4111111-1111-4111-8111-111111111102');

CREATE OR REPLACE FUNCTION pg_temp._cf_as(p_user uuid, p_org uuid) RETURNS void
LANGUAGE plpgsql AS $a$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user::text, 'role', 'authenticated',
    'app_metadata', json_build_object('organizationId', p_org::text)
  )::text, true);
  SET LOCAL ROLE authenticated;
END;
$a$;

CREATE OR REPLACE FUNCTION pg_temp._cf_cmd(p_intent text, p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $c$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp._cf_as(
    current_setting('cf.test_user', true)::uuid,
    current_setting('cf.test_org', true)::uuid
  );
  r := public.toll_v2_command(p_intent, p_body);
  RESET ROLE;
  RETURN r;
END;
$c$;

-- p_state (Claude, R4c check): when given, the refusal's DETAIL state must match too, so a WRONG_STATE can't pass
-- for the wrong reason.
CREATE OR REPLACE FUNCTION pg_temp._cf_refused(p_intent text, p_body jsonb, p_code text, p_state text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $r$
DECLARE m text; d text;
BEGIN
  BEGIN
    PERFORM pg_temp._cf_cmd(p_intent, p_body);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT, d = PG_EXCEPTION_DETAIL;
    RESET ROLE;
    IF m IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 'cf expected % got %', p_code, m;
    END IF;
    IF p_state IS NOT NULL AND (nullif(d, '')::jsonb ->> 'state') IS DISTINCT FROM p_state THEN
      RAISE EXCEPTION 'cf expected % state % got %', p_code, p_state, d;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'cf expected % but command succeeded', p_code;
END;
$r$;

CREATE OR REPLACE FUNCTION pg_temp._cf_ch(p_org uuid, p_ref text) RETURNS toll.charges
LANGUAGE sql AS $ch$
  SELECT * FROM toll.charges WHERE organization_id = p_org AND source_ref = p_ref;
$ch$;

CREATE OR REPLACE FUNCTION pg_temp._cf_pb(p_org uuid, p_ref text) RETURNS toll.paybacks
LANGUAGE sql AS $pb$
  SELECT * FROM toll.paybacks WHERE organization_id = p_org AND reference = p_ref;
$pb$;

CREATE OR REPLACE FUNCTION pg_temp._cf_nightly(p_org uuid, p_label text) RETURNS void
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

CREATE OR REPLACE FUNCTION pg_temp._cf_check4_week(p_org uuid, p_week date) RETURNS void
LANGUAGE plpgsql AS $c4$
DECLARE x record;
BEGIN
  RESET ROLE;
  SELECT * INTO x FROM toll_system.nightly_checks(p_org) c
  WHERE c.check_no = 4 AND c.name = 'sealed_week:' || p_week::text;
  IF NOT FOUND OR NOT x.ok THEN
    RAISE EXCEPTION 'check4 week % failed: %', p_week, x.detail;
  END IF;
END;
$c4$;

CREATE OR REPLACE FUNCTION pg_temp._cf_assert_paid_hash(p_org uuid, p_week date, p_hash text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF toll_system.week_hash(p_org, p_week) IS DISTINCT FROM p_hash THEN
    RAISE EXCEPTION 'paid week hash changed';
  END IF;
END;
$h$;

CREATE OR REPLACE FUNCTION pg_temp._cf_post_at(p_week date) RETURNS timestamptz
LANGUAGE sql AS $pa$
  SELECT (p_week + time '12:00') AT TIME ZONE 'America/Jamaica';
$pa$;

CREATE OR REPLACE FUNCTION pg_temp._cf_charge_leg_at(p_org uuid, p_ch uuid, p_rule text) RETURNS timestamptz
LANGUAGE sql AS $cl$
  SELECT e.effective_at FROM ledger.entries e
  WHERE e.organization_id = p_org AND e.reference_type = 'toll'
    AND e.metadata ->> 'toll_rule' = p_rule AND e.metadata ->> 'charge_id' = p_ch::text
    AND coalesce((e.metadata ->> 'reverse')::boolean, false) = false
  ORDER BY e.id LIMIT 1;
$cl$;

DO $$
DECLARE
  v_owner  uuid := 'f0411111-1111-4111-8111-111111111112';
  v_org    uuid := 'f4111111-1111-4111-8111-111111111102';
  v_w      date := '2024-10-07';
  v_tw     date := '2024-10-14';
  v_paid   text;
  r        jsonb;
  v_j      jsonb;
  c        toll.charges;
  p        toll.paybacks;
  v_fact   uuid;
  v_dec    uuid;
  v_ver    bigint;
  v_cnt    int;
  v_drv    jsonb;
  v_pre    bigint;
  v_post   bigint;
  v_cmd    text;
BEGIN
  PERFORM set_config('cf.test_user', v_owner::text, true);
  PERFORM set_config('cf.test_org', v_org::text, true);

  PERFORM public.toll_sys_import(v_org, 'uber', '[
    {"row_type":"trip","platform_trip_id":"t1","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-08T14:00:00-05:00","dropoff_at":"2024-10-08T14:50:00-05:00","payment_method":"card","toll_payback_minor":50000},
    {"row_type":"trip","platform_trip_id":"t2","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-09T14:00:00-05:00","dropoff_at":"2024-10-09T14:50:00-05:00","payment_method":"card","toll_payback_minor":50000},
    {"row_type":"trip","platform_trip_id":"t-left","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-08T10:00:00-05:00","dropoff_at":"2024-10-08T10:40:00-05:00","payment_method":"card","toll_payback_minor":30000},
    {"row_type":"trip","platform_trip_id":"t-cover","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-08T11:00:00-05:00","dropoff_at":"2024-10-08T11:40:00-05:00","payment_method":"card","toll_payback_minor":40000},
    {"row_type":"trip","platform_trip_id":"t-cash","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-09T16:00:00-05:00","dropoff_at":"2024-10-09T16:40:00-05:00","payment_method":"cash","toll_payback_minor":25000}
  ]'::jsonb, 'cf-imp-uber', 'smoke');
  PERFORM public.toll_sys_import(v_org, 'tag_statement', '[
    {"source_ref":"c1","occurred_at":"2024-10-08T14:20:00-05:00","amount_minor":34000,"plaza_id":"pzA","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c2","occurred_at":"2024-10-09T09:00:00-05:00","amount_minor":50000,"plaza_id":"pzB","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c3","occurred_at":"2024-10-10T09:00:00-05:00","amount_minor":30000,"plaza_id":"pzC","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"cf-cover","occurred_at":"2024-10-08T11:10:00-05:00","amount_minor":40000,"plaza_id":"pzD","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"cf-split-tag","occurred_at":"2024-10-08T12:00:00-05:00","amount_minor":30300,"plaza_id":"pzE","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"cf-round","occurred_at":"2024-10-09T11:00:00-05:00","amount_minor":10003,"plaza_id":"pzG","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"cf-pend","occurred_at":"2024-10-08T13:00:00-05:00","amount_minor":50000,"plaza_id":"pzH","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'cf-imp-tag', 'smoke');
  PERFORM public.toll_sys_import(v_org, 'driver_cash', '[
    {"source_ref":"cf-split-cash","occurred_at":"2024-10-09T10:00:00-05:00","amount_minor":10000,"plaza_id":"pzF","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"s"}},
    {"source_ref":"cf-cash-ver","occurred_at":"2024-10-09T10:30:00-05:00","amount_minor":20000,"plaza_id":"pzV","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"v"}}
  ]'::jsonb, 'cf-imp-cash', 'smoke');

  -- Decide from_week facts
  c := pg_temp._cf_ch(v_org, 'c1');
  p := pg_temp._cf_pb(v_org, 'trip:t1');
  r := pg_temp._cf_cmd('link_payback', jsonb_build_object(
    'command_id', 'cf-setup-1', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  p := pg_temp._cf_pb(v_org, 'trip:t1');
  PERFORM pg_temp._cf_cmd('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'cf-setup-2', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'excess'));

  c := pg_temp._cf_ch(v_org, 'c2');
  r := pg_temp._cf_cmd('driver_pays', jsonb_build_object(
    'command_id', 'cf-setup-3', 'charge_id', c.id, 'expected_charge_version', c.version, 'amount_minor', 30000));
  c := pg_temp._cf_ch(v_org, 'c2');
  PERFORM pg_temp._cf_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'cf-setup-4', 'charge_id', c.id, 'expected_charge_version', (r->>'charge_version')::bigint));

  c := pg_temp._cf_ch(v_org, 'cf-cover');
  p := pg_temp._cf_pb(v_org, 'trip:t-cover');
  PERFORM pg_temp._cf_cmd('link_payback', jsonb_build_object(
    'command_id', 'cf-setup-cover', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));

  p := pg_temp._cf_pb(v_org, 'trip:t-left');
  PERFORM pg_temp._cf_cmd('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'cf-setup-left', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'not_toll'));

  c := pg_temp._cf_ch(v_org, 'cf-split-tag');
  r := pg_temp._cf_cmd('driver_pays', jsonb_build_object(
    'command_id', 'cf-setup-st1', 'charge_id', c.id, 'expected_charge_version', c.version, 'amount_minor', 18180));
  c := pg_temp._cf_ch(v_org, 'cf-split-tag');
  PERFORM pg_temp._cf_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'cf-setup-st2', 'charge_id', c.id, 'expected_charge_version', (r->>'charge_version')::bigint));

  c := pg_temp._cf_ch(v_org, 'cf-split-cash');
  r := pg_temp._cf_cmd('verify_cash_receipt', jsonb_build_object(
    'command_id', 'cf-setup-scv', 'charge_id', c.id, 'expected_charge_version', c.version));
  c := pg_temp._cf_ch(v_org, 'cf-split-cash');
  r := pg_temp._cf_cmd('driver_pays', jsonb_build_object(
    'command_id', 'cf-setup-scd', 'charge_id', c.id, 'expected_charge_version', (r->>'charge_version')::bigint,
    'amount_minor', 6000));
  c := pg_temp._cf_ch(v_org, 'cf-split-cash');
  PERFORM pg_temp._cf_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'cf-setup-scf', 'charge_id', c.id, 'expected_charge_version', (r->>'charge_version')::bigint));

  c := pg_temp._cf_ch(v_org, 'cf-round');
  PERFORM pg_temp._cf_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'cf-setup-rnd', 'charge_id', c.id, 'expected_charge_version', c.version));

  c := pg_temp._cf_ch(v_org, 'cf-pend');
  PERFORM pg_temp._cf_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'cf-setup-pend', 'charge_id', c.id, 'expected_charge_version', c.version));

  p := pg_temp._cf_pb(v_org, 'trip:t2');
  PERFORM pg_temp._cf_cmd('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'cf-setup-t2', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'not_toll'));
  PERFORM public.toll_sys_import(v_org, 'tag_statement', '[
    {"source_ref":"cf-cash-tb","occurred_at":"2024-10-09T16:20:00-05:00","amount_minor":15000,"plaza_id":"pzT","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'cf-cash-tb-tag', 'smoke');
  c := pg_temp._cf_ch(v_org, 'cf-cash-tb');
  p := pg_temp._cf_pb(v_org, 'trip:t-cash');
  PERFORM pg_temp._cf_cmd('link_payback', jsonb_build_object(
    'command_id', 'cf-setup-tcash', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  p := pg_temp._cf_pb(v_org, 'trip:t-cash');
  PERFORM pg_temp._cf_cmd('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'cf-setup-tcash-u', 'payback_id', p.id, 'expected_payback_version', p.version,
    'amount_minor', 10000, 'reason_code', 'passenger'));

  c := pg_temp._cf_ch(v_org, 'c3');
  PERFORM pg_temp._cf_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'cf-setup-c3b', 'charge_id', c.id, 'expected_charge_version', c.version));

  c := pg_temp._cf_ch(v_org, 'cf-cash-ver');
  r := pg_temp._cf_cmd('verify_cash_receipt', jsonb_build_object(
    'command_id', 'cf-setup-ccv', 'charge_id', c.id, 'expected_charge_version', c.version));
  c := pg_temp._cf_ch(v_org, 'cf-cash-ver');
  PERFORM pg_temp._cf_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'cf-setup-cca', 'charge_id', c.id, 'expected_charge_version', (r->>'charge_version')::bigint));

  PERFORM public.toll_sys_import(v_org, 'tag_statement', '[
    {"source_ref":"cf-dup-a","occurred_at":"2024-10-10T10:00:00-05:00","amount_minor":8000,"plaza_id":"pzI","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"cf-dup-b","occurred_at":"2024-10-10T10:00:00-05:00","amount_minor":8000,"plaza_id":"pzI","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'cf-dup-pre', 'smoke');
  c := pg_temp._cf_ch(v_org, 'cf-dup-a');
  IF (pg_temp._cf_ch(v_org, 'cf-dup-a')).id < (pg_temp._cf_ch(v_org, 'cf-dup-b')).id THEN
    INSERT INTO toll.duplicate_reviews (organization_id, charge_a, charge_b, status)
    VALUES (v_org, (pg_temp._cf_ch(v_org, 'cf-dup-a')).id, (pg_temp._cf_ch(v_org, 'cf-dup-b')).id, 'open');
  ELSE
    INSERT INTO toll.duplicate_reviews (organization_id, charge_a, charge_b, status)
    VALUES (v_org, (pg_temp._cf_ch(v_org, 'cf-dup-b')).id, (pg_temp._cf_ch(v_org, 'cf-dup-a')).id, 'open');
  END IF;
  PERFORM pg_temp._cf_cmd('confirm_duplicate', jsonb_build_object(
    'command_id', 'cf-dup-conf',
    'charge_id', (pg_temp._cf_ch(v_org, 'cf-dup-b')).id,
    'other_charge_id', c.id,
    'expected_charge_version', (pg_temp._cf_ch(v_org, 'cf-dup-b')).version,
    'expected_other_version', c.version));
  c := pg_temp._cf_ch(v_org, 'cf-dup-a');
  PERFORM pg_temp._cf_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'cf-dup-abs', 'charge_id', c.id, 'expected_charge_version', c.version));

  PERFORM pg_temp._cf_cmd('seal_week', jsonb_build_object(
    'command_id', 'cf-setup-seal', 'week_key', v_w, 'expected_week_version', 0));
  v_paid := toll_system.week_hash(v_org, v_w);

  -- ── 1. refusals ──
  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s1-open', 'from_week', v_tw, 'to_week', v_tw + 7, 'kind', 'charge',
    'charge_id', (pg_temp._cf_ch(v_org, 'c1')).id,
    'expected_charge_version', (pg_temp._cf_ch(v_org, 'c1')).version), 'WEEK_NOT_SEALED');
  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s1-reopen', 'from_week', v_w, 'to_week', v_tw, 'kind', 'correction_down',
    'charge_id', (pg_temp._cf_ch(v_org, 'c2')).id,
    'expected_charge_version', (pg_temp._cf_ch(v_org, 'c2')).version,
    'amount_minor', 40000, 'reason_code', 'x'), 'REOPEN_INSTEAD');
  INSERT INTO ledger.settlement_movements (
    organization_id, driver_id, period_anchor, kind, amount_minor, idempotency_key, status
  ) VALUES (v_org, 'd1', v_w, 'pay', 100, 'cf-s1-paid', 'posted');

  PERFORM pg_temp._cf_cmd('seal_week', jsonb_build_object(
    'command_id', 'cf-s1-seal-tw', 'week_key', v_tw, 'expected_week_version', 0));
  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s1-tw-sealed', 'from_week', v_w, 'to_week', v_tw, 'kind', 'payback',
    'payback_id', (pg_temp._cf_pb(v_org, 'trip:t-left')).id,
    'expected_payback_version', (pg_temp._cf_pb(v_org, 'trip:t-left')).version), 'WEEK_SEALED');
  PERFORM pg_temp._cf_cmd('reopen_week', jsonb_build_object(
    'command_id', 'cf-s1-reopen-tw', 'week_key', v_tw,
    'expected_week_version', toll_system.week_version(v_org, v_tw), 'reason', 'cf s1'));

  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s1-bad-tw', 'from_week', v_w, 'to_week', v_w, 'kind', 'charge',
    'charge_id', (pg_temp._cf_ch(v_org, 'c1')).id,
    'expected_charge_version', (pg_temp._cf_ch(v_org, 'c1')).version), 'BAD_REQUEST');
  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s1-bad-kind', 'from_week', v_w, 'to_week', v_tw, 'kind', 'nope'), 'BAD_REQUEST');

  PERFORM public.toll_sys_import(v_org, 'tag_statement', '[
    {"source_ref":"cf-wrong-wk","occurred_at":"2024-10-14T09:00:00-05:00","amount_minor":5000,"plaza_id":"pzW","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'cf-wrong-wk', 'smoke');
  c := pg_temp._cf_ch(v_org, 'cf-wrong-wk');
  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s1-wrong-wk', 'from_week', v_w, 'to_week', v_tw, 'kind', 'charge',
    'charge_id', c.id, 'expected_charge_version', c.version), 'WRONG_STATE', 'not_in_from_week');

  c := pg_temp._cf_ch(v_org, 'c1');
  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s1-stale', 'from_week', v_w, 'to_week', v_tw, 'kind', 'correction_down',
    'charge_id', c.id, 'expected_charge_version', c.version - 1,
    'amount_minor', 30000, 'reason_code', 'x'), 'VERSION_CHANGED');
  PERFORM pg_temp._cf_assert_paid_hash(v_org, v_w, v_paid);
  PERFORM pg_temp._cf_nightly(v_org, 's1');

  -- ── 2. late charge ──
  PERFORM public.toll_sys_import(v_org, 'tag_statement', '[
    {"source_ref":"cf-late-tag","occurred_at":"2024-10-11T09:00:00-05:00","amount_minor":20000,"plaza_id":"pzL1","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'cf-late-tag', 'smoke');
  c := pg_temp._cf_ch(v_org, 'cf-late-tag');
  IF NOT c.after_seal THEN RAISE EXCEPTION '2 late tag not after_seal'; END IF;
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s2-tag', 'from_week', v_w, 'to_week', v_tw, 'kind', 'charge',
    'charge_id', c.id, 'expected_charge_version', c.version));
  c := pg_temp._cf_ch(v_org, 'cf-late-tag');
  IF pg_temp._cf_charge_leg_at(v_org, c.id, 'P2_tag_crossing') <> pg_temp._cf_post_at(v_tw) THEN
    RAISE EXCEPTION '2 P2 charge_post_at';
  END IF;
  IF toll_system.charge_counted_week(v_org, c.id, c.week_key) <> v_tw THEN
    RAISE EXCEPTION '2 counted week';
  END IF;

  PERFORM public.toll_sys_import(v_org, 'driver_cash', '[
    {"source_ref":"cf-late-cash-v","occurred_at":"2024-10-11T10:00:00-05:00","amount_minor":12000,"plaza_id":"pzL2","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"lv"}}
  ]'::jsonb, 'cf-late-cash-v', 'smoke');
  c := pg_temp._cf_ch(v_org, 'cf-late-cash-v');
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s2-cash-v', 'from_week', v_w, 'to_week', v_tw, 'kind', 'charge',
    'charge_id', c.id, 'expected_charge_version', c.version));
  c := pg_temp._cf_ch(v_org, 'cf-late-cash-v');
  IF pg_temp._cf_charge_leg_at(v_org, c.id, 'P3_cash_verified') <> pg_temp._cf_post_at(v_tw) THEN
    RAISE EXCEPTION '2 P3 verified at post_at';
  END IF;

  PERFORM public.toll_sys_import(v_org, 'driver_cash', '[
    {"source_ref":"cf-late-cash-u","occurred_at":"2024-10-11T11:00:00-05:00","amount_minor":11000,"plaza_id":"pzL3","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"lu"}}
  ]'::jsonb, 'cf-late-cash-u', 'smoke');
  c := pg_temp._cf_ch(v_org, 'cf-late-cash-u');
  PERFORM pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s2-cash-u', 'from_week', v_w, 'to_week', v_tw, 'kind', 'charge',
    'charge_id', c.id, 'expected_charge_version', c.version));
  IF EXISTS (
    SELECT 1 FROM ledger.entries e
    WHERE e.organization_id = v_org AND e.metadata ->> 'charge_id' = c.id::text
      AND e.metadata ->> 'toll_rule' LIKE 'P3%'
  ) THEN RAISE EXCEPTION '2 unverified should not post P3 yet'; END IF;
  c := pg_temp._cf_ch(v_org, 'cf-late-cash-u');
  r := pg_temp._cf_cmd('verify_cash_receipt', jsonb_build_object(
    'command_id', 'cf-s2-ver', 'charge_id', c.id, 'expected_charge_version', c.version));
  c := pg_temp._cf_ch(v_org, 'cf-late-cash-u');
  IF pg_temp._cf_charge_leg_at(v_org, c.id, 'P3_cash_verified') <> pg_temp._cf_post_at(v_tw) THEN
    RAISE EXCEPTION '2 P3 after verify in to_week';
  END IF;

  PERFORM public.toll_sys_import(v_org, 'uber', '[
    {"row_type":"trip","platform_trip_id":"t-link","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-11T12:00:00-05:00","dropoff_at":"2024-10-11T12:40:00-05:00","payment_method":"card","toll_payback_minor":20000}
  ]'::jsonb, 'cf-link-uber', 'smoke');
  PERFORM public.toll_sys_import(v_org, 'tag_statement', '[
    {"source_ref":"cf-link-ch","occurred_at":"2024-10-11T12:10:00-05:00","amount_minor":20000,"plaza_id":"pzL4","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'cf-link-tag', 'smoke');
  c := pg_temp._cf_ch(v_org, 'cf-link-ch');
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s2-link-c', 'from_week', v_w, 'to_week', v_tw, 'kind', 'charge',
    'charge_id', c.id, 'expected_charge_version', c.version));
  c := pg_temp._cf_ch(v_org, 'cf-link-ch');
  p := pg_temp._cf_pb(v_org, 'trip:t-link');
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s2-link-p', 'from_week', v_w, 'to_week', v_tw, 'kind', 'payback',
    'payback_id', p.id, 'expected_payback_version', p.version));
  p := pg_temp._cf_pb(v_org, 'trip:t-link');
  PERFORM pg_temp._cf_cmd('link_payback', jsonb_build_object(
    'command_id', 'cf-s2-link', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  IF NOT EXISTS (
    SELECT 1 FROM ledger.entries e
    WHERE e.organization_id = v_org       AND e.metadata ->> 'toll_rule' LIKE 'P6%'
      AND e.effective_at = pg_temp._cf_post_at(v_tw)
  ) THEN RAISE EXCEPTION '2 P6 in to_week'; END IF;

  c := pg_temp._cf_ch(v_org, 'cf-late-tag');
  r := pg_temp._cf_cmd('driver_pays', jsonb_build_object(
    'command_id', 'cf-s2-dp', 'charge_id', c.id,
    'expected_charge_version', c.version, 'amount_minor', 10000));
  IF NOT EXISTS (
    SELECT 1 FROM ledger.entries e
    WHERE e.organization_id = v_org AND e.metadata ->> 'charge_id' = c.id::text
      AND e.metadata ->> 'toll_rule' LIKE 'P7%' AND e.effective_at = pg_temp._cf_post_at(v_tw)
  ) THEN RAISE EXCEPTION '2 P7 in to_week'; END IF;

  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s2-not-seal', 'from_week', v_w, 'to_week', v_tw, 'kind', 'charge',
    'charge_id', (pg_temp._cf_ch(v_org, 'c1')).id,
    'expected_charge_version', (pg_temp._cf_ch(v_org, 'c1')).version), 'WRONG_STATE', 'not_after_seal');
  c := pg_temp._cf_ch(v_org, 'cf-dup-b');
  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s2-dup', 'from_week', v_w, 'to_week', v_tw, 'kind', 'charge',
    'charge_id', c.id, 'expected_charge_version', c.version), 'WRONG_STATE', 'not_after_seal');
  -- (Claude, R4c check) a confirmed duplicate in the paid week is refused as not_after_seal. An after_seal charge can't
  -- become a duplicate (imports into a sealed week skip the duplicate rules; confirm_duplicate refuses a sealed week),
  -- so carry_forward's own "duplicate" refusal is a safety net that real data can't reach.
  PERFORM pg_temp._cf_assert_paid_hash(v_org, v_w, v_paid);
  PERFORM pg_temp._cf_nightly(v_org, 's2');

  -- ── 3. late payback ──
  PERFORM public.toll_sys_import(v_org, 'uber', '[
    {"row_type":"adjustment","reference":"cf-adj-card","driver_id":"d1","paid_on":"2024-10-12","amount_minor":5000},
    {"row_type":"trip","platform_trip_id":"t-adj-cash","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-10T15:00:00-05:00","dropoff_at":"2024-10-10T15:40:00-05:00","payment_method":"cash","toll_payback_minor":8000}
  ]'::jsonb, 'cf-late-pb', 'smoke');
  p := pg_temp._cf_pb(v_org, 'cf-adj-card');
  IF NOT p.after_seal THEN RAISE EXCEPTION '3 card pb not after_seal'; END IF;
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s3-card', 'from_week', v_w, 'to_week', v_tw, 'kind', 'payback',
    'payback_id', p.id, 'expected_payback_version', p.version));
  p := pg_temp._cf_pb(v_org, 'cf-adj-card');
  IF p.week_key <> v_tw THEN RAISE EXCEPTION '3 card week_key %', p.week_key; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ledger.entries e
    WHERE e.organization_id = v_org AND e.metadata ->> 'payback_id' = p.id::text
      AND e.metadata ->> 'toll_rule' = 'P4_payback_fleet' AND e.effective_at = pg_temp._cf_post_at(v_tw)
  ) THEN RAISE EXCEPTION '3 P4'; END IF;

  p := pg_temp._cf_pb(v_org, 'trip:t-adj-cash');
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s3-cash', 'from_week', v_w, 'to_week', v_tw, 'kind', 'payback',
    'payback_id', p.id, 'expected_payback_version', p.version));
  p := pg_temp._cf_pb(v_org, 'trip:t-adj-cash');
  IF p.received_by <> 'driver' THEN RAISE EXCEPTION '3 cash pb receiver'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ledger.entries e
    WHERE e.organization_id = v_org AND e.metadata ->> 'payback_id' = p.id::text
      AND e.metadata ->> 'toll_rule' = 'P5_payback_driver'
  ) THEN RAISE EXCEPTION '3 P5'; END IF;

  v_j := toll_system.week_result_live(v_org, v_tw);
  IF coalesce((v_j -> 'paybacks' ->> 'receivedMinor')::bigint, 0) < 13000 THEN
    RAISE EXCEPTION '3 to_week counts paybacks';
  END IF;
  v_j := toll_system.week_result(v_org, v_w);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_j -> 'afterSeal', '[]'::jsonb)) x
    WHERE x ->> 'reference' IN ('cf-adj-card', 'trip:t-adj-cash')
  ) THEN RAISE EXCEPTION '3 from_week afterSeal lists carried pb'; END IF;

  p := pg_temp._cf_pb(v_org, 'cf-adj-card');
  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s3-dup', 'from_week', v_w, 'to_week', v_tw, 'kind', 'payback',
    'payback_id', p.id, 'expected_payback_version', p.version), 'WRONG_STATE', 'not_in_from_week');
  PERFORM pg_temp._cf_assert_paid_hash(v_org, v_w, v_paid);
  PERFORM pg_temp._cf_nightly(v_org, 's3');

  -- ── 4. take_back (P18) ──
  p := pg_temp._cf_pb(v_org, 'trip:t-left');
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s4-left', 'from_week', v_w, 'to_week', v_tw, 'kind', 'take_back',
    'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'tb-left', 'paid_on', '2024-10-15', 'bearer', 'fleet'));
  IF coalesce((r->>'leftover_minor')::bigint, 0) <> 30000 OR coalesce((r->>'covered_minor')::bigint, 0) <> 0 THEN
    RAISE EXCEPTION '4 leftover-only';
  END IF;

  p := pg_temp._cf_pb(v_org, 'trip:t-cover');
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s4-cover', 'from_week', v_w, 'to_week', v_tw, 'kind', 'take_back',
    'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'tb-cover', 'paid_on', '2024-10-15', 'bearer', 'fleet'));
  IF coalesce((r->>'leftover_minor')::bigint, 0) <> 0 OR coalesce((r->>'covered_minor')::bigint, 0) <> 40000 THEN
    RAISE EXCEPTION '4 covered-only';
  END IF;

  p := pg_temp._cf_pb(v_org, 'trip:t1');
  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s4-nob', 'from_week', v_w, 'to_week', v_tw, 'kind', 'take_back',
    'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'tb-x', 'paid_on', '2024-10-15'), 'BAD_REQUEST');
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s4-mix', 'from_week', v_w, 'to_week', v_tw, 'kind', 'take_back',
    'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'tb-mix', 'paid_on', '2024-10-15', 'bearer', 'fleet'));
  IF coalesce((r->>'leftover_minor')::bigint, 0) <> 16000
     OR coalesce((r->>'covered_minor')::bigint, 0) <> 34000 THEN
    RAISE EXCEPTION '4 mixed leftover/covered';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ledger.entries e JOIN toll.carried_facts f ON f.id = (e.metadata ->> 'carried_fact_id')::uuid
    WHERE e.organization_id = v_org AND f.bearer IS NULL AND e.metadata ->> 'toll_rule' = 'P18a_leftover_fleet'
  ) THEN RAISE EXCEPTION '4 P18a receivable_platform path'; END IF;

  p := pg_temp._cf_pb(v_org, 'trip:t-cash');
  v_pre := (SELECT coalesce((d ->> 'recoveredInPassengerCashMinor')::bigint, 0)
            FROM jsonb_array_elements(toll_system.week_result_live(v_org, v_tw) -> 'drivers') d
            WHERE d ->> 'driverId' = 'd1' LIMIT 1);
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s4-cash', 'from_week', v_w, 'to_week', v_tw, 'kind', 'take_back',
    'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'tb-cash', 'paid_on', '2024-10-15', 'bearer', 'driver'));
  IF NOT EXISTS (
    SELECT 1 FROM ledger.entries e
    WHERE e.organization_id = v_org AND e.metadata ->> 'toll_rule' = 'P18b_driver_cash'
  ) THEN RAISE EXCEPTION '4 P18b cash trip'; END IF;
  v_post := (SELECT coalesce((d ->> 'recoveredInPassengerCashMinor')::bigint, 0)
             FROM jsonb_array_elements(toll_system.week_result_live(v_org, v_tw) -> 'drivers') d
             WHERE d ->> 'driverId' = 'd1' LIMIT 1);
  IF v_post >= v_pre THEN RAISE EXCEPTION '4 cash take-back should lower recovered'; END IF;

  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s4-again', 'from_week', v_w, 'to_week', v_tw, 'kind', 'take_back',
    'payback_id', p.id, 'expected_payback_version', (r->>'payback_version')::bigint,
    'reference', 'tb-cash2', 'paid_on', '2024-10-16', 'bearer', 'fleet'), 'WRONG_STATE', 'already_taken_back');
  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s4-part', 'from_week', v_w, 'to_week', v_tw, 'kind', 'take_back',
    'payback_id', (pg_temp._cf_pb(v_org, 'trip:t2')).id,
    'expected_payback_version', (pg_temp._cf_pb(v_org, 'trip:t2')).version,
    'reference', 'tb-part', 'paid_on', '2024-10-16', 'bearer', 'fleet',
    'amount_minor', 1000), 'PARTIAL_TAKE_BACK');
  PERFORM pg_temp._cf_assert_paid_hash(v_org, v_w, v_paid);
  PERFORM pg_temp._cf_nightly(v_org, 's4');

  -- ── 5. correction_down (P19) ──
  c := pg_temp._cf_ch(v_org, 'cf-split-tag');
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s5-tag', 'from_week', v_w, 'to_week', v_tw, 'kind', 'correction_down',
    'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 20000, 'reason_code', 'stmt'));
  IF (r->'shares') <> '{"driver": 6180, "fleet": 4120, "platform": 0}'::jsonb THEN
    RAISE EXCEPTION '5 tag shares got %', r->'shares';
  END IF;

  v_drv := toll_system.week_result_live(v_org, v_tw) -> 'drivers';
  v_pre := (SELECT coalesce((d ->> 'owesFleetMinor')::bigint, 0) FROM jsonb_array_elements(v_drv) d
            WHERE d ->> 'driverId' = 'd1' LIMIT 1);
  c := pg_temp._cf_ch(v_org, 'cf-split-cash');
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s5-cash', 'from_week', v_w, 'to_week', v_tw, 'kind', 'correction_down',
    'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 7000, 'reason_code', 'stmt'));
  v_post := (SELECT coalesce((d ->> 'owesFleetMinor')::bigint, 0)
             FROM jsonb_array_elements(toll_system.week_result_live(v_org, v_tw) -> 'drivers') d
             WHERE d ->> 'driverId' = 'd1' LIMIT 1);
  IF v_post - v_pre <> 3000 THEN RAISE EXCEPTION '5 cash driver owes delta'; END IF;

  c := pg_temp._cf_ch(v_org, 'cf-round');
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s5-round', 'from_week', v_w, 'to_week', v_tw, 'kind', 'correction_down',
    'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 9000, 'reason_code', 'stmt'));
  IF (r->'shares') <> '{"driver": 0, "fleet": 1003, "platform": 0}'::jsonb THEN
    RAISE EXCEPTION '5 fleet-only down share got %', r->'shares';
  END IF;

  PERFORM public.toll_sys_import(v_org, 'tag_statement', '[
    {"source_ref":"cf-pend","occurred_at":"2024-10-08T13:00:00-05:00","amount_minor":45000,"plaza_id":"pzH","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'cf-pend-chg', 'smoke');
  c := pg_temp._cf_ch(v_org, 'cf-pend');
  IF NOT EXISTS (SELECT 1 FROM toll.charge_changes ch
    WHERE ch.organization_id = v_org AND ch.charge_id = c.id AND ch.pending) THEN
    RAISE EXCEPTION '5 pending change expected';
  END IF;
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s5-pend', 'from_week', v_w, 'to_week', v_tw, 'kind', 'correction_down',
    'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 45000, 'reason_code', 'stmt'));
  IF EXISTS (SELECT 1 FROM toll.charge_changes ch
    WHERE ch.organization_id = v_org AND ch.charge_id = c.id AND ch.pending) THEN
    RAISE EXCEPTION '5 pending not cleared';
  END IF;

  c := pg_temp._cf_ch(v_org, 'cf-split-tag');
  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s5-up', 'from_week', v_w, 'to_week', v_tw, 'kind', 'correction_down',
    'charge_id', c.id, 'expected_charge_version', (pg_temp._cf_ch(v_org, 'cf-split-tag')).version,
    'amount_minor', 50000, 'reason_code', 'x'), 'BAD_REQUEST');
  PERFORM public.toll_sys_import(v_org, 'driver_cash', '[
    {"source_ref":"cf-cash-unver","occurred_at":"2024-10-11T08:00:00-05:00","amount_minor":15000,"plaza_id":"pzU","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"u"}}
  ]'::jsonb, 'cf-unver', 'smoke');
  c := pg_temp._cf_ch(v_org, 'cf-cash-unver');
  IF NOT c.after_seal THEN RAISE EXCEPTION '5 unver not after_seal'; END IF;
  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s5-unver', 'from_week', v_w, 'to_week', v_tw, 'kind', 'correction_down',
    'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 10000, 'reason_code', 'x'), 'WRONG_STATE', 'unverified');
  PERFORM pg_temp._cf_assert_paid_hash(v_org, v_w, v_paid);
  PERFORM pg_temp._cf_nightly(v_org, 's5');

  -- ── 6. platform share on carried P19 ──
  c := pg_temp._cf_ch(v_org, 'c1');
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s6-plat', 'from_week', v_w, 'to_week', v_tw, 'kind', 'correction_down',
    'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 24000, 'reason_code', 'stmt'));
  v_fact := (r->'carried_fact_ids'->>0)::uuid;
  IF (SELECT count(*) FROM toll_system.seal_blockers(v_org, v_tw) b WHERE b.kind = 'carried') < 1 THEN
    RAISE EXCEPTION '6 seal_blockers missing carried';
  END IF;

  v_ver := (SELECT version FROM toll.carried_facts WHERE id = v_fact);
  r := pg_temp._cf_cmd('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'cf-s6-part', 'carried_fact_id', v_fact, 'expected_carried_version', v_ver,
    'amount_minor', 5000, 'reason_code', 'part'));
  v_ver := (r->>'carried_version')::bigint;
  PERFORM pg_temp._cf_cmd('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'cf-s6-rest', 'carried_fact_id', v_fact, 'expected_carried_version', v_ver,
    'reason_code', 'rest'));
  IF EXISTS (SELECT 1 FROM toll_system.seal_blockers(v_org, v_tw) b WHERE b.kind = 'carried') THEN
    RAISE EXCEPTION '6 blockers after full decide';
  END IF;

  v_dec := (r->>'decision_id')::uuid;
  v_ver := (SELECT version FROM toll.carried_facts WHERE id = v_fact);
  PERFORM pg_temp._cf_cmd('undo_decision', jsonb_build_object(
    'command_id', 'cf-s6-undo', 'decision_id', v_dec,
    'expected_versions', jsonb_build_object(v_fact::text, v_ver)));

  PERFORM pg_temp._cf_refused('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'cf-s6-stale', 'carried_fact_id', v_fact, 'expected_carried_version', v_ver - 1,
    'reason_code', 'x'), 'VERSION_CHANGED');

  p := pg_temp._cf_pb(v_org, 'trip:t-left');
  SELECT f.id INTO v_fact FROM toll.carried_facts f
  WHERE f.organization_id = v_org AND f.kind = 'take_back' AND f.original_id = p.id AND f.bearer IS NULL LIMIT 1;
  PERFORM pg_temp._cf_refused('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'cf-s6-noplat', 'carried_fact_id', v_fact,
    'expected_carried_version', (SELECT version FROM toll.carried_facts WHERE id = v_fact),
    'reason_code', 'x'), 'WRONG_STATE', 'not_a_platform_share');

  v_ver := (SELECT version FROM toll.carried_facts WHERE id = (r->'carried_fact_ids'->>0)::uuid);
  v_fact := (SELECT id FROM toll.carried_facts cf
    WHERE cf.organization_id = v_org AND cf.kind = 'correction_down' AND cf.bearer IS NULL
      AND toll_system.carried_open_minor(v_org, cf.id) > 0
    ORDER BY cf.created_at DESC LIMIT 1);
  PERFORM pg_temp._cf_refused('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'cf-s6-big', 'carried_fact_id', v_fact,
    'expected_carried_version', (SELECT version FROM toll.carried_facts WHERE id = v_fact),
    'amount_minor', toll_system.carried_open_minor(v_org, v_fact) + 1,
    'reason_code', 'x'), 'AMOUNT_TOO_LARGE');

  c := pg_temp._cf_ch(v_org, 'c1');
  v_fact := (SELECT cf.id FROM toll.carried_facts cf
    WHERE cf.organization_id = v_org AND cf.original_id = c.id AND cf.kind = 'correction_down'
      AND cf.bearer IS NULL ORDER BY cf.created_at DESC LIMIT 1);
  v_ver := (SELECT version FROM toll.carried_facts WHERE id = v_fact);
  r := pg_temp._cf_cmd('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'cf-s6-finish', 'carried_fact_id', v_fact, 'expected_carried_version', v_ver,
    'reason_code', 'plat'));
  PERFORM pg_temp._cf_assert_paid_hash(v_org, v_w, v_paid);
  PERFORM pg_temp._cf_nightly(v_org, 's6');

  -- ── 7. correction_up ──
  c := pg_temp._cf_ch(v_org, 'c3');
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', 'cf-s7-up', 'from_week', v_w, 'to_week', v_tw, 'kind', 'correction_up',
    'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 35000, 'reason_code', 'receipt'));
  c := (SELECT x FROM toll.charges x WHERE x.organization_id = v_org AND x.id = (r->>'adjusting_charge_id')::uuid);
  IF c.amount_minor <> 5000 OR c.adjusts_charge_id <> (pg_temp._cf_ch(v_org, 'c3')).id THEN
    RAISE EXCEPTION '7 adjusting charge';
  END IF;
  IF toll_system.charge_counted_week(v_org, c.id, c.week_key) <> v_tw THEN
    RAISE EXCEPTION '7 counted week';
  END IF;
  IF pg_temp._cf_charge_leg_at(v_org, c.id, 'P3_cash_verified') <> pg_temp._cf_post_at(v_tw) THEN
    RAISE EXCEPTION '7 P3 up charge';
  END IF;
  IF toll_system.charge_state(v_org, c.id) <> 'pending' THEN RAISE EXCEPTION '7 pending'; END IF;
  r := pg_temp._cf_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'cf-s7-abs', 'charge_id', c.id, 'expected_charge_version', c.version));

  PERFORM pg_temp._cf_refused('carry_forward', jsonb_build_object(
    'command_id', 'cf-s7-down', 'from_week', v_w, 'to_week', v_tw, 'kind', 'correction_up',
    'charge_id', (pg_temp._cf_ch(v_org, 'c3')).id,
    'expected_charge_version', (pg_temp._cf_ch(v_org, 'c3')).version,
    'amount_minor', 20000, 'reason_code', 'x'), 'BAD_REQUEST');
  PERFORM pg_temp._cf_assert_paid_hash(v_org, v_w, v_paid);
  PERFORM pg_temp._cf_nightly(v_org, 's7');

  -- ── 8. seal to_week ──
  FOR c IN SELECT ch.* FROM toll.charges ch
    WHERE ch.organization_id = v_org AND toll_system.charge_counted_week(v_org, ch.id, ch.week_key) = v_tw
      AND toll_system.charge_state(v_org, ch.id) = 'unverified'
  LOOP
    r := pg_temp._cf_cmd('verify_cash_receipt', jsonb_build_object(
      'command_id', 'cf-s8-ver-' || c.source_ref, 'charge_id', c.id,
      'expected_charge_version', c.version));
  END LOOP;
  FOR c IN SELECT ch.* FROM toll.charges ch
    WHERE ch.organization_id = v_org AND toll_system.charge_counted_week(v_org, ch.id, ch.week_key) = v_tw
      AND toll_system.charge_state(v_org, ch.id) = 'pending'
  LOOP
    PERFORM pg_temp._cf_cmd('fleet_absorbs', jsonb_build_object(
      'command_id', 'cf-s8-ch-' || c.source_ref, 'charge_id', c.id,
      'expected_charge_version', c.version));
  END LOOP;
  FOR p IN SELECT pb.* FROM toll.paybacks pb
    WHERE pb.organization_id = v_org AND pb.week_key = v_tw AND pb.reversal_of IS NULL
      AND pb.kind <> 'native' AND toll_system.payback_open_minor(v_org, pb.id) > 0
      AND NOT EXISTS (SELECT 1 FROM toll.paybacks r WHERE r.organization_id = v_org AND r.reversal_of = pb.id)
  LOOP
    PERFORM pg_temp._cf_cmd('leave_payback_unlinked', jsonb_build_object(
      'command_id', 'cf-s8-ul-' || p.reference, 'payback_id', p.id,
      'expected_payback_version', p.version, 'reason_code', 'seal'));
  END LOOP;
  r := pg_temp._cf_cmd('seal_week', jsonb_build_object(
    'command_id', 'cf-s8-seal', 'week_key', v_tw,
    'expected_week_version', toll_system.week_version(v_org, v_tw)));
  PERFORM pg_temp._cf_check4_week(v_org, v_w);
  PERFORM pg_temp._cf_check4_week(v_org, v_tw);

  v_j := toll_system.week_result(v_org, v_tw);
  IF jsonb_array_length(coalesce(v_j -> 'carriedIn', '[]'::jsonb)) < 1 THEN
    RAISE EXCEPTION '8 carriedIn empty';
  END IF;
  IF v_j ? 'carriedMoney' IS NOT TRUE THEN RAISE EXCEPTION '8 carriedMoney missing'; END IF;
  v_j := toll_system.week_result(v_org, v_w);
  IF v_j ? 'carriedMoney' THEN RAISE EXCEPTION '8 paid week must not have carriedMoney'; END IF;
  PERFORM pg_temp._cf_assert_paid_hash(v_org, v_w, v_paid);
  PERFORM pg_temp._cf_nightly(v_org, 's8');

  -- reopen to_week for section 9 replay (sealed week can't replay carry into it — use pre-seal carry id)
  PERFORM pg_temp._cf_cmd('reopen_week', jsonb_build_object(
    'command_id', 'cf-s8-reopen', 'week_key', v_tw,
    'expected_week_version', (r->'weeks'->0->>'week_version')::bigint, 'reason', 'cf s8 replay prep'));

  -- ── 9. replay ──
  PERFORM public.toll_sys_import(v_org, 'tag_statement', '[
    {"source_ref":"cf-rep-ch","occurred_at":"2024-10-12T09:00:00-05:00","amount_minor":9000,"plaza_id":"pzR","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'cf-rep', 'smoke');
  c := pg_temp._cf_ch(v_org, 'cf-rep-ch');
  v_cmd := 'cf-s9-cf';
  r := pg_temp._cf_cmd('carry_forward', jsonb_build_object(
    'command_id', v_cmd, 'from_week', v_w, 'to_week', v_tw, 'kind', 'charge',
    'charge_id', c.id, 'expected_charge_version', c.version));
  SELECT count(*) INTO v_cnt FROM toll.carried_facts f
  WHERE f.organization_id = v_org AND f.decision_id = (r->>'decision_id')::uuid;
  IF (pg_temp._cf_cmd('carry_forward', jsonb_build_object('command_id', v_cmd)) ->> 'replay') <> 'true' THEN
    RAISE EXCEPTION '9 carry replay flag';
  END IF;
  IF (SELECT count(*) FROM toll.carried_facts f WHERE f.organization_id = v_org
      AND f.decision_id = (r->>'decision_id')::uuid) <> v_cnt THEN
    RAISE EXCEPTION '9 replay wrote rows';
  END IF;
  PERFORM pg_temp._cf_assert_paid_hash(v_org, v_w, v_paid);
  PERFORM pg_temp._cf_nightly(v_org, 's9');

  RAISE NOTICE 'toll_v2_carry_forward: ok';
END;
$$;

ROLLBACK;

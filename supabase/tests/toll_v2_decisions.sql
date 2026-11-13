-- Toll v2 P2-R4a: everyday decisions (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT u.id, u.email
FROM (VALUES
  ('f0211111-1111-4111-8111-111111111111'::uuid, 'toll-dec-owner@example.com'),
  ('f0221111-1111-4111-8111-111111111112'::uuid, 'toll-dec-mgr@example.com'),
  ('f0231111-1111-4111-8111-111111111113'::uuid, 'toll-dec-acct@example.com'),
  ('f0241111-1111-4111-8111-111111111114'::uuid, 'toll-dec-view@example.com'),
  ('f0251111-1111-4111-8111-111111111115'::uuid, 'toll-dec-owner-b@example.com')
) AS u(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES
  ('f2111111-1111-4111-8111-111111111101', 'f0211111-1111-4111-8111-111111111111', 'Toll Decisions A', 'toll-dec-a', 'fleet', 'active'),
  ('f2211111-1111-4111-8111-111111111102', 'f0251111-1111-4111-8111-111111111115', 'Toll Decisions B', 'toll-dec-b', 'fleet', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO toll.switch_state (organization_id, tolls_v2)
VALUES
  ('f2111111-1111-4111-8111-111111111101', true),
  ('f2211111-1111-4111-8111-111111111102', true)
ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = EXCLUDED.tolls_v2;

SELECT toll_system.ensure_accounts('f2111111-1111-4111-8111-111111111101');
SELECT toll_system.ensure_accounts('f2211111-1111-4111-8111-111111111102');

CREATE OR REPLACE FUNCTION pg_temp._dec_as(p_user uuid, p_org uuid) RETURNS void
LANGUAGE plpgsql AS $a$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user::text,
    'role', 'authenticated',
    'app_metadata', json_build_object('organizationId', p_org::text)
  )::text, true);
  SET LOCAL ROLE authenticated;
END;
$a$;

CREATE OR REPLACE FUNCTION pg_temp._dec_cmd(p_intent text, p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $c$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp._dec_as(
    current_setting('dec.test_user', true)::uuid,
    current_setting('dec.test_org', true)::uuid
  );
  r := public.toll_v2_command(p_intent, p_body);
  RESET ROLE;
  RETURN r;
END;
$c$;

CREATE OR REPLACE FUNCTION pg_temp._dec_refused(p_intent text, p_body jsonb, p_code text) RETURNS void
LANGUAGE plpgsql AS $r$
DECLARE m text;
BEGIN
  BEGIN
    PERFORM pg_temp._dec_cmd(p_intent, p_body);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
    RESET ROLE;
    IF m IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 'dec expected % got %', p_code, m;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'dec expected % but command succeeded', p_code;
END;
$r$;

CREATE OR REPLACE FUNCTION pg_temp._dec_ch(p_org uuid, p_ref text) RETURNS toll.charges
LANGUAGE sql AS $ch$
  SELECT * FROM toll.charges WHERE organization_id = p_org AND source_ref = p_ref;
$ch$;

CREATE OR REPLACE FUNCTION pg_temp._dec_pb(p_org uuid, p_ref text) RETURNS toll.paybacks
LANGUAGE sql AS $pb$
  SELECT * FROM toll.paybacks WHERE organization_id = p_org AND reference = p_ref;
$pb$;

CREATE OR REPLACE FUNCTION pg_temp._dec_nightly_ok(p_org uuid) RETURNS void
LANGUAGE plpgsql AS $n$
DECLARE x record;
BEGIN
  RESET ROLE;
  FOR x IN SELECT * FROM toll_system.nightly_checks(p_org) LOOP
    IF NOT x.ok THEN
      RAISE EXCEPTION 'nightly check % % failed: %', x.check_no, x.name, x.detail;
    END IF;
  END LOOP;
END;
$n$;

DO $$
DECLARE
  v_owner   uuid := 'f0211111-1111-4111-8111-111111111111';
  v_mgr     uuid := 'f0221111-1111-4111-8111-111111111112';
  v_viewer  uuid := 'f0241111-1111-4111-8111-111111111114';
  v_owner_b uuid := 'f0251111-1111-4111-8111-111111111115';
  v_org_a   uuid := 'f2111111-1111-4111-8111-111111111101';
  v_org_b   uuid := 'f2211111-1111-4111-8111-111111111102';
  v_role_view uuid;
  v_decision uuid;
  v_link    uuid;
  v_sug     uuid;
  v_sug_w   uuid;
  v_seal    uuid;
  v_pb_b    uuid;
  v_ch_b    uuid;
  v_cnt     int;
  v_cnt2    int;
  v_msg     text;
  r         jsonb;
  c         toll.charges;
  p         toll.paybacks;
  x         record;
BEGIN
  PERFORM set_config('dec.test_user', v_owner::text, true);
  PERFORM set_config('dec.test_org', v_org_a::text, true);

  INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system)
  VALUES ('fleet_viewer', 'Fleet Viewer', 'toll dec test', 30, 'fleet', true)
  ON CONFLICT (name) DO NOTHING;
  SELECT id INTO v_role_view FROM platform.roles WHERE name = 'fleet_viewer';
  INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, status, expires_at)
  VALUES (v_viewer, v_role_view, 'organization', v_org_a, 'active', NULL)
  ON CONFLICT DO NOTHING;

  PERFORM public.toll_sys_import(v_org_a, 'uber', '[
    {"row_type":"trip","platform_trip_id":"t1","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-08T14:00:00-05:00","dropoff_at":"2024-10-08T14:50:00-05:00","payment_method":"card","toll_payback_minor":34000},
    {"row_type":"trip","platform_trip_id":"t11","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-09T10:00:00-05:00","dropoff_at":"2024-10-09T10:40:00-05:00","payment_method":"card","toll_payback_minor":14000},
    {"row_type":"trip","platform_trip_id":"t12","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-09T15:30:00-05:00","dropoff_at":"2024-10-09T16:10:00-05:00","payment_method":"card","toll_payback_minor":5000},
    {"row_type":"adjustment","reference":"adj1","driver_id":"d1","paid_on":"2024-10-09","amount_minor":10000}]'::jsonb,
    'dec-imp-uber', 'smoke');
  PERFORM public.toll_sys_import(v_org_a, 'tag_statement', '[
    {"source_ref":"c1","occurred_at":"2024-10-08T14:20:00-05:00","amount_minor":34000,"plaza_id":"pzA","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c2","occurred_at":"2024-10-08T20:00:00-05:00","amount_minor":50000,"plaza_id":"pzB","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c5","occurred_at":"2024-10-09T08:00:00-05:00","amount_minor":25000,"plaza_id":"pzC","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c9","occurred_at":"2024-10-09T12:00:00-05:00","amount_minor":10000,"plaza_id":"pzC","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c10","occurred_at":"2024-10-09T15:00:00-05:00","amount_minor":5000,"plaza_id":"pzC","vehicle_id":"v1","driver_id":"d1"}]'::jsonb,
    'dec-imp-tag', 'smoke');
  PERFORM public.toll_sys_import(v_org_a, 'driver_cash', '[
    {"source_ref":"c3","occurred_at":"2024-10-08T09:00:00-05:00","amount_minor":20000,"plaza_id":"pzD","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"x"}},
    {"source_ref":"c4","occurred_at":"2024-10-08T10:00:00-05:00","amount_minor":15000,"plaza_id":"pzE","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"y"}},
    {"source_ref":"c6","occurred_at":"2024-10-09T18:00:00-05:00","amount_minor":25000,"plaza_id":"pzC","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"z"}},
    {"source_ref":"c8","occurred_at":"2024-10-09T19:00:00-05:00","amount_minor":24000,"plaza_id":"pzC","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"w"}}]'::jsonb,
    'dec-imp-cash', 'smoke');

  -- ── 1. link_payback ──
  c := pg_temp._dec_ch(v_org_a, 'c1');
  p := pg_temp._dec_pb(v_org_a, 'trip:t1');
  SELECT count(*)::int INTO v_cnt FROM toll.allocations WHERE organization_id = v_org_a AND charge_id = c.id;
  PERFORM pg_temp._dec_refused('link_payback', jsonb_build_object(
    'command_id', 'dec-1-stale', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version - 1, 'expected_payback_version', p.version), 'VERSION_CHANGED');
  SELECT count(*)::int INTO v_cnt2 FROM toll.allocations WHERE organization_id = v_org_a AND charge_id = c.id;
  IF v_cnt2 <> v_cnt THEN RAISE EXCEPTION '1 VERSION_CHANGED wrote rows'; END IF;

  c := pg_temp._dec_ch(v_org_a, 'c9');
  p := pg_temp._dec_pb(v_org_a, 'trip:t11');
  r := pg_temp._dec_cmd('link_payback', jsonb_build_object(
    'command_id', 'dec-1-part', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version,
    'amount_minor', 6000));
  c := pg_temp._dec_ch(v_org_a, 'c9');
  p := pg_temp._dec_pb(v_org_a, 'adj1');
  r := pg_temp._dec_cmd('link_payback', jsonb_build_object(
    'command_id', 'dec-1-rest', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', (r->>'charge_version')::bigint, 'expected_payback_version', p.version));
  IF toll_system.charge_state(v_org_a, c.id) <> 'decided' THEN RAISE EXCEPTION '1 partial fill remainder'; END IF;

  c := pg_temp._dec_ch(v_org_a, 'c1');
  p := pg_temp._dec_pb(v_org_a, 'trip:t1');
  PERFORM pg_temp._dec_refused('link_payback', jsonb_build_object(
    'command_id', 'dec-1-big', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version,
    'amount_minor', 999999), 'AMOUNT_TOO_LARGE');

  r := pg_temp._dec_cmd('link_payback', jsonb_build_object(
    'command_id', 'dec-k1', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_link := (r->>'decision_id')::uuid;
  IF toll_system.charge_state(v_org_a, c.id) <> 'decided'
     OR toll_system.payback_open_minor(v_org_a, p.id) <> 0 THEN
    RAISE EXCEPTION '1 link state';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ledger.entries e
    WHERE e.organization_id = v_org_a
      AND e.metadata ->> 'toll_rule' = 'P6_allocate_platform'
      AND e.metadata ->> 'charge_id' = c.id::text
  ) THEN
    RAISE EXCEPTION '1 missing P6 posting';
  END IF;
  IF (pg_temp._dec_cmd('link_payback', jsonb_build_object('command_id', 'dec-k1')) ->> 'replay') <> 'true' THEN
    RAISE EXCEPTION '1 replay';
  END IF;

  PERFORM pg_temp._dec_nightly_ok(v_org_a);  -- money ties after section 1 (Claude, P2-R4a check)

  -- ── 2. driver_pays / fleet_absorbs ──
  c := pg_temp._dec_ch(v_org_a, 'c2');
  PERFORM pg_temp._dec_refused('driver_pays', jsonb_build_object(
    'command_id', 'dec-2-big', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 99999), 'AMOUNT_TOO_LARGE');
  r := pg_temp._dec_cmd('driver_pays', jsonb_build_object(
    'command_id', 'dec-k2', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 30000, 'reason_code', 'personal_use'));
  r := pg_temp._dec_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'dec-k2b', 'charge_id', c.id, 'expected_charge_version', (r->>'charge_version')::bigint));
  IF toll_system.charge_state(v_org_a, c.id) <> 'decided' THEN RAISE EXCEPTION '2 state'; END IF;
  PERFORM pg_temp._dec_refused('fleet_absorbs', jsonb_build_object(
    'command_id', 'dec-2-decided', 'charge_id', c.id,
    'expected_charge_version', (r->>'charge_version')::bigint), 'WRONG_STATE');

  RESET ROLE;
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, vehicle_id
  ) VALUES (
    v_org_a, '2024-10-10 12:00:00+00', '2024-10-07', 'exact', 5000,
    'tag', 'manual', 'dec-no-driver', 'verified', 'v1'
  );
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', 5000, '2024-10-10 12:00:00+00',
    'dec-no-driver-p2', 1, jsonb_build_object('charge_id', (pg_temp._dec_ch(v_org_a, 'dec-no-driver')).id::text));
  c := pg_temp._dec_ch(v_org_a, 'dec-no-driver');
  PERFORM pg_temp._dec_refused('driver_pays', jsonb_build_object(
    'command_id', 'dec-2-nodrv', 'charge_id', c.id, 'expected_charge_version', c.version), 'WRONG_STATE');

  c := pg_temp._dec_ch(v_org_a, 'c3');
  PERFORM pg_temp._dec_refused('fleet_absorbs', jsonb_build_object(
    'command_id', 'dec-2-unver', 'charge_id', c.id, 'expected_charge_version', c.version), 'WRONG_STATE');

  PERFORM pg_temp._dec_nightly_ok(v_org_a);  -- money ties after section 2 (Claude, P2-R4a check)

  -- ── 3. verify / reject receipts ──
  r := pg_temp._dec_cmd('verify_cash_receipt', jsonb_build_object(
    'command_id', 'dec-k3', 'charge_id', c.id, 'expected_charge_version', c.version));
  IF toll_system.rule_net(v_org_a, 'P3_cash_verified', 'charge_id', c.id::text) <> c.amount_minor THEN
    RAISE EXCEPTION '3 P3 amount';
  END IF;
  IF toll_system.charge_state(v_org_a, c.id) <> 'pending' THEN RAISE EXCEPTION '3 pending after verify'; END IF;
  PERFORM pg_temp._dec_refused('verify_cash_receipt', jsonb_build_object(
    'command_id', 'dec-3-twice', 'charge_id', c.id, 'expected_charge_version', (r->>'charge_version')::bigint),
    'WRONG_STATE');
  PERFORM pg_temp._dec_refused('verify_cash_receipt', jsonb_build_object(
    'command_id', 'dec-3-tag', 'charge_id', (pg_temp._dec_ch(v_org_a, 'c1')).id,
    'expected_charge_version', (pg_temp._dec_ch(v_org_a, 'c1')).version), 'WRONG_STATE');
  r := pg_temp._dec_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'dec-k3b', 'charge_id', c.id, 'expected_charge_version', (r->>'charge_version')::bigint));

  c := pg_temp._dec_ch(v_org_a, 'c4');
  PERFORM pg_temp._dec_refused('reject_cash_receipt', jsonb_build_object(
    'command_id', 'dec-4-noreason', 'charge_id', c.id, 'expected_charge_version', c.version), 'BAD_REQUEST');
  r := pg_temp._dec_cmd('reject_cash_receipt', jsonb_build_object(
    'command_id', 'dec-k4', 'charge_id', c.id, 'expected_charge_version', c.version, 'reason_code', 'no_receipt'));
  IF toll_system.charge_state(v_org_a, c.id) <> 'rejected' THEN RAISE EXCEPTION '4 rejected state'; END IF;
  PERFORM pg_temp._dec_refused('verify_cash_receipt', jsonb_build_object(
    'command_id', 'dec-4-after', 'charge_id', c.id, 'expected_charge_version', (r->>'charge_version')::bigint),
    'WRONG_STATE');

  PERFORM pg_temp._dec_nightly_ok(v_org_a);  -- money ties after section 3 (Claude, P2-R4a check)

  -- ── 4. leave_payback_unlinked ──
  p := pg_temp._dec_pb(v_org_a, 'adj1');
  PERFORM pg_temp._dec_refused('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'dec-5-noreason', 'payback_id', p.id, 'expected_payback_version', p.version), 'BAD_REQUEST');
  r := pg_temp._dec_cmd('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'dec-k5', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'not_a_toll'));
  IF EXISTS (
    SELECT 1 FROM ledger.entries e
    WHERE e.organization_id = v_org_a AND e.metadata ->> 'payback_id' = p.id::text
      AND e.metadata ->> 'toll_rule' LIKE 'P9%'
  ) THEN
    RAISE EXCEPTION '4 unlinked posted ledger';
  END IF;
  p := pg_temp._dec_pb(v_org_a, 'trip:t1');
  PERFORM pg_temp._dec_refused('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'dec-5-left', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'nope'), 'WRONG_STATE');

  PERFORM pg_temp._dec_nightly_ok(v_org_a);  -- money ties after section 4 (Claude, P2-R4a check)

  -- ── 5. undo_decision ──
  c := pg_temp._dec_ch(v_org_a, 'c1');
  p := pg_temp._dec_pb(v_org_a, 'trip:t1');
  PERFORM pg_temp._dec_refused('undo_decision', jsonb_build_object(
    'command_id', 'dec-6-missver', 'decision_id', v_link,
    'expected_versions', jsonb_build_object(c.id::text, c.version)), 'BAD_REQUEST');
  r := pg_temp._dec_cmd('undo_decision', jsonb_build_object(
    'command_id', 'dec-k6', 'decision_id', v_link,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)));
  IF toll_system.charge_state(v_org_a, c.id) <> 'pending'
     OR toll_system.payback_open_minor(v_org_a, p.id) <> 34000 THEN
    RAISE EXCEPTION '6 undo state';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.allocations a
    WHERE a.organization_id = v_org_a AND a.charge_id = c.id AND a.reversed_by IS NOT NULL
  ) THEN
    RAISE EXCEPTION '6 missing reverse allocation';
  END IF;
  c := pg_temp._dec_ch(v_org_a, 'c1');
  p := pg_temp._dec_pb(v_org_a, 'trip:t1');
  PERFORM pg_temp._dec_refused('undo_decision', jsonb_build_object(
    'command_id', 'dec-6-twice', 'decision_id', v_link,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)), 'WRONG_STATE');

  PERFORM pg_temp._dec_nightly_ok(v_org_a);  -- money ties after section 5 (Claude, P2-R4a check)

  -- ── 6. apply_suggestion ──
  c := pg_temp._dec_ch(v_org_a, 'c1');
  p := pg_temp._dec_pb(v_org_a, 'trip:t1');
  RESET ROLE;
  INSERT INTO toll.suggestions (
    organization_id, charge_id, payback_id, score_parts, rules_fired, engine_version, inputs, inputs_hash
  ) VALUES (
    v_org_a, c.id, p.id, '{"total":100}', ARRAY['on_trip'], 'toll-matcher-v1', '{"a":1}', md5('{"a":1}')
  ) RETURNING id INTO v_sug;
  DELETE FROM toll.match_queue WHERE organization_id = v_org_a AND record_id IN (c.id, p.id);
  PERFORM set_config('dec.test_org', v_org_a::text, true);
  r := pg_temp._dec_cmd('apply_suggestion', jsonb_build_object(
    'command_id', 'dec-k7', 'suggestion_id', v_sug,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  IF r ->> 'suggestion_id' IS NULL OR r ->> 'engine_version' IS NULL THEN
    RAISE EXCEPTION '7 apply answer fields';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.match_queue q
    WHERE q.organization_id = v_org_a AND q.record_kind = 'charge' AND q.record_id = c.id
  ) OR NOT EXISTS (
    SELECT 1 FROM toll.match_queue q
    WHERE q.organization_id = v_org_a AND q.record_kind = 'payback' AND q.record_id = p.id
  ) THEN
    RAISE EXCEPTION '7 apply should enqueue pair';
  END IF;
  RESET ROLE;
  INSERT INTO toll.suggestions (
    organization_id, charge_id, payback_id, score_parts, rules_fired, engine_version, inputs, inputs_hash
  ) VALUES (
    v_org_a, c.id, p.id, '{"total":0}', ARRAY['withdrawn'], 'toll-matcher-v1', '{"b":1}', md5('{"b":1}')
  ) RETURNING id INTO v_sug_w;
  UPDATE toll.suggestions SET superseded_by = v_sug_w WHERE id = v_sug;
  PERFORM set_config('dec.test_user', v_owner::text, true);
  PERFORM pg_temp._dec_refused('apply_suggestion', jsonb_build_object(
    'command_id', 'dec-7-stale', 'suggestion_id', v_sug,
    'expected_charge_version', c.version, 'expected_payback_version', p.version), 'WRONG_STATE');

  c := pg_temp._dec_ch(v_org_a, 'c3');
  p := pg_temp._dec_pb(v_org_a, 'trip:t1');
  RESET ROLE;
  INSERT INTO toll.suggestions (
    organization_id, charge_id, payback_id, score_parts, rules_fired, engine_version, inputs, inputs_hash
  ) VALUES (
    v_org_a, (SELECT id FROM toll.charges WHERE source_ref = 'c3' AND organization_id = v_org_a),
    p.id, '{"total":50}', ARRAY['on_trip'], 'toll-matcher-v1', '{"c":1}', md5('{"c":1}')
  ) RETURNING id INTO v_sug;
  PERFORM set_config('dec.test_user', v_owner::text, true);
  PERFORM pg_temp._dec_refused('apply_suggestion', jsonb_build_object(
    'command_id', 'dec-7-unver', 'suggestion_id', v_sug,
    'expected_charge_version', c.version, 'expected_payback_version', p.version), 'WRONG_STATE');

  PERFORM pg_temp._dec_nightly_ok(v_org_a);  -- money ties after section 6 (Claude, P2-R4a check)

  -- ── 7. duplicates ──
  c := pg_temp._dec_ch(v_org_a, 'c6');
  r := pg_temp._dec_cmd('verify_cash_receipt', jsonb_build_object(
    'command_id', 'dec-8a', 'charge_id', c.id, 'expected_charge_version', c.version));
  c := pg_temp._dec_ch(v_org_a, 'c6');
  r := pg_temp._dec_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'dec-8b', 'charge_id', c.id, 'expected_charge_version', c.version));
  c := pg_temp._dec_ch(v_org_a, 'c6');
  r := pg_temp._dec_cmd('confirm_duplicate', jsonb_build_object(
    'command_id', 'dec-k8', 'charge_id', c.id, 'other_charge_id', (pg_temp._dec_ch(v_org_a, 'c5')).id,
    'expected_charge_version', c.version, 'expected_other_version', (pg_temp._dec_ch(v_org_a, 'c5')).version));
  IF (pg_temp._dec_ch(v_org_a, 'c6')).duplicate_of IS NULL THEN RAISE EXCEPTION '8 duplicate_of'; END IF;

  c := pg_temp._dec_ch(v_org_a, 'c8');
  r := pg_temp._dec_cmd('verify_cash_receipt', jsonb_build_object(
    'command_id', 'dec-8r-a', 'charge_id', c.id, 'expected_charge_version', c.version));
  PERFORM pg_temp._dec_cmd('release_duplicate', jsonb_build_object(
    'command_id', 'dec-8r', 'charge_id', c.id, 'other_charge_id', (pg_temp._dec_ch(v_org_a, 'c5')).id,
    'expected_charge_version', (pg_temp._dec_ch(v_org_a, 'c8')).version,
    'expected_other_version', (pg_temp._dec_ch(v_org_a, 'c5')).version));
  IF NOT EXISTS (
    SELECT 1 FROM toll.duplicate_reviews dr
    WHERE dr.organization_id = v_org_a AND dr.status = 'released'
      AND (dr.charge_a = c.id OR dr.charge_b = c.id)
  ) THEN
    RAISE EXCEPTION '8 release status';
  END IF;

  PERFORM pg_temp._dec_refused('confirm_duplicate', jsonb_build_object(
    'command_id', 'dec-8-nopair', 'charge_id', (pg_temp._dec_ch(v_org_a, 'c1')).id,
    'other_charge_id', (pg_temp._dec_ch(v_org_a, 'c2')).id,
    'expected_charge_version', (pg_temp._dec_ch(v_org_a, 'c1')).version,
    'expected_other_version', (pg_temp._dec_ch(v_org_a, 'c2')).version), 'WRONG_STATE');
  PERFORM pg_temp._dec_refused('confirm_duplicate', jsonb_build_object(
    'command_id', 'dec-8-dup', 'charge_id', (pg_temp._dec_ch(v_org_a, 'c6')).id,
    'other_charge_id', (pg_temp._dec_ch(v_org_a, 'c5')).id,
    'expected_charge_version', (pg_temp._dec_ch(v_org_a, 'c6')).version,
    'expected_other_version', (pg_temp._dec_ch(v_org_a, 'c5')).version), 'WRONG_STATE');

  -- resolve pending fixtures so seal_week can close 2024-10-07
  c := pg_temp._dec_ch(v_org_a, 'c5');
  PERFORM pg_temp._dec_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'dec-9-prep-c5', 'charge_id', c.id, 'expected_charge_version', c.version));
  c := pg_temp._dec_ch(v_org_a, 'c8');
  PERFORM pg_temp._dec_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'dec-9-prep-c8', 'charge_id', c.id, 'expected_charge_version', c.version));
  c := pg_temp._dec_ch(v_org_a, 'dec-no-driver');
  PERFORM pg_temp._dec_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'dec-9-prep-nodrv', 'charge_id', c.id, 'expected_charge_version', c.version));
  p := pg_temp._dec_pb(v_org_a, 'trip:t11');
  PERFORM pg_temp._dec_cmd('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'dec-9-prep-t11', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'no_matching_toll'));
  c := pg_temp._dec_ch(v_org_a, 'c10');
  p := pg_temp._dec_pb(v_org_a, 'trip:t12');
  PERFORM pg_temp._dec_cmd('link_payback', jsonb_build_object(
    'command_id', 'dec-9-prep-c10', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));

  PERFORM pg_temp._dec_nightly_ok(v_org_a);  -- money ties after section 7 (Claude, P2-R4a check)

  -- ── 8. sealed weeks / AFTER_SEAL ──
  r := pg_temp._dec_cmd('seal_week', jsonb_build_object(
    'command_id', 'dec-k9', 'week_key', '2024-10-07', 'expected_week_version', 0));
  v_seal := (r->>'decision_id')::uuid;
  c := pg_temp._dec_ch(v_org_a, 'c1');
  p := pg_temp._dec_pb(v_org_a, 'trip:t1');
  PERFORM pg_temp._dec_refused('undo_decision', jsonb_build_object(
    'command_id', 'dec-9-sealed', 'decision_id',
      (SELECT id FROM toll.decisions WHERE organization_id = v_org_a AND command_id = 'dec-k7'),
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)), 'WEEK_SEALED');
  PERFORM pg_temp._dec_refused('undo_decision', jsonb_build_object(
    'command_id', 'dec-9-noundo-seal', 'decision_id', v_seal,
    'expected_versions', jsonb_build_object(c.id::text, c.version)), 'WRONG_STATE');
  PERFORM pg_temp._dec_cmd('reopen_week', jsonb_build_object(
    'command_id', 'dec-k10', 'week_key', '2024-10-07',
    'expected_week_version', (r->'weeks'->0->>'week_version')::bigint,
    'reason', 'decisions test reopen'));

  PERFORM pg_temp._dec_nightly_ok(v_org_a);  -- money ties after section 8 (Claude, P2-R4a check)

  -- ── 9. I4 guard (self-undoing probes) ──
  RESET ROLE;
  SELECT id INTO v_decision FROM toll.decisions WHERE organization_id = v_org_a AND command_id = 'dec-k2' LIMIT 1;
  BEGIN
    INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, decision_id)
    VALUES (v_org_a, (pg_temp._dec_ch(v_org_a, 'c2')).id, 'fleet', 1, v_decision);
    RAISE EXCEPTION 'i4 over-alloc allowed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'ALLOCATIONS_EXCEED_AMOUNT' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO toll.payback_unlinked_decisions (organization_id, payback_id, amount_minor, reason, decision_id)
    VALUES (v_org_a, (pg_temp._dec_pb(v_org_a, 'adj1')).id, 1, 'probe', v_decision);
    RAISE EXCEPTION 'i4 over-unlink allowed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'ALLOCATIONS_EXCEED_AMOUNT' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE toll.charges SET amount_minor = 1
    WHERE organization_id = v_org_a AND id = (pg_temp._dec_ch(v_org_a, 'c2')).id;
    RAISE EXCEPTION 'i4 charge shrink allowed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'ALLOCATIONS_EXCEED_AMOUNT' THEN RAISE; END IF;
  END;

  PERFORM pg_temp._dec_nightly_ok(v_org_a);  -- money ties after section 9 (Claude, P2-R4a check)

  BEGIN  -- payback lowered below its slices (self-undoing probe)
    UPDATE toll.paybacks SET amount_minor = 1
    WHERE organization_id = v_org_a AND id = (pg_temp._dec_pb(v_org_a, 'adj1')).id;
    RAISE EXCEPTION 'i4 payback shrink allowed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'ALLOCATIONS_EXCEED_AMOUNT' THEN RAISE; END IF;
  END;
  PERFORM pg_temp._dec_nightly_ok(v_org_a);

  -- ── 10. replay / isolation / roles ──
  PERFORM pg_temp._dec_refused('seal_week', jsonb_build_object(
    'command_id', 'dec-k1', 'week_key', '2024-10-14', 'expected_week_version', 0), 'COMMAND_ID_REUSED');

  PERFORM public.toll_sys_import(v_org_b, 'tag_statement', '[
    {"source_ref":"dec-b-c1","occurred_at":"2024-10-12T10:00:00-05:00","amount_minor":1000,"plaza_id":"pzB","vehicle_id":"vb","driver_id":"db"}]'::jsonb,
    'dec-b-tag', 'smoke');
  v_ch_b := (pg_temp._dec_ch(v_org_b, 'dec-b-c1')).id;
  PERFORM set_config('dec.test_user', v_owner::text, true);
  PERFORM set_config('dec.test_org', v_org_a::text, true);
  PERFORM pg_temp._dec_refused('fleet_absorbs', jsonb_build_object(
    'command_id', 'dec-10-xorg', 'charge_id', v_ch_b, 'expected_charge_version', 1), 'NOT_FOUND');

  PERFORM set_config('dec.test_user', v_viewer::text, true);
  PERFORM pg_temp._dec_refused('seal_week', jsonb_build_object(
    'command_id', 'dec-10-view', 'week_key', '2024-10-14', 'expected_week_version', 0), 'FORBIDDEN');
  PERFORM set_config('dec.test_user', v_owner::text, true);

  PERFORM pg_temp._dec_nightly_ok(v_org_a);
END;
$$;

ROLLBACK;

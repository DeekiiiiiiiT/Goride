-- Toll S1b: four-eyes, settings owner, matcher refuse, P25 income (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT u.id, u.email
FROM (VALUES
  ('b1b01111-1111-4111-8111-111111111101'::uuid, 's1b-owner2@example.com'),
  ('b1b02111-1111-4111-8111-111111111102'::uuid, 's1b-mgr2@example.com'),
  ('b1b03111-1111-4111-8111-111111111103'::uuid, 's1b-owner1@example.com')
) AS u(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES
  ('b1b11111-1111-4111-8111-111111111101', 'b1b01111-1111-4111-8111-111111111101', 'Toll S1b Two Seat', 'toll-s1b-2', 'fleet', 'active'),
  ('b1b12111-1111-4111-8111-111111111102', 'b1b03111-1111-4111-8111-111111111103', 'Toll S1b One Seat', 'toll-s1b-1', 'fleet', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO toll.switch_state (organization_id, tolls_v2, toll_disputes)
VALUES
  ('b1b11111-1111-4111-8111-111111111101', true, true),
  ('b1b12111-1111-4111-8111-111111111102', true, true)
ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = true, toll_disputes = EXCLUDED.toll_disputes;

SELECT toll_system.ensure_accounts('b1b11111-1111-4111-8111-111111111101');
SELECT toll_system.ensure_accounts('b1b12111-1111-4111-8111-111111111102');

INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system)
VALUES ('fleet_manager', 'Fleet Manager', 's1b test', 50, 'fleet', true)
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE v_role_mgr uuid;
BEGIN
  SELECT id INTO v_role_mgr FROM platform.roles WHERE name = 'fleet_manager';
  INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, status, expires_at)
  VALUES ('b1b02111-1111-4111-8111-111111111102', v_role_mgr, 'organization',
          'b1b11111-1111-4111-8111-111111111101', 'active', NULL)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp._s1b_as(p_user uuid, p_org uuid) RETURNS void
LANGUAGE plpgsql AS $a$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user::text, 'role', 'authenticated',
    'app_metadata', json_build_object('organizationId', p_org::text)
  )::text, true);
  SET LOCAL ROLE authenticated;
END;
$a$;

CREATE OR REPLACE FUNCTION pg_temp._s1b_cmd(p_user uuid, p_org uuid, p_intent text, p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $c$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp._s1b_as(p_user, p_org);
  r := public.toll_v2_command(p_intent, p_body);
  RESET ROLE;
  RETURN r;
END;
$c$;

CREATE OR REPLACE FUNCTION pg_temp._s1b_refused(
  p_user uuid, p_org uuid, p_intent text, p_body jsonb, p_code text) RETURNS void
LANGUAGE plpgsql AS $r$
DECLARE m text;
BEGIN
  BEGIN
    PERFORM pg_temp._s1b_cmd(p_user, p_org, p_intent, p_body);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
    RESET ROLE;
    IF m IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 's1b expected % got %', p_code, m;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 's1b expected % but command succeeded', p_code;
END;
$r$;

CREATE OR REPLACE FUNCTION pg_temp._s1b_refused_detail(
  p_user uuid, p_org uuid, p_intent text, p_body jsonb, p_code text, p_detail jsonb) RETURNS void
LANGUAGE plpgsql AS $rd$
DECLARE m text; d text; j jsonb;
BEGIN
  BEGIN
    PERFORM pg_temp._s1b_cmd(p_user, p_org, p_intent, p_body);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT, d = PG_EXCEPTION_DETAIL;
    RESET ROLE;
    IF m IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 's1b expected % got %', p_code, m;
    END IF;
    j := coalesce(nullif(d, '')::jsonb, '{}'::jsonb);
    IF j @> p_detail IS DISTINCT FROM true THEN
      RAISE EXCEPTION 's1b detail got % want superset %', j, p_detail;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 's1b expected % but command succeeded', p_code;
END;
$rd$;

CREATE OR REPLACE FUNCTION pg_temp._s1b_match_refused(p_org uuid, p_code text) RETURNS jsonb
LANGUAGE plpgsql AS $mr$
DECLARE m text; d text;
BEGIN
  BEGIN
    RETURN toll_system.match_claim(p_org, 50);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT, d = PG_EXCEPTION_DETAIL;
    IF m IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 'match expected % got %', p_code, m;
    END IF;
    RETURN coalesce(nullif(d, '')::jsonb, '{}'::jsonb);
  END;
END;
$mr$;

CREATE OR REPLACE FUNCTION pg_temp._s1b_bal(p_org uuid, p_suffix text) RETURNS bigint
LANGUAGE sql AS $b$
  SELECT coalesce(
    (SELECT balance_minor FROM ledger.accounts
     WHERE account_key = 'org:' || p_org::text || ':toll:' || p_suffix),
    0);
$b$;

CREATE OR REPLACE FUNCTION pg_temp._s1b_ch(p_org uuid, p_ref text) RETURNS toll.charges
LANGUAGE sql AS $ch$
  SELECT * FROM toll.charges WHERE organization_id = p_org AND source_ref = p_ref;
$ch$;

CREATE OR REPLACE FUNCTION pg_temp._s1b_pb(p_org uuid, p_ref text) RETURNS toll.paybacks
LANGUAGE sql AS $pb$
  SELECT * FROM toll.paybacks WHERE organization_id = p_org AND reference = p_ref;
$pb$;

CREATE OR REPLACE FUNCTION pg_temp._s1b_import(
  p_org uuid, p_suffix text, p_week date, p_charge bigint, p_pb bigint, p_plaza text DEFAULT 's1b-pz')
RETURNS void
LANGUAGE plpgsql AS $imp$
DECLARE
  v_occurred timestamptz := ((p_week + 2) + time '14:00') AT TIME ZONE 'America/Jamaica';
  v_trip timestamptz := ((p_week + 1) + time '15:00') AT TIME ZONE 'America/Jamaica';
BEGIN
  PERFORM public.toll_sys_import(p_org, 'uber', format(
    '[{"row_type":"trip","platform_trip_id":"%s","driver_id":"s1b-d1","vehicle_id":"v1",
      "request_at":"%s","dropoff_at":"%s","payment_method":"card","toll_payback_minor":%s}]',
    's1b-trip-' || p_suffix, v_trip, v_trip + interval '40 minutes', p_pb)::jsonb,
    's1b-uber-' || p_suffix, 'smoke');
  PERFORM public.toll_sys_import(p_org, 'tag_statement', format(
    '[{"source_ref":"%s","occurred_at":"%s","amount_minor":%s,"plaza_id":"%s",
      "vehicle_id":"v1","driver_id":"s1b-d1"}]',
    's1b-ch-' || p_suffix, v_occurred, p_charge, p_plaza)::jsonb,
    's1b-tag-' || p_suffix, 'smoke');
END;
$imp$;

CREATE OR REPLACE FUNCTION pg_temp._s1b_link(p_org uuid, p_user uuid, p_suffix text) RETURNS jsonb
LANGUAGE plpgsql AS $lk$
DECLARE c toll.charges; p toll.paybacks;
BEGIN
  c := pg_temp._s1b_ch(p_org, 's1b-ch-' || p_suffix);
  p := pg_temp._s1b_pb(p_org, 'trip:s1b-trip-' || p_suffix);
  RETURN pg_temp._s1b_cmd(p_user, p_org, 'link_payback', jsonb_build_object(
    'command_id', 's1b-link-' || p_suffix, 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
END;
$lk$;

CREATE OR REPLACE FUNCTION pg_temp._s1b_assert_nightly(p_org uuid) RETURNS void
LANGUAGE plpgsql AS $n$
DECLARE r record;
BEGIN
  RESET ROLE;
  FOR r IN SELECT * FROM toll_system.nightly_checks(p_org) LOOP
    IF NOT r.ok THEN
      RAISE EXCEPTION 'nightly % (%) %', r.check_no, r.name, r.detail;
    END IF;
  END LOOP;
END;
$n$;

DO $$
DECLARE
  v_owner2  uuid := 'b1b01111-1111-4111-8111-111111111101';
  v_mgr2    uuid := 'b1b02111-1111-4111-8111-111111111102';
  v_org2    uuid := 'b1b11111-1111-4111-8111-111111111101';
  v_owner1  uuid := 'b1b03111-1111-4111-8111-111111111103';
  v_org1    uuid := 'b1b12111-1111-4111-8111-111111111102';
  v_role_mgr uuid;
  v_week    date;
  v_r       jsonb;
  c         toll.charges;
  p         toll.paybacks;
  d         toll.disputes;
  v_dispute uuid;
  v_dec     uuid;
  v_link    uuid;
  v_req     uuid;
  v_exec    uuid;
  v_actor   uuid;
  v_approver uuid;
  v_appr_id uuid;
  v_intent  text;
  v_msg     text;
  v_cnt     int;
  v_cnt2    int;
  v_detail  jsonb;
  v_before  text;
  v_after   text;
  v_fact    uuid;
  v_ver     bigint;
  v_self    int;
  v_queue   int;
  v_amt     bigint;
  v_rates   int;
  v_seed    int;
  v_mix_pre uuid;
BEGIN
  SELECT id INTO v_role_mgr FROM platform.roles WHERE name = 'fleet_manager';

  IF toll_system.manage_seat_count(v_org2) <> 2 THEN
    RAISE EXCEPTION 'setup two-seat count %', toll_system.manage_seat_count(v_org2);
  END IF;
  IF toll_system.manage_seat_count(v_org1) <> 1 THEN
    RAISE EXCEPTION 'setup one-seat count %', toll_system.manage_seat_count(v_org1);
  END IF;

  v_week := ledger.jamaica_week_start((now() AT TIME ZONE 'America/Jamaica')::timestamptz - interval '21 days');

  -- ── 1. Switch off: no NEEDS_APPROVAL, no P25; matcher ignores missing settings ──
  UPDATE toll.switch_state SET toll_disputes = false WHERE organization_id = v_org2;

  PERFORM pg_temp._s1b_import(v_org2, 'sw', v_week, 39000, 39000);
  PERFORM pg_temp._s1b_link(v_org2, v_owner2, 'sw');
  PERFORM pg_temp._s1b_cmd(v_owner2, v_org2, 'seal_week', jsonb_build_object(
    'command_id', 's1b-sw-seal', 'week_key', v_week, 'expected_week_version', 0));
  v_r := pg_temp._s1b_cmd(v_owner2, v_org2, 'reopen_week', jsonb_build_object(
    'command_id', 's1b-sw-reopen', 'week_key', v_week, 'expected_week_version', 1,
    'reason', 'switch-off reopen'));

  PERFORM pg_temp._s1b_import(v_org2, 'sw6k', v_week + 7, 600000, 600000);
  v_r := pg_temp._s1b_link(v_org2, v_owner2, 'sw6k');
  v_link := (v_r ->> 'decision_id')::uuid;
  c := pg_temp._s1b_ch(v_org2, 's1b-ch-sw6k');
  p := pg_temp._s1b_pb(v_org2, 'trip:s1b-trip-sw6k');
  v_r := pg_temp._s1b_cmd(v_owner2, v_org2, 'undo_decision', jsonb_build_object(
    'command_id', 's1b-sw-undo6k', 'decision_id', v_link,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)));

  PERFORM pg_temp._s1b_import(v_org2, 'swk', v_week + 7, 35000, 35000);
  p := pg_temp._s1b_pb(v_org2, 'trip:s1b-trip-swk');
  v_r := pg_temp._s1b_cmd(v_owner2, v_org2, 'leave_payback_unlinked', jsonb_build_object(
    'command_id', 's1b-sw-keep', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'switch-off keep'));
  IF pg_temp._s1b_bal(v_org2, 'other_income') <> 0 THEN
    RAISE EXCEPTION '1 switch off P25 other_income %', pg_temp._s1b_bal(v_org2, 'other_income');
  END IF;

  DELETE FROM toll.platform_settings WHERE organization_id = v_org2;
  DELETE FROM toll.dispute_policy WHERE organization_id = v_org2;
  DELETE FROM toll.plaza_rules WHERE plaza_id = 's1b-pz';
  v_queue := (SELECT count(*)::int FROM toll.match_queue WHERE organization_id = v_org2);
  v_r := toll_system.match_claim(v_org2, 50);
  IF (v_r ->> 'claim_id') IS NULL AND v_queue > 0 THEN
    RAISE EXCEPTION '1 switch off match_claim null with queue';
  END IF;

  UPDATE toll.switch_state SET toll_disputes = true WHERE organization_id = v_org2;
  PERFORM toll_system.seed_dispute_setup(v_org2, false);

  -- ── 2. Threshold J$5,000.00 vs J$5,000.01 (two-seat, disputes on) ──
  PERFORM pg_temp._s1b_import(v_org2, 'th5k', v_week + 14, 400000, 37000);
  c := pg_temp._s1b_ch(v_org2, 's1b-ch-th5k');
  v_r := pg_temp._s1b_cmd(v_owner2, v_org2, 'correct_charge_amount', jsonb_build_object(
    'command_id', 's1b-th5k-exact', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 900000, 'reason_code', 'exact5k'));
  PERFORM pg_temp._s1b_import(v_org2, 'th5k-over', v_week + 17, 400000, 37000);
  c := pg_temp._s1b_ch(v_org2, 's1b-ch-th5k-over');
  PERFORM pg_temp._s1b_refused_detail(v_owner2, v_org2, 'correct_charge_amount', jsonb_build_object(
    'command_id', 's1b-th5k-over', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 900001, 'reason_code', 'over5k'), 'NEEDS_APPROVAL',
    jsonb_build_object('amount_minor', 500001, 'sole_manager', false));

  PERFORM pg_temp._s1b_import(v_org2, 'th5k-wk', v_week + 21, 500000, 37000);
  c := pg_temp._s1b_ch(v_org2, 's1b-ch-th5k-wk');
  v_r := pg_temp._s1b_cmd(v_owner2, v_org2, 'correct_charge_week', jsonb_build_object(
    'command_id', 's1b-th5k-wk-ok', 'charge_id', c.id, 'expected_charge_version', c.version,
    'occurred_at', ((v_week + 28) + time '12:00') AT TIME ZONE 'America/Jamaica',
    'reason_code', 'wk5k'));
  PERFORM pg_temp._s1b_import(v_org2, 'th5k-wk2', v_week + 35, 500001, 37000);
  c := pg_temp._s1b_ch(v_org2, 's1b-ch-th5k-wk2');
  PERFORM pg_temp._s1b_refused_detail(v_owner2, v_org2, 'correct_charge_week', jsonb_build_object(
    'command_id', 's1b-th5k-wk-bad', 'charge_id', c.id, 'expected_charge_version', c.version,
    'occurred_at', ((v_week + 42) + time '12:00') AT TIME ZONE 'America/Jamaica',
    'reason_code', 'wk5k1'), 'NEEDS_APPROVAL',
    jsonb_build_object('amount_minor', 500001, 'sole_manager', false));

  PERFORM pg_temp._s1b_import(v_org2, 'th-undo6', v_week + 49, 600000, 600000);
  v_r := pg_temp._s1b_link(v_org2, v_owner2, 'th-undo6');
  v_link := (v_r ->> 'decision_id')::uuid;
  c := pg_temp._s1b_ch(v_org2, 's1b-ch-th-undo6');
  p := pg_temp._s1b_pb(v_org2, 'trip:s1b-trip-th-undo6');
  PERFORM pg_temp._s1b_refused_detail(v_owner2, v_org2, 'undo_decision', jsonb_build_object(
    'command_id', 's1b-th-undo6', 'decision_id', v_link,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)),
    'NEEDS_APPROVAL', jsonb_build_object('amount_minor', 600000, 'sole_manager', false));

  PERFORM pg_temp._s1b_import(v_org2, 'th-lost', v_week + 56, 600001, 37000);
  c := pg_temp._s1b_ch(v_org2, 's1b-ch-th-lost');
  p := pg_temp._s1b_pb(v_org2, 'trip:s1b-trip-th-lost');
  v_r := pg_temp._s1b_cmd(v_owner2, v_org2, 'open_dispute', jsonb_build_object(
    'command_id', 's1b-th-lost-open', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org2 AND id = v_dispute;
  PERFORM pg_temp._s1b_cmd(v_owner2, v_org2, 'mark_dispute_sent', jsonb_build_object(
    'command_id', 's1b-th-lost-sent', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org2 AND id = v_dispute;
  PERFORM pg_temp._s1b_refused_detail(v_owner2, v_org2, 'close_dispute_lost', jsonb_build_object(
    'command_id', 's1b-th-lost', 'dispute_id', v_dispute, 'expected_dispute_version', d.version),
    'NEEDS_APPROVAL', jsonb_build_object('amount_minor', 600001, 'sole_manager', false));

  PERFORM pg_temp._s1b_import(v_org2, 'th-settle', v_week + 63, 600001, 37000);
  c := pg_temp._s1b_ch(v_org2, 's1b-ch-th-settle');
  p := pg_temp._s1b_pb(v_org2, 'trip:s1b-trip-th-settle');
  v_r := pg_temp._s1b_cmd(v_owner2, v_org2, 'open_dispute', jsonb_build_object(
    'command_id', 's1b-th-set-open', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org2 AND id = v_dispute;
  PERFORM pg_temp._s1b_cmd(v_owner2, v_org2, 'mark_dispute_sent', jsonb_build_object(
    'command_id', 's1b-th-set-sent', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  PERFORM public.toll_sys_import(v_org2, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1b-adj-th-settle","driver_id":"s1b-d1","paid_on":"%s","amount_minor":600001}]',
    (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb, 's1b-adj-th-settle', 'smoke');
  p := pg_temp._s1b_pb(v_org2, 's1b-adj-th-settle');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org2 AND id = v_dispute;
  PERFORM pg_temp._s1b_refused_detail(v_owner2, v_org2, 'settle_dispute', jsonb_build_object(
    'command_id', 's1b-th-settle', 'dispute_id', v_dispute, 'payback_id', p.id,
    'expected_dispute_version', d.version, 'expected_payback_version', p.version),
    'NEEDS_APPROVAL', jsonb_build_object('amount_minor', 600001, 'sole_manager', false));

  PERFORM pg_temp._s1b_import(v_org2, 'th-sys', v_week + 70, 700000, 37000);
  c := pg_temp._s1b_ch(v_org2, 's1b-ch-th-sys');
  p := pg_temp._s1b_pb(v_org2, 'trip:s1b-trip-th-sys');
  v_r := pg_temp._s1b_cmd(v_owner2, v_org2, 'open_dispute', jsonb_build_object(
    'command_id', 's1b-th-sys-open', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() - interval '2 hours'
  WHERE organization_id = v_org2 AND id = v_dispute;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id)
  VALUES (v_org2, 's1b-th-sys-exp', 'dispute_expire', 'user', v_owner2) RETURNING id INTO v_dec;
  PERFORM toll_system.dispute_expire(v_org2, v_dispute, v_dec, 's1b-th-sys-exp-cmd');
  PERFORM public.toll_sys_import(v_org2, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1b-adj-th-sys","driver_id":"s1b-d1","paid_on":"%s","amount_minor":700000}]',
    (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb, 's1b-adj-th-sys', 'smoke');
  p := pg_temp._s1b_pb(v_org2, 's1b-adj-th-sys');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org2 AND id = v_dispute;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id)
  VALUES (v_org2, 's1b-th-sys-set', 'settle_dispute', 'user', v_owner2) RETURNING id INTO v_dec;
  PERFORM toll_write.intent_settle_dispute(v_org2, v_dec, 's1b-th-sys-set-cmd', jsonb_build_object(
    'dispute_id', v_dispute, 'payback_id', p.id, 'expected_dispute_version', d.version,
    'expected_payback_version', p.version), true);

  -- ── 3. Always gated: reopen_week, change_toll_settings ──
  PERFORM pg_temp._s1b_refused(v_owner2, v_org2, 'reopen_week', jsonb_build_object(
    'command_id', 's1b-always-reopen', 'week_key', v_week, 'expected_week_version', 2,
    'reason', 'four eyes reopen'), 'NEEDS_APPROVAL');
  UPDATE toll.switch_state SET toll_disputes = false WHERE organization_id = v_org2;
  PERFORM pg_temp._s1b_refused(v_owner2, v_org2, 'change_toll_settings', jsonb_build_object(
    'command_id', 's1b-always-settings', 'note', 'seed note',
    'dispute_policy', jsonb_build_object('lost_bearer', 'driver')), 'NEEDS_APPROVAL');
  UPDATE toll.switch_state SET toll_disputes = true WHERE organization_id = v_org2;

  -- ── 4. Prepare + approve (two-seat) ──
  PERFORM pg_temp._s1b_cmd(v_owner2, v_org2, 'seal_week', jsonb_build_object(
    'command_id', 's1b-pa-seal', 'week_key', v_week, 'expected_week_version', 2));
  v_r := pg_temp._s1b_cmd(v_owner2, v_org2, 'request_approval', jsonb_build_object(
    'command_id', 's1b-pa-req', 'intent', 'reopen_week',
    'body', jsonb_build_object(
      'command_id', 's1b-pa-reopen', 'week_key', v_week, 'expected_week_version', 3,
      'reason', 'prepared reopen'),
    'note', 'A prepares'));
  v_req := (v_r ->> 'request_id')::uuid;
  PERFORM pg_temp._s1b_refused(v_owner2, v_org2, 'approve_request', jsonb_build_object(
    'command_id', 's1b-pa-self', 'request_id', v_req), 'SAME_PERSON');
  v_r := pg_temp._s1b_cmd(v_mgr2, v_org2, 'approve_request', jsonb_build_object(
    'command_id', 's1b-pa-approve', 'request_id', v_req));
  v_exec := (v_r ->> 'executed_decision_id')::uuid;
  SELECT actor_user_id, approved_by, approval_id, intent
  INTO v_actor, v_approver, v_appr_id, v_intent
  FROM toll.decisions WHERE organization_id = v_org2 AND id = v_exec;
  IF v_actor IS DISTINCT FROM v_owner2 OR v_approver IS DISTINCT FROM v_mgr2
     OR v_appr_id IS DISTINCT FROM v_req OR v_intent IS DISTINCT FROM 'reopen_week' THEN
    RAISE EXCEPTION '4 executed decision metadata';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.approval_requests ar
    WHERE ar.id = v_req AND ar.status = 'approved' AND ar.executed_decision_id = v_exec) THEN
    RAISE EXCEPTION '4 request not approved';
  END IF;
  PERFORM pg_temp._s1b_refused(v_mgr2, v_org2, 'approve_request', jsonb_build_object(
    'command_id', 's1b-pa-twice', 'request_id', v_req), 'WRONG_STATE');

  v_r := pg_temp._s1b_cmd(v_owner2, v_org2, 'request_approval', jsonb_build_object(
    'command_id', 's1b-pa-rej-req', 'intent', 'reopen_week',
    'body', jsonb_build_object(
      'command_id', 's1b-pa-rej-body', 'week_key', v_week, 'expected_week_version', 4,
      'reason', 'to reject'),
    'note', 'reject me'));
  v_req := (v_r ->> 'request_id')::uuid;
  v_amt := pg_temp._s1b_bal(v_org2, 'payback_unallocated');
  PERFORM pg_temp._s1b_cmd(v_mgr2, v_org2, 'reject_request', jsonb_build_object(
    'command_id', 's1b-pa-reject', 'request_id', v_req));
  IF pg_temp._s1b_bal(v_org2, 'payback_unallocated') IS DISTINCT FROM v_amt THEN
    RAISE EXCEPTION '4 reject moved money';
  END IF;

  v_r := pg_temp._s1b_cmd(v_owner2, v_org2, 'request_approval', jsonb_build_object(
    'command_id', 's1b-pa-wd-req', 'intent', 'reopen_week',
    'body', jsonb_build_object(
      'command_id', 's1b-pa-wd-body', 'week_key', v_week, 'expected_week_version', 4,
      'reason', 'to withdraw'),
    'note', 'withdraw me'));
  v_req := (v_r ->> 'request_id')::uuid;
  PERFORM pg_temp._s1b_cmd(v_owner2, v_org2, 'withdraw_request', jsonb_build_object(
    'command_id', 's1b-pa-withdraw', 'request_id', v_req));

  PERFORM pg_temp._s1b_import(v_org2, 'pa-stale', v_week + 63, 400000, 37000);
  c := pg_temp._s1b_ch(v_org2, 's1b-ch-pa-stale');
  v_ver := c.version;
  v_r := pg_temp._s1b_cmd(v_owner2, v_org2, 'request_approval', jsonb_build_object(
    'command_id', 's1b-pa-ver-req', 'intent', 'correct_charge_amount',
    'body', jsonb_build_object(
      'command_id', 's1b-pa-ver-body', 'charge_id', c.id, 'expected_charge_version', v_ver,
      'amount_minor', 900001, 'reason_code', 'stale'),
    'note', 'version trap'));
  v_req := (v_r ->> 'request_id')::uuid;
  PERFORM pg_temp._s1b_cmd(v_owner2, v_org2, 'correct_charge_amount', jsonb_build_object(
    'command_id', 's1b-pa-bump', 'charge_id', c.id, 'expected_charge_version', v_ver,
    'amount_minor', 410000, 'reason_code', 'bump', 'self_approval_reason', 'solo bump version'));
  BEGIN
    PERFORM pg_temp._s1b_cmd(v_mgr2, v_org2, 'approve_request', jsonb_build_object(
      'command_id', 's1b-pa-ver-bad', 'request_id', v_req));
    RAISE EXCEPTION '4 approve stale should fail';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT IN ('VERSION_CHANGED', 'BAD_REQUEST', 'WRONG_STATE') THEN
      RAISE EXCEPTION '4 stale approve got %', v_msg;
    END IF;
  END;
  IF (SELECT status FROM toll.approval_requests WHERE id = v_req) <> 'pending' THEN
    RAISE EXCEPTION '4 stale request not pending';
  END IF;

  -- ── 5. Sole manager (one-seat org) ──
  PERFORM pg_temp._s1b_import(v_org1, 'sole', v_week, 600001, 37000);
  c := pg_temp._s1b_ch(v_org1, 's1b-ch-sole');
  PERFORM pg_temp._s1b_refused(v_owner1, v_org1, 'correct_charge_amount', jsonb_build_object(
    'command_id', 's1b-sole-bad-reason', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 1100002, 'reason_code', 'x', 'self_approval_reason', 'short'), 'BAD_REQUEST');
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'correct_charge_amount', jsonb_build_object(
    'command_id', 's1b-sole-self', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 1100002, 'reason_code', 'x', 'self_approval_reason', 'twelve chars'));
  v_dec := (v_r ->> 'decision_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM toll.self_approvals sa WHERE sa.id = v_dec AND sa.self_approved) THEN
    RAISE EXCEPTION '5 not in self_approvals';
  END IF;
  c := pg_temp._s1b_ch(v_org2, 's1b-ch-th5k-over');
  PERFORM pg_temp._s1b_refused(v_owner2, v_org2, 'correct_charge_amount', jsonb_build_object(
    'command_id', 's1b-two-seat-self', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', c.amount_minor + 500001, 'reason_code', 'x', 'self_approval_reason', 'twelve chars'),
    'SELF_APPROVAL_NOT_ALLOWED');

  INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, status, expires_at)
  VALUES (v_owner1, v_role_mgr, 'organization', v_org1, 'active', NULL)
  ON CONFLICT DO NOTHING;
  v_self := toll_system.manage_seat_count(v_org1);
  IF v_self <> 1 THEN RAISE EXCEPTION '5 owner+seat count %', v_self; END IF;
  c := pg_temp._s1b_ch(v_org1, 's1b-ch-sole');
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'correct_charge_amount', jsonb_build_object(
    'command_id', 's1b-owner-seat', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 900003, 'reason_code', 'x', 'self_approval_reason', 'twelve chars'));

  INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, status, expires_at)
  VALUES (v_mgr2, v_role_mgr, 'organization', v_org1, 'active', NULL)
  ON CONFLICT DO NOTHING;
  c := pg_temp._s1b_ch(v_org1, 's1b-ch-sole');
  PERFORM pg_temp._s1b_refused(v_owner1, v_org1, 'correct_charge_amount', jsonb_build_object(
    'command_id', 's1b-sole-now2', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', c.amount_minor + 500001, 'reason_code', 'x', 'self_approval_reason', 'twelve chars'),
    'SELF_APPROVAL_NOT_ALLOWED');
  DELETE FROM platform.user_roles WHERE user_id = v_mgr2 AND scope_id = v_org1;

  -- ── 6. Settings change + seed ──
  DELETE FROM toll.platform_settings WHERE organization_id = v_org1;
  DELETE FROM toll.dispute_policy WHERE organization_id = v_org1;
  DELETE FROM toll.audit_log WHERE organization_id = v_org1;
  PERFORM pg_temp._s1b_import(v_org1, 'set', v_week, 39000, 37000);

  SELECT count(*)::int INTO v_seed FROM toll.platform_settings WHERE organization_id = v_org1;
  IF v_seed > 0 THEN RAISE EXCEPTION '6 settings not empty'; END IF;

  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'approve_settings_seed', jsonb_build_object(
    'command_id', 's1b-seed1', 'note', 'first seed',
    'self_approval_reason', 'twelve chars'));
  SELECT count(*)::int INTO v_seed FROM toll.platform_settings WHERE organization_id = v_org1;
  IF v_seed < 3 THEN RAISE EXCEPTION '6 seed platforms %', v_seed; END IF;
  IF NOT EXISTS (SELECT 1 FROM toll.dispute_policy WHERE organization_id = v_org1) THEN
    RAISE EXCEPTION '6 no dispute_policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM toll.plaza_rules WHERE plaza_id = 's1b-pz') THEN
    RAISE EXCEPTION '6 no plaza_rules';
  END IF;
  v_cnt := (SELECT count(*)::int FROM toll.dispute_text_templates WHERE organization_id = v_org1);
  IF v_cnt < 1 THEN RAISE EXCEPTION '6 no template'; END IF;

  v_cnt := (SELECT count(*)::int FROM toll.audit_log WHERE organization_id = v_org1);
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'approve_settings_seed', jsonb_build_object(
    'command_id', 's1b-seed2', 'note', 'second seed',
    'self_approval_reason', 'twelve chars'));
  IF (SELECT count(*)::int FROM toll.audit_log WHERE organization_id = v_org1) <> v_cnt THEN
    RAISE EXCEPTION '6 second seed wrote audit';
  END IF;

  SELECT lost_bearer INTO v_before FROM toll.dispute_policy WHERE organization_id = v_org1;
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'change_toll_settings', jsonb_build_object(
    'command_id', 's1b-chg-pol', 'note', 'only lost',
    'self_approval_reason', 'twelve chars',
    'dispute_policy', jsonb_build_object('lost_bearer', CASE WHEN v_before = 'fleet' THEN 'driver' ELSE 'fleet' END)));
  SELECT lost_bearer INTO v_after FROM toll.dispute_policy WHERE organization_id = v_org1;
  IF v_after = v_before THEN RAISE EXCEPTION '6 lost_bearer unchanged'; END IF;
  -- review R3: before / after are on the response, and the missing key (expired_bearer) is left alone
  IF jsonb_array_length(v_r -> 'changes') <> 1
     OR v_r -> 'changes' -> 0 -> 'before' ->> 'lost_bearer' IS DISTINCT FROM v_before
     OR v_r -> 'changes' -> 0 -> 'after' ->> 'lost_bearer' IS DISTINCT FROM v_after
     OR v_r -> 'changes' -> 0 -> 'after' ->> 'expired_bearer'
        IS DISTINCT FROM v_r -> 'changes' -> 0 -> 'before' ->> 'expired_bearer' THEN
    RAISE EXCEPTION '6 response before/after %', v_r;
  END IF;
  IF (SELECT response -> 'changes' FROM toll.decisions WHERE organization_id = v_org1 AND command_id = 's1b-chg-pol')
     IS DISTINCT FROM v_r -> 'changes' THEN
    RAISE EXCEPTION '6 decision response missing changes';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.audit_log al
    WHERE al.organization_id = v_org1 AND al.table_name = 'toll.dispute_policy'
      AND al.old_row IS NOT NULL AND al.new_row IS NOT NULL) THEN
    RAISE EXCEPTION '6 audit before/after';
  END IF;
  PERFORM pg_temp._s1b_refused(v_owner1, v_org1, 'change_toll_settings', jsonb_build_object(
    'command_id', 's1b-chg-bad', 'note', 'bad key', 'self_approval_reason', 'twelve chars',
    'bogus_key', 'x'), 'BAD_REQUEST');

  v_rates := (SELECT count(*)::int FROM toll.plaza_rates WHERE plaza_id = 's1b-pz');
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'change_toll_settings', jsonb_build_object(
    'command_id', 's1b-rate-add', 'note', 'rate add',
    'self_approval_reason', 'twelve chars',
    'plaza_rates_add', jsonb_build_array(jsonb_build_object(
      'plaza_id', 's1b-pz', 'platform', 'uber', 'rate_minor', 39000,
      'effective_from', v_week::text))));
  IF (SELECT count(*)::int FROM toll.plaza_rates WHERE plaza_id = 's1b-pz') <> v_rates + 1 THEN
    RAISE EXCEPTION '6 plaza_rates_add';
  END IF;

  -- ── 7. Settings missing (a new plaza, settings deleted): the matcher sets them up itself and claims ──
  PERFORM pg_temp._s1b_import(v_org1, 'm7', v_week + 70, 39000, 37000, 's1b-pz-miss');
  DELETE FROM toll.platform_settings WHERE organization_id = v_org1;
  DELETE FROM toll.dispute_policy WHERE organization_id = v_org1;
  UPDATE toll.switch_state SET toll_disputes = true WHERE organization_id = v_org1;
  v_r := toll_system.match_claim(v_org1, 50);
  IF v_r IS NULL OR (v_r ->> 'claim_id') IS NULL THEN
    RAISE EXCEPTION '7 match did not set up and claim %', v_r;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM toll.platform_settings WHERE organization_id = v_org1 AND platform = 'uber')
     OR NOT EXISTS (SELECT 1 FROM toll.dispute_policy WHERE organization_id = v_org1)
     OR NOT EXISTS (SELECT 1 FROM toll.plaza_rules WHERE plaza_id = 's1b-pz-miss') THEN
    RAISE EXCEPTION '7 settings not set up by the matcher';
  END IF;

  -- ── 8. Toll income P25 + undo; carried P19 path ──
  UPDATE toll.switch_state SET toll_disputes = true WHERE organization_id = v_org1;
  PERFORM public.toll_sys_import(v_org1, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1b-adj-inc","driver_id":"s1b-d1","paid_on":"%s","amount_minor":35000}]',
    (v_week + 7)::text)::jsonb, 's1b-adj-inc', 'smoke');
  p := pg_temp._s1b_pb(v_org1, 's1b-adj-inc');
  v_amt := pg_temp._s1b_bal(v_org1, 'payback_unallocated');
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'leave_payback_unlinked', jsonb_build_object(
    'command_id', 's1b-inc-keep', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'income test'));
  IF pg_temp._s1b_bal(v_org1, 'other_income') <> 35000 THEN
    RAISE EXCEPTION '8 other_income %', pg_temp._s1b_bal(v_org1, 'other_income');
  END IF;
  IF pg_temp._s1b_bal(v_org1, 'payback_unallocated') <> v_amt - 35000 THEN
    RAISE EXCEPTION '8 payback_unallocated';
  END IF;
  PERFORM pg_temp._s1b_assert_nightly(v_org1);
  v_dec := (v_r ->> 'decision_id')::uuid;
  p := pg_temp._s1b_pb(v_org1, 's1b-adj-inc');
  PERFORM pg_temp._s1b_cmd(v_owner1, v_org1, 'undo_decision', jsonb_build_object(
    'command_id', 's1b-inc-undo', 'decision_id', v_dec,
    'expected_versions', jsonb_build_object(p.id::text, p.version)));
  IF pg_temp._s1b_bal(v_org1, 'other_income') <> 0 OR pg_temp._s1b_bal(v_org1, 'payback_unallocated') <> v_amt THEN
    RAISE EXCEPTION '8 undo income balances';
  END IF;
  PERFORM pg_temp._s1b_assert_nightly(v_org1);

  PERFORM pg_temp._s1b_import(v_org1, 'inc-cf', v_week + 14, 50000, 50000);
  PERFORM pg_temp._s1b_link(v_org1, v_owner1, 'inc-cf');
  PERFORM pg_temp._s1b_cmd(v_owner1, v_org1, 'seal_week', jsonb_build_object(
    'command_id', 's1b-inc-cf-seal', 'week_key', v_week + 14,
    'expected_week_version', toll_system.week_version(v_org1, v_week + 14)));
  INSERT INTO ledger.settlement_movements (
    organization_id, driver_id, period_anchor, kind, amount_minor, idempotency_key, status
  ) VALUES (v_org1, 's1b-d1', v_week + 14, 'pay', 100, 's1b-inc-cf-paid', 'posted');
  c := pg_temp._s1b_ch(v_org1, 's1b-ch-inc-cf');
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'carry_forward', jsonb_build_object(
    'command_id', 's1b-inc-cf', 'from_week', v_week + 14, 'to_week', v_week + 21,
    'kind', 'correction_down', 'charge_id', c.id, 'expected_charge_version', c.version,
    'amount_minor', 10000, 'reason_code', 'plat share'));
  v_fact := (v_r -> 'carried_fact_ids' ->> 0)::uuid;
  v_ver := (SELECT version FROM toll.carried_facts WHERE id = v_fact);
  v_amt := pg_temp._s1b_bal(v_org1, 'other_income');
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'leave_payback_unlinked', jsonb_build_object(
    'command_id', 's1b-inc-carried', 'carried_fact_id', v_fact, 'expected_carried_version', v_ver,
    'amount_minor', 5000, 'reason_code', 'p19 share'));
  IF pg_temp._s1b_bal(v_org1, 'other_income') <> v_amt + 5000 THEN
    RAISE EXCEPTION '8 carried P25 %', pg_temp._s1b_bal(v_org1, 'other_income');
  END IF;
  PERFORM pg_temp._s1b_assert_nightly(v_org1);

  -- ── 9. Legacy carve-out ──
  UPDATE toll.switch_state SET toll_disputes = false WHERE organization_id = v_org1;
  PERFORM pg_temp._s1b_import(v_org1, 'leg', v_week + 28, 39000, 70000);
  p := pg_temp._s1b_pb(v_org1, 'trip:s1b-trip-leg');
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'leave_payback_unlinked', jsonb_build_object(
    'command_id', 's1b-leg-pre', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'pre switch keep'));
  v_dec := (v_r ->> 'decision_id')::uuid;
  IF toll_system.unlinked_has_p25(v_org1, v_dec) THEN
    RAISE EXCEPTION '9 pre-switch had P25';
  END IF;
  -- review R2: a payback with a pre-switch part-keep (J$400) and, later, a post-switch keep of the rest
  PERFORM public.toll_sys_import(v_org1, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1b-adj-mix","driver_id":"s1b-d1","paid_on":"%s","amount_minor":100000}]',
    (v_week + 28)::text)::jsonb, 's1b-adj-mix', 'smoke');
  p := pg_temp._s1b_pb(v_org1, 's1b-adj-mix');
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'leave_payback_unlinked', jsonb_build_object(
    'command_id', 's1b-mix-pre', 'payback_id', p.id, 'expected_payback_version', p.version,
    'amount_minor', 40000, 'reason_code', 'pre switch part keep'));
  v_mix_pre := (v_r ->> 'decision_id')::uuid;
  UPDATE toll.switch_state SET toll_disputes = true WHERE organization_id = v_org1;
  DELETE FROM toll.legacy_carve_outs WHERE organization_id = v_org1;
  v_r := toll_system.record_legacy_kept(v_org1);
  IF (v_r ->> 'amount_minor')::bigint <> 110000 THEN
    RAISE EXCEPTION '9 carve-out %', v_r;
  END IF;
  BEGIN
    PERFORM toll_system.record_legacy_kept(v_org1);
    RAISE EXCEPTION '9 second carve should fail';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'ALREADY_RECORDED' THEN
      RAISE EXCEPTION '9 second carve got %', v_msg;
    END IF;
  END;
  PERFORM pg_temp._s1b_assert_nightly(v_org1);
  p := pg_temp._s1b_pb(v_org1, 'trip:s1b-trip-leg');
  PERFORM pg_temp._s1b_refused(v_owner1, v_org1, 'undo_decision', jsonb_build_object(
    'command_id', 's1b-leg-undo', 'decision_id', v_dec,
    'expected_versions', jsonb_build_object(p.id::text, p.version)), 'LEGACY_KEEP_FINAL');

  UPDATE toll.switch_state SET toll_disputes = true WHERE organization_id = v_org1;
  PERFORM pg_temp._s1b_import(v_org1, 'post', v_week + 35, 39000, 15000);
  p := pg_temp._s1b_pb(v_org1, 'trip:s1b-trip-post');
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'leave_payback_unlinked', jsonb_build_object(
    'command_id', 's1b-leg-post', 'payback_id', p.id, 'expected_payback_version', p.version,
    'amount_minor', 2000, 'reason_code', 'post switch keep'));
  IF NOT toll_system.unlinked_has_p25(v_org1, (v_r ->> 'decision_id')::uuid) THEN
    RAISE EXCEPTION '9 post-switch missing P25';
  END IF;
  PERFORM pg_temp._s1b_assert_nightly(v_org1);

  -- review R2: keep the rest of the mixed payback after switch-on → P25; the pre-switch part stays final
  p := pg_temp._s1b_pb(v_org1, 's1b-adj-mix');
  v_amt := pg_temp._s1b_bal(v_org1, 'other_income');
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'leave_payback_unlinked', jsonb_build_object(
    'command_id', 's1b-mix-post', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'post switch rest'));
  v_dec := (v_r ->> 'decision_id')::uuid;
  IF pg_temp._s1b_bal(v_org1, 'other_income') <> v_amt + 60000 THEN
    RAISE EXCEPTION '9 mix post P25 %', pg_temp._s1b_bal(v_org1, 'other_income') - v_amt;
  END IF;
  IF toll_system.unlinked_has_p25(v_org1, v_mix_pre) THEN
    RAISE EXCEPTION '9 mix pre-switch keep now looks posted';
  END IF;
  PERFORM pg_temp._s1b_assert_nightly(v_org1);
  p := pg_temp._s1b_pb(v_org1, 's1b-adj-mix');
  PERFORM pg_temp._s1b_refused(v_owner1, v_org1, 'undo_decision', jsonb_build_object(
    'command_id', 's1b-mix-undo-pre', 'decision_id', v_mix_pre,
    'expected_versions', jsonb_build_object(p.id::text, p.version)), 'LEGACY_KEEP_FINAL');
  PERFORM pg_temp._s1b_cmd(v_owner1, v_org1, 'undo_decision', jsonb_build_object(
    'command_id', 's1b-mix-undo-post', 'decision_id', v_dec,
    'expected_versions', jsonb_build_object(p.id::text, p.version)));
  IF pg_temp._s1b_bal(v_org1, 'other_income') <> v_amt THEN
    RAISE EXCEPTION '9 mix undo post P25 %', pg_temp._s1b_bal(v_org1, 'other_income') - v_amt;
  END IF;
  PERFORM pg_temp._s1b_assert_nightly(v_org1);

  -- review R4: switch turned off after the carve-out: a keep still posts P25, a pre-switch keep stays final
  UPDATE toll.switch_state SET toll_disputes = false WHERE organization_id = v_org1;
  PERFORM public.toll_sys_import(v_org1, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1b-adj-off","driver_id":"s1b-d1","paid_on":"%s","amount_minor":3000}]',
    (v_week + 28)::text)::jsonb, 's1b-adj-off', 'smoke');
  p := pg_temp._s1b_pb(v_org1, 's1b-adj-off');
  v_amt := pg_temp._s1b_bal(v_org1, 'other_income');
  PERFORM pg_temp._s1b_cmd(v_owner1, v_org1, 'leave_payback_unlinked', jsonb_build_object(
    'command_id', 's1b-off-keep', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'switch off after carve'));
  IF pg_temp._s1b_bal(v_org1, 'other_income') <> v_amt + 3000 THEN
    RAISE EXCEPTION '9 off-after-carve P25 missing';
  END IF;
  PERFORM pg_temp._s1b_assert_nightly(v_org1);
  p := pg_temp._s1b_pb(v_org1, 's1b-adj-mix');
  PERFORM pg_temp._s1b_refused(v_owner1, v_org1, 'undo_decision', jsonb_build_object(
    'command_id', 's1b-mix-undo-pre-off', 'decision_id', v_mix_pre,
    'expected_versions', jsonb_build_object(p.id::text, p.version)), 'LEGACY_KEEP_FINAL');
  UPDATE toll.switch_state SET toll_disputes = true WHERE organization_id = v_org1;

  -- ── 10. Review R5 + R1 (sole manager, sealed charge week) ──
  -- R5: undo of a lost dispute in a sealed charge week is gated by the dispute's money, not J$0
  -- the charge sits in an old week; the trip is earlier this week (v_week + 21 is the current, open week,
  -- any day the test runs) so the dispute is inside its 9-day window
  PERFORM public.toll_sys_import(v_org1, 'uber', format(
    '[{"row_type":"trip","platform_trip_id":"s1b-trip-sl","driver_id":"s1b-d1","vehicle_id":"v1",
      "request_at":"%s","dropoff_at":"%s","payment_method":"card","toll_payback_minor":37000}]',
    (((v_week + 21) + time '00:00') AT TIME ZONE 'America/Jamaica')
      + (now() - (((v_week + 21) + time '00:00') AT TIME ZONE 'America/Jamaica')) / 2,
    (((v_week + 21) + time '00:00') AT TIME ZONE 'America/Jamaica')
      + (now() - (((v_week + 21) + time '00:00') AT TIME ZONE 'America/Jamaica')) * 3 / 4)::jsonb,
    's1b-uber-sl', 'smoke');
  PERFORM public.toll_sys_import(v_org1, 'tag_statement', format(
    '[{"source_ref":"s1b-ch-sl","occurred_at":"%s","amount_minor":600001,"plaza_id":"s1b-pz",
      "vehicle_id":"v1","driver_id":"s1b-d1"}]',
    ((v_week - 12) + time '14:00') AT TIME ZONE 'America/Jamaica')::jsonb, 's1b-tag-sl', 'smoke');
  PERFORM pg_temp._s1b_link(v_org1, v_owner1, 'sl');
  c := pg_temp._s1b_ch(v_org1, 's1b-ch-sl');
  p := pg_temp._s1b_pb(v_org1, 'trip:s1b-trip-sl');
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'open_dispute', jsonb_build_object(
    'command_id', 's1b-sl-open', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org1 AND id = v_dispute;
  PERFORM pg_temp._s1b_cmd(v_owner1, v_org1, 'mark_dispute_sent', jsonb_build_object(
    'command_id', 's1b-sl-sent', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  PERFORM pg_temp._s1b_cmd(v_owner1, v_org1, 'seal_week', jsonb_build_object(
    'command_id', 's1b-sl-seal', 'week_key', v_week - 14,
    'expected_week_version', toll_system.week_version(v_org1, v_week - 14)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org1 AND id = v_dispute;
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'close_dispute_lost', jsonb_build_object(
    'command_id', 's1b-sl-lost', 'dispute_id', v_dispute, 'expected_dispute_version', d.version,
    'self_approval_reason', 'sole manager lost'));
  v_dec := (v_r ->> 'decision_id')::uuid;
  PERFORM pg_temp._s1b_assert_nightly(v_org1);
  c := pg_temp._s1b_ch(v_org1, 's1b-ch-sl');
  p := pg_temp._s1b_pb(v_org1, 'trip:s1b-trip-sl');
  PERFORM pg_temp._s1b_refused_detail(v_owner1, v_org1, 'undo_decision', jsonb_build_object(
    'command_id', 's1b-sl-undo-no', 'decision_id', v_dec,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)), 'NEEDS_APPROVAL',
    jsonb_build_object('amount_minor', 563001, 'sole_manager', true));
  PERFORM pg_temp._s1b_cmd(v_owner1, v_org1, 'undo_decision', jsonb_build_object(
    'command_id', 's1b-sl-undo', 'decision_id', v_dec, 'self_approval_reason', 'undo the lost result',
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)));
  PERFORM pg_temp._s1b_assert_nightly(v_org1);

  -- R1: a sole manager can reopen a sealed week with a reason (and is refused without one)
  PERFORM pg_temp._s1b_refused_detail(v_owner1, v_org1, 'reopen_week', jsonb_build_object(
    'command_id', 's1b-sole-reopen-no', 'week_key', v_week - 14,
    'expected_week_version', toll_system.week_version(v_org1, v_week - 14),
    'reason', 'sole reopen'), 'NEEDS_APPROVAL', jsonb_build_object('sole_manager', true));
  v_r := pg_temp._s1b_cmd(v_owner1, v_org1, 'reopen_week', jsonb_build_object(
    'command_id', 's1b-sole-reopen', 'week_key', v_week - 14,
    'expected_week_version', toll_system.week_version(v_org1, v_week - 14),
    'reason', 'sole reopen', 'self_approval_reason', 'only manager here'));
  IF toll_system.week_is_sealed(v_org1, v_week - 14) THEN
    RAISE EXCEPTION '10 sole reopen did not reopen';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM toll.self_approvals sa
                 WHERE sa.organization_id = v_org1 AND sa.command_id = 's1b-sole-reopen') THEN
    RAISE EXCEPTION '10 sole reopen not in self_approvals';
  END IF;
  PERFORM pg_temp._s1b_assert_nightly(v_org1);

  RAISE NOTICE 'toll_four_eyes_settings_income_test: ok';
END;
$$;

ROLLBACK;
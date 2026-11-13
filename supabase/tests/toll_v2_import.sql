-- Toll v2 P2-R1: import_batch core (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT u.id, u.email
FROM (VALUES
  ('e0111111-1111-4111-8111-111111111111'::uuid, 'toll-imp-owner@example.com'),
  ('e0211111-1111-4111-8111-111111111112'::uuid, 'toll-imp-mgr@example.com'),
  ('e0311111-1111-4111-8111-111111111113'::uuid, 'toll-imp-acct@example.com'),
  ('e0411111-1111-4111-8111-111111111114'::uuid, 'toll-imp-viewer@example.com'),
  ('e0511111-1111-4111-8111-111111111115'::uuid, 'toll-imp-owner-b@example.com')
) AS u(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

DO $$
DECLARE
  v_owner       uuid := 'e0111111-1111-4111-8111-111111111111';
  v_mgr         uuid := 'e0211111-1111-4111-8111-111111111112';
  v_acct        uuid := 'e0311111-1111-4111-8111-111111111113';
  v_viewer      uuid := 'e0411111-1111-4111-8111-111111111114';
  v_owner_b     uuid := 'e0511111-1111-4111-8111-111111111115';
  v_org_a       uuid := 'e1111111-1111-4111-8111-111111111101';
  v_org_b       uuid := 'e2222222-2222-4222-8222-222222222202';
  v_driver      text := 'driver-imp-1';
  v_vehicle     text := 'vehicle-imp-1';
  v_plaza       text := 'plaza-imp-main';
  v_plaza_dup   text := 'plaza-imp-dup';
  v_plaza_rev   text := 'plaza-imp-rev';
  v_effective   timestamptz := '2024-06-10 12:00:00+00';
  v_week0       date;
  v_w_open      date;
  v_w_sealed    date;
  v_w_corr      date;
  v_w_dup       date;
  v_w_top       date;
  v_w_top_seal  date;
  v_w_uber      date;
  v_w_ind       date;
  v_w_corr_seal date;
  v_ev          timestamptz;
  v_resp        jsonb;
  v_resp2       jsonb;
  v_decision_id uuid;
  v_charge      uuid;
  v_charge2     uuid;
  v_tag_id      uuid;
  v_cash_id     uuid;
  v_roam_id     uuid;
  v_cnt         int;
  v_led         int;
  v_led_before  int;
  v_role_mgr    uuid;
  v_role_acct   uuid;
  v_role_view   uuid;
  v_fn_imp      regprocedure := 'public.toll_sys_import(uuid,text,jsonb,text,text)'::regprocedure;
  v_j           jsonb;
  v_status      text;
  v_first_dec   text;
  v_pb_id       uuid;
  v_drop        timestamptz;
  v_msg         text;
  v_line        int := 5000;
  r             record;
BEGIN
  v_week0 := ledger.jamaica_week_start(v_effective);
  v_w_sealed := v_week0 + 7 * 3;
  v_w_open := v_week0 + 7 * 20;
  v_w_corr := v_week0 + 7 * 21;
  v_w_dup := v_week0 + 7 * 22;
  v_w_top := v_week0 + 7 * 23;
  v_w_top_seal := v_week0 + 7 * 4;
  v_w_uber := v_week0 + 7 * 24;
  v_w_ind := v_week0 + 7 * 25;
  v_w_corr_seal := v_week0 + 7 * 26;
  v_ev := v_w_open::timestamptz + time '10:00';

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES
    (v_org_a, v_owner, 'Toll Import Org A', 'toll-imp-a', 'fleet', 'active'),
    (v_org_b, v_owner_b, 'Toll Import Org B', 'toll-imp-b', 'fleet', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO toll.switch_state (organization_id, tolls_v2)
  VALUES (v_org_a, true), (v_org_b, true)
  ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = EXCLUDED.tolls_v2;

  PERFORM toll_system.ensure_accounts(v_org_a);
  PERFORM toll_system.ensure_accounts(v_org_b);

  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org_a, 'toll-imp-fixture', 'fixture', 'user')
  RETURNING id INTO v_decision_id;

  INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system)
  VALUES
    ('fleet_manager', 'Fleet Manager', 'toll imp test', 50, 'fleet', true),
    ('fleet_accountant', 'Fleet Accountant', 'toll imp test', 40, 'fleet', true),
    ('fleet_viewer', 'Fleet Viewer', 'toll imp test', 30, 'fleet', true)
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_role_mgr FROM platform.roles WHERE name = 'fleet_manager';
  SELECT id INTO v_role_acct FROM platform.roles WHERE name = 'fleet_accountant';
  SELECT id INTO v_role_view FROM platform.roles WHERE name = 'fleet_viewer';

  INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, status, expires_at)
  VALUES
    (v_mgr, v_role_mgr, 'organization', v_org_a, 'active', NULL),
    (v_acct, v_role_acct, 'organization', v_org_a, 'active', NULL),
    (v_viewer, v_role_view, 'organization', v_org_a, 'active', NULL);

  INSERT INTO toll.plaza_rules (plaza_id, auto_duplicate_window_minutes, review_duplicate_window)
  VALUES (v_plaza_dup, 5, 'same_day')
  ON CONFLICT (plaza_id) DO UPDATE
    SET auto_duplicate_window_minutes = EXCLUDED.auto_duplicate_window_minutes;

  CREATE OR REPLACE FUNCTION pg_temp._imp_as(p_user uuid, p_org uuid) RETURNS void
  LANGUAGE plpgsql AS $as$
  BEGIN
    PERFORM set_config('imp.test_user', p_user::text, true);
    PERFORM set_config('imp.test_org', p_org::text, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object(
        'sub', p_user::text,
        'role', 'authenticated',
        'app_metadata', json_build_object('organizationId', p_org::text)
      )::text,
      true
    );
    SET LOCAL ROLE authenticated;
  END;
  $as$;

  CREATE OR REPLACE FUNCTION pg_temp._imp_cmd(p_intent text, p_body jsonb) RETURNS jsonb
  LANGUAGE plpgsql AS $cmd$
  BEGIN
    PERFORM pg_temp._imp_as(
      current_setting('imp.test_user')::uuid,
      current_setting('imp.test_org')::uuid
    );
    RETURN public.toll_v2_command(p_intent, p_body);
  END;
  $cmd$;

  CREATE OR REPLACE FUNCTION pg_temp._imp_expect(p_intent text, p_body jsonb, p_code text) RETURNS void
  LANGUAGE plpgsql AS $ex$
  DECLARE v_msg text;
  BEGIN
    PERFORM public.toll_v2_command(p_intent, p_body);
    RAISE EXCEPTION 'expect % but command succeeded', p_code;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 'expect code % got %', p_code, v_msg;
    END IF;
  END;
  $ex$;

  CREATE OR REPLACE FUNCTION pg_temp._imp_expect_bad_request(p_intent text, p_body jsonb) RETURNS void
  LANGUAGE plpgsql AS $bad$
  DECLARE v_err text;
  BEGIN
    PERFORM public.toll_v2_command(p_intent, p_body);
    RAISE EXCEPTION 'expected BAD_REQUEST';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT LIKE 'BAD_REQUEST%' THEN
      RAISE;
    END IF;
  END;
  $bad$;

  CREATE OR REPLACE FUNCTION pg_temp._imp_nightly_ok(p_org uuid) RETURNS void
  LANGUAGE plpgsql AS $ok$
  DECLARE r record;
  BEGIN
    RESET ROLE;
    FOR r IN SELECT * FROM toll_system.nightly_checks(p_org) LOOP
      IF NOT r.ok THEN
        RAISE EXCEPTION 'nightly check % % failed: %', r.check_no, r.name, r.detail;
      END IF;
    END LOOP;
  END;
  $ok$;

  CREATE OR REPLACE FUNCTION pg_temp._imp_rep_status(p_resp jsonb, p_ref text) RETURNS text
  LANGUAGE sql AS $rep$
    SELECT x ->> 'status'
    FROM jsonb_array_elements(p_resp -> 'report') x
    WHERE x ->> 'ref' = p_ref
    LIMIT 1;
  $rep$;

  CREATE OR REPLACE FUNCTION pg_temp._imp_led_charge(p_org uuid, p_charge uuid, p_rule text, p_rev boolean DEFAULT false) RETURNS int
  LANGUAGE plpgsql AS $ledc$
  DECLARE v_n int;
  BEGIN
    RESET ROLE;
    SELECT count(*)::int INTO v_n FROM ledger.entries e
    WHERE e.organization_id = p_org AND e.reference_type = 'toll'
      AND e.metadata ->> 'charge_id' = p_charge::text
      AND e.metadata ->> 'toll_rule' = p_rule
      AND coalesce((e.metadata ->> 'reverse')::boolean, false) = p_rev;
    RETURN v_n;
  END;
  $ledc$;

  CREATE OR REPLACE FUNCTION pg_temp._imp_led_topup(p_org uuid, p_topup uuid, p_rule text) RETURNS int
  LANGUAGE plpgsql AS $ledt$
  DECLARE v_n int;
  BEGIN
    RESET ROLE;
    SELECT count(*)::int INTO v_n FROM ledger.entries e
    WHERE e.organization_id = p_org AND e.reference_type = 'toll'
      AND e.metadata ->> 'tag_topup_id' = p_topup::text
      AND e.metadata ->> 'toll_rule' = p_rule;
    RETURN v_n;
  END;
  $ledt$;

  CREATE OR REPLACE FUNCTION pg_temp._imp_led_payback(p_org uuid, p_payback uuid, p_rule text) RETURNS int
  LANGUAGE plpgsql AS $ledp$
  DECLARE v_n int;
  BEGIN
    RESET ROLE;
    SELECT count(*)::int INTO v_n FROM ledger.entries e
    WHERE e.organization_id = p_org AND e.reference_type = 'toll'
      AND e.metadata ->> 'payback_id' = p_payback::text
      AND e.metadata ->> 'toll_rule' = p_rule;
    RETURN v_n;
  END;
  $ledp$;

  -- Seal week for after_seal / sealed top-up / correction-in-sealed fixtures
  PERFORM pg_temp._imp_as(v_owner, v_org_a);
  PERFORM pg_temp._imp_cmd('seal_week', jsonb_build_object(
    'command_id', 'imp-seal-3',
    'week_key', v_w_sealed,
    'expected_week_version', 0
  ));
  PERFORM pg_temp._imp_cmd('seal_week', jsonb_build_object(
    'command_id', 'imp-seal-4',
    'week_key', v_w_top_seal,
    'expected_week_version', 0
  ));
  RESET ROLE;

  -- ── 1. Tag statement: twin crossings + after_seal ──
  PERFORM pg_temp._imp_as(v_owner, v_org_a);
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s1-tag',
    'kind', 'tag_statement',
    'file_name', 'tag-s1.csv',
    'rows', jsonb_build_array(
      jsonb_build_object(
        'source_ref', 'imp-tag-twin#1', 'occurred_at', v_ev,
        'amount_minor', 500, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle, 'driver_id', v_driver
      ),
      jsonb_build_object(
        'source_ref', 'imp-tag-twin#2', 'occurred_at', v_ev,
        'amount_minor', 500, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle, 'driver_id', v_driver
      ),
      jsonb_build_object(
        'source_ref', 'imp-tag-sealed', 'occurred_at', (v_w_sealed::timestamptz + time '11:00'),
        'amount_minor', 700, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle, 'driver_id', v_driver
      )
    )
  ));
  IF pg_temp._imp_rep_status(v_resp, 'imp-tag-twin#1') <> 'new'
    OR pg_temp._imp_rep_status(v_resp, 'imp-tag-twin#2') <> 'new'
    OR pg_temp._imp_rep_status(v_resp, 'imp-tag-sealed') <> 'after_seal' THEN
    RAISE EXCEPTION 's1 status: %', v_resp -> 'report';
  END IF;
  SELECT id INTO v_charge FROM toll.charges
  WHERE organization_id = v_org_a AND source = 'tag_statement' AND source_ref = 'imp-tag-twin#1';
  SELECT id INTO v_charge2 FROM toll.charges
  WHERE organization_id = v_org_a AND source = 'tag_statement' AND source_ref = 'imp-tag-twin#2';
  IF pg_temp._imp_led_charge(v_org_a, v_charge, 'P2_tag_crossing') <> 1
    OR pg_temp._imp_led_charge(v_org_a, v_charge2, 'P2_tag_crossing') <> 1 THEN
    RAISE EXCEPTION 's1 missing P2 for twins';
  END IF;
  SELECT id INTO v_charge FROM toll.charges
  WHERE organization_id = v_org_a AND source_ref = 'imp-tag-sealed';
  IF pg_temp._imp_led_charge(v_org_a, v_charge, 'P2_tag_crossing') <> 0 THEN
    RAISE EXCEPTION 's1 after_seal must not post';
  END IF;
  v_j := toll_system.week_result_live(v_org_a, v_w_sealed);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_j -> 'afterSeal') x
    WHERE x ->> 'kind' = 'charge' AND x ->> 'id' = v_charge::text
  ) THEN
    RAISE EXCEPTION 's1 week_result.afterSeal missing charge';
  END IF;
  PERFORM pg_temp._imp_nightly_ok(v_org_a);


  -- ── 2. Same batch replay (shuffled) ──
  v_first_dec := v_resp ->> 'decision_id';
  SELECT count(*)::int INTO v_cnt FROM toll.charges WHERE organization_id = v_org_a AND source = 'tag_statement';
  SELECT count(*)::int INTO v_led FROM ledger.entries WHERE organization_id = v_org_a AND reference_type = 'toll';
  v_resp2 := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s2-replay',
    'kind', 'tag_statement',
    'file_name', 'tag-s1.csv',
    'rows', jsonb_build_array(
      jsonb_build_object(
        'source_ref', 'imp-tag-sealed', 'occurred_at', (v_w_sealed::timestamptz + time '11:00'),
        'amount_minor', 700, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle, 'driver_id', v_driver
      ),
      jsonb_build_object(
        'source_ref', 'imp-tag-twin#2', 'occurred_at', v_ev,
        'amount_minor', 500, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle, 'driver_id', v_driver
      ),
      jsonb_build_object(
        'source_ref', 'imp-tag-twin#1', 'occurred_at', v_ev,
        'amount_minor', 500, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle, 'driver_id', v_driver
      )
    )
  ));
  IF v_resp2 ->> 'same_batch_as' IS DISTINCT FROM v_first_dec THEN
    RAISE EXCEPTION 's2 same_batch_as';
  END IF;
  RESET ROLE;
  IF (SELECT count(*)::int FROM toll.charges WHERE organization_id = v_org_a AND source = 'tag_statement') <> v_cnt THEN
    RAISE EXCEPTION 's2 wrote new charges on replay';
  END IF;
  IF (SELECT count(*)::int FROM ledger.entries WHERE organization_id = v_org_a AND reference_type = 'toll') <> v_led THEN
    RAISE EXCEPTION 's2 wrote new ledger on replay';
  END IF;
  PERFORM pg_temp._imp_nightly_ok(v_org_a);


  -- ── 3. Corrections ──
  v_ev := v_w_corr::timestamptz + time '09:00';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s3a',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-corr-open', 'occurred_at', v_ev,
      'amount_minor', 1000, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle
    ))
  ));
  SELECT id INTO v_charge FROM toll.charges WHERE organization_id = v_org_a AND source_ref = 'imp-corr-open';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s3a-fix',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-corr-open', 'occurred_at', v_ev,
      'amount_minor', 1200, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'imp-corr-open') <> 'corrected' THEN
    RAISE EXCEPTION 's3a corrected';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.charge_changes cc
    WHERE cc.organization_id = v_org_a AND cc.charge_id = v_charge AND cc.field = 'amount_minor'
      AND cc.pending = false AND cc.old_value = '1000' AND cc.new_value = '1200'
  ) THEN
    RAISE EXCEPTION 's3a charge_changes';
  END IF;
  IF pg_temp._imp_led_charge(v_org_a, v_charge, 'P16_up_tag') <> 1 THEN
    RAISE EXCEPTION 's3a P16_up_tag';
  END IF;

  v_ev := v_w_corr::timestamptz + time '09:30';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s3b',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-corr-alloc', 'occurred_at', v_ev,
      'amount_minor', 800, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle
    ))
  ));
  RESET ROLE;
  SELECT id INTO v_charge FROM toll.charges WHERE organization_id = v_org_a AND source_ref = 'imp-corr-alloc';
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, decision_id)
  VALUES (v_org_a, v_charge, 'fleet', 800, 'imp-test', v_decision_id);
  v_line := v_line + 1;
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', 800, v_ev, 'imp-s3b', v_line,
    jsonb_build_object('charge_id', v_charge::text));
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s3b-pend',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-corr-alloc', 'occurred_at', v_ev,
      'amount_minor', 900, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'imp-corr-alloc') <> 'correction_pending' THEN
    RAISE EXCEPTION 's3b correction_pending';
  END IF;
  IF (SELECT amount_minor FROM toll.charges WHERE id = v_charge) <> 800 THEN
    RAISE EXCEPTION 's3b amount unchanged';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.charge_changes cc
    WHERE cc.charge_id = v_charge AND cc.pending = true AND cc.new_value = '900'
  ) THEN
    RAISE EXCEPTION 's3b pending change row';
  END IF;

  v_ev := v_w_corr_seal::timestamptz + time '08:00';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s3c0',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-corr-sealed', 'occurred_at', v_ev,
      'amount_minor', 600, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle
    ))
  ));
  RESET ROLE;
  SELECT id INTO v_charge FROM toll.charges WHERE organization_id = v_org_a AND source_ref = 'imp-corr-sealed';
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, decision_id)
  VALUES (v_org_a, v_charge, 'fleet', 600, 'imp-corr-seal', v_decision_id);
  v_line := v_line + 1;
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', 600, v_ev, 'imp-s3c', v_line,
    jsonb_build_object('charge_id', v_charge::text));
  PERFORM pg_temp._imp_cmd('seal_week', jsonb_build_object(
    'command_id', 'imp-seal-corr',
    'week_key', v_w_corr_seal,
    'expected_week_version', 0
  ));
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s3c1',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-corr-sealed', 'occurred_at', v_ev,
      'amount_minor', 650, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'imp-corr-sealed') <> 'correction_pending' THEN
    RAISE EXCEPTION 's3c sealed correction_pending';
  END IF;
  PERFORM pg_temp._imp_nightly_ok(v_org_a);


  -- ── 4. Cross-source duplicates ──
  v_ev := v_w_dup::timestamptz + time '14:00';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s4-tag',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-dup-tag1', 'occurred_at', v_ev,
      'amount_minor', 400, 'plaza_id', v_plaza_dup, 'vehicle_id', v_vehicle
    ))
  ));
  SELECT id INTO v_tag_id FROM toll.charges WHERE organization_id = v_org_a AND source_ref = 'imp-dup-tag1';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s4-cash-after',
    'kind', 'driver_cash',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-dup-cash1', 'occurred_at', v_ev + interval '2 minutes',
      'amount_minor', 400, 'plaza_id', v_plaza_dup, 'vehicle_id', v_vehicle,
      'evidence_status', 'verified'
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'imp-dup-cash1') <> 'duplicate' THEN
    RAISE EXCEPTION 's4 tag then cash duplicate';
  END IF;
  SELECT id INTO v_cash_id FROM toll.charges WHERE organization_id = v_org_a AND source_ref = 'imp-dup-cash1';
  IF (SELECT duplicate_of FROM toll.charges WHERE id = v_cash_id) IS DISTINCT FROM v_tag_id THEN
    RAISE EXCEPTION 's4 cash duplicate_of tag';
  END IF;
  IF pg_temp._imp_led_charge(v_org_a, v_cash_id, 'P3_cash_verified') <> 0 THEN
    RAISE EXCEPTION 's4 cash duplicate must not post P3';
  END IF;

  v_ev := v_w_dup::timestamptz + time '15:00';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s4-cash-first',
    'kind', 'driver_cash',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-dup-cash2', 'occurred_at', v_ev,
      'amount_minor', 450, 'plaza_id', v_plaza_dup, 'vehicle_id', v_vehicle,
      'evidence_status', 'verified'
    ))
  ));
  SELECT id INTO v_cash_id FROM toll.charges WHERE organization_id = v_org_a AND source_ref = 'imp-dup-cash2';
  IF pg_temp._imp_led_charge(v_org_a, v_cash_id, 'P3_cash_verified') <> 1 THEN
    RAISE EXCEPTION 's4 cash first P3';
  END IF;
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s4-tag-second',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-dup-tag2', 'occurred_at', v_ev + interval '2 minutes',
      'amount_minor', 450, 'plaza_id', v_plaza_dup, 'vehicle_id', v_vehicle
    ))
  ));
  SELECT id INTO v_tag_id FROM toll.charges WHERE organization_id = v_org_a AND source_ref = 'imp-dup-tag2';
  IF (SELECT duplicate_of FROM toll.charges WHERE id = v_cash_id) IS DISTINCT FROM v_tag_id THEN
    RAISE EXCEPTION 's4 cash loser duplicate_of tag';
  END IF;
  IF pg_temp._imp_led_charge(v_org_a, v_cash_id, 'P3_cash_verified', true) <> 1 THEN
    RAISE EXCEPTION 's4 P3 reversed on loser';
  END IF;

  v_ev := v_w_dup::timestamptz + time '16:00';
  PERFORM toll_system.native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', 'imp-roam-dup', 'payment_method', 'card', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
    'ended_at', v_ev, 'estimated_tolls_minor', 0,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', 'rx1', 'plaza_id', v_plaza_dup, 'amount_minor', 300, 'crossed_at', v_ev, 'paid_by', 'tag'))
  ));
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s4-roam-tag',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-dup-tag3', 'occurred_at', v_ev + interval '1 minute',
      'amount_minor', 300, 'plaza_id', v_plaza_dup, 'vehicle_id', v_vehicle
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'imp-dup-tag3') <> 'duplicate' THEN
    RAISE EXCEPTION 's4 roam then tag';
  END IF;

  v_ev := v_w_dup::timestamptz + time '17:00';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s4-alloc-cash',
    'kind', 'driver_cash',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-dup-cash3', 'occurred_at', v_ev,
      'amount_minor', 550, 'plaza_id', v_plaza_dup, 'vehicle_id', v_vehicle,
      'evidence_status', 'verified'
    ))
  ));
  RESET ROLE;
  SELECT id INTO v_cash_id FROM toll.charges WHERE organization_id = v_org_a AND source_ref = 'imp-dup-cash3';
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, decision_id)
  VALUES (v_org_a, v_cash_id, 'fleet', 550, 'imp-dup-alloc', v_decision_id);
  v_line := v_line + 1;
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', 550, v_ev, 'imp-s4-alloc', v_line,
    jsonb_build_object('charge_id', v_cash_id::text));
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s4-alloc-tag',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-dup-tag4', 'occurred_at', v_ev + interval '3 minutes',
      'amount_minor', 550, 'plaza_id', v_plaza_dup, 'vehicle_id', v_vehicle
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'imp-dup-tag4') <> 'review_pair' THEN
    RAISE EXCEPTION 's4 review_pair with alloc, got %', pg_temp._imp_rep_status(v_resp, 'imp-dup-tag4');
  END IF;
  SELECT id INTO v_tag_id FROM toll.charges WHERE organization_id = v_org_a AND source_ref = 'imp-dup-tag4';
  IF NOT EXISTS (
    SELECT 1 FROM toll.duplicate_reviews dr
    WHERE dr.organization_id = v_org_a AND dr.status = 'open'
      AND (dr.charge_a = v_tag_id OR dr.charge_b = v_tag_id)
  ) THEN
    RAISE EXCEPTION 's4 open duplicate_reviews';
  END IF;
  PERFORM pg_temp._imp_nightly_ok(v_org_a);


  -- ── 5. Review list (outside window) vs same-source genuine ──
  v_ev := v_w_dup::timestamptz + time '18:00';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s5-tag',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-rev-tag', 'occurred_at', v_ev,
      'amount_minor', 350, 'plaza_id', v_plaza_rev, 'vehicle_id', v_vehicle
    ))
  ));
  SELECT id INTO v_tag_id FROM toll.charges WHERE organization_id = v_org_a AND source_ref = 'imp-rev-tag';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s5-cash-far',
    'kind', 'driver_cash',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-rev-cash', 'occurred_at', v_ev + interval '20 minutes',
      'amount_minor', 350, 'plaza_id', v_plaza_rev, 'vehicle_id', v_vehicle,
      'evidence_status', 'verified'
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'imp-rev-cash') <> 'review_pair' THEN
    RAISE EXCEPTION 's5 outside window review_pair';
  END IF;

  v_ev := v_w_dup::timestamptz + time '19:00';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s5-same-src',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(
      jsonb_build_object(
        'source_ref', 'imp-same#1', 'occurred_at', v_ev,
        'amount_minor', 500, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle
      ),
      jsonb_build_object(
        'source_ref', 'imp-same#2', 'occurred_at', v_ev + interval '20 minutes',
        'amount_minor', 500, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle
      )
    )
  ));
  IF pg_temp._imp_rep_status(v_resp, 'imp-same#1') <> 'new'
    OR pg_temp._imp_rep_status(v_resp, 'imp-same#2') <> 'new' THEN
    RAISE EXCEPTION 's5 same-source twins';
  END IF;
  SELECT count(*)::int INTO v_cnt FROM toll.duplicate_reviews dr
  JOIN toll.charges c ON c.id IN (dr.charge_a, dr.charge_b)
  WHERE dr.organization_id = v_org_a AND c.source_ref IN ('imp-same#1', 'imp-same#2');
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 's5 same-source must not open review';
  END IF;
  PERFORM pg_temp._imp_nightly_ok(v_org_a);


  -- ── 6. Top-ups ──
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s6-new',
    'kind', 'topups',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-top-1', 'topped_up_on', v_w_top,
      'amount_minor', 50000, 'provider', 'transjam', 'account_ref', 'acct-imp-1', 'vehicle_id', v_vehicle
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'imp-top-1') <> 'new' THEN
    RAISE EXCEPTION 's6 topup new';
  END IF;
  SELECT id INTO v_charge FROM toll.tag_topups WHERE organization_id = v_org_a AND source_ref = 'imp-top-1';
  IF pg_temp._imp_led_topup(v_org_a, v_charge, 'P1_tag_topup') <> 1 THEN
    RAISE EXCEPTION 's6 P1';
  END IF;
  SELECT count(*)::int INTO v_cnt FROM toll.tag_accounts
  WHERE organization_id = v_org_a AND provider = 'transjam' AND account_ref = 'acct-imp-1';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 's6 tag account once'; END IF;

  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s6-unch',
    'kind', 'topups',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-top-1', 'topped_up_on', v_w_top,
      'amount_minor', 50000, 'provider', 'transjam', 'account_ref', 'acct-imp-1'
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'imp-top-1') <> 'unchanged' THEN
    RAISE EXCEPTION 's6 unchanged';
  END IF;

  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s6-chg',
    'kind', 'topups',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-top-2', 'topped_up_on', v_w_top + 1,
      'amount_minor', 10000, 'provider', 'transjam', 'account_ref', 'acct-imp-1'
    ))
  ));
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s6-chg2',
    'kind', 'topups',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-top-2', 'topped_up_on', v_w_top + 1,
      'amount_minor', 11000, 'provider', 'transjam', 'account_ref', 'acct-imp-1'
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'imp-top-2') <> 'topup_changed_needs_person' THEN
    RAISE EXCEPTION 's6 topup_changed_needs_person';
  END IF;

  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s6-sealed',
    'kind', 'topups',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-top-sealed', 'topped_up_on', v_w_top_seal,
      'amount_minor', 9000, 'provider', 'transjam', 'account_ref', 'acct-sealed'
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'imp-top-sealed') <> 'refused_sealed_week' THEN
    RAISE EXCEPTION 's6 refused_sealed_week';
  END IF;
  IF EXISTS (SELECT 1 FROM toll.tag_topups WHERE organization_id = v_org_a AND source_ref = 'imp-top-sealed') THEN
    RAISE EXCEPTION 's6 sealed topup stored';
  END IF;
  PERFORM pg_temp._imp_nightly_ok(v_org_a);


  -- ── 7. Uber ──
  v_drop := v_w_uber::timestamptz + time '13:00';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s7-cash',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip', 'platform_trip_id', 'uber-cash-1',
      'driver_id', v_driver, 'vehicle_id', v_vehicle,
      'request_at', v_drop - interval '20 minutes', 'dropoff_at', v_drop,
      'payment_method', 'cash', 'toll_payback_minor', 800
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'uber-cash-1') <> 'new' THEN RAISE EXCEPTION 's7 cash trip'; END IF;
  SELECT id INTO v_pb_id FROM toll.paybacks WHERE organization_id = v_org_a AND reference = 'trip:uber-cash-1';
  IF (SELECT received_by FROM toll.paybacks WHERE id = v_pb_id) <> 'driver' THEN
    RAISE EXCEPTION 's7 cash received_by driver';
  END IF;
  IF pg_temp._imp_led_payback(v_org_a, v_pb_id, 'P5_payback_driver') <> 1 THEN
    RAISE EXCEPTION 's7 P5';
  END IF;

  v_drop := v_w_uber::timestamptz + time '14:00';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s7-card',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip', 'platform_trip_id', 'uber-card-1',
      'driver_id', v_driver, 'vehicle_id', v_vehicle,
      'request_at', v_drop - interval '20 minutes', 'dropoff_at', v_drop,
      'payment_method', 'card', 'toll_payback_minor', 900
    ))
  ));
  SELECT id INTO v_pb_id FROM toll.paybacks WHERE organization_id = v_org_a AND reference = 'trip:uber-card-1';
  IF pg_temp._imp_led_payback(v_org_a, v_pb_id, 'P4_payback_fleet') <> 1 THEN
    RAISE EXCEPTION 's7 P4 card';
  END IF;

  v_drop := v_w_uber::timestamptz + time '15:00';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s7-nopm',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip', 'platform_trip_id', 'uber-nopm-1',
      'driver_id', v_driver, 'vehicle_id', v_vehicle,
      'request_at', v_drop - interval '15 minutes', 'dropoff_at', v_drop,
      'toll_payback_minor', 700
    ))
  ));
  SELECT id INTO v_pb_id FROM toll.paybacks WHERE organization_id = v_org_a AND reference = 'trip:uber-nopm-1';
  IF (SELECT received_by FROM toll.paybacks WHERE id = v_pb_id) <> 'fleet' THEN
    RAISE EXCEPTION 's7 missing pm -> fleet';
  END IF;

  v_drop := v_w_uber::timestamptz + time '16:00';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s7-triponly',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip', 'platform_trip_id', 'uber-notoll-1',
      'driver_id', v_driver, 'vehicle_id', v_vehicle,
      'request_at', v_drop - interval '25 minutes', 'dropoff_at', v_drop,
      'payment_method', 'card', 'toll_payback_minor', 0
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'uber-notoll-1') <> 'trip_only' THEN
    RAISE EXCEPTION 's7 trip_only';
  END IF;
  v_drop := v_drop + interval '5 minutes';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s7-triponly2',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip', 'platform_trip_id', 'uber-notoll-1',
      'driver_id', v_driver, 'vehicle_id', v_vehicle,
      'request_at', v_drop - interval '25 minutes', 'dropoff_at', v_drop,
      'payment_method', 'card', 'toll_payback_minor', 0
    ))
  ));
  IF (SELECT dropoff_at FROM toll.platform_trips
      WHERE organization_id = v_org_a AND platform = 'uber' AND platform_trip_id = 'uber-notoll-1')
    IS DISTINCT FROM v_drop THEN
    RAISE EXCEPTION 's7 trip upsert times';
  END IF;

  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s7-adj',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'adjustment', 'reference', 'adj-pos-1',
      'driver_id', v_driver, 'paid_on', v_w_uber, 'amount_minor', 1200
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'adj-pos-1') <> 'new' THEN RAISE EXCEPTION 's7 adj new'; END IF;
  SELECT id INTO v_pb_id FROM toll.paybacks WHERE organization_id = v_org_a AND reference = 'adj-pos-1';
  IF pg_temp._imp_led_payback(v_org_a, v_pb_id, 'P4_payback_fleet') <> 1 THEN
    RAISE EXCEPTION 's7 adj P4';
  END IF;

  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s7-take',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'adjustment', 'reference', 'adj-neg-1',
      'driver_id', v_driver, 'paid_on', v_w_uber, 'amount_minor', -500
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'adj-neg-1') <> 'take_back_needs_person' THEN
    RAISE EXCEPTION 's7 take_back';
  END IF;
  IF EXISTS (SELECT 1 FROM toll.paybacks WHERE organization_id = v_org_a AND reference = 'adj-neg-1') THEN
    RAISE EXCEPTION 's7 take_back stored';
  END IF;

  v_drop := v_w_uber::timestamptz + time '17:00';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s7-rep',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip', 'platform_trip_id', 'uber-rep-1',
      'driver_id', v_driver, 'vehicle_id', v_vehicle,
      'request_at', v_drop - interval '20 minutes', 'dropoff_at', v_drop,
      'payment_method', 'card', 'toll_payback_minor', 600
    ))
  ));
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s7-rep2',
    'kind', 'uber',
    'file_name', 'uber-rep-pass2.csv',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip', 'platform_trip_id', 'uber-rep-1',
      'driver_id', v_driver, 'vehicle_id', v_vehicle,
      'request_at', v_drop - interval '20 minutes', 'dropoff_at', v_drop,
      'payment_method', 'card', 'toll_payback_minor', 600, 'import_note', 'pass-2'
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'uber-rep-1') <> 'unchanged' THEN
    RAISE EXCEPTION 's7 trip unchanged';
  END IF;

  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s7-pbchg',
    'kind', 'uber',
    'file_name', 'uber-rep-chg.csv',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip', 'platform_trip_id', 'uber-rep-1',
      'driver_id', v_driver, 'vehicle_id', v_vehicle,
      'request_at', v_drop - interval '20 minutes', 'dropoff_at', v_drop,
      'payment_method', 'card', 'toll_payback_minor', 750, 'import_note', 'pass-3'
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'uber-rep-1') <> 'payback_changed_needs_person' THEN
    RAISE EXCEPTION 's7 payback_changed';
  END IF;
  PERFORM pg_temp._imp_nightly_ok(v_org_a);


  -- ── 8. InDrive ──
  v_drop := v_w_ind::timestamptz + time '12:00';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s8-with',
    'kind', 'indrive',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip', 'platform_trip_id', 'ind-toll-1',
      'driver_id', v_driver, 'vehicle_id', v_vehicle,
      'request_at', v_drop - interval '18 minutes', 'dropoff_at', v_drop,
      'payment_method', 'card', 'toll_payback_minor', 400
    ))
  ));
  IF NOT EXISTS (
    SELECT 1 FROM toll.platform_trips
    WHERE organization_id = v_org_a AND platform = 'indrive' AND platform_trip_id = 'ind-toll-1'
  ) THEN
    RAISE EXCEPTION 's8 indrive trip';
  END IF;
  SELECT id INTO v_pb_id FROM toll.paybacks WHERE organization_id = v_org_a AND reference = 'trip:ind-toll-1';
  IF v_pb_id IS NULL THEN RAISE EXCEPTION 's8 trip_line payback'; END IF;

  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s8-notoll',
    'kind', 'indrive',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip', 'platform_trip_id', 'ind-notoll-1',
      'driver_id', v_driver, 'vehicle_id', v_vehicle,
      'request_at', v_drop, 'dropoff_at', v_drop + interval '30 minutes',
      'payment_method', 'cash', 'toll_payback_minor', 0
    ))
  ));
  IF pg_temp._imp_rep_status(v_resp, 'ind-notoll-1') <> 'trip_only' THEN
    RAISE EXCEPTION 's8 trip_only';
  END IF;
  PERFORM pg_temp._imp_nightly_ok(v_org_a);


  -- ── 9. Bad rows + bad kind ──
  v_ev := v_w_open::timestamptz + time '20:00';
  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s9-mix',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(
      jsonb_build_object('occurred_at', v_ev, 'amount_minor', 100, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle),
      jsonb_build_object('source_ref', 'imp-bad-zero', 'occurred_at', v_ev, 'amount_minor', 0,
        'plaza_id', v_plaza, 'vehicle_id', v_vehicle),
      jsonb_build_object('source_ref', 'imp-bad-ok', 'occurred_at', v_ev, 'amount_minor', 250,
        'plaza_id', v_plaza, 'vehicle_id', v_vehicle)
    )
  ));
  IF (SELECT count(*) FROM jsonb_array_elements(v_resp -> 'report') x
      WHERE x ->> 'status' = 'rejected') < 2 THEN
    RAISE EXCEPTION 's9 rejected rows';
  END IF;
  IF pg_temp._imp_rep_status(v_resp, 'imp-bad-ok') <> 'new' THEN
    RAISE EXCEPTION 's9 good row still imported';
  END IF;

  v_resp := pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s9-uber-bad',
    'kind', 'uber',
    'rows', jsonb_build_array(
      jsonb_build_object('row_type', 'nope', 'platform_trip_id', 'x'),
      jsonb_build_object(
        'row_type', 'trip', 'platform_trip_id', 'uber-mix-ok',
        'driver_id', v_driver, 'vehicle_id', v_vehicle,
        'request_at', v_ev, 'dropoff_at', v_ev + interval '10 minutes',
        'toll_payback_minor', 0
      )
    )
  ));
  IF pg_temp._imp_rep_status(v_resp, 'uber-mix-ok') <> 'trip_only' THEN
    RAISE EXCEPTION 's9 uber partial';
  END IF;

  PERFORM pg_temp._imp_expect_bad_request('import_batch', jsonb_build_object(
    'command_id', 'imp-s9-bad-kind',
    'kind', 'not_a_kind',
    'rows', '[]'::jsonb
  ));
  PERFORM pg_temp._imp_nightly_ok(v_org_a);


  -- ── 10. Who may import ──
  RESET ROLE;
  PERFORM pg_temp._imp_as(v_acct, v_org_a);
  PERFORM pg_temp._imp_expect('import_batch', jsonb_build_object(
    'command_id', 'imp-s10-acct',
    'kind', 'tag_statement',
    'rows', '[]'::jsonb
  ), 'FORBIDDEN');
  PERFORM pg_temp._imp_as(v_viewer, v_org_a);
  PERFORM pg_temp._imp_expect('import_batch', jsonb_build_object(
    'command_id', 'imp-s10-view',
    'kind', 'tag_statement',
    'rows', '[]'::jsonb
  ), 'FORBIDDEN');

  RESET ROLE;
  SELECT count(*)::int INTO v_cnt FROM toll.charges WHERE organization_id = v_org_a;
  PERFORM pg_temp._imp_as(v_owner_b, v_org_b);
  PERFORM pg_temp._imp_cmd('import_batch', jsonb_build_object(
    'command_id', 'imp-s10-b',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-org-b-only', 'occurred_at', v_ev,
      'amount_minor', 333, 'plaza_id', v_plaza, 'vehicle_id', 'vehicle-imp-b'
    ))
  ));
  RESET ROLE;
  IF (SELECT count(*)::int FROM toll.charges WHERE organization_id = v_org_a) <> v_cnt THEN
    RAISE EXCEPTION 's10 org B import touched A';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.charges WHERE organization_id = v_org_b AND source_ref = 'imp-org-b-only'
  ) THEN
    RAISE EXCEPTION 's10 org B row';
  END IF;
  RESET ROLE;

  IF has_function_privilege('anon', v_fn_imp, 'EXECUTE')
    OR has_function_privilege('authenticated', v_fn_imp, 'EXECUTE') THEN
    RAISE EXCEPTION 's10 toll_sys_import must be service_role only';
  END IF;
  IF NOT has_function_privilege('service_role', v_fn_imp, 'EXECUTE') THEN
    RAISE EXCEPTION 's10 service_role must EXECUTE toll_sys_import';
  END IF;

  SET LOCAL ROLE service_role;
  v_resp := public.toll_sys_import(
    v_org_a, 'tag_statement',
    jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-sys-1', 'occurred_at', v_ev + interval '1 hour',
      'amount_minor', 222, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle
    )),
    'imp-sys-cmd-1',
  'import_test_job'
  );
  v_resp2 := public.toll_sys_import(
    v_org_a, 'tag_statement',
    jsonb_build_array(jsonb_build_object(
      'source_ref', 'imp-sys-1', 'occurred_at', v_ev + interval '1 hour',
      'amount_minor', 222, 'plaza_id', v_plaza, 'vehicle_id', v_vehicle
    )),
    'imp-sys-cmd-1',
    'import_test_job'
  );
  RESET ROLE;
  IF coalesce(v_resp2 ->> 'replay', 'false') <> 'true' THEN
    RAISE EXCEPTION 's10 system replay';
  END IF;
  PERFORM pg_temp._imp_nightly_ok(v_org_a);
  PERFORM pg_temp._imp_nightly_ok(v_org_b);

  -- ── 11. Driver app cash — same command_id never doubles (I6) ──
  SET LOCAL ROLE service_role;
  v_resp := public.toll_sys_import(
    v_org_a, 'driver_cash',
    jsonb_build_array(jsonb_build_object(
      'source_ref', 'submission:imp-driver-cash-i6',
      'occurred_at', v_ev,
      'amount_minor', 37000,
      'plaza_id', v_plaza,
      'vehicle_id', v_vehicle,
      'driver_id', v_driver,
      'evidence_status', 'unverified',
      'evidence', jsonb_build_object('receipt_url', 'https://example.com/driver-cash.jpg')
    )),
    'imp-driver-cash-i6',
    'driver_app'
  );
  v_resp2 := public.toll_sys_import(
    v_org_a, 'driver_cash',
    jsonb_build_array(jsonb_build_object(
      'source_ref', 'submission:imp-driver-cash-i6',
      'occurred_at', v_ev,
      'amount_minor', 37000,
      'plaza_id', v_plaza,
      'vehicle_id', v_vehicle,
      'driver_id', v_driver,
      'evidence_status', 'unverified',
      'evidence', jsonb_build_object('receipt_url', 'https://example.com/driver-cash.jpg')
    )),
    'imp-driver-cash-i6',
    'driver_app'
  );
  RESET ROLE;
  IF coalesce(v_resp2 ->> 'replay', 'false') <> 'true' THEN
    RAISE EXCEPTION 's11 driver_cash replay flag';
  END IF;
  SELECT count(*)::int INTO v_cnt
    FROM toll.charges
   WHERE organization_id = v_org_a
     AND source_ref = 'submission:imp-driver-cash-i6';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 's11 expected one driver_cash charge, got %', v_cnt;
  END IF;
  SELECT id INTO v_cash_id
    FROM toll.charges
   WHERE organization_id = v_org_a
     AND source_ref = 'submission:imp-driver-cash-i6';
  IF (SELECT evidence_status FROM toll.charges WHERE id = v_cash_id) <> 'unverified' THEN
    RAISE EXCEPTION 's11 charge must be unverified';
  END IF;
  IF EXISTS (SELECT 1 FROM toll.allocations WHERE organization_id = v_org_a AND charge_id = v_cash_id) THEN
    RAISE EXCEPTION 's11 unverified charge must have no allocations';
  END IF;
  IF pg_temp._imp_led_charge(v_org_a, v_cash_id, 'P3_cash_verified') <> 0 THEN
    RAISE EXCEPTION 's11 unverified driver_cash must have no ledger rows';
  END IF;
  v_status := v_resp -> 'report' -> 0 ->> 'id';
  IF v_status IS DISTINCT FROM (v_resp2 -> 'report' -> 0 ->> 'id') THEN
    RAISE EXCEPTION 's11 replay charge id mismatch';
  END IF;
  PERFORM pg_temp._imp_nightly_ok(v_org_a);

  RAISE NOTICE 'toll_v2_import: all sections passed';
END $$;

ROLLBACK;

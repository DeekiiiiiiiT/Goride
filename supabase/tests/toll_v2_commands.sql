-- Toll v2 R3: command framework, seal/reopen, permissions (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT u.id, u.email
FROM (VALUES
  ('d0111111-1111-4111-8111-111111111111'::uuid, 'toll-v2-cmd-owner@example.com'),
  ('d0211111-1111-4111-8111-111111111112'::uuid, 'toll-v2-cmd-mgr@example.com'),
  ('d0311111-1111-4111-8111-111111111113'::uuid, 'toll-v2-cmd-acct@example.com'),
  ('d0411111-1111-4111-8111-111111111114'::uuid, 'toll-v2-cmd-mgr-exp@example.com'),
  ('d0511111-1111-4111-8111-111111111115'::uuid, 'toll-v2-cmd-mgr-susp@example.com'),
  ('d0611111-1111-4111-8111-111111111116'::uuid, 'toll-v2-cmd-mgr-b@example.com'),
  ('d0711111-1111-4111-8111-111111111117'::uuid, 'toll-v2-cmd-owner-b@example.com')
) AS u(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

DO $$
DECLARE
  v_owner       uuid := 'd0111111-1111-4111-8111-111111111111';
  v_mgr         uuid := 'd0211111-1111-4111-8111-111111111112';
  v_acct        uuid := 'd0311111-1111-4111-8111-111111111113';
  v_mgr_exp     uuid := 'd0411111-1111-4111-8111-111111111114';
  v_mgr_susp    uuid := 'd0511111-1111-4111-8111-111111111115';
  v_mgr_b       uuid := 'd0611111-1111-4111-8111-111111111116';
  v_owner_b     uuid := 'd0711111-1111-4111-8111-111111111117';
  v_org_a       uuid := 'd1111111-1111-4111-8111-111111111101';
  v_org_b       uuid := 'd2222222-2222-4222-8222-222222222202';
  v_effective   timestamptz := '2024-03-12 12:00:00+00';  -- in the past: sealed weeks must have ended
  v_amount      bigint := 1000;
  v_week0       date;
  v_week        date;
  v_i           int;
  v_resp        jsonb;
  v_resp2       jsonb;
  v_msg         text;
  v_detail      text;
  v_decision    uuid;
  v_decision_id uuid;
  v_stmt_cnt    int;
  v_charge      uuid;
  v_charge2     uuid;
  v_payback     uuid;
  v_dup_review  uuid;
  v_role_mgr    uuid;
  v_role_acct   uuid;
  v_cnt         int;
  v_ver         int;
  v_fn_cmd      regprocedure := 'public.toll_v2_command(text,jsonb)'::regprocedure;
  v_fn_en       regprocedure := 'public.toll_v2_enabled()'::regprocedure;
  v_fn_wr       regprocedure := 'toll_write.command(text,jsonb)'::regprocedure;
  v_j           jsonb;
  v_blocking    jsonb;
BEGIN
  v_week0 := ledger.jamaica_week_start(v_effective);

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES
    (v_org_a, v_owner, 'Toll Commands Org A', 'toll-cmd-a', 'fleet', 'active'),
    (v_org_b, v_owner_b, 'Toll Commands Org B', 'toll-cmd-b', 'fleet', 'active')
  ON CONFLICT (id) DO NOTHING;

  PERFORM toll_system.ensure_accounts(v_org_a);
  PERFORM toll_system.ensure_accounts(v_org_b);

  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org_a, 'toll-cmd-fixture', 'fixture', 'user')
  RETURNING id INTO v_decision_id;

  INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system)
  VALUES
    ('fleet_manager', 'Fleet Manager', 'toll cmd test', 50, 'fleet', true),
    ('fleet_accountant', 'Fleet Accountant', 'toll cmd test', 40, 'fleet', true)
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_role_mgr FROM platform.roles WHERE name = 'fleet_manager';
  SELECT id INTO v_role_acct FROM platform.roles WHERE name = 'fleet_accountant';

  INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, status, expires_at)
  VALUES
    (v_mgr, v_role_mgr, 'organization', v_org_a, 'active', NULL),
    (v_acct, v_role_acct, 'organization', v_org_a, 'active', NULL),
    (v_mgr_exp, v_role_mgr, 'organization', v_org_a, 'active', now() - interval '1 day'),
    (v_mgr_susp, v_role_mgr, 'organization', v_org_a, 'suspended', NULL),
    (v_mgr_b, v_role_mgr, 'organization', v_org_b, 'active', NULL);

  -- ── helper: act as user for company ──
  CREATE OR REPLACE FUNCTION pg_temp._toll_cmd_as(p_user uuid, p_org uuid) RETURNS void
  LANGUAGE plpgsql AS $as$
  BEGIN
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

  CREATE OR REPLACE FUNCTION pg_temp._toll_cmd_expect(p_intent text, p_body jsonb, p_code text) RETURNS void
  LANGUAGE plpgsql AS $ex$
  DECLARE v_msg text; v_detail text;
  BEGIN
    PERFORM public.toll_v2_command(p_intent, p_body);
    RAISE EXCEPTION 'test expect % but command succeeded (intent %)', p_code, p_intent;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
    IF v_msg IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 'test expect code % got % (detail %)', p_code, v_msg, v_detail;
    END IF;
  END;
  $ex$;

  CREATE OR REPLACE FUNCTION pg_temp._toll_charge(
    p_org uuid, p_week date, p_suffix text,
    p_evidence text DEFAULT 'verified',
    p_awaiting boolean DEFAULT false,
    p_legacy boolean DEFAULT false,
    p_after boolean DEFAULT false,
    p_dup_of uuid DEFAULT NULL
  ) RETURNS uuid
  LANGUAGE plpgsql AS $ch$
  DECLARE v_id uuid;
  BEGIN
    INSERT INTO toll.charges (
      organization_id, occurred_at, week_key, time_precision, amount_minor,
      paid_by, source, source_ref, evidence_status, awaiting_cash, is_legacy, after_seal, duplicate_of,
      driver_id
    ) VALUES (
      p_org, (p_week::timestamptz + time '12:00'), p_week, 'exact', 1000,
      'tag', 'manual', 'toll-cmd-' || p_suffix,
      p_evidence, p_awaiting, p_legacy, p_after, p_dup_of,
      'driver-toll-cmd-1'
    ) RETURNING id INTO v_id;
    RETURN v_id;
  END;
  $ch$;

  -- 1. Owner seals empty week
  v_week := v_week0;
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
  v_resp := public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-seal-1',
    'week_key', v_week,
    'expected_week_version', 0
  ));
  IF coalesce((v_resp -> 'weeks' -> 0 ->> 'week_version')::int, -1) <> 1 THEN
    RAISE EXCEPTION 'test1: week_version expected 1 got %', v_resp;
  END IF;
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM ledger.week_statements ws
    WHERE ws.organization_id = v_org_a AND ws.kind = 'toll_week' AND ws.driver_id = '*'
      AND ws.week_key = v_week AND ws.status = 'closed'
  ) THEN
    RAISE EXCEPTION 'test1: missing closed toll_week statement';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.decisions d
    WHERE d.organization_id = v_org_a AND d.command_id = 'toll-cmd-seal-1' AND d.response IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'test1: decision response not stored';
  END IF;
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);

  -- 2. Replay + COMMAND_ID_REUSED
  v_resp2 := public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-seal-1',
    'week_key', v_week,
    'expected_week_version', 0
  ));
  IF coalesce(v_resp2 ->> 'replay', 'false') <> 'true' THEN
    RAISE EXCEPTION 'test2: replay flag missing';
  END IF;
  IF (v_resp2 ->> 'decision_id') IS DISTINCT FROM (v_resp ->> 'decision_id') THEN
    RAISE EXCEPTION 'test2: decision_id mismatch on replay';
  END IF;
  RESET ROLE;
  SELECT count(*) INTO v_stmt_cnt FROM ledger.week_statements ws
  WHERE ws.organization_id = v_org_a AND ws.kind = 'toll_week' AND ws.driver_id = '*'
    AND ws.week_key = v_week AND ws.status = 'closed';
  IF v_stmt_cnt <> 1 THEN
    RAISE EXCEPTION 'test2: expected 1 closed statement, got %', v_stmt_cnt;
  END IF;
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
  PERFORM pg_temp._toll_cmd_expect('reopen_week', jsonb_build_object(
    'command_id', 'toll-cmd-seal-1',
    'week_key', v_week,
    'expected_week_version', 1,
    'reason', 'x'
  ), 'COMMAND_ID_REUSED');

  -- 3. Seal blockers (one week each) + non-blockers seal on shared week index
  FOR v_i IN 0..3 LOOP
    v_week := v_week0 + (7 * (10 + v_i));
    RESET ROLE;
    IF v_i = 0 THEN
      PERFORM pg_temp._toll_charge(v_org_a, v_week, 'pending-' || v_i);
      -- pending: no allocation
    ELSIF v_i = 1 THEN
      PERFORM pg_temp._toll_charge(v_org_a, v_week, 'unverified-' || v_i, 'unverified', false);
    ELSIF v_i = 2 THEN
      v_charge := pg_temp._toll_charge(v_org_a, v_week, 'dup-a-' || v_i);
      v_charge2 := pg_temp._toll_charge(v_org_a, v_week, 'dup-b-' || v_i);
      IF v_charge < v_charge2 THEN
        INSERT INTO toll.duplicate_reviews (organization_id, charge_a, charge_b, status)
        VALUES (v_org_a, v_charge, v_charge2, 'open');
      ELSE
        INSERT INTO toll.duplicate_reviews (organization_id, charge_a, charge_b, status)
        VALUES (v_org_a, v_charge2, v_charge, 'open');
      END IF;
    ELSE
      INSERT INTO toll.paybacks (
        organization_id, platform, kind, reference, paid_on, week_key,
        amount_minor, received_by
      ) VALUES (
        v_org_a, 'uber', 'trip_line', 'toll-cmd-unalloc-' || v_i, v_week, v_week,
        v_amount, 'fleet'
      );
    END IF;
    PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
    BEGIN
      PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
        'command_id', 'toll-cmd-block-' || v_i,
        'week_key', v_week,
        'expected_week_version', 0
      ));
      RAISE EXCEPTION 'test3 blocker week % should refuse', v_i;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
      IF v_msg <> 'PENDING_NOT_RESOLVED' THEN
        RAISE EXCEPTION 'test3 week % expected PENDING_NOT_RESOLVED got %', v_i, v_msg;
      END IF;
      v_j := v_detail::jsonb;
      v_blocking := v_j -> 'blocking';
      IF jsonb_array_length(v_blocking) < 1 THEN
        RAISE EXCEPTION 'test3 week % blocking empty', v_i;
      END IF;
      IF v_i = 0 AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_blocking) el WHERE el ->> 'reason' = 'pending'
      ) THEN
        RAISE EXCEPTION 'test3 pending blocker missing';
      ELSIF v_i = 1 AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_blocking) el WHERE el ->> 'reason' = 'unverified'
      ) THEN
        RAISE EXCEPTION 'test3 unverified blocker missing';
      ELSIF v_i = 2 AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_blocking) el WHERE el ->> 'reason' = 'review_pair'
      ) THEN
        RAISE EXCEPTION 'test3 review_pair blocker missing';
      ELSIF v_i = 3 AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_blocking) el WHERE el ->> 'reason' = 'unallocated_payback'
      ) THEN
        RAISE EXCEPTION 'test3 unallocated_payback blocker missing';
      END IF;
    END;
  END LOOP;

  -- non-blockers on separate weeks
  RESET ROLE;
  v_week := v_week0 + 7 * 20;
  v_charge := pg_temp._toll_charge(v_org_a, v_week, 'allocated-ok');
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, decision_id)
  VALUES (v_org_a, v_charge, 'fleet', v_amount, 'test', v_decision_id);
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-nb-alloc', 'week_key', v_week, 'expected_week_version', 0
  ));

  RESET ROLE;
  v_week := v_week0 + 7 * 21;
  PERFORM pg_temp._toll_charge(v_org_a, v_week, 'rejected-ok', 'rejected');
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-nb-rej', 'week_key', v_week, 'expected_week_version', 0
  ));

  RESET ROLE;
  v_week := v_week0 + 7 * 22;
  v_charge := pg_temp._toll_charge(v_org_a, v_week, 'dup-conf-a');
  v_charge2 := pg_temp._toll_charge(v_org_a, v_week, 'dup-conf-b');
  IF v_charge < v_charge2 THEN
    INSERT INTO toll.duplicate_reviews (organization_id, charge_a, charge_b, status)
    VALUES (v_org_a, v_charge, v_charge2, 'confirmed');
  ELSE
    INSERT INTO toll.duplicate_reviews (organization_id, charge_a, charge_b, status)
    VALUES (v_org_a, v_charge2, v_charge, 'confirmed');
  END IF;
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, decision_id)
  VALUES
    (v_org_a, v_charge, 'fleet', v_amount, 'test', v_decision_id),
    (v_org_a, v_charge2, 'fleet', v_amount, 'test', v_decision_id);
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-nb-dup', 'week_key', v_week, 'expected_week_version', 0
  ));

  RESET ROLE;
  v_week := v_week0 + 7 * 23;
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-cmd-pb-rev', v_week, v_week, v_amount, 'fleet'
  ) RETURNING id INTO v_payback;
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by, reversal_of
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-cmd-pb-rev-r', v_week, v_week, v_amount, 'fleet', v_payback
  );
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-nb-rev-pb', 'week_key', v_week, 'expected_week_version', 0
  ));

  RESET ROLE;
  v_week := v_week0 + 7 * 24;
  PERFORM pg_temp._toll_charge(v_org_a, v_week, 'legacy-ok', 'verified', false, true);
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-nb-leg', 'week_key', v_week, 'expected_week_version', 0
  ));

  RESET ROLE;
  v_week := v_week0 + 7 * 25;
  PERFORM pg_temp._toll_charge(v_org_a, v_week, 'after-seal-ok', 'verified', false, false, true);
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-nb-after', 'week_key', v_week, 'expected_week_version', 0
  ));

  -- 4. awaiting_cash
  RESET ROLE;
  v_week := v_week0 + 7 * 26;
  v_charge := pg_temp._toll_charge(v_org_a, v_week, 'await-cash', 'verified', true);
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
  v_resp := public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-await', 'week_key', v_week, 'expected_week_version', 0
  ));
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM toll.allocations a
    WHERE a.organization_id = v_org_a AND a.charge_id = v_charge AND a.provisional = true AND a.bearer = 'fleet'
  ) THEN
    RAISE EXCEPTION 'test4: missing provisional fleet allocation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ledger.entries e
    WHERE e.organization_id = v_org_a
      AND e.metadata->>'toll_rule' = 'P8_allocate_fleet'
  ) THEN
    RAISE EXCEPTION 'test4: missing P8_allocate_fleet ledger row';
  END IF;
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);

  -- 5. Versions
  v_week := v_week0 + 7 * 27;
  PERFORM pg_temp._toll_cmd_expect('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-ver-wrong', 'week_key', v_week, 'expected_week_version', 5
  ), 'VERSION_CHANGED');
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-ver-seal', 'week_key', v_week, 'expected_week_version', 0
  ));
  PERFORM pg_temp._toll_cmd_expect('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-ver-sealed', 'week_key', v_week, 'expected_week_version', 1
  ), 'WEEK_SEALED');
  PERFORM pg_temp._toll_cmd_expect('reopen_week', jsonb_build_object(
    'command_id', 'toll-cmd-ver-open', 'week_key', v_week0 + 7 * 28, 'expected_week_version', 0, 'reason', 'x'
  ), 'WEEK_NOT_SEALED');

  -- 6. Reopen
  v_week := v_week0 + 7 * 29;
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-reopen-seal', 'week_key', v_week, 'expected_week_version', 0
  ));
  v_resp := public.toll_v2_command('reopen_week', jsonb_build_object(
    'command_id', 'toll-cmd-reopen-ok',
    'week_key', v_week,
    'expected_week_version', 1,
    'reason', 'fix mistake'
  ));
  IF coalesce((v_resp -> 'weeks' -> 0 ->> 'week_version')::int, -1) <> 2 THEN
    RAISE EXCEPTION 'test6 reopen version expected 2';
  END IF;
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM ledger.week_statements ws
    WHERE ws.organization_id = v_org_a AND ws.week_key = v_week AND ws.version = 2 AND ws.status = 'draft'
  ) THEN
    RAISE EXCEPTION 'test6: draft statement version 2 missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.audit_log a
    WHERE a.organization_id = v_org_a AND a.action = 'reopen'
  ) THEN
    RAISE EXCEPTION 'test6: audit reopen row missing';
  END IF;
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
  PERFORM pg_temp._toll_cmd_expect('reopen_week', jsonb_build_object(
    'command_id', 'toll-cmd-reopen-nr',
    'week_key', v_week,
    'expected_week_version', 2
  ), 'BAD_REQUEST');
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-reopen-reseal', 'week_key', v_week, 'expected_week_version', 2
  ));
  RESET ROLE;
  INSERT INTO ledger.settlement_movements (
    organization_id, driver_id, period_anchor, kind, amount_minor, idempotency_key, status
  ) VALUES (
    v_org_a, 'driver-paid-1', v_week, 'pay', 100, 'toll-cmd-paid-' || v_week::text, 'posted'
  );
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
  PERFORM pg_temp._toll_cmd_expect('reopen_week', jsonb_build_object(
    'command_id', 'toll-cmd-reopen-paid',
    'week_key', v_week,
    'expected_week_version', 3,
    'reason', 'too late'
  ), 'DRIVERS_ALREADY_PAID');

  -- 7. carry_forward
  v_week := v_week0 + 7 * 30;
  PERFORM pg_temp._toll_cmd_expect('carry_forward', jsonb_build_object(
    'command_id', 'toll-cmd-cf-open', 'from_week', v_week,
    'to_week', v_week + 7, 'kind', 'take_back'
  ), 'WEEK_NOT_SEALED');
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-cf-seal-unpaid', 'week_key', v_week, 'expected_week_version', 0
  ));
  PERFORM pg_temp._toll_cmd_expect('carry_forward', jsonb_build_object(
    'command_id', 'toll-cmd-cf-unpaid', 'from_week', v_week,
    'to_week', v_week + 7, 'kind', 'take_back'
  ), 'REOPEN_INSTEAD');
  v_week := v_week0 + 7 * 31;
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-cf-seal-paid', 'week_key', v_week, 'expected_week_version', 0
  ));
  RESET ROLE;
  INSERT INTO ledger.settlement_movements (
    organization_id, driver_id, period_anchor, kind, amount_minor, idempotency_key, status
  ) VALUES (
    v_org_a, 'driver-paid-2', v_week, 'pay', 100, 'toll-cmd-cf-paid-' || v_week::text, 'posted'
  );
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
  PERFORM pg_temp._toll_cmd_expect('carry_forward', jsonb_build_object(
    'command_id', 'toll-cmd-cf-paid', 'from_week', v_week,
    'to_week', v_week + 7, 'kind', 'take_back'
  ), 'BAD_REQUEST');

  -- 8. Who may act
  v_week := v_week0 + 7 * 32;
  PERFORM pg_temp._toll_cmd_as(v_mgr, v_org_a);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-mgr-ok', 'week_key', v_week, 'expected_week_version', 0
  ));
  v_week := v_week0 + 7 * 33;
  PERFORM pg_temp._toll_cmd_as(v_acct, v_org_a);
  PERFORM pg_temp._toll_cmd_expect('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-acct', 'week_key', v_week, 'expected_week_version', 0
  ), 'FORBIDDEN');
  v_week := v_week0 + 7 * 34;
  PERFORM pg_temp._toll_cmd_as(v_mgr_exp, v_org_a);
  PERFORM pg_temp._toll_cmd_expect('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-exp', 'week_key', v_week, 'expected_week_version', 0
  ), 'FORBIDDEN');
  v_week := v_week0 + 7 * 35;
  PERFORM pg_temp._toll_cmd_as(v_mgr_susp, v_org_a);
  PERFORM pg_temp._toll_cmd_expect('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-susp', 'week_key', v_week, 'expected_week_version', 0
  ), 'FORBIDDEN');
  PERFORM pg_temp._toll_cmd_as(v_mgr_b, v_org_a);
  PERFORM pg_temp._toll_cmd_expect('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-cross', 'week_key', v_week0 + 7 * 36, 'expected_week_version', 0
  ), 'FORBIDDEN');

  -- 9. Company isolation
  RESET ROLE;
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref
  ) VALUES (
    v_org_a, (v_week0::timestamptz + time '12:00'), v_week0, 'exact', v_amount, 'tag', 'manual', 'toll-cmd-iso-a'
  );
  PERFORM pg_temp._toll_cmd_as(v_owner_b, v_org_b);
  SELECT count(*) INTO v_cnt FROM toll.charges WHERE organization_id = v_org_a;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'test9: company B token must not see company A charges (saw %)', v_cnt;
  END IF;
  SELECT count(*) INTO v_cnt FROM toll.decisions WHERE organization_id = v_org_a;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'test9: company B token must not see company A decisions';
  END IF;
  v_week := v_week0 + 7 * 37;
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-iso-b-seal', 'week_key', v_week, 'expected_week_version', 0
  ));
  RESET ROLE;
  IF EXISTS (
    SELECT 1 FROM ledger.week_statements ws
    WHERE ws.organization_id = v_org_a AND ws.week_key = v_week AND ws.kind = 'toll_week'
  ) THEN
    RAISE EXCEPTION 'test9: B seal created A statement';
  END IF;
  PERFORM pg_temp._toll_cmd_as(v_owner_b, v_org_b);
  PERFORM pg_temp._toll_cmd_expect('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-org-body',
    'week_key', v_week,
    'expected_week_version', 0,
    'organization_id', v_org_a
  ), 'COMPANY_NOT_ACCEPTED');
  PERFORM set_config('request.jwt.claims', '{"sub":"' || v_owner::text || '","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._toll_cmd_expect('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-no-co',
    'week_key', v_week,
    'expected_week_version', 0
  ), 'NO_COMPANY');

  -- 10. Intents
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
  -- P2-R4b built reverse_payback; the carried P19 leftover path is still P2-R4c.
  PERFORM pg_temp._toll_cmd_expect('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'toll-cmd-nb-intent', 'carried_fact_id', gen_random_uuid(), 'reason_code', 'x'
  ), 'NOT_FOUND');
  PERFORM pg_temp._toll_cmd_expect('make_coffee', jsonb_build_object(
    'command_id', 'toll-cmd-unknown'
  ), 'UNKNOWN_INTENT');
  PERFORM pg_temp._toll_cmd_expect('seal_week', jsonb_build_object(
    'command_id', 'toll-cmd-not-mon',
    'week_key', v_week0 + 3,
    'expected_week_version', 0
  ), 'BAD_REQUEST');

  -- 11. Grants
  RESET ROLE;
  IF has_function_privilege('anon', v_fn_cmd, 'EXECUTE')
    OR has_function_privilege('service_role', v_fn_cmd, 'EXECUTE') THEN
    RAISE EXCEPTION 'test11: anon/service_role must not EXECUTE toll_v2_command';
  END IF;
  IF has_function_privilege('anon', v_fn_en, 'EXECUTE')
    OR has_function_privilege('service_role', v_fn_en, 'EXECUTE') THEN
    RAISE EXCEPTION 'test11: anon/service_role must not EXECUTE toll_v2_enabled';
  END IF;
  IF has_function_privilege('anon', v_fn_wr, 'EXECUTE')
    OR has_function_privilege('service_role', v_fn_wr, 'EXECUTE') THEN
    RAISE EXCEPTION 'test11: anon/service_role must not EXECUTE toll_write.command';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn_cmd, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', v_fn_en, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', v_fn_wr, 'EXECUTE') THEN
    RAISE EXCEPTION 'test11: authenticated must EXECUTE command RPCs';
  END IF;
  IF has_function_privilege('authenticated', 'toll_write.intent_seal_week(uuid,uuid,text,jsonb)'::regprocedure, 'EXECUTE')
    OR has_function_privilege('authenticated', 'toll_system.user_can_manage_tolls(uuid,uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'test11: authenticated must not EXECUTE toll_write.intent_* or toll_system.*';
  END IF;

  -- 12. Switch (as authenticated user; row inserted as postgres below)
  PERFORM pg_temp._toll_cmd_as(v_owner, v_org_a);
  IF public.toll_v2_enabled() IS NOT FALSE THEN
    RAISE EXCEPTION 'test12: enabled should be false without switch row';
  END IF;
END;
$$;

RESET ROLE;

INSERT INTO toll.switch_state (organization_id, tolls_v2)
VALUES ('d1111111-1111-4111-8111-111111111101'::uuid, true)
ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = true;

DO $$
DECLARE
  v_owner uuid := 'd0111111-1111-4111-8111-111111111111';
  v_org_a uuid := 'd1111111-1111-4111-8111-111111111101';
  v_org_b uuid := 'd2222222-2222-4222-8222-222222222202';
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('organizationId', v_org_a::text)
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  IF public.toll_v2_enabled() IS NOT TRUE THEN
    RAISE EXCEPTION 'test12: enabled should be true for org A';
  END IF;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('organizationId', v_org_b::text)
    )::text,
    true
  );
  IF public.toll_v2_enabled() IS NOT FALSE THEN
    RAISE EXCEPTION 'test12: enabled should stay false for org B';
  END IF;
  RAISE NOTICE 'toll_v2_commands: ok';
END;
$$;

ROLLBACK;

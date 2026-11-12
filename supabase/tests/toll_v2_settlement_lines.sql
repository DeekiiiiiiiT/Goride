-- Toll v2 P1-R4: driver settlement lines, toll statements, RPC seam, check 3 (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT u.id, u.email
FROM (VALUES
  ('a0111111-1111-4111-8111-111111111131'::uuid, 'toll-sl-owner@example.com'),
  ('a0211111-1111-4111-8111-111111111132'::uuid, 'toll-sl-owner-off@example.com')
) AS u(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

DO $$
DECLARE
  v_owner     uuid := 'a0111111-1111-4111-8111-111111111131';
  v_owner_off uuid := 'a0211111-1111-4111-8111-111111111132';
  v_org       uuid := 'a1111111-1111-4111-8111-111111111131';
  v_org_off   uuid := 'a2222222-2222-4222-8222-222222222132';
  v_effective timestamptz := '2024-08-20 12:00:00+00';
  v_week0     date;
  v_w         date;
  v_w_chk     date;
  v_ev        timestamptz;
  v_d1        text := 'driver-sl-1';
  v_d2        text := 'driver-sl-2';
  v_decision  uuid;
  v_ch_tag    uuid;
  v_ch_cash   uuid;
  v_ch_plat   uuid;
  v_pb_fleet  uuid;
  v_j         jsonb;
  v_line      jsonb;
  v_resp      jsonb;
  v_cnt       int;
  v_ob        int;
  v_fn_drv    regprocedure := 'public.toll_sys_driver_week_tolls(uuid,date,text)'::regprocedure;
  v_amt_tag   bigint := 1500;
  v_amt_cash  bigint := 2000;
  v_amt_plat  bigint := 1000;
  v_amt_pb    bigint := 1000;
BEGIN
  v_week0 := ledger.jamaica_week_start(v_effective);
  v_w := v_week0 + 7 * 40;
  v_w_chk := v_week0 + 7 * 41;
  v_ev := v_w::timestamptz + time '12:00';

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES
    (v_org, v_owner, 'Toll SL Org', 'toll-sl', 'fleet', 'active'),
    (v_org_off, v_owner_off, 'Toll SL Off', 'toll-sl-off', 'fleet', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO toll.switch_state (organization_id, tolls_v2)
  VALUES (v_org, true), (v_org_off, false)
  ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = EXCLUDED.tolls_v2;

  PERFORM toll_system.ensure_accounts(v_org);
  PERFORM toll_system.ensure_accounts(v_org_off);

  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org, 'toll-sl-fixture', 'fixture', 'user')
  RETURNING id INTO v_decision;

  CREATE OR REPLACE FUNCTION pg_temp._sl_as(p_user uuid, p_org uuid) RETURNS void
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

  CREATE OR REPLACE FUNCTION pg_temp._sl_check3_ok(p_org uuid, p_week date) RETURNS boolean
  LANGUAGE plpgsql AS $c3$
  DECLARE r record;
  BEGIN
    FOR r IN SELECT * FROM toll_system.nightly_checks(p_org) WHERE check_no = 3 AND name = 'week_flow:' || p_week::text LOOP
      RETURN r.ok;
    END LOOP;
    RETURN false;
  END;
  $c3$;

  -- Section 1: driver line (tag→driver, cash→fleet, platform-linked)
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org, 'uber', 'trip_line', 'toll-sl-pb', v_w, v_w, v_amt_pb, 'fleet'
  ) RETURNING id INTO v_pb_fleet;
  PERFORM toll_system.post(v_org, 'P4_payback_fleet', v_amt_pb, v_ev, 'toll-sl-p4', 1,
    jsonb_build_object('payback_id', v_pb_fleet::text));

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org, v_ev, v_w, 'exact', v_amt_tag, 'tag', 'manual', 'toll-sl-tag', 'verified', v_d1
  ) RETURNING id INTO v_ch_tag;
  PERFORM toll_system.post(v_org, 'P2_tag_crossing', v_amt_tag, v_ev, 'toll-sl-p2-tag', 2,
    jsonb_build_object('charge_id', v_ch_tag::text));
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, decision_id)
  VALUES (v_org, v_ch_tag, 'driver', v_amt_tag, 'sl-tag-drv', v_decision);
  PERFORM toll_system.post(v_org, 'P7_allocate_driver', v_amt_tag, v_ev, 'toll-sl-p7', 3,
    jsonb_build_object('charge_id', v_ch_tag::text));

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org, v_ev, v_w, 'exact', v_amt_cash, 'cash', 'driver_cash', 'toll-sl-cash', 'verified', v_d1
  ) RETURNING id INTO v_ch_cash;
  PERFORM toll_system.post(v_org, 'P3_cash_verified', v_amt_cash, v_ev, 'toll-sl-p3', 4,
    jsonb_build_object('charge_id', v_ch_cash::text));
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, decision_id)
  VALUES (v_org, v_ch_cash, 'fleet', v_amt_cash, 'sl-cash-flt', v_decision);
  PERFORM toll_system.post(v_org, 'P8_allocate_fleet', v_amt_cash, v_ev, 'toll-sl-p8', 5,
    jsonb_build_object('charge_id', v_ch_cash::text));

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org, v_ev, v_w, 'exact', v_amt_plat, 'tag', 'manual', 'toll-sl-plat', 'verified', v_d1
  ) RETURNING id INTO v_ch_plat;
  PERFORM toll_system.post(v_org, 'P2_tag_crossing', v_amt_plat, v_ev, 'toll-sl-p2-plat', 6,
    jsonb_build_object('charge_id', v_ch_plat::text));
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id)
  VALUES (v_org, v_ch_plat, 'platform', v_amt_plat, v_pb_fleet, 'sl-plat', v_decision);
  PERFORM toll_system.post(v_org, 'P6_allocate_platform', v_amt_plat, v_ev, 'toll-sl-p6', 7,
    jsonb_build_object('charge_id', v_ch_plat::text, 'payback_id', v_pb_fleet::text));

  v_j := toll_system.week_result(v_org, v_w);
  SELECT l INTO v_line
  FROM jsonb_array_elements(coalesce(v_j -> 'drivers', '[]'::jsonb)) l
  WHERE l ->> 'driverId' = v_d1 LIMIT 1;
  IF v_line IS NULL THEN RAISE EXCEPTION 'sec1: missing driver line'; END IF;
  IF (v_line ->> 'owesFleetMinor')::bigint <> v_amt_tag THEN RAISE EXCEPTION 'sec1 owesFleet'; END IF;
  IF (v_line ->> 'fleetOwesMinor')::bigint <> v_amt_cash THEN RAISE EXCEPTION 'sec1 fleetOwes'; END IF;
  IF (v_line ->> 'spendMinor')::bigint <> v_amt_tag + v_amt_cash + v_amt_plat THEN RAISE EXCEPTION 'sec1 spend'; END IF;
  IF (v_line ->> 'tagSpendMinor')::bigint <> v_amt_tag + v_amt_plat THEN RAISE EXCEPTION 'sec1 tagSpend'; END IF;
  IF (v_line ->> 'cashSpendMinor')::bigint <> v_amt_cash THEN RAISE EXCEPTION 'sec1 cashSpend'; END IF;
  IF (v_line ->> 'platformMinor')::bigint <> v_amt_plat THEN RAISE EXCEPTION 'sec1 platform'; END IF;
  IF (v_line ->> 'fleetMinor')::bigint <> v_amt_cash THEN RAISE EXCEPTION 'sec1 fleetMinor'; END IF;
  IF (v_line ->> 'recoveredInPassengerCashMinor')::bigint <> 0 THEN RAISE EXCEPTION 'sec1 recovered'; END IF;
  IF (v_line ->> 'driverId') <> v_d1 THEN RAISE EXCEPTION 'sec1 driverId'; END IF;

  -- Section 2: DFP rows + seal → per-driver toll statements
  INSERT INTO public.driver_financial_periods (
    organization_id, driver_id, period_anchor, period_end, status, metadata
  ) VALUES
    (v_org, v_d1, v_w, v_w + 6, 'open', '{}'::jsonb),
    (v_org, v_d2, v_w, v_w + 6, 'open', '{}'::jsonb)
  ON CONFLICT DO NOTHING;

  PERFORM pg_temp._sl_as(v_owner, v_org);
  v_resp := public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-sl-seal-1',
    'week_key', v_w,
    'expected_week_version', 0
  ));
  RESET ROLE;

  SELECT count(*) INTO v_cnt FROM ledger.week_statements ws
  WHERE ws.organization_id = v_org AND ws.kind = 'toll' AND ws.driver_id = v_d1
    AND ws.week_key = v_w AND ws.status = 'closed';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'sec2: missing closed toll stmt d1'; END IF;

  SELECT count(*) INTO v_cnt FROM ledger.week_statements ws
  WHERE ws.organization_id = v_org AND ws.kind = 'toll' AND ws.driver_id = v_d2
    AND ws.week_key = v_w AND ws.status = 'closed';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'sec2: missing closed toll stmt d2'; END IF;

  SELECT ws.amounts_minor INTO v_j FROM ledger.week_statements ws
  WHERE ws.organization_id = v_org AND ws.kind = 'toll' AND ws.driver_id = v_d1
    AND ws.week_key = v_w AND ws.status = 'closed' ORDER BY ws.version DESC LIMIT 1;
  IF (v_j ->> 'totalSpend')::bigint <> (v_amt_tag + v_amt_cash + v_amt_plat) THEN RAISE EXCEPTION 'sec2 totalSpend'; END IF;
  IF (v_j ->> 'chargedToDriver')::bigint <> v_amt_tag THEN RAISE EXCEPTION 'sec2 charged'; END IF;
  IF (v_j ->> 'reimbursed')::bigint <> v_amt_plat THEN RAISE EXCEPTION 'sec2 reimbursed'; END IF;
  IF (v_j ->> 'netLoss')::bigint <> v_amt_cash THEN RAISE EXCEPTION 'sec2 netLoss'; END IF;
  IF (v_j ->> 'cashWashSpend')::bigint <> v_amt_cash THEN RAISE EXCEPTION 'sec2 cashWash'; END IF;
  IF (v_j ->> 'tagSpend')::bigint <> (v_amt_tag + v_amt_plat) THEN RAISE EXCEPTION 'sec2 tagSpend'; END IF;

  SELECT ws.amounts_minor INTO v_j FROM ledger.week_statements ws
  WHERE ws.organization_id = v_org AND ws.kind = 'toll' AND ws.driver_id = v_d2
    AND ws.week_key = v_w AND ws.status = 'closed' ORDER BY ws.version DESC LIMIT 1;
  IF (v_j ->> 'totalSpend')::bigint <> 0 OR (v_j ->> 'chargedToDriver')::bigint <> 0 THEN
    RAISE EXCEPTION 'sec2: d2 zeros';
  END IF;
  IF (v_j ->> 'totalSpend')::bigint - (v_j ->> 'reimbursed')::bigint
       - (v_j ->> 'chargedToDriver')::bigint - (v_j ->> 'netLoss')::bigint <> 0 THEN
    RAISE EXCEPTION 'sec2: identity d1';
  END IF;

  -- Section 3: reopen → draft; re-seal → restated prior closed
  PERFORM pg_temp._sl_as(v_owner, v_org);
  PERFORM public.toll_v2_command('reopen_week', jsonb_build_object(
    'command_id', 'toll-sl-reopen-1',
    'week_key', v_w,
    'expected_week_version', 1,
    'reason', 'settlement test reopen'
  ));
  RESET ROLE;
  SELECT count(*) INTO v_cnt FROM ledger.week_statements ws
  WHERE ws.organization_id = v_org AND ws.kind = 'toll' AND ws.driver_id = v_d1
    AND ws.week_key = v_w AND ws.status = 'draft';
  IF v_cnt < 1 THEN RAISE EXCEPTION 'sec3: missing draft after reopen'; END IF;

  PERFORM pg_temp._sl_as(v_owner, v_org);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-sl-seal-2',
    'week_key', v_w,
    'expected_week_version', 2
  ));
  RESET ROLE;

  SELECT count(*) INTO v_cnt FROM ledger.week_statements ws
  WHERE ws.organization_id = v_org AND ws.kind = 'toll' AND ws.driver_id = v_d1
    AND ws.week_key = v_w AND ws.status = 'restated';
  IF v_cnt < 1 THEN RAISE EXCEPTION 'sec3: missing restated stmt'; END IF;

  -- Section 4: toll_sys_driver_week_tolls
  v_resp := public.toll_sys_driver_week_tolls(v_org, v_w, v_d1);
  IF v_resp ->> 'state' <> 'sealed' THEN RAISE EXCEPTION 'sec4: state sealed'; END IF;
  IF (v_resp -> 'line' ->> 'spendMinor')::bigint <> (v_amt_tag + v_amt_cash + v_amt_plat) THEN
    RAISE EXCEPTION 'sec4: rpc line spend';
  END IF;
  v_resp := public.toll_sys_driver_week_tolls(v_org, v_w, 'unknown-driver-sl');
  IF (v_resp -> 'line' ->> 'driverId') IS NOT NULL THEN RAISE EXCEPTION 'sec4: expected null line'; END IF;

  IF has_function_privilege('authenticated', v_fn_drv, 'EXECUTE') THEN
    RAISE EXCEPTION 'sec4: authenticated must not EXECUTE toll_sys_driver_week_tolls';
  END IF;
  IF NOT has_function_privilege('service_role', v_fn_drv, 'EXECUTE') THEN
    RAISE EXCEPTION 'sec4: service_role must EXECUTE toll_sys_driver_week_tolls';
  END IF;

  -- Section 5: period_projection_refresh outbox (v2 on vs off, no-driver charge)
  SELECT count(*) INTO v_cnt FROM ledger.financial_outbox
  WHERE payload ->> 'domain' = 'toll_v2' AND payload ->> 'driver_id' = v_d1;
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, decision_id)
  VALUES (v_org, v_ch_plat, 'fleet', 50, 'sl-outbox-alloc', v_decision);
  SELECT count(*) INTO v_ob FROM ledger.financial_outbox
  WHERE payload ->> 'domain' = 'toll_v2' AND payload ->> 'driver_id' = v_d1;
  IF v_ob <= v_cnt THEN RAISE EXCEPTION 'sec5: allocation should queue outbox'; END IF;

  SELECT count(*) INTO v_cnt FROM ledger.financial_outbox WHERE payload ->> 'organization_id' = v_org_off::text;
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_off, v_ev, v_w_chk, 'exact', 500, 'tag', 'manual', 'toll-sl-off', 'verified', v_d1
  );
  IF (SELECT count(*) FROM ledger.financial_outbox WHERE payload ->> 'organization_id' = v_org_off::text) <> v_cnt THEN
    RAISE EXCEPTION 'sec5: v2-off org queued outbox';
  END IF;

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org, v_ev, v_w_chk, 'exact', 700, 'tag', 'manual', 'toll-sl-nodrv', 'verified', NULL
  );
  IF EXISTS (
    SELECT 1 FROM ledger.financial_outbox
    WHERE payload ->> 'period_anchor' = v_w_chk::text
      AND payload ->> 'event_type' = 'toll_v2_charges_INSERT'
      AND (payload ->> 'driver_id') IS NULL
  ) THEN
    RAISE EXCEPTION 'sec5: null driver should not queue';
  END IF;

  -- Section 6: check 3 clean week, then one break per account
  PERFORM toll_system.ensure_accounts(v_org);
  v_w_chk := v_week0 + 7 * 42;
  v_ev := v_w_chk::timestamptz + time '12:00';

  INSERT INTO toll.tag_accounts (organization_id, provider, account_ref)
  VALUES (v_org, 'test', 'sl-tag-acct')
  ON CONFLICT DO NOTHING;
  INSERT INTO toll.tag_topups (
    organization_id, tag_account_id, amount_minor, topped_up_on, week_key, source_ref
  )
  SELECT v_org, id, 5000, v_w_chk, v_w_chk, 'sl-topup'
  FROM toll.tag_accounts WHERE organization_id = v_org AND account_ref = 'sl-tag-acct' LIMIT 1;
  PERFORM toll_system.post(v_org, 'P1_tag_topup', 5000, v_ev, 'toll-sl-p1', 20,
    jsonb_build_object('tag_topup_id', (
      SELECT id::text FROM toll.tag_topups WHERE organization_id = v_org AND week_key = v_w_chk LIMIT 1)));

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org, v_ev, v_w_chk, 'exact', 800, 'cash', 'driver_cash', 'sl-c3-cash', 'verified', v_d1
  ) RETURNING id INTO v_ch_cash;
  PERFORM toll_system.post(v_org, 'P3_cash_verified', 800, v_ev, 'toll-sl-c3-p3', 21,
    jsonb_build_object('charge_id', v_ch_cash::text));

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org, v_ev, v_w_chk, 'exact', 900, 'tag', 'manual', 'sl-c3-tag', 'verified', v_d1
  ) RETURNING id INTO v_ch_tag;
  PERFORM toll_system.post(v_org, 'P2_tag_crossing', 900, v_ev, 'toll-sl-c3-p2', 22,
    jsonb_build_object('charge_id', v_ch_tag::text));

  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by, driver_id
  ) VALUES (
    v_org, 'uber', 'trip_line', 'sl-c3-pb-drv', v_w_chk, v_w_chk, 400, 'driver', v_d1
  ) RETURNING id INTO v_pb_fleet;
  PERFORM toll_system.post(v_org, 'P5_payback_driver', 400, v_ev, 'toll-sl-c3-p5', 23,
    jsonb_build_object('payback_id', v_pb_fleet::text));

  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org, 'uber', 'trip_line', 'sl-c3-pb-flt', v_w_chk, v_w_chk, 600, 'fleet'
  ) RETURNING id INTO v_pb_fleet;
  PERFORM toll_system.post(v_org, 'P4_payback_fleet', 600, v_ev, 'toll-sl-c3-p4', 24,
    jsonb_build_object('payback_id', v_pb_fleet::text));

  IF NOT pg_temp._sl_check3_ok(v_org, v_w_chk) THEN RAISE EXCEPTION 'sec6: check3 should pass on clean week'; END IF;

  -- P7 missing: driver allocation without post
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, decision_id)
  VALUES (v_org, v_ch_tag, 'driver', 100, 'sl-break-p7', v_decision);
  IF pg_temp._sl_check3_ok(v_org, v_w_chk) THEN RAISE EXCEPTION 'sec6: P7 break should fail'; END IF;
  PERFORM toll_system.post(v_org, 'P7_allocate_driver', 100, v_ev, 'toll-sl-c3-p7-fix', 25,
    jsonb_build_object('charge_id', v_ch_tag::text));

  -- P8 missing
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, decision_id)
  VALUES (v_org, v_ch_cash, 'fleet', 200, 'sl-break-p8', v_decision);
  IF pg_temp._sl_check3_ok(v_org, v_w_chk) THEN RAISE EXCEPTION 'sec6: P8 break should fail'; END IF;
  PERFORM toll_system.post(v_org, 'P8_allocate_fleet', 200, v_ev, 'toll-sl-c3-p8-fix', 26,
    jsonb_build_object('charge_id', v_ch_cash::text));

  -- P3 missing: cash charge without P3 post
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org, v_ev, v_w_chk, 'exact', 300, 'cash', 'driver_cash', 'sl-c3-p3-brk', 'verified', v_d1
  );
  IF pg_temp._sl_check3_ok(v_org, v_w_chk) THEN RAISE EXCEPTION 'sec6: P3 break should fail'; END IF;
  PERFORM toll_system.post(v_org, 'P3_cash_verified', 300, v_ev, 'toll-sl-c3-p3-fix', 27,
    jsonb_build_object('charge_id', (SELECT id::text FROM toll.charges WHERE source_ref = 'sl-c3-p3-brk' LIMIT 1)));

  -- P1 missing: top-up row without P1 post
  INSERT INTO toll.tag_topups (
    organization_id, tag_account_id, amount_minor, topped_up_on, week_key, source_ref
  )
  SELECT v_org, id, 100, v_w_chk, v_w_chk, 'sl-c3-p1-brk'
  FROM toll.tag_accounts WHERE organization_id = v_org AND account_ref = 'sl-tag-acct' LIMIT 1;
  IF pg_temp._sl_check3_ok(v_org, v_w_chk) THEN RAISE EXCEPTION 'sec6: P1 break should fail'; END IF;
  PERFORM toll_system.post(v_org, 'P1_tag_topup', 100, v_ev, 'toll-sl-c3-p1-fix', 28,
    jsonb_build_object('tag_topup_id', (
      SELECT id::text FROM toll.tag_topups WHERE source_ref = 'sl-c3-p1-brk' LIMIT 1)));

  -- P4 missing: fleet payback without P4 post
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org, 'uber', 'trip_line', 'sl-c3-p4-brk', v_w_chk, v_w_chk, 250, 'fleet'
  );
  IF pg_temp._sl_check3_ok(v_org, v_w_chk) THEN RAISE EXCEPTION 'sec6: P4 break should fail'; END IF;
  PERFORM toll_system.post(v_org, 'P4_payback_fleet', 250, v_ev, 'toll-sl-c3-p4-fix', 29,
    jsonb_build_object('payback_id', (
      SELECT id::text FROM toll.paybacks WHERE reference = 'sl-c3-p4-brk' LIMIT 1)));

  IF NOT pg_temp._sl_check3_ok(v_org, v_w_chk) THEN RAISE EXCEPTION 'sec6: check3 should pass after fixes'; END IF;

  RAISE NOTICE 'toll_v2_settlement_lines: ok';
END;
$$;

ROLLBACK;

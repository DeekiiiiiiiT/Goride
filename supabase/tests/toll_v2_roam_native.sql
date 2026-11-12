-- Toll v2 P1-R2: Roam native ride_charge + cash_settled (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT u.id, u.email
FROM (VALUES
  ('a0111111-1111-4111-8111-111111111111'::uuid, 'toll-rn-owner@example.com'),
  ('a0211111-1111-4111-8111-111111111112'::uuid, 'toll-rn-owner-b@example.com')
) AS u(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

DO $$
DECLARE
  v_owner       uuid := 'a0111111-1111-4111-8111-111111111111';
  v_owner_b     uuid := 'a0211111-1111-4111-8111-111111111112';
  v_org_a       uuid := 'a1111111-1111-4111-8111-111111111101';
  v_org_b       uuid := 'a2222222-2222-4222-8222-222222222202';
  v_driver      text := 'driver-rn-1';
  v_vehicle     text := 'vehicle-rn-1';
  v_effective   timestamptz := '2024-06-10 12:00:00+00';
  v_week0       date;
  v_week        date;
  v_ev          timestamptz;
  v_ride        text;
  v_resp        jsonb;
  v_cnt         int;
  v_nat         bigint;
  v_hash        text;
  v_open        bigint;
  v_j           jsonb;
  v_fn_ride     regprocedure := 'public.toll_sys_native_ride_charge(uuid,jsonb)'::regprocedure;
  v_fn_cash     regprocedure := 'public.toll_sys_native_cash_settled(uuid,jsonb)'::regprocedure;
  v_fn_sys_ride regprocedure := 'toll_system.native_ride_charge(uuid,jsonb)'::regprocedure;
  v_fn_sys_cash regprocedure := 'toll_system.native_cash_settled(uuid,jsonb)'::regprocedure;
BEGIN
  v_week0 := ledger.jamaica_week_start(v_effective);

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES
    (v_org_a, v_owner, 'Toll RN Org A', 'toll-rn-a', 'fleet', 'active'),
    (v_org_b, v_owner_b, 'Toll RN Org B', 'toll-rn-b', 'fleet', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO toll.switch_state (organization_id, tolls_v2)
  VALUES (v_org_a, true), (v_org_b, false)
  ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = EXCLUDED.tolls_v2;

  PERFORM toll_system.ensure_accounts(v_org_a);
  PERFORM toll_system.ensure_accounts(v_org_b);

  UPDATE public.organizations SET fleet_org_payout_enabled = false WHERE id = v_org_a;

  CREATE OR REPLACE FUNCTION pg_temp._rn_nightly_ok(p_org uuid) RETURNS void
  LANGUAGE plpgsql AS $ok$
  DECLARE r record;
  BEGIN
    FOR r IN SELECT * FROM toll_system.nightly_checks(p_org) LOOP
      IF NOT r.ok THEN
        RAISE EXCEPTION 'nightly check % % failed: %', r.check_no, r.name, r.detail;
      END IF;
    END LOOP;
  END;
  $ok$;

  CREATE OR REPLACE FUNCTION pg_temp._rn_expect_fail(
    p_org uuid, p_check_no int, p_name_like text, p_want_ok boolean
  ) RETURNS void
  LANGUAGE plpgsql AS $ef$
  DECLARE r record;
  v_found boolean := false;
  BEGIN
    FOR r IN SELECT * FROM toll_system.nightly_checks(p_org) WHERE check_no = p_check_no LOOP
      IF r.name LIKE p_name_like THEN
        v_found := true;
        IF r.ok IS DISTINCT FROM p_want_ok THEN
          RAISE EXCEPTION 'nightly % % want ok=% got %', p_check_no, r.name, p_want_ok, r.ok;
        END IF;
      END IF;
    END LOOP;
    IF NOT v_found THEN
      RAISE EXCEPTION 'no nightly row % like %', p_check_no, p_name_like;
    END IF;
  END;
  $ef$;

  CREATE OR REPLACE FUNCTION pg_temp._rn_as(p_user uuid, p_org uuid) RETURNS void
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

  CREATE OR REPLACE FUNCTION pg_temp._rn_cmd_expect(p_intent text, p_body jsonb, p_code text) RETURNS void
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

  CREATE OR REPLACE FUNCTION pg_temp._rn_expect_bad(p_sql text) RETURNS void
  LANGUAGE plpgsql AS $bad$
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'expected BAD_REQUEST for %', p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'BAD_REQUEST%' THEN
      RAISE;
    END IF;
  END;
  $bad$;

  CREATE OR REPLACE FUNCTION pg_temp._rn_ledger_rule_cnt(p_org uuid, p_ride text, p_rule text) RETURNS int
  LANGUAGE plpgsql AS $lrc$
  DECLARE v_n int;
  BEGIN
    SELECT count(*)::int INTO v_n
    FROM ledger.entries e
    JOIN toll.charges c ON c.organization_id = p_org AND c.id::text = e.metadata ->> 'charge_id'
    WHERE e.organization_id = p_org AND e.reference_type = 'toll'
      AND c.native_ride_id = p_ride AND e.metadata ->> 'toll_rule' = p_rule;
    RETURN v_n;
  END;
  $lrc$;

  -- 1. Switched off
  v_ride := 'rn-case-01-off';
  SELECT count(*) INTO v_cnt FROM toll.charges WHERE organization_id = v_org_b;
  v_resp := toll_system.native_ride_charge(v_org_b, jsonb_build_object(
    'ride_id', v_ride, 'payment_method', 'card', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
    'ended_at', v_effective, 'estimated_tolls_minor', 1000,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', 'x1', 'plaza_id', 'p1', 'amount_minor', 1000,
      'crossed_at', v_effective, 'paid_by', 'tag'))
  ));
  IF v_resp ->> 'skipped' IS DISTINCT FROM 'tolls_v2_off' THEN
    RAISE EXCEPTION 'case1 ride_charge skip';
  END IF;
  v_resp := toll_system.native_cash_settled(v_org_b, jsonb_build_object(
    'ride_id', v_ride, 'outcome', 'exact', 'cash_received_minor', 1000,
    'estimated_tolls_minor', 1000, 'driver_id', v_driver, 'settled_at', v_effective
  ));
  IF v_resp ->> 'skipped' IS DISTINCT FROM 'tolls_v2_off' THEN
    RAISE EXCEPTION 'case1 cash settled skip';
  END IF;
  IF (SELECT count(*) FROM toll.charges WHERE organization_id = v_org_b) <> v_cnt THEN
    RAISE EXCEPTION 'case1 wrote rows while off';
  END IF;
  PERFORM pg_temp._rn_nightly_ok(v_org_b);

  -- 2. Card estimate = actual, fleet payout off → driver P5
  v_week := v_week0 + 7 * 2;
  v_ev := v_week::timestamptz + time '12:00';
  v_ride := 'rn-case-02-card-eq';
  v_resp := toll_system.native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'payment_method', 'card', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
    'ended_at', v_ev, 'estimated_tolls_minor', 1200,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', 'c2', 'plaza_id', 'plz-a', 'amount_minor', 1200, 'crossed_at', v_ev, 'paid_by', 'tag'))
  ));
  IF coalesce((v_resp ->> 'payback_minor')::bigint, -1) <> 1200 THEN
    RAISE EXCEPTION 'case2 payback_minor';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.paybacks p
    WHERE p.organization_id = v_org_a AND p.reference = 'roam:' || v_ride AND p.received_by = 'driver'
  ) THEN
    RAISE EXCEPTION 'case2 received_by driver';
  END IF;
  IF EXISTS (SELECT 1 FROM toll.payback_unlinked_decisions u
             JOIN toll.paybacks p ON p.organization_id = u.organization_id AND p.id = u.payback_id
             WHERE p.organization_id = v_org_a AND p.reference = 'roam:' || v_ride) THEN
    RAISE EXCEPTION 'case2 unlinked';
  END IF;
  IF (SELECT sum(a.amount_minor) FROM toll.allocations a
      JOIN toll.charges c ON c.id = a.charge_id
      WHERE c.organization_id = v_org_a AND c.native_ride_id = v_ride) IS DISTINCT FROM 1200::bigint THEN
    RAISE EXCEPTION 'case2 links';
  END IF;
  PERFORM pg_temp._rn_nightly_ok(v_org_a);

  -- 3. Card, fleet payout on → fleet P4
  UPDATE public.organizations SET fleet_org_payout_enabled = true WHERE id = v_org_a;
  v_week := v_week0 + 7 * 3;
  v_ev := v_week::timestamptz + time '12:00';
  v_ride := 'rn-case-03-card-fleet';
  v_resp := toll_system.native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'payment_method', 'card', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
    'ended_at', v_ev, 'estimated_tolls_minor', 1100,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', 'c3', 'plaza_id', 'plz-b', 'amount_minor', 1100, 'crossed_at', v_ev, 'paid_by', 'tag'))
  ));
  IF NOT EXISTS (
    SELECT 1 FROM toll.paybacks p WHERE p.organization_id = v_org_a AND p.reference = 'roam:' || v_ride
      AND p.received_by = 'fleet'
  ) THEN
    RAISE EXCEPTION 'case3 fleet payback';
  END IF;
  PERFORM pg_temp._rn_nightly_ok(v_org_a);
  UPDATE public.organizations SET fleet_org_payout_enabled = false WHERE id = v_org_a;

  -- 4. Card estimate > actual
  v_week := v_week0 + 7 * 4;
  v_ev := v_week::timestamptz + time '12:00';
  v_ride := 'rn-case-04-over-est';
  v_resp := toll_system.native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'payment_method', 'card', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
    'ended_at', v_ev, 'estimated_tolls_minor', 1500,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', 'c4', 'plaza_id', 'plz-c', 'amount_minor', 1200, 'crossed_at', v_ev, 'paid_by', 'tag'))
  ));
  SELECT sum(p.amount_minor) INTO v_nat FROM toll.paybacks p
  WHERE p.organization_id = v_org_a AND p.reference = 'roam:' || v_ride;
  IF v_nat <> 1500 THEN RAISE EXCEPTION 'case4 payback 1500 got %', v_nat; END IF;
  SELECT sum(u.amount_minor) INTO v_nat FROM toll.payback_unlinked_decisions u
  JOIN toll.paybacks p ON p.id = u.payback_id AND p.organization_id = v_org_a
  WHERE p.reference = 'roam:' || v_ride AND u.reason = 'roam_estimate_over_actual';
  IF v_nat <> 300 THEN RAISE EXCEPTION 'case4 unlinked 300 got %', v_nat; END IF;
  SELECT sum(a.amount_minor) INTO v_nat FROM toll.allocations a
  JOIN toll.charges c ON c.id = a.charge_id
  WHERE c.organization_id = v_org_a AND c.native_ride_id = v_ride;
  IF v_nat <> 1200 THEN RAISE EXCEPTION 'case4 linked 1200 got %', v_nat; END IF;
  PERFORM pg_temp._rn_nightly_ok(v_org_a);

  -- 5. Card estimate, no crossings
  v_week := v_week0 + 7 * 5;
  v_ev := v_week::timestamptz + time '12:00';
  v_ride := 'rn-case-05-noxing';
  v_resp := toll_system.native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'payment_method', 'card', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
    'ended_at', v_ev, 'estimated_tolls_minor', 1500, 'crossings', '[]'::jsonb
  ));
  IF coalesce((v_resp ->> 'charges')::int, -1) <> 0 THEN RAISE EXCEPTION 'case5 charges'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.paybacks p WHERE p.organization_id = v_org_a AND p.reference = 'roam:' || v_ride
      AND p.amount_minor = 1500
  ) THEN RAISE EXCEPTION 'case5 payback'; END IF;
  SELECT sum(u.amount_minor) INTO v_nat FROM toll.payback_unlinked_decisions u
  JOIN toll.paybacks p ON p.id = u.payback_id WHERE p.reference = 'roam:' || v_ride;
  IF v_nat <> 1500 THEN RAISE EXCEPTION 'case5 all unlinked'; END IF;
  PERFORM pg_temp._rn_nightly_ok(v_org_a);

  -- 6. Card actual > estimate (tag + cash crossings)
  v_week := v_week0 + 7 * 6;
  v_ev := v_week::timestamptz + time '12:00';
  v_ride := 'rn-case-06-both';
  v_resp := toll_system.native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'payment_method', 'card', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
    'ended_at', v_ev, 'estimated_tolls_minor', 1000,
    'crossings', jsonb_build_array(
      jsonb_build_object('id', 't6', 'plaza_id', 'plz-t', 'amount_minor', 700, 'crossed_at', v_ev, 'paid_by', 'tag'),
      jsonb_build_object('id', 'c6', 'plaza_id', 'plz-c', 'amount_minor', 400, 'crossed_at', v_ev + interval '5 min', 'paid_by', 'cash')
    )
  ));
  IF coalesce((v_resp ->> 'payback_minor')::bigint, -1) <> 1100 THEN
    RAISE EXCEPTION 'case6 payback actual';
  END IF;
  IF pg_temp._rn_ledger_rule_cnt(v_org_a, v_ride, 'P2_tag_crossing') <> 1
    OR pg_temp._rn_ledger_rule_cnt(v_org_a, v_ride, 'P3_cash_verified') <> 1 THEN
    RAISE EXCEPTION 'case6 P2/P3 counts';
  END IF;
  PERFORM pg_temp._rn_nightly_ok(v_org_a);

  -- 7. Cash open week exact
  v_week := v_week0 + 7 * 7;
  v_ev := v_week::timestamptz + time '12:00';
  v_ride := 'rn-case-07-cash-ex';
  v_resp := toll_system.native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'payment_method', 'cash', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
    'ended_at', v_ev, 'estimated_tolls_minor', 1000,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', 'x7', 'plaza_id', 'plz', 'amount_minor', 1000, 'crossed_at', v_ev, 'paid_by', 'cash'))
  ));
  IF coalesce(v_resp ->> 'awaiting_cash', 'false') <> 'true' THEN RAISE EXCEPTION 'case7 awaiting'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.charges c WHERE c.organization_id = v_org_a AND c.native_ride_id = v_ride AND c.awaiting_cash
  ) THEN RAISE EXCEPTION 'case7 charge awaiting'; END IF;
  v_resp := toll_system.native_cash_settled(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'outcome', 'exact', 'cash_received_minor', 1000,
    'estimated_tolls_minor', 1000, 'driver_id', v_driver, 'settled_at', v_ev + interval '1 hour'
  ));
  IF v_resp ->> 'branch' <> 'open' THEN RAISE EXCEPTION 'case7 branch'; END IF;
  IF EXISTS (
    SELECT 1 FROM toll.charges c WHERE c.organization_id = v_org_a AND c.native_ride_id = v_ride AND c.awaiting_cash
  ) THEN RAISE EXCEPTION 'case7 awaiting cleared'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.paybacks p WHERE p.organization_id = v_org_a AND p.reference = 'roam:' || v_ride
      AND p.amount_minor = 1000
  ) THEN RAISE EXCEPTION 'case7 payback'; END IF;
  PERFORM pg_temp._rn_nightly_ok(v_org_a);

  -- 8. Cash underpay
  v_week := v_week0 + 7 * 8;
  v_ev := v_week::timestamptz + time '12:00';
  v_ride := 'rn-case-08-under';
  PERFORM toll_system.native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'payment_method', 'cash', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
    'ended_at', v_ev, 'estimated_tolls_minor', 1000,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', 'x8', 'plaza_id', 'plz', 'amount_minor', 1000, 'crossed_at', v_ev, 'paid_by', 'cash'))
  ));
  v_resp := toll_system.native_cash_settled(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'outcome', 'underpay', 'cash_received_minor', 600,
    'estimated_tolls_minor', 1000, 'driver_id', v_driver, 'settled_at', v_ev + interval '1 hour'
  ));
  SELECT sum(p.amount_minor) INTO v_nat FROM toll.paybacks p WHERE p.reference = 'roam:' || v_ride;
  IF v_nat <> 600 THEN RAISE EXCEPTION 'case8 payback 600 got %', v_nat; END IF;
  SELECT sum(a.amount_minor) INTO v_nat FROM toll.allocations a
  JOIN toll.charges c ON c.id = a.charge_id WHERE c.native_ride_id = v_ride AND a.reason = 'rider_arrears';
  IF v_nat <> 400 THEN RAISE EXCEPTION 'case8 fleet arrears 400 got %', v_nat; END IF;
  PERFORM pg_temp._rn_nightly_ok(v_org_a);

  -- 9. Cash unpaid
  v_week := v_week0 + 7 * 9;
  v_ev := v_week::timestamptz + time '12:00';
  v_ride := 'rn-case-09-unpaid';
  PERFORM toll_system.native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'payment_method', 'cash', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
    'ended_at', v_ev, 'estimated_tolls_minor', 800,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', 'x9', 'plaza_id', 'plz', 'amount_minor', 800, 'crossed_at', v_ev, 'paid_by', 'cash'))
  ));
  v_resp := toll_system.native_cash_settled(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'outcome', 'unpaid', 'cash_received_minor', 0,
    'estimated_tolls_minor', 800, 'driver_id', v_driver, 'settled_at', v_ev + interval '1 hour'
  ));
  IF EXISTS (SELECT 1 FROM toll.paybacks p WHERE p.reference = 'roam:' || v_ride) THEN
    RAISE EXCEPTION 'case9 payback';
  END IF;
  SELECT sum(a.amount_minor) INTO v_nat FROM toll.allocations a
  JOIN toll.charges c ON c.id = a.charge_id WHERE c.native_ride_id = v_ride AND a.reason = 'rider_arrears';
  IF v_nat <> 800 THEN RAISE EXCEPTION 'case9 fleet 800 got %', v_nat; END IF;
  PERFORM pg_temp._rn_nightly_ok(v_org_a);

  -- 10. Cash sealed week → carried cash_recovered + P20
  v_week := v_week0 + 7 * 10;
  v_ev := v_week::timestamptz + time '12:00';
  v_ride := 'rn-case-10-sealed';
  PERFORM toll_system.native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'payment_method', 'cash', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
    'ended_at', v_ev, 'estimated_tolls_minor', 900,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', 'x10', 'plaza_id', 'plz', 'amount_minor', 900, 'crossed_at', v_ev, 'paid_by', 'cash'))
  ));
  PERFORM pg_temp._rn_as(v_owner, v_org_a);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-rn-seal-10', 'week_key', v_week, 'expected_week_version', 0
  ));
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM toll.allocations al JOIN toll.charges c ON c.id = al.charge_id
    WHERE c.native_ride_id = v_ride AND al.provisional AND al.reason = 'awaiting_cash_at_seal'
  ) THEN RAISE EXCEPTION 'case10 provisional'; END IF;
  SELECT source_hash INTO v_hash FROM ledger.week_statements
  WHERE organization_id = v_org_a AND kind = 'toll_week' AND driver_id = '*' AND week_key = v_week
  ORDER BY version DESC LIMIT 1;
  v_resp := toll_system.native_cash_settled(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'outcome', 'exact', 'cash_received_minor', 900,
    'estimated_tolls_minor', 900, 'driver_id', v_driver, 'settled_at', v_ev + interval '2 days'
  ));
  IF v_resp ->> 'branch' <> 'sealed' THEN RAISE EXCEPTION 'case10 branch sealed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.carried_facts f
    JOIN toll.charges c ON c.id = f.original_id
    WHERE c.native_ride_id = v_ride AND f.kind = 'cash_recovered'
      AND f.to_week = ledger.jamaica_week_start(now())
      AND f.amount_minor = 900
  ) THEN RAISE EXCEPTION 'case10 carried_fact'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ledger.entries e
    JOIN toll.carried_facts f ON f.id::text = e.metadata ->> 'carried_fact_id'
    WHERE e.metadata ->> 'toll_rule' = 'P20_cash_recovered'
  ) THEN RAISE EXCEPTION 'case10 P20'; END IF;
  IF (SELECT source_hash FROM ledger.week_statements
      WHERE organization_id = v_org_a AND kind = 'toll_week' AND driver_id = '*' AND week_key = v_week
      ORDER BY version DESC LIMIT 1) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'case10 sealed hash moved';
  END IF;
  PERFORM pg_temp._rn_expect_fail(v_org_a, 4, 'sealed_week:' || v_week::text, true);
  IF EXISTS (
    SELECT 1 FROM toll.charges c WHERE c.native_ride_id = v_ride AND NOT c.awaiting_cash
  ) THEN RAISE EXCEPTION 'case10 sealed charge awaiting_cash cleared'; END IF;
  PERFORM pg_temp._rn_nightly_ok(v_org_a);

  -- 11. Cash reopened week
  v_week := v_week0 + 7 * 11;
  v_ev := v_week::timestamptz + time '12:00';
  v_ride := 'rn-case-11-reopen';
  PERFORM toll_system.native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'payment_method', 'cash', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
    'ended_at', v_ev, 'estimated_tolls_minor', 750,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', 'x11', 'plaza_id', 'plz', 'amount_minor', 750, 'crossed_at', v_ev, 'paid_by', 'cash'))
  ));
  PERFORM pg_temp._rn_as(v_owner, v_org_a);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-rn-seal-11', 'week_key', v_week, 'expected_week_version', 0
  ));
  PERFORM public.toll_v2_command('reopen_week', jsonb_build_object(
    'command_id', 'toll-rn-reopen-11', 'week_key', v_week, 'expected_week_version', 1, 'reason', 'cash arrived'
  ));
  RESET ROLE;
  v_resp := toll_system.native_cash_settled(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'outcome', 'exact', 'cash_received_minor', 750,
    'estimated_tolls_minor', 750, 'driver_id', v_driver, 'settled_at', v_ev + interval '2 days'
  ));
  IF v_resp ->> 'branch' <> 'reopened' THEN RAISE EXCEPTION 'case11 branch got %', v_resp ->> 'branch'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.allocations al JOIN toll.charges c ON c.id = al.charge_id
    WHERE c.native_ride_id = v_ride AND al.provisional AND al.reversed_by IS NOT NULL
  ) THEN RAISE EXCEPTION 'case11 provisional reversed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ledger.entries e
    JOIN toll.charges c ON c.id::text = e.metadata ->> 'charge_id'
    WHERE c.native_ride_id = v_ride AND e.metadata ->> 'toll_rule' = 'P8_allocate_fleet'
      AND (e.metadata ->> 'reverse')::boolean
  ) THEN RAISE EXCEPTION 'case11 reversing P8'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.paybacks p WHERE p.reference = 'roam:' || v_ride AND p.amount_minor = 750
  ) THEN RAISE EXCEPTION 'case11 payback'; END IF;
  IF EXISTS (
    SELECT 1 FROM toll.charges c WHERE c.native_ride_id = v_ride AND c.awaiting_cash
  ) THEN RAISE EXCEPTION 'case11 awaiting cleared'; END IF;
  PERFORM pg_temp._rn_nightly_ok(v_org_a);

  -- 12. Replay
  v_week := v_week0 + 7 * 12;
  v_ev := v_week::timestamptz + time '12:00';
  v_ride := 'rn-case-12-replay';
  PERFORM toll_system.native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'payment_method', 'card', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
    'ended_at', v_ev, 'estimated_tolls_minor', 500,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', 'x12', 'plaza_id', 'plz', 'amount_minor', 500, 'crossed_at', v_ev, 'paid_by', 'tag'))
  ));
  SELECT count(*) INTO v_cnt FROM toll.charges WHERE organization_id = v_org_a AND native_ride_id = v_ride;
  v_open := (SELECT count(*) FROM ledger.entries e
    JOIN toll.charges c ON c.id::text = e.metadata ->> 'charge_id'
    WHERE c.native_ride_id = v_ride);
  v_resp := toll_system.native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', v_ride, 'payment_method', 'card', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
    'ended_at', v_ev, 'estimated_tolls_minor', 500,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', 'x12', 'plaza_id', 'plz', 'amount_minor', 500, 'crossed_at', v_ev, 'paid_by', 'tag'))
  ));
  IF coalesce(v_resp ->> 'replay', 'false') <> 'true' THEN RAISE EXCEPTION 'case12 replay ride'; END IF;
  IF (SELECT count(*) FROM toll.charges WHERE native_ride_id = v_ride) <> v_cnt THEN
    RAISE EXCEPTION 'case12 extra charges';
  END IF;
  v_resp := toll_system.native_cash_settled(v_org_a, jsonb_build_object(
    'ride_id', 'rn-case-07-cash-ex', 'outcome', 'exact', 'cash_received_minor', 1000,
    'estimated_tolls_minor', 1000, 'driver_id', v_driver, 'settled_at', v_ev
  ));
  IF coalesce(v_resp ->> 'replay', 'false') <> 'true' THEN RAISE EXCEPTION 'case12 replay cash'; END IF;
  PERFORM pg_temp._rn_nightly_ok(v_org_a);

  -- 13. Bad input
  PERFORM pg_temp._rn_expect_bad(format(
    'SELECT toll_system.native_ride_charge(%L::uuid, %L::jsonb)',
    v_org_a, '{"payment_method":"card"}'::text
  ));
  PERFORM pg_temp._rn_expect_bad(format(
    'SELECT toll_system.native_ride_charge(%L::uuid, %L::jsonb)',
    v_org_a, '{"ride_id":"bad1","payment_method":"bitcoin"}'::text
  ));
  PERFORM pg_temp._rn_expect_bad(format(
    'SELECT toll_system.native_ride_charge(%L::uuid, %L::jsonb)',
    v_org_a, jsonb_build_object(
      'ride_id', 'bad2', 'payment_method', 'card', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
      'ended_at', v_ev, 'estimated_tolls_minor', 100,
      'crossings', jsonb_build_array(jsonb_build_object(
        'id', 'b', 'plaza_id', 'p', 'amount_minor', 0, 'crossed_at', v_ev, 'paid_by', 'tag'))
    )::text
  ));
  PERFORM pg_temp._rn_expect_bad(format(
    'SELECT toll_system.native_ride_charge(%L::uuid, %L::jsonb)',
    v_org_a, jsonb_build_object(
      'ride_id', 'bad3', 'payment_method', 'card', 'driver_id', v_driver, 'vehicle_id', v_vehicle,
      'ended_at', v_ev, 'estimated_tolls_minor', 100,
      'crossings', jsonb_build_array(jsonb_build_object(
        'id', 'b', 'plaza_id', 'p', 'amount_minor', 100, 'crossed_at', v_ev, 'paid_by', 'card'))
    )::text
  ));
  PERFORM pg_temp._rn_expect_bad(format(
    'SELECT toll_system.native_cash_settled(%L::uuid, %L::jsonb)',
    v_org_a, '{"ride_id":"bad4","outcome":"maybe","cash_received_minor":0,"estimated_tolls_minor":0}'::text
  ));
  PERFORM pg_temp._rn_nightly_ok(v_org_a);

  -- 14. WEEK_NOT_ENDED (compute week as postgres; JWT role cannot call ledger.jamaica_week_start)
  v_week := ledger.jamaica_week_start(now());
  PERFORM pg_temp._rn_as(v_owner, v_org_a);
  PERFORM pg_temp._rn_cmd_expect('seal_week', jsonb_build_object(
    'command_id', 'toll-rn-not-ended',
    'week_key', v_week,
    'expected_week_version', 0
  ), 'WEEK_NOT_ENDED');
  RESET ROLE;
  PERFORM pg_temp._rn_nightly_ok(v_org_a);

  -- 15. Grants
  IF has_function_privilege('anon', v_fn_ride, 'EXECUTE')
    OR has_function_privilege('authenticated', v_fn_ride, 'EXECUTE')
    OR has_function_privilege('anon', v_fn_cash, 'EXECUTE')
    OR has_function_privilege('authenticated', v_fn_cash, 'EXECUTE') THEN
    RAISE EXCEPTION 'case15 public wrappers must be service_role only';
  END IF;
  IF NOT has_function_privilege('service_role', v_fn_ride, 'EXECUTE')
    OR NOT has_function_privilege('service_role', v_fn_cash, 'EXECUTE') THEN
    RAISE EXCEPTION 'case15 service_role wrappers';
  END IF;
  IF has_function_privilege('authenticated', v_fn_sys_ride, 'EXECUTE')
    OR has_function_privilege('authenticated', v_fn_sys_cash, 'EXECUTE') THEN
    RAISE EXCEPTION 'case15 authenticated native';
  END IF;

  RAISE NOTICE 'toll_v2_roam_native: all cases passed';
END;
$$;

ROLLBACK;

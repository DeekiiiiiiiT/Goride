-- Toll v2 P1-R5: company_metrics, toll_v2_metrics(), Roam gap nightly alerts (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT u.id, u.email
FROM (VALUES
  ('c0111111-1111-4111-8111-111111111111'::uuid, 'toll-mt-owner@example.com'),
  ('c0211111-1111-4111-8111-111111111112'::uuid, 'toll-mt-mgr@example.com'),
  ('c0311111-1111-4111-8111-111111111113'::uuid, 'toll-mt-acct@example.com'),
  ('c0411111-1111-4111-8111-111111111114'::uuid, 'toll-mt-viewer@example.com'),
  ('c0511111-1111-4111-8111-111111111115'::uuid, 'toll-mt-driver@example.com'),
  ('c0611111-1111-4111-8111-111111111116'::uuid, 'toll-mt-rider@example.com'),
  ('c0711111-1111-4111-8111-111111111117'::uuid, 'toll-mt-owner-b@example.com')
) AS u(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

DO $$
DECLARE
  v_owner       uuid := 'c0111111-1111-4111-8111-111111111111';
  v_mgr         uuid := 'c0211111-1111-4111-8111-111111111112';
  v_acct        uuid := 'c0311111-1111-4111-8111-111111111113';
  v_viewer      uuid := 'c0411111-1111-4111-8111-111111111114';
  v_driver      uuid := 'c0511111-1111-4111-8111-111111111115';
  v_rider       uuid := 'c0611111-1111-4111-8111-111111111116';
  v_owner_b     uuid := 'c0711111-1111-4111-8111-111111111117';
  v_org_a       uuid := 'c1111111-1111-4111-8111-111111111101';
  v_org_b       uuid := 'c2222222-2222-4222-8222-222222222202';
  v_week        date;
  v_ev          timestamptz := now();
  v_decision_id uuid;
  v_switch_at   timestamptz := now() - interval '7 days';

  v_amt_pend1   bigint := 600;
  v_amt_pend2   bigint := 400;
  v_amt_unver   bigint := 700;
  v_amt_await   bigint := 1200;
  v_amt_pb      bigint := 5000;
  v_amt_pb_alloc bigint := 2000;
  v_amt_after   bigint := 500;
  v_at_pend_old timestamptz := now() - interval '5 days';
  v_at_pend_new timestamptz := now() - interval '2 days';

  v_ch_p1       uuid;
  v_ch_p2       uuid;
  v_ch_unver    uuid;
  v_ch_await    uuid;
  v_ch_dup_a    uuid;
  v_ch_dup_b    uuid;
  v_ch_after    uuid;
  v_ch_pb_tgt   uuid;
  v_pb_open     uuid;
  v_nightly_run uuid;
  v_nightly_at  timestamptz;

  v_j           jsonb;
  v_sys         jsonb;
  v_rec         bigint;
  v_cnt         int;
  v_msg         text;
  v_role_mgr    uuid;
  v_role_acct   uuid;
  v_role_view   uuid;
  v_fn_pub      regprocedure := 'public.toll_v2_metrics()'::regprocedure;

  v_ride_gap    uuid := 'c3111111-1111-4111-8111-111111111301';
  v_xing_gap    uuid := 'c3211111-1111-4111-8111-111111111302';
  v_ride_fresh  uuid := 'c3311111-1111-4111-8111-111111111303';
  v_xing_fresh  uuid := 'c3411111-1111-4111-8111-111111111304';
  v_ride_pre    uuid := 'c3511111-1111-4111-8111-111111111305';
  v_xing_pre    uuid := 'c3611111-1111-4111-8111-111111111306';
  v_ride_b      uuid := 'c3711111-1111-4111-8111-111111111307';
  v_xing_b      uuid := 'c3811111-1111-4111-8111-111111111308';
  v_ride_ok     uuid := 'c3911111-1111-4111-8111-111111111309';
  v_xing_ok     uuid := 'c3a11111-1111-4111-8111-111111111310';
  v_ride_ind    uuid := 'c3b11111-1111-4111-8111-111111111311';
  v_xing_ind    uuid := 'c3c11111-1111-4111-8111-111111111312';
  v_ch_roam     uuid;
BEGIN
  v_week := ledger.jamaica_week_start(v_ev);

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES
    (v_org_a, v_owner, 'Toll Metrics Org A', 'toll-mt-a', 'fleet', 'active'),
    (v_org_b, v_owner_b, 'Toll Metrics Org B', 'toll-mt-b', 'fleet', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO toll.switch_state (organization_id, tolls_v2, changed_at)
  VALUES (v_org_a, true, v_switch_at), (v_org_b, false, v_switch_at)
  ON CONFLICT (organization_id) DO UPDATE
    SET tolls_v2 = EXCLUDED.tolls_v2, changed_at = EXCLUDED.changed_at;

  PERFORM toll_system.ensure_accounts(v_org_a);
  PERFORM toll_system.ensure_accounts(v_org_b);

  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org_a, 'toll-mt-fixture', 'fixture', 'user')
  RETURNING id INTO v_decision_id;

  INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system)
  VALUES
    ('fleet_manager', 'Fleet Manager', 'toll mt test', 50, 'fleet', true),
    ('fleet_accountant', 'Fleet Accountant', 'toll mt test', 40, 'fleet', true),
    ('fleet_viewer', 'Fleet Viewer', 'toll mt test', 30, 'fleet', true)
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_role_mgr FROM platform.roles WHERE name = 'fleet_manager';
  SELECT id INTO v_role_acct FROM platform.roles WHERE name = 'fleet_accountant';
  SELECT id INTO v_role_view FROM platform.roles WHERE name = 'fleet_viewer';

  INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, status, expires_at)
  VALUES
    (v_mgr, v_role_mgr, 'organization', v_org_a, 'active', NULL),
    (v_acct, v_role_acct, 'organization', v_org_a, 'active', NULL),
    (v_viewer, v_role_view, 'organization', v_org_a, 'active', NULL);

  CREATE OR REPLACE FUNCTION pg_temp._mt_as(p_user uuid, p_org uuid) RETURNS void
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

  CREATE OR REPLACE FUNCTION pg_temp._mt_expect(p_code text) RETURNS void
  LANGUAGE plpgsql AS $ex$
  DECLARE v_msg text;
  BEGIN
    PERFORM public.toll_v2_metrics();
    RAISE EXCEPTION 'test expect % but metrics succeeded', p_code;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 'test expect code % got %', p_code, v_msg;
    END IF;
  END;
  $ex$;

  -- ══ 1. Metrics fixture (hand totals in comments) ══
  -- pending: 600 + 400 unallocated; unverified 700; awaiting_cash 1×1200; payback open 3000;
  -- afterSeal 1; reviewPairsOpen 1; openAlerts page 1 watch 2; lastNightly failed 1 of 2 checks.

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amt_pend1, 'tag', 'manual', 'toll-mt-p1', 'verified', 'driver-mt-1'
  ) RETURNING id INTO v_ch_p1;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_amt_pend1, v_ev, 'toll-mt-p2-p1', 1,
    jsonb_build_object('charge_id', v_ch_p1::text));
  UPDATE toll.charges SET created_at = v_at_pend_old WHERE id = v_ch_p1;

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amt_pend2, 'tag', 'manual', 'toll-mt-p2', 'verified', 'driver-mt-1'
  ) RETURNING id INTO v_ch_p2;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_amt_pend2, v_ev, 'toll-mt-p2-p2', 2,
    jsonb_build_object('charge_id', v_ch_p2::text));
  UPDATE toll.charges SET created_at = v_at_pend_new WHERE id = v_ch_p2;

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amt_unver, 'tag', 'manual', 'toll-mt-unver', 'unverified', 'driver-mt-1'
  ) RETURNING id INTO v_ch_unver;

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, awaiting_cash, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amt_await, 'cash', 'driver_cash', 'toll-mt-await', 'verified', true,
    'driver-mt-1'
  ) RETURNING id INTO v_ch_await;
  PERFORM toll_system.post(v_org_a, 'P3_cash_verified', v_amt_await, v_ev, 'toll-mt-p3-await', 3,
    jsonb_build_object('charge_id', v_ch_await::text));

  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-mt-pb-open', v_week, v_week, v_amt_pb, 'fleet'
  ) RETURNING id INTO v_pb_open;
  PERFORM toll_system.post(v_org_a, 'P4_payback_fleet', v_amt_pb, v_ev, 'toll-mt-p4-pb', 4,
    jsonb_build_object('payback_id', v_pb_open::text));
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amt_pb_alloc, 'tag', 'manual', 'toll-mt-pb-tgt', 'verified', 'driver-mt-1'
  ) RETURNING id INTO v_ch_pb_tgt;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_amt_pb_alloc, v_ev, 'toll-mt-p2-pbt', 5,
    jsonb_build_object('charge_id', v_ch_pb_tgt::text));
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (v_org_a, v_ch_pb_tgt, 'platform', v_amt_pb_alloc, v_pb_open, 'mt-part', v_decision_id);
  PERFORM toll_system.post(v_org_a, 'P6_allocate_platform', v_amt_pb_alloc, v_ev, 'toll-mt-p6-pb', 6,
    jsonb_build_object('charge_id', v_ch_pb_tgt::text, 'payback_id', v_pb_open::text));

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, after_seal, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amt_after, 'tag', 'manual', 'toll-mt-after', 'verified', true,
    'driver-mt-1'
  ) RETURNING id INTO v_ch_after;

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', 900, 'tag', 'manual', 'toll-mt-dup-a', 'verified', 'driver-mt-1'
  ) RETURNING id INTO v_ch_dup_a;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', 900, v_ev, 'toll-mt-p2-da', 7,
    jsonb_build_object('charge_id', v_ch_dup_a::text));
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, reason, decision_id
  ) VALUES (v_org_a, v_ch_dup_a, 'fleet', 900, 'mt-dup-a', v_decision_id);
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', 900, v_ev, 'toll-mt-p8-da', 8,
    jsonb_build_object('charge_id', v_ch_dup_a::text));

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', 950, 'tag', 'manual', 'toll-mt-dup-b', 'verified', 'driver-mt-1'
  ) RETURNING id INTO v_ch_dup_b;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', 950, v_ev, 'toll-mt-p2-db', 9,
    jsonb_build_object('charge_id', v_ch_dup_b::text));
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, reason, decision_id
  ) VALUES (v_org_a, v_ch_dup_b, 'fleet', 950, 'mt-dup-b', v_decision_id);
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', 950, v_ev, 'toll-mt-p8-db', 10,
    jsonb_build_object('charge_id', v_ch_dup_b::text));

  IF v_ch_dup_a < v_ch_dup_b THEN
    INSERT INTO toll.duplicate_reviews (organization_id, charge_a, charge_b, status)
    VALUES (v_org_a, v_ch_dup_a, v_ch_dup_b, 'open');
  ELSE
    INSERT INTO toll.duplicate_reviews (organization_id, charge_a, charge_b, status)
    VALUES (v_org_a, v_ch_dup_b, v_ch_dup_a, 'open');
  END IF;

  INSERT INTO toll.alerts (organization_id, kind, severity, dedupe_key, title, detail)
  VALUES
    (v_org_a, 'aging', 'page', 'toll-mt-page', 'page alert', '{}'::jsonb),
    (v_org_a, 'aging', 'watch', 'toll-mt-watch-1', 'watch 1', '{}'::jsonb),
    (v_org_a, 'aging', 'watch', 'toll-mt-watch-2', 'watch 2', '{}'::jsonb);

  v_nightly_run := gen_random_uuid();
  v_nightly_at := now() - interval '1 hour';
  INSERT INTO toll.nightly_results (organization_id, run_id, check_no, name, ok, detail, created_at)
  VALUES
    (v_org_a, v_nightly_run, 1, 'toll-mt-nightly-ok', true, '{}'::jsonb, v_nightly_at),
    (v_org_a, v_nightly_run, 2, 'toll-mt-nightly-fail', false, '{"test":true}'::jsonb, v_nightly_at + interval '1 second');

  v_rec := toll_system.natural_balance(v_org_a, 'toll:receivable_platform');
  v_sys := toll_system.company_metrics(v_org_a);

  IF (v_sys ->> 'tollsV2')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 's1 tollsV2';
  END IF;
  IF (v_sys -> 'pendingCharges' ->> 'count')::int <> 2 THEN
    RAISE EXCEPTION 's1 pending count got %', v_sys -> 'pendingCharges' ->> 'count';
  END IF;
  IF (v_sys -> 'pendingCharges' ->> 'amountMinor')::bigint <> v_amt_pend1 + v_amt_pend2 THEN
    RAISE EXCEPTION 's1 pending amount';
  END IF;
  IF (v_sys -> 'pendingCharges' ->> 'oldestAt')::timestamptz IS DISTINCT FROM v_at_pend_old THEN
    RAISE EXCEPTION 's1 pending oldestAt got % want %',
      v_sys -> 'pendingCharges' ->> 'oldestAt', v_at_pend_old;
  END IF;
  IF (v_sys -> 'unverifiedReceipts' ->> 'count')::int <> 1
    OR (v_sys -> 'unverifiedReceipts' ->> 'amountMinor')::bigint <> v_amt_unver THEN
    RAISE EXCEPTION 's1 unverified';
  END IF;
  IF (v_sys -> 'awaitingCash' ->> 'count')::int <> 1 THEN
    RAISE EXCEPTION 's1 awaitingCash count';
  END IF;
  IF (v_sys -> 'unallocatedPaybacks' ->> 'count')::int <> 1
    OR (v_sys -> 'unallocatedPaybacks' ->> 'amountMinor')::bigint <> v_amt_pb - v_amt_pb_alloc THEN
    RAISE EXCEPTION 's1 unallocatedPaybacks';
  END IF;
  IF (v_sys -> 'afterSeal' ->> 'count')::int <> 1 THEN
    RAISE EXCEPTION 's1 afterSeal count';
  END IF;
  IF (v_sys ->> 'reviewPairsOpen')::int <> 1 THEN
    RAISE EXCEPTION 's1 reviewPairsOpen';
  END IF;
  IF (v_sys ->> 'receivablePlatformMinor')::bigint IS DISTINCT FROM v_rec THEN
    RAISE EXCEPTION 's1 receivablePlatformMinor';
  END IF;
  IF (v_sys -> 'openAlerts' ->> 'page')::int <> 1
    OR (v_sys -> 'openAlerts' ->> 'watch')::int <> 2 THEN
    RAISE EXCEPTION 's1 openAlerts';
  END IF;
  IF (v_sys -> 'lastNightly' ->> 'failed')::int <> 1 THEN
    RAISE EXCEPTION 's1 lastNightly.failed';
  END IF;
  IF (v_sys -> 'lastNightly' ->> 'at')::timestamptz IS DISTINCT FROM v_nightly_at + interval '1 second' THEN
    RAISE EXCEPTION 's1 lastNightly.at got % want %',
      v_sys -> 'lastNightly' ->> 'at', v_nightly_at + interval '1 second';
  END IF;

  PERFORM pg_temp._mt_as(v_owner, v_org_a);
  v_j := public.toll_v2_metrics();
  RESET ROLE;
  IF v_j IS DISTINCT FROM v_sys THEN
    RAISE EXCEPTION 's1 public toll_v2_metrics differs from company_metrics';
  END IF;

  -- ══ 2. Who may read + grants ══
  PERFORM pg_temp._mt_as(v_owner, v_org_a);
  PERFORM public.toll_v2_metrics();
  RESET ROLE;
  PERFORM pg_temp._mt_as(v_mgr, v_org_a);
  PERFORM public.toll_v2_metrics();
  RESET ROLE;
  PERFORM pg_temp._mt_as(v_acct, v_org_a);
  PERFORM public.toll_v2_metrics();
  RESET ROLE;

  PERFORM pg_temp._mt_as(v_viewer, v_org_a);
  PERFORM pg_temp._mt_expect('FORBIDDEN');
  RESET ROLE;

  PERFORM pg_temp._mt_as(v_driver, v_org_a);
  PERFORM pg_temp._mt_expect('FORBIDDEN');
  RESET ROLE;

  PERFORM pg_temp._mt_as(v_owner_b, v_org_b);
  v_j := public.toll_v2_metrics();
  IF (v_j ->> 'tollsV2')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 's2 company B tollsV2';
  END IF;
  IF (v_j -> 'pendingCharges' ->> 'count')::int <> 0 THEN
    RAISE EXCEPTION 's2 company B must not see A pending';
  END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{"sub":"' || v_owner::text || '","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._mt_expect('NO_COMPANY');
  RESET ROLE;

  IF has_function_privilege('anon', v_fn_pub, 'EXECUTE')
    OR has_function_privilege('service_role', v_fn_pub, 'EXECUTE') THEN
    RAISE EXCEPTION 's2 anon/service_role must not EXECUTE toll_v2_metrics';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn_pub, 'EXECUTE') THEN
    RAISE EXCEPTION 's2 authenticated must EXECUTE toll_v2_metrics';
  END IF;

  -- ══ 3. Roam gap alerts (nightly_run → aging_alerts → roam_gap_alerts) ══
  INSERT INTO rides.ride_requests (
    id, rider_user_id, organization_id, status,
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, fare_estimate_minor,
    payment_method, fare_final_minor, completed_at
  ) VALUES (
    v_ride_gap, v_rider, v_org_a, 'completed',
    18.0, -76.8, 18.1, -76.7, 5000,
    'card', 5000, now() - interval '3 hours'
  );
  INSERT INTO rides.ride_toll_crossings (id, ride_request_id, toll_plaza_id, toll_amount_minor, crossed_at)
  VALUES (v_xing_gap, v_ride_gap, 'plz-gap', 1100, now() - interval '3 hours');

  INSERT INTO rides.ride_requests (
    id, rider_user_id, organization_id, status,
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, fare_estimate_minor,
    payment_method, fare_final_minor, completed_at
  ) VALUES (
    v_ride_fresh, v_rider, v_org_a, 'completed',
    18.0, -76.8, 18.1, -76.7, 5000,
    'card', 5000, now() - interval '30 minutes'
  );
  INSERT INTO rides.ride_toll_crossings (id, ride_request_id, toll_plaza_id, toll_amount_minor, crossed_at)
  VALUES (v_xing_fresh, v_ride_fresh, 'plz-fresh', 900, now() - interval '30 minutes');

  INSERT INTO rides.ride_requests (
    id, rider_user_id, organization_id, status,
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, fare_estimate_minor,
    payment_method, fare_final_minor, completed_at
  ) VALUES (
    v_ride_pre, v_rider, v_org_a, 'completed',
    18.0, -76.8, 18.1, -76.7, 5000,
    'card', 5000, v_switch_at - interval '2 days'
  );
  INSERT INTO rides.ride_toll_crossings (id, ride_request_id, toll_plaza_id, toll_amount_minor, crossed_at)
  VALUES (v_xing_pre, v_ride_pre, 'plz-pre', 800, v_switch_at - interval '2 days');

  INSERT INTO rides.ride_requests (
    id, rider_user_id, organization_id, status,
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, fare_estimate_minor,
    payment_method, fare_final_minor, completed_at
  ) VALUES (
    v_ride_b, v_rider, v_org_b, 'completed',
    18.0, -76.8, 18.1, -76.7, 5000,
    'card', 5000, now() - interval '3 hours'
  );
  INSERT INTO rides.ride_toll_crossings (id, ride_request_id, toll_plaza_id, toll_amount_minor, crossed_at)
  VALUES (v_xing_b, v_ride_b, 'plz-b', 700, now() - interval '3 hours');

  INSERT INTO rides.ride_requests (
    id, rider_user_id, organization_id, status,
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, fare_estimate_minor,
    payment_method, fare_final_minor, completed_at
  ) VALUES (
    v_ride_ok, v_rider, v_org_a, 'completed',
    18.0, -76.8, 18.1, -76.7, 5000,
    'card', 5000, now() - interval '3 hours'
  );
  INSERT INTO rides.ride_toll_crossings (id, ride_request_id, toll_plaza_id, toll_amount_minor, crossed_at)
  VALUES (v_xing_ok, v_ride_ok, 'plz-ok', 600, now() - interval '3 hours');
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, now() - interval '3 hours', v_week, 'exact', 600,
    'tag', 'roam_ride', 'roam_crossing:' || v_xing_ok::text, 'verified', 'driver-mt-1'
  ) RETURNING id INTO v_ch_roam;

  INSERT INTO rides.ride_requests (
    id, rider_user_id, organization_id, attribution_mode, status,
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, fare_estimate_minor,
    payment_method, fare_final_minor, completed_at
  ) VALUES (
    v_ride_ind, v_rider, v_org_a, 'independent', 'completed',
    18.0, -76.8, 18.1, -76.7, 5000,
    'card', 5000, now() - interval '3 hours'
  );
  INSERT INTO rides.ride_toll_crossings (id, ride_request_id, toll_plaza_id, toll_amount_minor, crossed_at)
  VALUES (v_xing_ind, v_ride_ind, 'plz-ind', 550, now() - interval '3 hours');

  UPDATE rides.ride_requests SET attribution_mode = 'fleet'
  WHERE id IN (v_ride_gap, v_ride_fresh, v_ride_pre, v_ride_b, v_ride_ok);
  PERFORM toll_system.nightly_run();

  IF NOT EXISTS (
    SELECT 1 FROM toll.alerts
    WHERE organization_id = v_org_a AND dedupe_key = 'roam_gap:' || v_ride_gap::text AND resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 's3 expected roam_gap alert for gap ride';
  END IF;

  IF EXISTS (
    SELECT 1 FROM toll.alerts
    WHERE organization_id = v_org_a AND dedupe_key = 'roam_gap:' || v_ride_fresh::text AND resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 's3 too-fresh ride must not alert';
  END IF;
  IF EXISTS (
    SELECT 1 FROM toll.alerts
    WHERE organization_id = v_org_a AND dedupe_key = 'roam_gap:' || v_ride_pre::text AND resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 's3 pre-switch ride must not alert';
  END IF;
  IF EXISTS (
    SELECT 1 FROM toll.alerts
    WHERE organization_id = v_org_b AND dedupe_key = 'roam_gap:' || v_ride_b::text AND resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 's3 v2-off company must not alert';
  END IF;
  IF EXISTS (
    SELECT 1 FROM toll.alerts
    WHERE organization_id = v_org_a AND dedupe_key = 'roam_gap:' || v_ride_ok::text AND resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 's3 charged crossing must not alert';
  END IF;
  IF EXISTS (
    SELECT 1 FROM toll.alerts
    WHERE organization_id = v_org_a AND dedupe_key = 'roam_gap:' || v_ride_ind::text AND resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 's3 non-fleet attribution must not alert';
  END IF;

  PERFORM toll_system.native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', v_ride_gap::text,
    'payment_method', 'card',
    'driver_id', 'driver-mt-1',
    'vehicle_id', 'vehicle-mt-1',
    'ended_at', now() - interval '3 hours',
    'estimated_tolls_minor', 1100,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', v_xing_gap::text,
      'plaza_id', 'plz-gap',
      'amount_minor', 1100,
      'crossed_at', (now() - interval '3 hours')::text,
      'paid_by', 'tag'
    ))
  ));

  PERFORM toll_system.nightly_run();

  IF EXISTS (
    SELECT 1 FROM toll.alerts
    WHERE organization_id = v_org_a AND dedupe_key = 'roam_gap:' || v_ride_gap::text AND resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 's3 roam_gap alert should resolve after native_ride_charge';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.alerts
    WHERE organization_id = v_org_a AND dedupe_key = 'roam_gap:' || v_ride_gap::text AND resolved_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 's3 roam_gap alert should be resolved';
  END IF;

  RAISE NOTICE 'toll_v2_metrics: all sections passed';
END;
$$;

ROLLBACK;

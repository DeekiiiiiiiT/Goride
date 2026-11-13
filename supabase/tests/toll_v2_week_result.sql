-- Toll v2 P1-R1: week result (TollWeekResultV1), read path, seal freeze, check 4 (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT u.id, u.email
FROM (VALUES
  ('f0111111-1111-4111-8111-111111111111'::uuid, 'toll-wr-owner@example.com'),
  ('f0211111-1111-4111-8111-111111111112'::uuid, 'toll-wr-mgr@example.com'),
  ('f0311111-1111-4111-8111-111111111113'::uuid, 'toll-wr-acct@example.com'),
  ('f0411111-1111-4111-8111-111111111114'::uuid, 'toll-wr-acct-exp@example.com'),
  ('f0511111-1111-4111-8111-111111111115'::uuid, 'toll-wr-viewer@example.com'),
  ('f0611111-1111-4111-8111-111111111116'::uuid, 'toll-wr-driver@example.com'),
  ('f0711111-1111-4111-8111-111111111117'::uuid, 'toll-wr-owner-b@example.com')
) AS u(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

DO $$
DECLARE
  v_owner       uuid := 'f0111111-1111-4111-8111-111111111111';
  v_mgr         uuid := 'f0211111-1111-4111-8111-111111111112';
  v_acct        uuid := 'f0311111-1111-4111-8111-111111111113';
  v_acct_exp    uuid := 'f0411111-1111-4111-8111-111111111114';
  v_viewer      uuid := 'f0511111-1111-4111-8111-111111111115';
  v_driver      uuid := 'f0611111-1111-4111-8111-111111111116';
  v_owner_b     uuid := 'f0711111-1111-4111-8111-111111111117';
  v_org_a       uuid := 'f1111111-1111-4111-8111-111111111101';
  v_org_b       uuid := 'f2222222-2222-4222-8222-222222222202';
  v_d1          text := 'driver-wr-d1';
  v_effective   timestamptz := '2024-05-14 12:00:00+00';  -- in the past: sealed weeks must have ended
  v_week0       date;
  v_w           date;
  v_wm1         date;
  v_w_early     date;
  v_w_hash      date;
  v_ev          timestamptz;
  v_decision_id uuid;

  -- fixture amounts (minor)
  v_tu_wm1      bigint := 20000;
  v_tu_w        bigint := 8000;
  v_t1          bigint := 1000;
  v_t2          bigint := 1500;
  v_cash1       bigint := 2000;
  v_pending     bigint := 600;
  v_unverified  bigint := 700;
  v_await       bigint := 1200;
  v_pb_card     bigint := 1000;
  v_pb_cash     bigint := 3000;
  v_pb_part     bigint := 5000;
  v_pb_link     bigint := 2000;
  v_unlinked    bigint := 3000;
  v_take        bigint := 1000;
  v_carried_amt bigint := 500;
  v_bank_in     bigint := 4000;

  v_tag_acct    uuid;
  v_top_wm1     uuid;
  v_top_w       uuid;
  v_ch_t1       uuid;
  v_ch_t2       uuid;
  v_ch_t2b      uuid;
  v_ch_tb       uuid;
  v_ch_cash1    uuid;
  v_ch_pending  uuid;
  v_ch_unver    uuid;
  v_ch_await    uuid;
  v_ch_carried  uuid;
  v_pb1         uuid;
  v_pb2         uuid;
  v_pb3         uuid;
  v_pb_orig     uuid;
  v_pb_rev      uuid;
  v_alloc       uuid;
  v_carried_id  uuid;

  v_j           jsonb;
  v_pre_seal    jsonb;
  v_hash1       text;
  v_hash2       text;
  v_open_before bigint;
  v_keys        text[];
  v_expect_keys text[] := ARRAY[
    'afterSeal','awaitingCash','bearers','carriedIn','companyId','contractVersion',
    'drivers','engineVersion','factsHash','ledgerMovements','paybacks','pending',
    'spend','state','tagAccount','unverified','weekKey','weekVersion'
  ];
  v_stmt_hash   text;
  v_cnt         int;
  v_msg         text;
  v_detail      text;
  v_caught      boolean;
  v_role_mgr    uuid;
  v_role_acct   uuid;
  v_role_view   uuid;
  v_fn_wr       regprocedure := 'public.toll_v2_week_result(date)'::regprocedure;
  v_fn_live     regprocedure := 'toll_system.week_result_live(uuid,date)'::regprocedure;
  v_fn_res      regprocedure := 'toll_system.week_result(uuid,date)'::regprocedure;
  v_fn_view     regprocedure := 'toll_system.user_can_view_tolls(uuid,uuid)'::regprocedure;
BEGIN
  v_week0 := ledger.jamaica_week_start(v_effective);
  v_w := v_week0 + 7 * 60;
  v_wm1 := v_w - 7;
  v_w_early := v_week0 + 7 * 58;
  v_w_hash := v_week0 + 7 * 70;
  v_ev := v_w::timestamptz + time '12:00';

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES
    (v_org_a, v_owner, 'Toll WR Org A', 'toll-wr-a', 'fleet', 'active'),
    (v_org_b, v_owner_b, 'Toll WR Org B', 'toll-wr-b', 'fleet', 'active')
  ON CONFLICT (id) DO NOTHING;

  PERFORM toll_system.ensure_accounts(v_org_a);
  PERFORM toll_system.ensure_accounts(v_org_b);

  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org_a, 'toll-wr-fixture', 'fixture', 'user')
  RETURNING id INTO v_decision_id;

  INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system)
  VALUES
    ('fleet_manager', 'Fleet Manager', 'toll wr test', 50, 'fleet', true),
    ('fleet_accountant', 'Fleet Accountant', 'toll wr test', 40, 'fleet', true),
    ('fleet_viewer', 'Fleet Viewer', 'toll wr test', 30, 'fleet', true)
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_role_mgr FROM platform.roles WHERE name = 'fleet_manager';
  SELECT id INTO v_role_acct FROM platform.roles WHERE name = 'fleet_accountant';
  SELECT id INTO v_role_view FROM platform.roles WHERE name = 'fleet_viewer';

  INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, status, expires_at)
  VALUES
    (v_mgr, v_role_mgr, 'organization', v_org_a, 'active', NULL),
    (v_acct, v_role_acct, 'organization', v_org_a, 'active', NULL),
    (v_acct_exp, v_role_acct, 'organization', v_org_a, 'active', now() - interval '1 day'),
    (v_viewer, v_role_view, 'organization', v_org_a, 'active', NULL);

  -- helpers
  CREATE OR REPLACE FUNCTION pg_temp._wr_as(p_user uuid, p_org uuid) RETURNS void
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

  CREATE OR REPLACE FUNCTION pg_temp._wr_expect(p_code text, p_week date) RETURNS void
  LANGUAGE plpgsql AS $ex$
  DECLARE v_msg text;
  BEGIN
    PERFORM public.toll_v2_week_result(p_week);
    RAISE EXCEPTION 'test expect % but week_result succeeded', p_code;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 'test expect code % got %', p_code, v_msg;
    END IF;
  END;
  $ex$;

  CREATE OR REPLACE FUNCTION pg_temp._wr_expect_fail(
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
          RAISE EXCEPTION 'nightly check % % want ok=% got % detail %',
            p_check_no, r.name, p_want_ok, r.ok, r.detail;
        END IF;
      END IF;
    END LOOP;
    IF NOT v_found THEN
      RAISE EXCEPTION 'no nightly row check % like %', p_check_no, p_name_like;
    END IF;
  END;
  $ef$;

  CREATE OR REPLACE FUNCTION pg_temp._p17_takeback(
    p_org uuid, p_orig_pb uuid, p_rev_pb uuid, p_charge uuid, p_alloc uuid,
    p_amt bigint, p_eff timestamptz, p_cmd text
  ) RETURNS void
  LANGUAGE plpgsql AS $p17$
  DECLARE v_refs jsonb;
  BEGIN
    UPDATE toll.allocations SET reversed_by = p_rev_pb
    WHERE organization_id = p_org AND id = p_alloc;
    v_refs := jsonb_build_object(
      'charge_id', p_charge::text, 'payback_id', p_orig_pb::text, 'reversing_payback_id', p_rev_pb::text);
    PERFORM toll_system.post(p_org, 'P6_allocate_platform', p_amt, p_eff, p_cmd, 1, v_refs, true);
    v_refs := jsonb_build_object('payback_id', p_orig_pb::text, 'reversing_payback_id', p_rev_pb::text);
    PERFORM toll_system.post(p_org, 'P4_payback_fleet', p_amt, p_eff, p_cmd, 2, v_refs, true);
  END;
  $p17$;

  -- ── early open week (section 4: tag usage before W) ──
  INSERT INTO toll.tag_accounts (organization_id, provider, account_ref)
  VALUES (v_org_a, 'test', 'toll-wr-early-tag') RETURNING id INTO v_tag_acct;
  INSERT INTO toll.tag_topups (
    organization_id, tag_account_id, amount_minor, topped_up_on, week_key, source_ref
  ) VALUES (v_org_a, v_tag_acct, 5000, v_w_early, v_w_early, 'toll-wr-early-tu')
  RETURNING id INTO v_top_wm1;
  PERFORM toll_system.post(v_org_a, 'P1_tag_topup', 5000, v_w_early::timestamptz + time '12:00',
    'toll-wr-early-p1', 1, jsonb_build_object('tag_topup_id', v_top_wm1::text));

  -- ── fixture week W (section 1) ──
  INSERT INTO toll.tag_accounts (organization_id, provider, account_ref)
  VALUES (v_org_a, 'test', 'toll-wr-main-tag') RETURNING id INTO v_tag_acct;

  -- W-1 top-up 20000 → opening for W = 20000 (no prior usage)
  INSERT INTO toll.tag_topups (
    organization_id, tag_account_id, amount_minor, topped_up_on, week_key, source_ref
  ) VALUES (v_org_a, v_tag_acct, v_tu_wm1, v_wm1, v_wm1, 'toll-wr-tu-wm1')
  RETURNING id INTO v_top_wm1;
  PERFORM toll_system.post(v_org_a, 'P1_tag_topup', v_tu_wm1, v_wm1::timestamptz + time '12:00',
    'toll-wr-p1-wm1', 1, jsonb_build_object('tag_topup_id', v_top_wm1::text));

  -- W top-up 8000
  INSERT INTO toll.tag_topups (
    organization_id, tag_account_id, amount_minor, topped_up_on, week_key, source_ref
  ) VALUES (v_org_a, v_tag_acct, v_tu_w, v_w, v_w, 'toll-wr-tu-w')
  RETURNING id INTO v_top_w;
  PERFORM toll_system.post(v_org_a, 'P1_tag_topup', v_tu_w, v_ev, 'toll-wr-p1-w', 2,
    jsonb_build_object('tag_topup_id', v_top_w::text));

  -- bank leg in W (P11) for ledgerMovements.bankMinor
  PERFORM toll_system.post(v_org_a, 'P11_payout_deposited', v_bank_in, v_ev, 'toll-wr-p11', 3,
    jsonb_build_object('payout_ref', 'toll-wr-payout-w'));

  -- tag charges T1, T2 (posted)
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_w, 'exact', v_t1, 'tag', 'manual', 'toll-wr-t1', 'verified', v_d1
  ) RETURNING id INTO v_ch_t1;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_t1, v_ev, 'toll-wr-p2-t1', 4,
    jsonb_build_object('charge_id', v_ch_t1::text));

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_w, 'exact', v_t2, 'tag', 'manual', 'toll-wr-t2', 'verified', v_d1
  ) RETURNING id INTO v_ch_t2;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_t2, v_ev, 'toll-wr-p2-t2', 5,
    jsonb_build_object('charge_id', v_ch_t2::text));

  -- cash charge D1
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_w, 'exact', v_cash1, 'cash', 'driver_cash', 'toll-wr-cash1', 'verified', v_d1
  ) RETURNING id INTO v_ch_cash1;
  PERFORM toll_system.post(v_org_a, 'P3_cash_verified', v_cash1, v_ev, 'toll-wr-p3-c1', 6,
    jsonb_build_object('charge_id', v_ch_cash1::text));

  -- paybacks: card fleet + cash driver
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by, driver_id
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-wr-pb-card', v_w, v_w, v_pb_card, 'fleet', NULL
  ) RETURNING id INTO v_pb1;
  PERFORM toll_system.post(v_org_a, 'P4_payback_fleet', v_pb_card, v_ev, 'toll-wr-p4-1', 7,
    jsonb_build_object('payback_id', v_pb1::text));

  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by, driver_id
  ) VALUES (
    v_org_a, 'indrive', 'trip_line', 'toll-wr-pb-cash', v_w, v_w, v_pb_cash, 'driver', v_d1
  ) RETURNING id INTO v_pb2;
  PERFORM toll_system.post(v_org_a, 'P5_payback_driver', v_pb_cash, v_ev, 'toll-wr-p5-1', 8,
    jsonb_build_object('payback_id', v_pb2::text));

  -- platform / driver / fleet allocations on T1/T2/cash1
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (v_org_a, v_ch_t1, 'platform', v_t1, v_pb1, 'wr-t1', v_decision_id);
  PERFORM toll_system.post(v_org_a, 'P6_allocate_platform', v_t1, v_ev, 'toll-wr-p6-t1', 9,
    jsonb_build_object('charge_id', v_ch_t1::text, 'payback_id', v_pb1::text));

  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (v_org_a, v_ch_t2, 'driver', v_t2, NULL, 'wr-t2', v_decision_id);
  PERFORM toll_system.post(v_org_a, 'P7_allocate_driver', v_t2, v_ev, 'toll-wr-p7-t2', 10,
    jsonb_build_object('charge_id', v_ch_t2::text));

  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (v_org_a, v_ch_cash1, 'fleet', v_cash1, NULL, 'wr-c1', v_decision_id);
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', v_cash1, v_ev, 'toll-wr-p8-c1', 11,
    jsonb_build_object('charge_id', v_ch_cash1::text));

  -- pending (part-allocated 400/600)
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_w, 'exact', v_pending, 'tag', 'manual', 'toll-wr-pending', 'verified', v_d1
  ) RETURNING id INTO v_ch_pending;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_pending, v_ev, 'toll-wr-p2-pend', 12,
    jsonb_build_object('charge_id', v_ch_pending::text));
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (v_org_a, v_ch_pending, 'fleet', 400, NULL, 'wr-pend-part', v_decision_id);
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', 400, v_ev, 'toll-wr-p8-pend', 13,
    jsonb_build_object('charge_id', v_ch_pending::text));

  -- unverified (not posted)
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_w, 'exact', v_unverified, 'tag', 'manual', 'toll-wr-unver', 'unverified', v_d1
  ) RETURNING id INTO v_ch_unver;

  -- awaiting_cash, fully allocated
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, awaiting_cash, driver_id
  ) VALUES (
    v_org_a, v_ev, v_w, 'exact', v_await, 'cash', 'driver_cash', 'toll-wr-await', 'verified', true, v_d1
  ) RETURNING id INTO v_ch_await;
  PERFORM toll_system.post(v_org_a, 'P3_cash_verified', v_await, v_ev, 'toll-wr-p3-await', 14,
    jsonb_build_object('charge_id', v_ch_await::text));
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (v_org_a, v_ch_await, 'fleet', v_await, NULL, 'wr-await', v_decision_id);
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', v_await, v_ev, 'toll-wr-p8-await', 15,
    jsonb_build_object('charge_id', v_ch_await::text));

  -- payback partly unlinked
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-wr-pb-part', v_w, v_w, v_pb_part, 'fleet'
  ) RETURNING id INTO v_pb3;
  PERFORM toll_system.post(v_org_a, 'P4_payback_fleet', v_pb_part, v_ev, 'toll-wr-p4-part', 16,
    jsonb_build_object('payback_id', v_pb3::text));
  -- t2 is fully driver-allocated; platform slice for pb3 lives on its own charge (I4 guard).
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_w, 'exact', v_pb_link, 'tag', 'manual', 'toll-wr-t2b', 'verified', v_d1
  ) RETURNING id INTO v_ch_t2b;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_pb_link, v_ev, 'toll-wr-p2-t2b', 16,
    jsonb_build_object('charge_id', v_ch_t2b::text));
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (v_org_a, v_ch_t2b, 'platform', v_pb_link, v_pb3, 'wr-pb3', v_decision_id);
  PERFORM toll_system.post(v_org_a, 'P6_allocate_platform', v_pb_link, v_ev, 'toll-wr-p6-pb3', 17,
    jsonb_build_object('charge_id', v_ch_t2b::text, 'payback_id', v_pb3::text));
  INSERT INTO toll.payback_unlinked_decisions (
    organization_id, payback_id, amount_minor, reason, decision_id
  ) VALUES (v_org_a, v_pb3, v_unlinked, 'no toll', v_decision_id);

  -- take-back in W (original payback + reversal same week; own charge so I4 holds)
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_w, 'exact', v_take, 'tag', 'manual', 'toll-wr-tb-ch', 'verified', v_d1
  ) RETURNING id INTO v_ch_tb;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_take, v_ev, 'toll-wr-p2-tb', 18,
    jsonb_build_object('charge_id', v_ch_tb::text));
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-wr-pb-tb-y', v_w, v_w, v_take, 'fleet'
  ) RETURNING id INTO v_pb_orig;
  PERFORM toll_system.post(v_org_a, 'P4_payback_fleet', v_take, v_ev, 'toll-wr-p4-tb', 19,
    jsonb_build_object('payback_id', v_pb_orig::text));
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (v_org_a, v_ch_tb, 'platform', v_take, v_pb_orig, 'wr-tb', v_decision_id)
  RETURNING id INTO v_alloc;
  PERFORM toll_system.post(v_org_a, 'P6_allocate_platform', v_take, v_ev, 'toll-wr-p6-tb', 20,
    jsonb_build_object('charge_id', v_ch_tb::text, 'payback_id', v_pb_orig::text));
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by, reversal_of
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-wr-pb-tb-z', v_w, v_w, v_take, 'fleet', v_pb_orig
  ) RETURNING id INTO v_pb_rev;
  PERFORM pg_temp._p17_takeback(v_org_a, v_pb_orig, v_pb_rev, v_ch_tb, v_alloc, v_take, v_ev, 'toll-wr-p17-tb');

  -- carried into W
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status
  ) VALUES (
    v_org_a, v_wm1::timestamptz + time '12:00', v_wm1, 'exact', v_carried_amt,
    'tag', 'manual', 'toll-wr-carried-src', 'verified'
  ) RETURNING id INTO v_ch_carried;
  INSERT INTO toll.carried_facts (
    organization_id, kind, original_id, from_week, to_week, amount_minor, decision_id
  ) VALUES (
    v_org_a, 'charge', v_ch_carried, v_wm1, v_w, v_carried_amt, v_decision_id
  ) RETURNING id INTO v_carried_id;

  -- ══ 1. Every field on fixture week W (hand totals in comments) ══
  -- spend: tag 1000+1500+2000(t2b)+1000(tb)+600+500(carried) + cash 2000+1200; unverified 700 excluded → tag 6600 cash 3200 total 9800
  -- bearers: platform 1000+2000+1000(TB alloc still counts until reversed? after P17 platform on t1 was reversed)
  --   After take-back, t1 platform alloc from tb reversed — platform from t1 alloc 1000 + pb3 2000 = 3000; driver t2 1500; fleet cash1 2000 + pend 400 + await 1200 = 3600
  -- pending: 2 charges (part-pending 600 + carried 500), 700 undecided
  -- unverified: 1 / 700
  -- awaitingCash: 1 charge, 0 undecided
  -- paybacks received: 1000+3000+5000+1000+1000=11000; allocated sum; unallocated; leftUnlinked 3000; takenBack 1000
  -- tagAccount opening 25000 (W-1 20000 + early-week topup 5000), topUps 8000, usage 3600, closing 29400
  -- drivers D1: owes driver bearer on t2 1500; fleetOwes cash 2000+1200=3200; recovered pb2 3000
  -- bankMinor: money in minus money out in W = P11 deposit (+4000) - P1 top-up in W (-8000) = -4000

  PERFORM pg_temp._wr_as(v_owner, v_org_a);
  v_j := public.toll_v2_week_result(v_w);

  IF (v_j -> 'spend' ->> 'tagMinor')::bigint <> v_t1 + v_t2 + v_pb_link + v_take + v_pending + v_carried_amt THEN
    RAISE EXCEPTION 's1 spend.tag got % want %', v_j -> 'spend' ->> 'tagMinor',
      v_t1 + v_t2 + v_pb_link + v_take + v_pending + v_carried_amt;
  END IF;
  IF (v_j -> 'spend' ->> 'cashMinor')::bigint <> v_cash1 + v_await THEN
    RAISE EXCEPTION 's1 spend.cash got % want %', v_j -> 'spend' ->> 'cashMinor', v_cash1 + v_await;
  END IF;
  IF (v_j -> 'spend' ->> 'totalMinor')::bigint <>
      v_t1 + v_t2 + v_pb_link + v_take + v_pending + v_carried_amt + v_cash1 + v_await THEN
    RAISE EXCEPTION 's1 spend.total';
  END IF;

  IF (v_j -> 'bearers' ->> 'platformMinor')::bigint <> v_t1 + v_pb_link THEN
    RAISE EXCEPTION 's1 bearers.platform got % want %', v_j -> 'bearers' ->> 'platformMinor', v_t1 + v_pb_link;
  END IF;
  IF (v_j -> 'bearers' ->> 'driverMinor')::bigint <> v_t2 THEN
    RAISE EXCEPTION 's1 bearers.driver';
  END IF;
  IF (v_j -> 'bearers' ->> 'fleetMinor')::bigint <> v_cash1 + 400 + v_await THEN
    RAISE EXCEPTION 's1 bearers.fleet got % want %', v_j -> 'bearers' ->> 'fleetMinor', v_cash1 + 400 + v_await;
  END IF;

  -- take-back charge reopens as pending after P17 until otherwise decided (+v_take)
  IF (v_j -> 'pending' ->> 'charges')::int <> 3
    OR (v_j -> 'pending' ->> 'amountMinor')::bigint <> v_pending - 400 + v_carried_amt + v_take THEN
    RAISE EXCEPTION 's1 pending got charges=% amt=%', v_j -> 'pending' ->> 'charges',
      v_j -> 'pending' ->> 'amountMinor';
  END IF;
  IF (v_j -> 'unverified' ->> 'charges')::int <> 1
    OR (v_j -> 'unverified' ->> 'amountMinor')::bigint <> v_unverified THEN
    RAISE EXCEPTION 's1 unverified';
  END IF;
  IF (v_j -> 'awaitingCash' ->> 'charges')::int <> 1
    OR (v_j -> 'awaitingCash' ->> 'amountMinor')::bigint <> 0 THEN
    RAISE EXCEPTION 's1 awaitingCash';
  END IF;

  IF (v_j -> 'paybacks' ->> 'receivedMinor')::bigint <> v_pb_card + v_pb_cash + v_pb_part THEN
    RAISE EXCEPTION 's1 paybacks.received got % want %', v_j -> 'paybacks' ->> 'receivedMinor',
      v_pb_card + v_pb_cash + v_pb_part;
  END IF;
  IF (v_j -> 'paybacks' ->> 'allocatedMinor')::bigint <> v_pb_card + v_pb_link THEN
    RAISE EXCEPTION 's1 paybacks.allocated got % want %', v_j -> 'paybacks' ->> 'allocatedMinor',
      v_pb_card + v_pb_link;
  END IF;
  IF (v_j -> 'paybacks' ->> 'unallocatedMinor')::bigint <> v_pb_cash THEN
    RAISE EXCEPTION 's1 paybacks.unallocated got % want %', v_j -> 'paybacks' ->> 'unallocatedMinor', v_pb_cash;
  END IF;
  IF (v_j -> 'paybacks' ->> 'leftUnlinkedMinor')::bigint <> v_unlinked THEN
    RAISE EXCEPTION 's1 paybacks.leftUnlinked';
  END IF;
  IF (v_j -> 'paybacks' ->> 'takenBackMinor')::bigint <> v_take THEN
    RAISE EXCEPTION 's1 paybacks.takenBack';
  END IF;

  IF jsonb_array_length(v_j -> 'carriedIn') <> 1
    OR (v_j -> 'carriedIn' -> 0 ->> 'amountMinor')::bigint <> v_carried_amt THEN
    RAISE EXCEPTION 's1 carriedIn';
  END IF;

  IF (v_j -> 'tagAccount' ->> 'openingMinor')::bigint <> v_tu_wm1 + 5000 THEN
    RAISE EXCEPTION 's1 tagAccount.opening got % want %', v_j -> 'tagAccount' ->> 'openingMinor', v_tu_wm1 + 5000;
  END IF;
  IF (v_j -> 'tagAccount' ->> 'topUpsMinor')::bigint <> v_tu_w THEN
    RAISE EXCEPTION 's1 tagAccount.topUps';
  END IF;
  IF (v_j -> 'tagAccount' ->> 'usageMinor')::bigint <> v_t1 + v_t2 + v_pb_link + v_take + v_pending + v_carried_amt THEN
    RAISE EXCEPTION 's1 tagAccount.usage';
  END IF;
  IF (v_j -> 'tagAccount' ->> 'closingMinor')::bigint <>
      v_tu_wm1 + 5000 + v_tu_w - (v_t1 + v_t2 + v_pb_link + v_take + v_pending + v_carried_amt) THEN
    RAISE EXCEPTION 's1 tagAccount.closing';
  END IF;

  IF jsonb_array_length(v_j -> 'drivers') < 1 THEN
    RAISE EXCEPTION 's1 drivers missing';
  END IF;
  IF (
    SELECT (d ->> 'owesFleetMinor')::bigint FROM jsonb_array_elements(v_j -> 'drivers') d
    WHERE d ->> 'driverId' = v_d1 LIMIT 1
  ) IS DISTINCT FROM v_t2 THEN
    RAISE EXCEPTION 's1 driver owesFleet';
  END IF;
  IF (
    SELECT (d ->> 'fleetOwesMinor')::bigint FROM jsonb_array_elements(v_j -> 'drivers') d
    WHERE d ->> 'driverId' = v_d1 LIMIT 1
  ) IS DISTINCT FROM v_cash1 + v_await THEN
    RAISE EXCEPTION 's1 driver fleetOwes';
  END IF;
  IF (
    SELECT (d ->> 'recoveredInPassengerCashMinor')::bigint FROM jsonb_array_elements(v_j -> 'drivers') d
    WHERE d ->> 'driverId' = v_d1 LIMIT 1
  ) IS DISTINCT FROM v_pb_cash THEN
    RAISE EXCEPTION 's1 driver recovered';
  END IF;

  IF (v_j -> 'ledgerMovements' ->> 'bankMinor')::bigint <> v_bank_in - v_tu_w THEN
    RAISE EXCEPTION 's1 bankMinor got % want %', v_j -> 'ledgerMovements' ->> 'bankMinor', v_bank_in - v_tu_w;
  END IF;

  IF v_j ->> 'state' <> 'open' THEN
    RAISE EXCEPTION 's1 state open';
  END IF;

  RESET ROLE;

  -- ══ 2. Exact top-level shape (must match TollWeekResultV1) ══
  SELECT array_agg(k ORDER BY k) INTO v_keys
  FROM jsonb_object_keys(v_j) AS k;
  IF v_keys IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(v_expect_keys) x) THEN
    RAISE EXCEPTION 's2 keys got % want %', v_keys, v_expect_keys;
  END IF;

  -- resolve seal blockers, snapshot, ══ 3. Sealed read ══
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_carried_amt, v_wm1::timestamptz + time '12:00',
    'toll-wr-p2-carried', 20, jsonb_build_object('charge_id', v_ch_carried::text));
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (v_org_a, v_ch_carried, 'fleet', v_carried_amt, NULL, 'wr-carried', v_decision_id);
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', v_carried_amt, v_wm1::timestamptz + time '12:00',
    'toll-wr-p8-carried', 21, jsonb_build_object('charge_id', v_ch_carried::text));

  INSERT INTO toll.payback_unlinked_decisions (
    organization_id, payback_id, amount_minor, reason, decision_id
  ) VALUES (v_org_a, v_pb2, v_pb_cash, 'passenger cash only', v_decision_id);

  UPDATE toll.charges SET evidence_status = 'verified' WHERE id = v_ch_unver;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_unverified, v_ev, 'toll-wr-p2-unver', 22,
    jsonb_build_object('charge_id', v_ch_unver::text));
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (v_org_a, v_ch_unver, 'fleet', v_unverified, NULL, 'wr-unver', v_decision_id);
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', v_unverified, v_ev, 'toll-wr-p8-unver', 23,
    jsonb_build_object('charge_id', v_ch_unver::text));

  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (v_org_a, v_ch_pending, 'fleet', v_pending - 400, NULL, 'wr-pend-rest', v_decision_id);
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', v_pending - 400, v_ev, 'toll-wr-p8-pend2', 24,
    jsonb_build_object('charge_id', v_ch_pending::text));

  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (v_org_a, v_ch_tb, 'fleet', v_take, NULL, 'wr-tb-close', v_decision_id);
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', v_take, v_ev, 'toll-wr-p8-tb', 25,
    jsonb_build_object('charge_id', v_ch_tb::text));

  PERFORM pg_temp._wr_as(v_owner, v_org_a);
  v_pre_seal := public.toll_v2_week_result(v_w);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-wr-seal-w',
    'week_key', v_w,
    'expected_week_version', 0
  ));
  v_j := public.toll_v2_week_result(v_w);
  RESET ROLE;

  SELECT source_hash INTO v_stmt_hash
  FROM ledger.week_statements
  WHERE organization_id = v_org_a AND kind = 'toll_week' AND driver_id = '*' AND week_key = v_w
  ORDER BY version DESC LIMIT 1;

  IF v_j ->> 'state' <> 'sealed' OR (v_j ->> 'weekVersion')::int <> 1 THEN
    RAISE EXCEPTION 's3 sealed metadata';
  END IF;
  IF v_j ->> 'factsHash' IS DISTINCT FROM v_stmt_hash THEN
    RAISE EXCEPTION 's3 factsHash vs statement';
  END IF;
  IF v_j - 'state' - 'weekVersion' - 'factsHash' - 'afterSeal' - 'engineVersion'
    IS DISTINCT FROM v_pre_seal - 'state' - 'weekVersion' - 'factsHash' - 'afterSeal' - 'engineVersion' THEN
    RAISE EXCEPTION 's3 frozen body mismatch pre-seal';
  END IF;
  v_hash1 := v_j ->> 'factsHash';

  -- ══ 4. After the seal ══
  RESET ROLE;
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, after_seal, driver_id
  ) VALUES (
    v_org_a, v_ev, v_w, 'exact', 500, 'tag', 'manual', 'toll-wr-as-ch', 'verified', true, v_d1
  );
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by,
    after_seal, reversal_of
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-wr-as-rev', v_w, v_w, v_take, 'fleet', true, v_pb_orig
  );
  PERFORM pg_temp._wr_as(v_owner, v_org_a);
  v_j := public.toll_v2_week_result(v_w);
  RESET ROLE;

  IF jsonb_array_length(v_j -> 'afterSeal') < 2 THEN
    RAISE EXCEPTION 's4 afterSeal count';
  END IF;
  IF v_j - 'afterSeal' - 'state' - 'weekVersion' - 'factsHash' - 'engineVersion'
    IS DISTINCT FROM v_pre_seal - 'state' - 'weekVersion' - 'factsHash' - 'afterSeal' - 'engineVersion' THEN
    RAISE EXCEPTION 's4 totals changed after after_seal facts';
  END IF;

  -- earlier open week tag charge → openingMinor moves (usage before W), sealed factsHash unchanged
  v_open_before := (toll_system.week_result_live(v_org_a, v_w) -> 'tagAccount' ->> 'openingMinor')::bigint;
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_w_early::timestamptz + time '12:00', v_w_early, 'exact', 2500,
    'tag', 'manual', 'toll-wr-early-ch', 'verified', v_d1
  ) RETURNING id INTO v_ch_pending;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', 2500, v_w_early::timestamptz + time '12:00',
    'toll-wr-early-p2', 1, jsonb_build_object('charge_id', v_ch_pending::text));

  IF (toll_system.week_result_live(v_org_a, v_w) -> 'tagAccount' ->> 'openingMinor')::bigint
      = v_open_before THEN
    RAISE EXCEPTION 's4 openingMinor should change after early-week tag usage';
  END IF;
  PERFORM pg_temp._wr_as(v_owner, v_org_a);
  IF public.toll_v2_week_result(v_w) ->> 'factsHash' IS DISTINCT FROM v_hash1 THEN
    RAISE EXCEPTION 's4 sealed factsHash must not move on prior-week tag usage';
  END IF;
  RESET ROLE;
  PERFORM pg_temp._wr_expect_fail(v_org_a, 4, 'sealed_week:' || v_w::text, true);

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_w, 'exact', 999, 'tag', 'manual', 'toll-wr-live-sealed', 'verified', v_d1
  );
  PERFORM pg_temp._wr_expect_fail(v_org_a, 4, 'sealed_week:' || v_w::text, false);

  -- ══ 5. Hash sensitivity (open week) ══
  PERFORM toll_system.ensure_accounts(v_org_a);
  v_ev := v_w_hash::timestamptz + time '12:00';
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_w_hash, 'exact', 1111, 'tag', 'manual', 'toll-wr-hash-ch', 'verified', v_d1
  ) RETURNING id INTO v_ch_t1;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', 1111, v_ev, 'toll-wr-hash-p2', 1,
    jsonb_build_object('charge_id', v_ch_t1::text));

  PERFORM pg_temp._wr_as(v_owner, v_org_a);
  v_hash1 := public.toll_v2_week_result(v_w_hash) ->> 'factsHash';
  v_hash2 := public.toll_v2_week_result(v_w_hash) ->> 'factsHash';
  IF v_hash1 IS DISTINCT FROM v_hash2 THEN
    RAISE EXCEPTION 's5 stable hash';
  END IF;
  RESET ROLE;

  UPDATE toll.charges SET amount_minor = 2222 WHERE organization_id = v_org_a AND id = v_ch_t1;
  PERFORM pg_temp._wr_as(v_owner, v_org_a);
  IF public.toll_v2_week_result(v_w_hash) ->> 'factsHash' = v_hash1 THEN
    RAISE EXCEPTION 's5 hash must change when charge amount changes';
  END IF;
  RESET ROLE;

  -- ══ 6. Who may read ══
  PERFORM pg_temp._wr_as(v_owner, v_org_a);
  PERFORM public.toll_v2_week_result(v_w);
  RESET ROLE;
  PERFORM pg_temp._wr_as(v_mgr, v_org_a);
  PERFORM public.toll_v2_week_result(v_w);
  RESET ROLE;
  PERFORM pg_temp._wr_as(v_acct, v_org_a);
  PERFORM public.toll_v2_week_result(v_w);
  RESET ROLE;

  PERFORM pg_temp._wr_as(v_viewer, v_org_a);
  PERFORM pg_temp._wr_expect('FORBIDDEN', v_w);
  RESET ROLE;

  PERFORM pg_temp._wr_as(v_driver, v_org_a);
  PERFORM pg_temp._wr_expect('FORBIDDEN', v_w);
  RESET ROLE;

  PERFORM pg_temp._wr_as(v_acct_exp, v_org_a);
  PERFORM pg_temp._wr_expect('FORBIDDEN', v_w);
  RESET ROLE;

  PERFORM pg_temp._wr_as(v_owner_b, v_org_b);
  v_j := public.toll_v2_week_result(v_w);
  IF (v_j -> 'spend' ->> 'totalMinor')::bigint <> 0 THEN
    RAISE EXCEPTION 's6 company B must see empty week';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_j -> 'drivers') d WHERE (d ->> 'driverId') = v_d1
  ) THEN
    RAISE EXCEPTION 's6 company B must not see A driver totals';
  END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{"sub":"' || v_owner::text || '","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._wr_expect('NO_COMPANY', v_w);
  RESET ROLE;

  PERFORM pg_temp._wr_as(v_owner, v_org_a);
  PERFORM pg_temp._wr_expect('BAD_REQUEST', v_w + 3);
  RESET ROLE;

  -- ══ 7. Grants ══
  IF has_function_privilege('anon', v_fn_wr, 'EXECUTE')
    OR has_function_privilege('service_role', v_fn_wr, 'EXECUTE') THEN
    RAISE EXCEPTION 's7 anon/service_role must not EXECUTE toll_v2_week_result';
  END IF;
  IF has_function_privilege('authenticated', v_fn_live, 'EXECUTE')
    OR has_function_privilege('authenticated', v_fn_res, 'EXECUTE')
    OR has_function_privilege('authenticated', v_fn_view, 'EXECUTE') THEN
    RAISE EXCEPTION 's7 authenticated must not EXECUTE toll_system week_result*';
  END IF;
  IF NOT has_function_privilege('service_role', v_fn_res, 'EXECUTE') THEN
    RAISE EXCEPTION 's7 service_role must EXECUTE toll_system.week_result';
  END IF;

  RAISE NOTICE 'toll_v2_week_result: all sections passed';
END;
$$;

ROLLBACK;

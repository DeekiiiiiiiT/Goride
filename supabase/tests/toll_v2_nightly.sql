-- Toll v2 R5: nightly checks, payout trigger, aging, plaza rules (rolled back).

BEGIN;

INSERT INTO auth.users (id, email, raw_app_meta_data)
SELECT u.id, u.email, u.meta
FROM (VALUES
  ('e0111111-1111-4111-8111-111111111111'::uuid, 'toll-v2-nightly-owner@example.com', NULL::jsonb),
  ('e0211111-1111-4111-8111-111111111112'::uuid, 'toll-v2-nightly-plat@example.com',
   jsonb_build_object('role', 'platform_owner')),
  ('e0311111-1111-4111-8111-111111111113'::uuid, 'toll-v2-nightly-user@example.com',
   jsonb_build_object('role', 'fleet_manager')),
  ('e0411111-1111-4111-8111-111111111114'::uuid, 'toll-v2-nightly-owner-b@example.com', NULL::jsonb)
) AS u(id, email, meta)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

DO $$
DECLARE
  v_owner       uuid := 'e0111111-1111-4111-8111-111111111111';
  v_plat_owner  uuid := 'e0211111-1111-4111-8111-111111111112';
  v_plain_user  uuid := 'e0311111-1111-4111-8111-111111111113';
  v_owner_b     uuid := 'e0411111-1111-4111-8111-111111111114';
  v_org_a       uuid := 'e1111111-1111-4111-8111-111111111101';
  v_org_b       uuid := 'e2222222-2222-4222-8222-222222222202';
  v_effective   timestamptz := '2024-04-09 12:00:00+00';  -- in the past: sealed weeks must have ended
  v_amount      bigint := 1000;
  v_d           bigint := 200;
  v_week0       date;
  v_week        date;
  v_week2       date;
  v_decision_id uuid;
  v_decision2   uuid;

  v_tag_acct    uuid;
  v_topup       uuid;
  v_charge      uuid;
  v_payback     uuid;
  v_payback_y   uuid;
  v_payback_z   uuid;
  v_alloc       uuid;
  v_refs        jsonb;
  v_ev          timestamptz;
  v_ev2         timestamptz;

  v_key         text;
  v_val         jsonb;
  v_cnt         int;
  v_caught      boolean;
  v_msg         text;
  v_row         record;
  v_nat         bigint;
  v_plaza       text := 'toll-nightly-plaza-1';

  v_fn_nightly_checks   regprocedure := 'toll_system.nightly_checks(uuid)'::regprocedure;
  v_fn_nightly_run      regprocedure := 'toll_system.nightly_run()'::regprocedure;
  v_fn_payout_received  regprocedure := 'toll_system.payout_received(text,jsonb)'::regprocedure;
  v_fn_set_plaza        regprocedure := 'toll_system.set_plaza_rule(text,int,text,uuid)'::regprocedure;
  v_fn_cmd              regprocedure := 'public.toll_v2_command(text,jsonb)'::regprocedure;
BEGIN
  v_week0 := ledger.jamaica_week_start(v_effective);

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES
    (v_org_a, v_owner, 'Toll Nightly Org A', 'toll-nightly-a', 'fleet', 'active'),
    (v_org_b, v_owner_b, 'Toll Nightly Org B', 'toll-nightly-b', 'fleet', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO toll.switch_state (organization_id, tolls_v2)
  VALUES (v_org_a, true), (v_org_b, false)
  ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = EXCLUDED.tolls_v2;

  PERFORM toll_system.ensure_accounts(v_org_a);
  PERFORM toll_system.ensure_accounts(v_org_b);

  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org_a, 'toll-nightly-fixture', 'fixture', 'user')
  RETURNING id INTO v_decision_id;

  -- helpers
  CREATE OR REPLACE FUNCTION pg_temp._toll_nightly_as(p_user uuid, p_org uuid) RETURNS void
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

  CREATE OR REPLACE FUNCTION pg_temp._nightly_all_ok(p_org uuid) RETURNS void
  LANGUAGE plpgsql AS $ok$
  DECLARE r record;
  BEGIN
    FOR r IN SELECT * FROM toll_system.nightly_checks(p_org) LOOP
      IF NOT r.ok THEN
        RAISE EXCEPTION 'test: expected all nightly_checks ok, got check % name % detail %',
          r.check_no, r.name, r.detail;
      END IF;
    END LOOP;
  END;
  $ok$;

  CREATE OR REPLACE FUNCTION pg_temp._nightly_expect_fail(
    p_org uuid, p_check_no int, p_name_like text, p_want_ok boolean DEFAULT false
  ) RETURNS void
  LANGUAGE plpgsql AS $ef$
  DECLARE r record;
  v_found boolean := false;
  BEGIN
    FOR r IN SELECT * FROM toll_system.nightly_checks(p_org) WHERE check_no = p_check_no LOOP
      IF r.name LIKE p_name_like THEN
        v_found := true;
        IF r.ok IS DISTINCT FROM p_want_ok THEN
          RAISE EXCEPTION 'test: check % % expected ok=% got % detail %',
            p_check_no, r.name, p_want_ok, r.ok, r.detail;
        END IF;
      END IF;
    END LOOP;
    IF NOT v_found THEN
      RAISE EXCEPTION 'test: no nightly row check % name like %', p_check_no, p_name_like;
    END IF;
  END;
  $ef$;

  CREATE OR REPLACE FUNCTION pg_temp._nightly_clean_books(
    p_org uuid, p_week date, p_eff timestamptz, p_decision uuid, p_suffix text
  ) RETURNS void
  LANGUAGE plpgsql AS $cb$
  DECLARE
    v_tag uuid;
    v_top uuid;
    v_ch  uuid;
    v_pb  uuid;
    v_al  uuid;
    v_refs jsonb;
    v_amt bigint := 1000;
  BEGIN
    INSERT INTO toll.tag_accounts (organization_id, provider, account_ref)
    VALUES (p_org, 'test', 'toll-nightly-tag-' || p_suffix)
    RETURNING id INTO v_tag;

    INSERT INTO toll.tag_topups (
      organization_id, tag_account_id, amount_minor, topped_up_on, week_key, source_ref
    ) VALUES (
      p_org, v_tag, v_amt, p_week, p_week, 'toll-nightly-topup-' || p_suffix
    ) RETURNING id INTO v_top;

    PERFORM toll_system.post(p_org, 'P1_tag_topup', v_amt, p_eff, 'toll-nightly-p1-' || p_suffix, 1,
      jsonb_build_object('tag_topup_id', v_top::text));

    INSERT INTO toll.charges (
      organization_id, occurred_at, week_key, time_precision, amount_minor,
      paid_by, source, source_ref, evidence_status, driver_id
    ) VALUES (
      p_org, p_eff, p_week, 'exact', v_amt,
      'tag', 'manual', 'toll-nightly-ch-' || p_suffix, 'verified', 'driver-nightly-1'
    ) RETURNING id INTO v_ch;

    PERFORM toll_system.post(p_org, 'P2_tag_crossing', v_amt, p_eff, 'toll-nightly-p2-' || p_suffix, 1,
      jsonb_build_object('charge_id', v_ch::text));

    INSERT INTO toll.paybacks (
      organization_id, platform, kind, reference, paid_on, week_key,
      amount_minor, received_by
    ) VALUES (
      p_org, 'uber', 'trip_line', 'toll-nightly-pb-' || p_suffix, p_week, p_week, v_amt, 'fleet'
    ) RETURNING id INTO v_pb;

    PERFORM toll_system.post(p_org, 'P4_payback_fleet', v_amt, p_eff, 'toll-nightly-p4-' || p_suffix, 1,
      jsonb_build_object('payback_id', v_pb::text));

    INSERT INTO toll.allocations (
      organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
    ) VALUES (
      p_org, v_ch, 'platform', v_amt, v_pb, 'nightly-clean', p_decision
    ) RETURNING id INTO v_al;

    v_refs := jsonb_build_object('charge_id', v_ch::text, 'payback_id', v_pb::text);
    PERFORM toll_system.post(p_org, 'P6_allocate_platform', v_amt, p_eff, 'toll-nightly-p6-' || p_suffix, 1, v_refs);
  END;
  $cb$;

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
      'charge_id', p_charge::text,
      'payback_id', p_orig_pb::text,
      'reversing_payback_id', p_rev_pb::text
    );
    PERFORM toll_system.post(p_org, 'P6_allocate_platform', p_amt, p_eff, p_cmd, 1, v_refs, true);

    v_refs := jsonb_build_object(
      'payback_id', p_orig_pb::text,
      'reversing_payback_id', p_rev_pb::text
    );
    PERFORM toll_system.post(p_org, 'P4_payback_fleet', p_amt, p_eff, p_cmd, 2, v_refs, true);
  END;
  $p17$;

  -- 1. Clean books pass
  v_week := v_week0 + 7 * 1;
  v_ev := v_week::timestamptz + time '12:00';
  PERFORM pg_temp._nightly_clean_books(v_org_a, v_week, v_ev, v_decision_id, 'clean1');
  PERFORM pg_temp._nightly_all_ok(v_org_a);

  -- 2. Planted breaks
  -- 2a allocation without posting
  v_week := v_week0 + 7 * 2;
  v_ev := v_week::timestamptz + time '12:00';
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amount,
    'tag', 'manual', 'toll-nightly-brk-alloc', 'verified', 'driver-nightly-1'
  ) RETURNING id INTO v_charge;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_amount, v_ev, 'toll-nightly-brk-alloc-p2', 1,
    jsonb_build_object('charge_id', v_charge::text));
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-nightly-brk-pb', v_week, v_week, v_amount, 'fleet'
  ) RETURNING id INTO v_payback;
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (
    v_org_a, v_charge, 'platform', v_amount, v_payback, 'planted', v_decision_id
  );
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 2, 'allocations_posted', false);
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 1, 'account:toll:suspense', false);

  -- 2b charge without P2
  v_week := v_week0 + 7 * 3;
  v_ev := v_week::timestamptz + time '12:00';
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amount,
    'tag', 'manual', 'toll-nightly-brk-ch', 'verified', 'driver-nightly-1'
  );
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 2, 'charge_posted', false);

  -- 2c payback without P4
  v_week := v_week0 + 7 * 4;
  v_ev := v_week::timestamptz + time '12:00';
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-nightly-brk-pb2', v_week, v_week, v_amount, 'fleet'
  );
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 2, 'payback_posted', false);

  -- 3. week_flow (check 3) — four cases
  -- 3a same-week take-back
  v_week := v_week0 + 7 * 10;
  v_ev := v_week::timestamptz + time '12:00';
  INSERT INTO toll.tag_accounts (organization_id, provider, account_ref)
  VALUES (v_org_a, 'test', 'toll-nightly-wf-a') RETURNING id INTO v_tag_acct;
  INSERT INTO toll.tag_topups (
    organization_id, tag_account_id, amount_minor, topped_up_on, week_key, source_ref
  ) VALUES (v_org_a, v_tag_acct, v_amount, v_week, v_week, 'toll-nightly-wf-tu-a')
  RETURNING id INTO v_topup;
  PERFORM toll_system.post(v_org_a, 'P1_tag_topup', v_amount, v_ev, 'toll-nightly-wf-p1-a', 1,
    jsonb_build_object('tag_topup_id', v_topup::text));
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amount,
    'tag', 'manual', 'toll-nightly-wf-ch-a', 'verified', 'driver-nightly-1'
  ) RETURNING id INTO v_charge;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_amount, v_ev, 'toll-nightly-wf-p2-a', 1,
    jsonb_build_object('charge_id', v_charge::text));
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-nightly-wf-y', v_week, v_week, v_amount, 'fleet'
  ) RETURNING id INTO v_payback_y;
  PERFORM toll_system.post(v_org_a, 'P4_payback_fleet', v_amount, v_ev, 'toll-nightly-wf-p4-y', 1,
    jsonb_build_object('payback_id', v_payback_y::text));
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (v_org_a, v_charge, 'platform', v_amount, v_payback_y, 'wf', v_decision_id)
  RETURNING id INTO v_alloc;
  PERFORM toll_system.post(v_org_a, 'P6_allocate_platform', v_amount, v_ev, 'toll-nightly-wf-p6-a', 1,
    jsonb_build_object('charge_id', v_charge::text, 'payback_id', v_payback_y::text));
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by, reversal_of
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-nightly-wf-z', v_week, v_week, v_amount, 'fleet', v_payback_y
  ) RETURNING id INTO v_payback_z;
  PERFORM pg_temp._p17_takeback(
    v_org_a, v_payback_y, v_payback_z, v_charge, v_alloc, v_amount, v_ev, 'toll-nightly-wf-p17-a'
  );
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 3, 'week_flow:' || v_week::text, true);

  -- 3b cross-week take-back
  v_week := v_week0 + 7 * 11;
  v_week2 := v_week + 7;
  v_ev := v_week::timestamptz + time '12:00';
  v_ev2 := v_week2::timestamptz + time '12:00';
  INSERT INTO toll.tag_accounts (organization_id, provider, account_ref)
  VALUES (v_org_a, 'test', 'toll-nightly-wf-b') RETURNING id INTO v_tag_acct;
  INSERT INTO toll.tag_topups (
    organization_id, tag_account_id, amount_minor, topped_up_on, week_key, source_ref
  ) VALUES (v_org_a, v_tag_acct, v_amount, v_week, v_week, 'toll-nightly-wf-tu-b')
  RETURNING id INTO v_topup;
  PERFORM toll_system.post(v_org_a, 'P1_tag_topup', v_amount, v_ev, 'toll-nightly-wf-p1-b', 1,
    jsonb_build_object('tag_topup_id', v_topup::text));
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amount,
    'tag', 'manual', 'toll-nightly-wf-ch-b', 'verified', 'driver-nightly-1'
  ) RETURNING id INTO v_charge;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_amount, v_ev, 'toll-nightly-wf-p2-b', 1,
    jsonb_build_object('charge_id', v_charge::text));
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-nightly-wf-y-b', v_week, v_week, v_amount, 'fleet'
  ) RETURNING id INTO v_payback_y;
  PERFORM toll_system.post(v_org_a, 'P4_payback_fleet', v_amount, v_ev, 'toll-nightly-wf-p4-y-b', 1,
    jsonb_build_object('payback_id', v_payback_y::text));
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id
  ) VALUES (v_org_a, v_charge, 'platform', v_amount, v_payback_y, 'wf', v_decision_id)
  RETURNING id INTO v_alloc;
  PERFORM toll_system.post(v_org_a, 'P6_allocate_platform', v_amount, v_ev, 'toll-nightly-wf-p6-b', 1,
    jsonb_build_object('charge_id', v_charge::text, 'payback_id', v_payback_y::text));
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by, reversal_of
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-nightly-wf-z-b', v_week2, v_week2, v_amount, 'fleet', v_payback_y
  ) RETURNING id INTO v_payback_z;
  PERFORM pg_temp._p17_takeback(
    v_org_a, v_payback_y, v_payback_z, v_charge, v_alloc, v_amount, v_ev2, 'toll-nightly-wf-p17-b'
  );
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 3, 'week_flow:' || v_week::text, true);
  SELECT (c.detail ->> 'suspense_expected')::bigint INTO v_nat
  FROM toll_system.nightly_checks(v_org_a) c
  WHERE c.check_no = 3 AND c.name = 'week_flow:' || v_week::text;
  IF v_nat IS DISTINCT FROM v_amount THEN
    RAISE EXCEPTION 'test3b: suspense_expected want % got %', v_amount, v_nat;
  END IF;
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 3, 'week_flow:' || v_week2::text, true);

  -- 3c week move
  v_week := v_week0 + 7 * 12;
  v_week2 := v_week + 7;
  v_ev := v_week::timestamptz + time '12:00';
  v_ev2 := v_week2::timestamptz + time '12:00';
  INSERT INTO toll.tag_accounts (organization_id, provider, account_ref)
  VALUES (v_org_a, 'test', 'toll-nightly-wf-c') RETURNING id INTO v_tag_acct;
  INSERT INTO toll.tag_topups (
    organization_id, tag_account_id, amount_minor, topped_up_on, week_key, source_ref
  ) VALUES (v_org_a, v_tag_acct, v_amount, v_week, v_week, 'toll-nightly-wf-tu-c')
  RETURNING id INTO v_topup;
  PERFORM toll_system.post(v_org_a, 'P1_tag_topup', v_amount, v_ev, 'toll-nightly-wf-p1-c', 1,
    jsonb_build_object('tag_topup_id', v_topup::text));
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amount,
    'tag', 'manual', 'toll-nightly-wf-ch-c', 'verified', 'driver-nightly-1'
  ) RETURNING id INTO v_charge;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_amount, v_ev, 'toll-nightly-wf-p2-c', 1,
    jsonb_build_object('charge_id', v_charge::text));
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, reason, decision_id
  ) VALUES (v_org_a, v_charge, 'fleet', v_amount, 'wf-fleet', v_decision_id)
  RETURNING id INTO v_alloc;
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', v_amount, v_ev, 'toll-nightly-wf-p8-c', 1,
    jsonb_build_object('charge_id', v_charge::text));
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_amount, v_ev, 'toll-nightly-wf-p2c-rev', 1,
    jsonb_build_object('charge_id', v_charge::text), true);
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', v_amount, v_ev, 'toll-nightly-wf-p8c-rev', 1,
    jsonb_build_object('charge_id', v_charge::text), true);
  UPDATE toll.charges
  SET week_key = v_week2, occurred_at = v_ev2
  WHERE organization_id = v_org_a AND id = v_charge;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_amount, v_ev2, 'toll-nightly-wf-p2-c2', 1,
    jsonb_build_object('charge_id', v_charge::text));
  PERFORM toll_system.post(v_org_a, 'P8_allocate_fleet', v_amount, v_ev2, 'toll-nightly-wf-p8-c2', 1,
    jsonb_build_object('charge_id', v_charge::text));
  IF NOT (
    SELECT c.ok AND (c.detail ->> 'suspense_flow')::bigint = 0
      AND (c.detail ->> 'suspense_expected')::bigint = 0
      AND (c.detail ->> 'unallocated_flow')::bigint = 0
      AND (c.detail ->> 'unallocated_expected')::bigint = 0
    FROM toll_system.nightly_checks(v_org_a) c
    WHERE c.check_no = 3 AND c.name = 'week_flow:' || v_week::text
  ) THEN
    RAISE EXCEPTION 'test3c: week % should show zero flows after charge move', v_week;
  END IF;
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 3, 'week_flow:' || v_week2::text, true);

  -- 3d amount correction
  v_week := v_week0 + 7 * 13;
  v_ev := v_week::timestamptz + time '12:00';
  INSERT INTO toll.tag_accounts (organization_id, provider, account_ref)
  VALUES (v_org_a, 'test', 'toll-nightly-wf-d') RETURNING id INTO v_tag_acct;
  INSERT INTO toll.tag_topups (
    organization_id, tag_account_id, amount_minor, topped_up_on, week_key, source_ref
  ) VALUES (v_org_a, v_tag_acct, v_amount, v_week, v_week, 'toll-nightly-wf-tu-d')
  RETURNING id INTO v_topup;
  PERFORM toll_system.post(v_org_a, 'P1_tag_topup', v_amount, v_ev, 'toll-nightly-wf-p1-d', 1,
    jsonb_build_object('tag_topup_id', v_topup::text));
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amount,
    'tag', 'manual', 'toll-nightly-wf-ch-d', 'verified', 'driver-nightly-1'
  ) RETURNING id INTO v_charge;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_amount, v_ev, 'toll-nightly-wf-p2-d', 1,
    jsonb_build_object('charge_id', v_charge::text));
  PERFORM toll_system.post(v_org_a, 'P16_down_tag', v_d, v_ev, 'toll-nightly-wf-p16-d', 1,
    jsonb_build_object('charge_id', v_charge::text));
  UPDATE toll.charges SET amount_minor = v_amount - v_d WHERE organization_id = v_org_a AND id = v_charge;
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 3, 'week_flow:' || v_week::text, true);

  -- 4. Check 4 sealed week
  v_week := v_week0 + 7 * 20;
  v_ev := v_week::timestamptz + time '12:00';
  PERFORM pg_temp._toll_nightly_as(v_owner, v_org_a);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-nightly-seal-4',
    'week_key', v_week,
    'expected_week_version', 0
  ));
  RESET ROLE;
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 4, 'sealed_week:' || v_week::text, true);
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amount,
    'tag', 'manual', 'toll-nightly-seal-live', 'verified', 'driver-nightly-1'
  ) RETURNING id INTO v_charge;
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 4, 'sealed_week:' || v_week::text, false);

  -- 5. Check 5 after_seal
  v_week := v_week0 + 7 * 21;
  v_ev := v_week::timestamptz + time '12:00';
  PERFORM pg_temp._toll_nightly_as(v_owner, v_org_a);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-nightly-seal-5',
    'week_key', v_week,
    'expected_week_version', 0
  ));
  RESET ROLE;
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, after_seal, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amount,
    'tag', 'manual', 'toll-nightly-as-ok', 'verified', true, 'driver-nightly-1'
  ) RETURNING id INTO v_charge;
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 5, 'after_seal:' || v_week::text, true);
  SELECT (c.detail ->> 'count')::int, (c.detail ->> 'sum')::bigint
  INTO v_cnt, v_nat
  FROM toll_system.nightly_checks(v_org_a) c
  WHERE c.check_no = 5 AND c.name = 'after_seal:' || v_week::text;
  IF v_cnt <> 1 OR v_nat <> v_amount THEN
    RAISE EXCEPTION 'test5: after_seal count/sum want 1/% got %/%', v_amount, v_cnt, v_nat;
  END IF;

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, after_seal, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amount,
    'tag', 'manual', 'toll-nightly-as-bad', 'verified', true, 'driver-nightly-1'
  ) RETURNING id INTO v_charge;
  PERFORM set_config('toll.writer', 'on', true);
  PERFORM ledger.post_entry(
    p_idempotency_key := 'toll-nightly-as-direct',
    p_entry_type := 'toll_v2:test',
    p_debit_account_key := 'org:' || v_org_a::text || ':toll:suspense',
    p_credit_account_key := 'org:' || v_org_a::text || ':toll:tag_prepaid',
    p_amount_minor := v_amount,
    p_currency := 'JMD',
    p_request_hash := md5('toll-nightly-as-direct'),
    p_organization_id := v_org_a,
    p_product := 'roam_fleet',
    p_effective_at := v_ev,
    p_reference_type := 'toll',
    p_reference_id := v_charge::text,
    p_metadata := jsonb_build_object('toll_rule', 'P2_tag_crossing', 'charge_id', v_charge::text, 'reverse', false)
  );
  PERFORM set_config('toll.writer', 'off', true);
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 5, 'after_seal:' || v_week::text, false);

  v_week := v_week0 + 7 * 22;
  v_ev := v_week::timestamptz + time '12:00';
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, after_seal, driver_id
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amount,
    'tag', 'manual', 'toll-nightly-as-open', 'verified', true, 'driver-nightly-1'
  );
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 5, 'after_seal:' || v_week::text, false);

  -- 6. Payout trigger and check 7
  v_week := v_week0 + 7 * 30;
  v_ev := v_week::timestamptz + time '12:00';
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-nightly-payout-pb', v_week, v_week, v_amount, 'fleet'
  ) RETURNING id INTO v_payback;
  PERFORM toll_system.post(v_org_a, 'P4_payback_fleet', v_amount, v_ev, 'toll-nightly-payout-p4', 1,
    jsonb_build_object('payback_id', v_payback::text));
  v_key := 'fleet_bank_confirm:org:' || v_org_a::text || ':' || v_week::text || ':uber';
  v_val := jsonb_build_object('organizationId', v_org_a::text, 'amountMinor', v_amount);

  INSERT INTO public.kv_store_37f42386 (key, value) VALUES (v_key, v_val);
  SELECT count(*) INTO v_cnt FROM ledger.entries e
  WHERE e.organization_id = v_org_a AND e.metadata ->> 'toll_rule' LIKE 'P10\_%' ESCAPE '\'
    AND (e.metadata ->> 'reverse')::boolean IS NOT TRUE;
  IF v_cnt < 1 THEN
    RAISE EXCEPTION 'test6: P10 not posted on save';
  END IF;
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 7, 'payout:' || v_key, true);

  v_val := v_val || jsonb_build_object('note', 'changed');
  UPDATE public.kv_store_37f42386 SET value = v_val WHERE key = v_key;
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 7, 'payout:' || v_key, true);

  DELETE FROM public.kv_store_37f42386 WHERE key = v_key;
  SELECT count(*) INTO v_cnt FROM toll.payout_postings pp
  WHERE pp.organization_id = v_org_a AND pp.source_ref = v_key AND pp.reversed_at IS NULL;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'test6: expected payout posting reversed on delete';
  END IF;
  IF EXISTS (
    SELECT 1 FROM toll_system.nightly_checks(v_org_a) c
    WHERE c.check_no = 7 AND c.name LIKE 'payout_deleted:' || v_key
  ) THEN
    RAISE EXCEPTION 'test6: check 7 should be clean after delete';
  END IF;

  v_key := 'fleet_bank_confirm:org:' || v_org_a::text || ':' || v_week::text || ':indrive';
  v_val := jsonb_build_object('organizationId', v_org_b::text);
  INSERT INTO public.kv_store_37f42386 (key, value) VALUES (v_key, v_val);
  IF EXISTS (
    SELECT 1 FROM toll.payout_postings pp
    WHERE pp.organization_id = v_org_a AND pp.source_ref = v_key AND pp.reversed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'test6: mismatch key should not post';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.alerts a
    WHERE a.organization_id = v_org_a AND a.resolved_at IS NULL
      AND a.dedupe_key = 'payout_key_mismatch:' || v_key
  ) THEN
    RAISE EXCEPTION 'test6: missing payout_key_mismatch alert';
  END IF;
  DELETE FROM public.kv_store_37f42386 WHERE key = v_key;

  v_week2 := v_week0 + 7 * 31;
  v_key := 'fleet_bank_confirm:org:' || v_org_b::text || ':' || v_week2::text || ':uber';
  v_val := jsonb_build_object('organizationId', v_org_b::text);
  INSERT INTO public.kv_store_37f42386 (key, value) VALUES (v_key, v_val);
  IF EXISTS (
    SELECT 1 FROM toll.payout_postings pp WHERE pp.organization_id = v_org_b AND pp.source_ref = v_key
  ) THEN
    RAISE EXCEPTION 'test6: org B v2 off should not post';
  END IF;
  DELETE FROM public.kv_store_37f42386 WHERE key = v_key;

  v_key := 'fleet_bank_confirm:org:' || v_org_a::text || ':' || v_week::text;
  INSERT INTO public.kv_store_37f42386 (key, value)
  VALUES (v_key, jsonb_build_object('organizationId', v_org_a::text));
  IF EXISTS (
    SELECT 1 FROM toll.payout_postings pp WHERE pp.organization_id = v_org_a AND pp.source_ref = v_key
  ) THEN
    RAISE EXCEPTION 'test6: legacy key without platform should be ignored';
  END IF;
  DELETE FROM public.kv_store_37f42386 WHERE key = v_key;

  -- 7. Self-heal
  v_week := v_week0 + 7 * 32;
  v_ev := v_week::timestamptz + time '12:00';
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org_a, 'roam', 'trip_line', 'toll-nightly-heal-pb', v_week, v_week, v_amount, 'fleet'
  ) RETURNING id INTO v_payback;
  PERFORM toll_system.post(v_org_a, 'P4_payback_fleet', v_amount, v_ev, 'toll-nightly-heal-p4', 1,
    jsonb_build_object('payback_id', v_payback::text));
  v_key := 'fleet_bank_confirm:org:' || v_org_a::text || ':' || v_week::text || ':roam';
  v_val := jsonb_build_object('organizationId', v_org_a::text);

  ALTER TABLE public.kv_store_37f42386 DISABLE TRIGGER toll_kv_bank_confirm_upsert;
  INSERT INTO public.kv_store_37f42386 (key, value) VALUES (v_key, v_val);
  ALTER TABLE public.kv_store_37f42386 ENABLE TRIGGER toll_kv_bank_confirm_upsert;

  PERFORM pg_temp._nightly_expect_fail(v_org_a, 7, 'payout:' || v_key, false);
  PERFORM toll_system.nightly_run();
  PERFORM pg_temp._nightly_expect_fail(v_org_a, 7, 'payout:' || v_key, true);
  IF NOT EXISTS (
    SELECT 1 FROM toll.alerts a
    WHERE a.organization_id = v_org_a AND a.resolved_at IS NULL
      AND a.dedupe_key = 'payout_healed:' || v_key
  ) THEN
    RAISE EXCEPTION 'test7: missing payout_healed alert';
  END IF;

  -- 8. Aging
  v_week := v_week0 + 7 * 40;
  v_ev := v_week::timestamptz + time '12:00';
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id, created_at
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amount,
    'tag', 'manual', 'toll-nightly-age-pend', 'verified', 'driver-nightly-1',
    now() - interval '15 days'
  ) RETURNING id INTO v_charge;
  PERFORM toll_system.post(v_org_a, 'P2_tag_crossing', v_amount, v_ev, 'toll-nightly-age-p2', 1,
    jsonb_build_object('charge_id', v_charge::text));
  PERFORM toll_system.aging_alerts(v_org_a);
  IF NOT EXISTS (
    SELECT 1 FROM toll.alerts a
    WHERE a.organization_id = v_org_a AND a.dedupe_key = 'aging:charge:' || v_charge::text
      AND a.severity = 'watch' AND a.resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'test8: missing pending charge aging alert';
  END IF;

  v_week := v_week0 + 7 * 41;
  v_ev := v_week::timestamptz + time '12:00';
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, driver_id, created_at
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amount,
    'cash', 'driver_cash', 'toll-nightly-age-cash', 'unverified', 'driver-nightly-1',
    now() - interval '8 days'
  ) RETURNING id INTO v_charge;
  PERFORM toll_system.aging_alerts(v_org_a);
  IF NOT EXISTS (
    SELECT 1 FROM toll.alerts a
    WHERE a.organization_id = v_org_a AND a.dedupe_key = 'aging:charge:' || v_charge::text
      AND a.resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'test8: missing unverified cash aging alert';
  END IF;

  v_week := v_week0 + 7 * 42;
  v_ev := v_week::timestamptz + time '12:00';
  PERFORM pg_temp._toll_nightly_as(v_owner, v_org_a);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-nightly-seal-age',
    'week_key', v_week,
    'expected_week_version', 0
  ));
  RESET ROLE;
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key,
    amount_minor, received_by, after_seal, created_at, reversal_of
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-nightly-age-rev-orig', v_week, v_week,
    v_amount, 'fleet', true, now() - interval '20 days', NULL
  ) RETURNING id INTO v_payback_y;
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key,
    amount_minor, received_by, after_seal, created_at, reversal_of
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-nightly-age-rev', v_week, v_week,
    v_amount, 'fleet', true, now() - interval '8 days', v_payback_y
  ) RETURNING id INTO v_payback_z;
  PERFORM toll_system.aging_alerts(v_org_a);
  IF NOT EXISTS (
    SELECT 1 FROM toll.alerts a
    WHERE a.organization_id = v_org_a AND a.dedupe_key = 'aging:after_seal:' || v_payback_z::text
      AND a.severity = 'page' AND a.resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'test8: missing after_seal reversing payback page alert';
  END IF;

  v_week := v_week0 + 7 * 43;
  v_ev := v_week::timestamptz + time '12:00';
  PERFORM pg_temp._toll_nightly_as(v_owner, v_org_a);
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', 'toll-nightly-seal-age-ch',
    'week_key', v_week,
    'expected_week_version', 0
  ));
  RESET ROLE;
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, evidence_status, after_seal, driver_id, created_at
  ) VALUES (
    v_org_a, v_ev, v_week, 'exact', v_amount,
    'tag', 'manual', 'toll-nightly-age-as-ch', 'verified', true, 'driver-nightly-1',
    now() - interval '8 days'
  ) RETURNING id INTO v_charge;
  PERFORM toll_system.aging_alerts(v_org_a);
  IF EXISTS (
    SELECT 1 FROM toll.alerts a
    WHERE a.organization_id = v_org_a AND a.dedupe_key = 'aging:after_seal:' || v_charge::text
      AND a.resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'test8: after_seal charge 8d should not alert yet';
  END IF;
  UPDATE toll.charges SET created_at = now() - interval '15 days'
  WHERE organization_id = v_org_a AND id = v_charge;
  PERFORM toll_system.aging_alerts(v_org_a);
  IF NOT EXISTS (
    SELECT 1 FROM toll.alerts a
    WHERE a.organization_id = v_org_a AND a.dedupe_key = 'aging:after_seal:' || v_charge::text
      AND a.resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'test8: after_seal charge 15d should alert';
  END IF;

  v_week := v_week0 + 7 * 44;
  v_ev := v_week::timestamptz + time '12:00';
  UPDATE toll.switch_state SET tolls_v2 = true WHERE organization_id = v_org_b;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org_b, 'toll-nightly-age-b', 'fixture', 'user')
  RETURNING id INTO v_decision2;
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org_b, 'uber', 'trip_line', 'toll-nightly-age-cred', v_week, v_week, v_amount, 'fleet'
  ) RETURNING id INTO v_payback_y;
  PERFORM toll_system.post(v_org_b, 'P4_payback_fleet', v_amount, v_ev, 'toll-nightly-age-cred-p4', 1,
    jsonb_build_object('payback_id', v_payback_y::text));
  PERFORM toll_system.post(v_org_b, 'P10_payout_confirmed', v_amount + 1, v_ev, 'toll-nightly-age-cred-p10', 1,
    jsonb_build_object('payout_ref', 'toll-nightly-age-cred-over'));
  PERFORM toll_system.post(v_org_b, 'P11_payout_deposited', v_amount + 1, v_ev, 'toll-nightly-age-cred-p10', 2,
    jsonb_build_object('payout_ref', 'toll-nightly-age-cred-over'));
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by, reversal_of
  ) VALUES (
    v_org_b, 'uber', 'trip_line', 'toll-nightly-age-cred-rev', v_week, v_week, v_amount, 'fleet', v_payback_y
  ) RETURNING id INTO v_payback_z;
  PERFORM toll_system.post(v_org_b, 'P4_payback_fleet', v_amount, v_ev, 'toll-nightly-age-cred-p17', 1,
    jsonb_build_object('payback_id', v_payback_y::text, 'reversing_payback_id', v_payback_z::text), true);
  IF toll_system.natural_balance(v_org_b, 'toll:receivable_platform') >= 0 THEN
    RAISE EXCEPTION 'test8: receivable_platform should be in credit before aging (got %)',
      toll_system.natural_balance(v_org_b, 'toll:receivable_platform');
  END IF;
  PERFORM toll_system.aging_alerts(v_org_b);
  IF NOT EXISTS (
    SELECT 1 FROM toll.alerts a
    WHERE a.organization_id = v_org_b AND a.dedupe_key = 'aging:receivable_platform_credit'
      AND a.severity = 'watch' AND a.resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'test8: missing receivable_platform_credit watch alert';
  END IF;
  UPDATE toll.alerts SET created_at = now() - interval '31 days'
  WHERE organization_id = v_org_b AND dedupe_key = 'aging:receivable_platform_credit' AND resolved_at IS NULL;
  PERFORM toll_system.aging_alerts(v_org_b);
  IF NOT EXISTS (
    SELECT 1 FROM toll.alerts a
    WHERE a.organization_id = v_org_b AND a.dedupe_key = 'aging:receivable_platform_credit'
      AND a.severity = 'page' AND a.resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'test8: receivable_platform_credit should page after 30 days';
  END IF;
  UPDATE toll.switch_state SET tolls_v2 = false WHERE organization_id = v_org_b;

  -- 9. Nightly run results + alert resolve + append-only
  FOR v_row IN
    SELECT p.id, p.week_key, p.amount_minor, p.received_by
    FROM toll.paybacks p
    WHERE p.organization_id = v_org_a AND NOT p.is_legacy AND NOT p.after_seal AND p.reversal_of IS NULL
      AND NOT EXISTS (SELECT 1 FROM toll.paybacks r WHERE r.organization_id = v_org_a AND r.reversal_of = p.id)
      AND toll_system.rule_net(v_org_a, 'P4\_%', 'payback_id', p.id::text)
        + toll_system.rule_net(v_org_a, 'P5\_%', 'payback_id', p.id::text) = 0
  LOOP
    PERFORM toll_system.post(
      v_org_a,
      CASE WHEN v_row.received_by = 'driver' THEN 'P5_payback_driver' ELSE 'P4_payback_fleet' END,
      v_row.amount_minor, (v_row.week_key::timestamptz + time '12:00'),
      'toll-nightly-run-prefix-' || (v_row.id)::text, 1,
      jsonb_build_object('payback_id', (v_row.id)::text)
    );
  END LOOP;

  v_week := v_week0 + 7 * 50;
  v_ev := v_week::timestamptz + time '12:00';
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org_a, 'indrive', 'trip_line', 'toll-nightly-run-pb', v_week, v_week, v_amount, 'fleet'
  ) RETURNING id INTO v_payback;

  PERFORM toll_system.nightly_run();
  SELECT count(*) INTO v_cnt FROM toll.nightly_results WHERE organization_id = v_org_a;
  IF v_cnt < 1 THEN
    RAISE EXCEPTION 'test9: nightly_results should have rows for A';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.alerts a
    WHERE a.organization_id = v_org_a AND a.kind = 'nightly_check' AND a.severity = 'page'
      AND a.resolved_at IS NULL
      AND a.dedupe_key LIKE 'check2:payback_posted'
  ) THEN
    RAISE EXCEPTION 'test9: expected open page alert for planted payback_posted failure';
  END IF;

  PERFORM toll_system.post(v_org_a, 'P4_payback_fleet', v_amount, v_ev, 'toll-nightly-run-fix', 1,
    jsonb_build_object('payback_id', v_payback::text));
  PERFORM toll_system.nightly_run();
  IF EXISTS (
    SELECT 1 FROM toll.alerts a
    WHERE a.organization_id = v_org_a AND a.dedupe_key LIKE 'check2:payback_posted'
      AND a.resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'test9: payback_posted alert should be resolved after fix';
  END IF;

  v_caught := false;
  BEGIN
    UPDATE toll.nightly_results SET ok = false WHERE organization_id = v_org_a;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'test9: UPDATE on nightly_results should fail';
  END IF;
  v_caught := false;
  BEGIN
    DELETE FROM toll.nightly_results WHERE organization_id = v_org_a;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'test9: DELETE on nightly_results should fail';
  END IF;

  -- 10. Plaza rules
  PERFORM toll_system.set_plaza_rule(v_plaza, 30, 'same_day', v_plat_owner);
  IF NOT EXISTS (
    SELECT 1 FROM toll.plaza_rules r WHERE r.plaza_id = v_plaza AND r.auto_duplicate_window_minutes = 30
  ) THEN
    RAISE EXCEPTION 'test10: plaza rule not saved';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.audit_log al
    WHERE al.table_name = 'toll.plaza_rules' AND al.row_key = v_plaza AND al.actor_user_id = v_plat_owner
  ) THEN
    RAISE EXCEPTION 'test10: plaza audit row missing';
  END IF;

  v_caught := false;
  BEGIN
    PERFORM toll_system.set_plaza_rule(v_plaza, 15, 'same_day', v_plain_user);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE '%FORBIDDEN%' THEN v_caught := true; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'test10: non-owner must get FORBIDDEN';
  END IF;

  v_caught := false;
  BEGIN
    PERFORM toll_system.set_plaza_rule(v_plaza, -1, 'same_day', v_plat_owner);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE '%BAD_REQUEST%' THEN v_caught := true; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'test10: negative window must get BAD_REQUEST';
  END IF;

  -- 11. Cron
  IF NOT EXISTS (
    SELECT 1 FROM cron.job j
    WHERE j.jobname = 'toll-v2-nightly' AND j.command LIKE '%toll_system.nightly_run()%'
  ) THEN
    RAISE EXCEPTION 'test11: cron job toll-v2-nightly missing';
  END IF;

  -- 12. Grants and RLS on alerts
  RESET ROLE;
  IF has_function_privilege('authenticated', v_fn_nightly_checks, 'EXECUTE')
    OR has_function_privilege('anon', v_fn_nightly_checks, 'EXECUTE') THEN
    RAISE EXCEPTION 'test12: anon/authenticated must not EXECUTE nightly_checks';
  END IF;
  IF has_function_privilege('authenticated', v_fn_nightly_run, 'EXECUTE')
    OR has_function_privilege('anon', v_fn_nightly_run, 'EXECUTE') THEN
    RAISE EXCEPTION 'test12: anon/authenticated must not EXECUTE nightly_run';
  END IF;
  IF has_function_privilege('authenticated', v_fn_payout_received, 'EXECUTE')
    OR has_function_privilege('anon', v_fn_payout_received, 'EXECUTE') THEN
    RAISE EXCEPTION 'test12: anon/authenticated must not EXECUTE payout_received';
  END IF;
  IF has_function_privilege('authenticated', v_fn_set_plaza, 'EXECUTE')
    OR has_function_privilege('anon', v_fn_set_plaza, 'EXECUTE') THEN
    RAISE EXCEPTION 'test12: anon/authenticated must not EXECUTE set_plaza_rule';
  END IF;

  INSERT INTO toll.alerts (organization_id, kind, severity, dedupe_key, title, detail)
  VALUES
    (v_org_a, 'aging', 'watch', 'toll-nightly-rls-a', 'a', '{}'::jsonb),
    (v_org_b, 'aging', 'watch', 'toll-nightly-rls-b', 'b', '{}'::jsonb);

  PERFORM pg_temp._toll_nightly_as(v_owner, v_org_a);
  SELECT count(*) INTO v_cnt FROM toll.alerts WHERE dedupe_key LIKE 'toll-nightly-rls-%';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'test12: authenticated A should see 1 alert, got %', v_cnt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM toll.alerts WHERE dedupe_key = 'toll-nightly-rls-a') THEN
    RAISE EXCEPTION 'test12: should see org A alert only';
  END IF;
  RESET ROLE;

  RAISE NOTICE 'toll_v2_nightly: ok';
END;
$$;

ROLLBACK;

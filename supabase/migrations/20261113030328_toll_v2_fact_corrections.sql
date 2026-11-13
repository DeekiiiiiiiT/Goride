-- Toll rebuild Phase 2 P2-R4b: decisions that change the facts (design B3, B5 P15-P17, PB2, PB4, C3; Part F P2-R4).
--
--   reverse_payback        the platform took a payback back (P17)        a reversing payback; the original's slices
--                                                                        and unlinked rows reversed; P6 and P4/P5 reversed
--   correct_charge_amount  a charge's amount was wrong (P16)             up: the charge is pending for the difference;
--                                                                        down below its slices: the slices shrink in
--                                                                        proportion first (C3), then P16
--   correct_charge_week    a charge's time / week was wrong (PB2)        its rows reversed in the old week and posted
--                                                                        again in the new week; its slices move with it
-- carry_forward (P18-P20, late facts against a paid week) is P2-R4c: it needs a counted week for paybacks too.
--
-- Decisions made here (one each):
--   * A take-back reverses the WHOLE payback. A partial take-back is refused (PARTIAL_TAKE_BACK): B2 makes a
--     reversed payback final, and no partial take-back exists in the data (Phase 2 live look: 0 negative adjustments).
--   * Slices reversed by a take-back carry reversed_by = the reversing payback's id (the Phase 1 test convention),
--     so the nightly check can tell "taken back by the platform" from "undone by a person" (reversed_by = decision).
--   * A person's command on a sealed week gets WEEK_SEALED (B3); the paid-week path is carry_forward (R4c).
--   * Check 3 is corrected for a take-back in a LATER open week of a payback with a leftover (PB4: the original week
--     keeps its figures; the take-back week shows it). The old line expected the leftover to vanish from the
--     original week, which would raise a false alarm on correct postings. Nothing else in the checks changes.

-- 1. Proportional reduction of a charge's slices (C3) ---------------------------------------------------------
-- Shrinks the active slices by p_short in proportion to each bearer's total: each share is rounded down, and the
-- cents left over go to the driver, then the fleet, then the platform. Within a bearer the newest slice shrinks
-- first: it is reversed and written again for what remains. Returns the last ledger line used.
CREATE OR REPLACE FUNCTION toll_system.reduce_allocations(p_company uuid, p_charge uuid, p_short bigint,
                                                         p_decision uuid, p_cmd text, p_line int)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_total bigint;
  v_share jsonb := '{}'::jsonb;
  v_sum   bigint := 0;
  v_left  bigint;
  v_t     bigint;
  v_s     bigint;
  v_cut   bigint;
  v_line  int := p_line;
  b       text;
  a       record;
BEGIN
  IF p_short <= 0 THEN RETURN v_line; END IF;
  SELECT coalesce(sum(x.amount_minor), 0) INTO v_total FROM toll.allocations x
  WHERE x.organization_id = p_company AND x.charge_id = p_charge AND x.reversed_by IS NULL;
  IF p_short > v_total THEN
    RAISE EXCEPTION 'TOLL_REDUCE_BEYOND_ALLOCATIONS: charge % short % allocated %', p_charge, p_short, v_total;
  END IF;

  FOREACH b IN ARRAY ARRAY['driver', 'fleet', 'platform'] LOOP
    SELECT coalesce(sum(x.amount_minor), 0) INTO v_t FROM toll.allocations x
    WHERE x.organization_id = p_company AND x.charge_id = p_charge AND x.reversed_by IS NULL AND x.bearer = b;
    v_s := (p_short * v_t) / v_total;                 -- non-negative integers: rounds down
    v_share := v_share || jsonb_build_object(b, v_s);
    v_sum := v_sum + v_s;
  END LOOP;
  v_left := p_short - v_sum;
  FOREACH b IN ARRAY ARRAY['driver', 'fleet', 'platform'] LOOP
    EXIT WHEN v_left = 0;
    SELECT coalesce(sum(x.amount_minor), 0) INTO v_t FROM toll.allocations x
    WHERE x.organization_id = p_company AND x.charge_id = p_charge AND x.reversed_by IS NULL AND x.bearer = b;
    v_s := (v_share ->> b)::bigint;
    v_cut := least(v_left, v_t - v_s);
    v_share := v_share || jsonb_build_object(b, v_s + v_cut);
    v_left := v_left - v_cut;
  END LOOP;

  FOREACH b IN ARRAY ARRAY['driver', 'fleet', 'platform'] LOOP
    v_s := (v_share ->> b)::bigint;
    FOR a IN
      SELECT x.id, x.amount_minor, x.payback_id, x.reason FROM toll.allocations x
      WHERE x.organization_id = p_company AND x.charge_id = p_charge AND x.reversed_by IS NULL AND x.bearer = b
      ORDER BY x.created_at DESC, x.id DESC
    LOOP
      EXIT WHEN v_s <= 0;
      v_cut := least(v_s, a.amount_minor);
      v_line := v_line + 1;
      PERFORM toll_system.reverse_allocation(p_company, a.id, p_decision, p_cmd, v_line);
      IF a.amount_minor - v_cut > 0 THEN
        v_line := v_line + 1;
        PERFORM toll_system.allocate(p_company, p_charge, b, a.amount_minor - v_cut, a.payback_id,
                                     coalesce(a.reason, b) || ':reduced', p_decision, p_cmd, v_line);
      END IF;
      v_s := v_s - v_cut;
    END LOOP;
  END LOOP;
  RETURN v_line;
END;
$$;

-- 2. reverse_payback (P17) ------------------------------------------------------------------------------------
-- Body: payback_id, expected_payback_version, reference (the platform's take-back reference), paid_on (the day it
-- arrived), amount_minor? (must equal the payback's amount), reason_code?. The take-back counts in the week it arrived.
CREATE OR REPLACE FUNCTION toll_write.intent_reverse_payback(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id       uuid := nullif(p_body ->> 'payback_id', '')::uuid;
  v_ref      text := nullif(btrim(p_body ->> 'reference'), '');
  v_paid_on  date := nullif(p_body ->> 'paid_on', '')::date;
  v_eff      timestamptz;
  v_rw       date;
  v_pw       date;
  v_weeks    date[];
  v_charges  uuid[];
  v_rev      uuid;
  v_line     int := 0;
  v_taken    bigint := 0;
  v_deltas   jsonb := '{}'::jsonb;
  v_versions jsonb := '{}'::jsonb;
  v_ver      bigint;
  v_amount   bigint;
  p          toll.paybacks%ROWTYPE;
  r          record;
BEGIN
  IF v_id IS NULL OR v_ref IS NULL OR v_paid_on IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('payback_id', 'reference', 'paid_on')));
  END IF;
  v_amount := toll_write.body_amount(p_body);
  v_eff := (v_paid_on + time '12:00') AT TIME ZONE 'America/Jamaica';
  v_rw := ledger.jamaica_week_start(v_eff);

  SELECT x.week_key INTO v_pw FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = v_id;
  v_charges := array(SELECT DISTINCT a.charge_id FROM toll.allocations a
                     WHERE a.organization_id = p_company AND a.payback_id = v_id AND a.reversed_by IS NULL ORDER BY 1);
  v_weeks := array(SELECT toll_system.charge_counted_week(p_company, c.id, c.week_key) FROM toll.charges c
                   WHERE c.organization_id = p_company AND c.id = ANY (v_charges)) || ARRAY[v_pw, v_rw];
  PERFORM toll_write.lock_weeks(p_company, v_weeks);

  p := toll_write.lock_payback(p_company, v_id, (p_body ->> 'expected_payback_version')::bigint);
  PERFORM toll_write.require_payback_usable(p_company, p);
  IF v_amount IS NOT NULL AND v_amount <> p.amount_minor THEN
    PERFORM toll_write.refuse('PARTIAL_TAKE_BACK', jsonb_build_object('payback_id', p.id, 'amount_minor', p.amount_minor,
                                                                      'taken_back_minor', v_amount));
  END IF;
  IF EXISTS (SELECT 1 FROM toll.paybacks x WHERE x.organization_id = p_company AND x.platform = p.platform
               AND x.reference = v_ref) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('reference', v_ref, 'state', 'reference_used'));
  END IF;
  -- The slices' charges (locked; their versions move, the take-back did not need them)
  PERFORM 1 FROM toll.charges c WHERE c.organization_id = p_company AND c.id = ANY (v_charges) ORDER BY c.id FOR UPDATE;
  PERFORM toll_write.refuse_if_sealed(p_company, v_weeks);

  INSERT INTO toll.paybacks (organization_id, platform, kind, platform_trip_id, reference, driver_id, paid_on, week_key,
                             amount_minor, reversal_of, received_by)
  VALUES (p_company, p.platform, p.kind, p.platform_trip_id, v_ref, p.driver_id, v_paid_on, v_rw,
          p.amount_minor, p.id, p.received_by)
  RETURNING id INTO v_rev;

  -- (a) every active slice of the original: reversed, its P6 reversed (counted in the take-back's week on the payback side)
  FOR r IN
    SELECT a.id, a.charge_id, a.amount_minor, c.occurred_at, c.driver_id,
           toll_system.charge_counted_week(p_company, c.id, c.week_key) AS cw
    FROM toll.allocations a JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
    WHERE a.organization_id = p_company AND a.payback_id = p.id AND a.reversed_by IS NULL
    ORDER BY a.created_at DESC, a.id DESC
  LOOP
    UPDATE toll.allocations SET reversed_by = v_rev WHERE organization_id = p_company AND id = r.id;
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, 'P6_allocate_platform', r.amount_minor, r.occurred_at, p_cmd, v_line,
                             jsonb_build_object('charge_id', r.charge_id, 'payback_id', p.id, 'reversing_payback_id', v_rev,
                                                'driver_id', r.driver_id), true);
    v_taken := v_taken + r.amount_minor;
    v_deltas := toll_write.add_delta(v_deltas, r.cw, jsonb_build_object('uncovered_minor',
                  coalesce((v_deltas -> (r.cw::text) ->> 'uncovered_minor')::bigint, 0) + r.amount_minor));
  END LOOP;
  -- the unlinked rows go with it (no posting of their own: P9)
  UPDATE toll.payback_unlinked_decisions SET reversed_by = v_rev
  WHERE organization_id = p_company AND payback_id = p.id AND reversed_by IS NULL;

  -- (b) the original's arrival, for its full amount
  v_line := v_line + 1;
  PERFORM toll_system.post(p_company, CASE WHEN p.received_by = 'fleet' THEN 'P4_payback_fleet' ELSE 'P5_payback_driver' END,
                           p.amount_minor, v_eff, p_cmd, v_line,
                           jsonb_build_object('payback_id', p.id, 'reversing_payback_id', v_rev, 'driver_id', p.driver_id), true);

  UPDATE toll.paybacks SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = p.id RETURNING version INTO v_ver;
  FOR r IN SELECT c.id FROM toll.charges c WHERE c.organization_id = p_company AND c.id = ANY (v_charges) LOOP
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = r.id RETURNING version INTO v_amount;
    v_versions := v_versions || jsonb_build_object(r.id::text, v_amount);
  END LOOP;
  v_deltas := toll_write.add_delta(v_deltas, v_rw, jsonb_build_object('taken_back_minor', p.amount_minor));

  RETURN jsonb_build_object('decision_id', p_decision, 'reversal_payback_id', v_rev, 'payback_version', v_ver,
                            'charge_versions', v_versions, 'uncovered_minor', v_taken,
                            'weeks', toll_write.weeks_answer(p_company, v_deltas));
END;
$$;

-- 3. correct_charge_amount (P16 + C3) ---------------------------------------------------------------------------
-- Body: charge_id, expected_charge_version, amount_minor (the right amount), reason_code (required).
CREATE OR REPLACE FUNCTION toll_write.intent_correct_charge_amount(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id      uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_new     bigint;
  v_cw      date;
  v_weeks   date[];
  v_pbs     uuid[];
  v_alloc   bigint;
  v_short   bigint := 0;
  v_line    int := 0;
  v_cv      bigint;
  v_ver     bigint;
  v_pvers   jsonb := '{}'::jsonb;
  v_posted  boolean;
  c         toll.charges%ROWTYPE;
  r         record;
BEGIN
  v_new := toll_write.body_amount(p_body);
  IF v_new IS NULL OR nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('amount_minor', 'reason_code')));
  END IF;
  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_cw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_id;
  -- A platform slice that shrinks leaves a leftover on its payback, so the payback's week must be open too.
  v_pbs := array(SELECT DISTINCT a.payback_id FROM toll.allocations a WHERE a.organization_id = p_company
                   AND a.charge_id = v_id AND a.reversed_by IS NULL AND a.payback_id IS NOT NULL ORDER BY 1);
  v_weeks := array(SELECT x.week_key FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = ANY (v_pbs))
             || ARRAY[v_cw];
  PERFORM toll_write.lock_weeks(p_company, v_weeks);

  PERFORM 1 FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = ANY (v_pbs) ORDER BY x.id FOR UPDATE;
  c := toll_write.lock_charge(p_company, v_id, (p_body ->> 'expected_charge_version')::bigint);
  PERFORM toll_write.require_charge_state(p_company, c, ARRAY['pending', 'decided', 'unverified', 'awaiting_cash']);
  IF v_new = c.amount_minor THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('amount_minor', 'same as now', 'charge_id', c.id));
  END IF;

  v_alloc := c.amount_minor - toll_system.charge_open_minor(p_company, c.id);
  v_short := greatest(v_alloc - v_new, 0);
  IF v_short = 0 THEN   -- only a shrink below the slices touches a payback
    v_weeks := ARRAY[v_cw];
  END IF;
  PERFORM toll_write.refuse_if_sealed(p_company, v_weeks);

  v_posted := c.evidence_status = 'verified';
  v_line := toll_system.reduce_allocations(p_company, c.id, v_short, p_decision, p_cmd, v_line);
  INSERT INTO toll.charge_changes (organization_id, charge_id, field, old_value, new_value, pending, decision_id)
  VALUES (p_company, c.id, 'amount_minor', c.amount_minor::text, v_new::text, false, p_decision);
  UPDATE toll.charges SET amount_minor = v_new, version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  IF v_posted THEN
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company,
      'P16_' || CASE WHEN v_new > c.amount_minor THEN 'up_' ELSE 'down_' END || c.paid_by,
      abs(v_new - c.amount_minor), c.occurred_at, p_cmd, v_line,
      jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id));
  END IF;
  IF v_short > 0 THEN
    FOR r IN SELECT x.id FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = ANY (v_pbs) LOOP
      UPDATE toll.paybacks SET version = version + 1, updated_at = now()
      WHERE organization_id = p_company AND id = r.id RETURNING version INTO v_ver;
      v_pvers := v_pvers || jsonb_build_object(r.id::text, v_ver);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('decision_id', p_decision, 'charge_version', v_cv, 'payback_versions', v_pvers,
    'old_amount_minor', c.amount_minor, 'amount_minor', v_new, 'slices_reduced_minor', v_short,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
               jsonb_build_object('amount_change_minor', v_new - c.amount_minor, 'slices_reduced_minor', v_short))));
END;
$$;

-- 4. correct_charge_week (PB2) --------------------------------------------------------------------------------
-- Body: charge_id, expected_charge_version, occurred_at (the right time), reason_code (required). Both weeks open.
-- The charge's rows are reversed at the old time (old week) and posted again at the new time (new week); its slices
-- stay the same slices, only their rows move.
CREATE OR REPLACE FUNCTION toll_write.intent_correct_charge_week(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id      uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_at      timestamptz := nullif(p_body ->> 'occurred_at', '')::timestamptz;
  v_ow      date;
  v_nw      date;
  v_line    int := 0;
  v_cv      bigint;
  v_rule    text;
  v_net     bigint;
  c         toll.charges%ROWTYPE;
  a         record;
BEGIN
  IF v_id IS NULL OR v_at IS NULL OR nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('charge_id', 'occurred_at', 'reason_code')));
  END IF;
  v_nw := ledger.jamaica_week_start(v_at);
  SELECT x.week_key INTO v_ow FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_id;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_ow, v_nw]);
  c := toll_write.lock_charge(p_company, v_id, (p_body ->> 'expected_charge_version')::bigint);
  PERFORM toll_write.require_charge_state(p_company, c, ARRAY['pending', 'decided', 'unverified', 'awaiting_cash']);
  IF toll_system.charge_counted_week(p_company, c.id, c.week_key) <> c.week_key THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', 'carried'));
  END IF;
  IF v_at = c.occurred_at THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('occurred_at', 'same as now', 'charge_id', c.id));
  END IF;
  PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_ow, v_nw]);

  -- 1. reverse every row of the charge at the old time
  v_rule := CASE WHEN c.paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END;
  v_net := toll_system.rule_net(p_company, v_rule, 'charge_id', c.id::text)
         + toll_system.rule_net(p_company, 'P16_up_%', 'charge_id', c.id::text)
         - toll_system.rule_net(p_company, 'P16_down_%', 'charge_id', c.id::text);
  FOR a IN SELECT x.id, x.bearer, x.amount_minor, x.payback_id FROM toll.allocations x
           WHERE x.organization_id = p_company AND x.charge_id = c.id AND x.reversed_by IS NULL ORDER BY x.created_at, x.id LOOP
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, toll_system.bearer_rule(a.bearer), a.amount_minor, c.occurred_at, p_cmd, v_line,
      jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id)
      || CASE WHEN a.payback_id IS NOT NULL THEN jsonb_build_object('payback_id', a.payback_id) ELSE '{}'::jsonb END, true);
  END LOOP;
  IF v_net > 0 THEN
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, v_rule, v_net, c.occurred_at, p_cmd, v_line,
                             jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id), true);
  END IF;

  -- 2. the charge moves
  INSERT INTO toll.charge_changes (organization_id, charge_id, field, old_value, new_value, pending, decision_id)
  VALUES (p_company, c.id, 'week_key', c.week_key::text || ' ' || c.occurred_at::text, v_nw::text || ' ' || v_at::text,
          false, p_decision);
  UPDATE toll.charges SET occurred_at = v_at, week_key = v_nw, version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;

  -- 3. the same rows again at the new time
  IF v_net > 0 THEN
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, v_rule, v_net, v_at, p_cmd, v_line,
                             jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id));
  END IF;
  FOR a IN SELECT x.id, x.bearer, x.amount_minor, x.payback_id FROM toll.allocations x
           WHERE x.organization_id = p_company AND x.charge_id = c.id AND x.reversed_by IS NULL ORDER BY x.created_at, x.id LOOP
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, toll_system.bearer_rule(a.bearer), a.amount_minor, v_at, p_cmd, v_line,
      jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id)
      || CASE WHEN a.payback_id IS NOT NULL THEN jsonb_build_object('payback_id', a.payback_id) ELSE '{}'::jsonb END);
  END LOOP;

  RETURN jsonb_build_object('decision_id', p_decision, 'charge_version', v_cv, 'from_week', v_ow, 'to_week', v_nw,
    'weeks', toll_write.weeks_answer(p_company,
               toll_write.add_delta(toll_write.add_delta('{}'::jsonb, v_ow, jsonb_build_object('moved_out_minor', c.amount_minor)),
                                    v_nw, jsonb_build_object('moved_in_minor', c.amount_minor))));
END;
$$;

-- 5. Nightly checks: the same function, with check 3's payback_unallocated line corrected for cross-week take-backs.
-- Expected per week w = for each payback recorded in w: amount − slices still active − slices its own take-back
-- reversed (the original week keeps its figures, PB4); minus, for each take-back that arrived in w: the original's
-- amount − the slices that take-back reversed. A same-week take-back nets to 0, exactly as before.
CREATE OR REPLACE FUNCTION toll_system.nightly_checks(p_company uuid)
RETURNS TABLE (check_no int, name text, ok boolean, detail jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_expected bigint;
  v_actual   bigint;
  r          record;
BEGIN
  -- Check 1: each toll account equals what its records say (B5 account table).
  -- suspense: the undecided part of posted live charges
  SELECT coalesce(sum(c.amount_minor - c.allocated_minor), 0) INTO v_expected
  FROM toll.v_live_charges c
  WHERE c.organization_id = p_company AND c.state NOT IN ('duplicate', 'rejected', 'unverified');
  v_actual := toll_system.natural_balance(p_company, 'toll:suspense');
  check_no := 1; name := 'account:toll:suspense'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- payback_unallocated: the unallocated part of active paybacks (incl. left-unlinked) + carried P19 platform shares - P18a
  SELECT coalesce(sum(p.amount_minor - p.allocated_minor), 0) INTO v_expected
  FROM toll.v_active_paybacks p WHERE p.organization_id = p_company;
  v_expected := v_expected + toll_system.rule_net(p_company, 'P19\_%\_platform') - toll_system.rule_net(p_company, 'P18a\_%');
  v_actual := toll_system.natural_balance(p_company, 'toll:payback_unallocated');
  check_no := 1; name := 'account:toll:payback_unallocated'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- expense: active fleet allocations + P18b fleet - P19 fleet shares - P20
  SELECT coalesce(sum(a.amount_minor), 0) INTO v_expected
  FROM toll.allocations a
  JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
  WHERE a.organization_id = p_company AND a.bearer = 'fleet' AND a.reversed_by IS NULL AND NOT c.is_legacy;
  v_expected := v_expected + toll_system.rule_net(p_company, 'P18b\_fleet\_%')
              - toll_system.rule_net(p_company, 'P19\_%\_fleet') - toll_system.rule_net(p_company, 'P20\_%');
  v_actual := toll_system.natural_balance(p_company, 'toll:expense');
  check_no := 1; name := 'account:toll:expense'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- receivable_driver: active driver allocations + P18b driver + P19 cash debits - P14 settled
  SELECT coalesce(sum(a.amount_minor), 0) INTO v_expected
  FROM toll.allocations a
  JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
  WHERE a.organization_id = p_company AND a.bearer = 'driver' AND a.reversed_by IS NULL AND NOT c.is_legacy;
  v_expected := v_expected + toll_system.rule_net(p_company, 'P18b\_driver\_%')
              + toll_system.rule_net(p_company, 'P19\_cash\_%') - toll_system.rule_net(p_company, 'P14\_%');
  v_actual := toll_system.natural_balance(p_company, 'toll:receivable_driver');
  check_no := 1; name := 'account:toll:receivable_driver'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- payable_driver: verified live cash charges + P19 driver shares - P13 settled
  SELECT coalesce(sum(c.amount_minor), 0) INTO v_expected
  FROM toll.v_live_charges c
  WHERE c.organization_id = p_company AND c.paid_by = 'cash' AND c.state NOT IN ('duplicate', 'rejected', 'unverified');
  v_expected := v_expected + toll_system.rule_net(p_company, 'P19\_%\_driver') - toll_system.rule_net(p_company, 'P13\_%');
  v_actual := toll_system.natural_balance(p_company, 'toll:payable_driver');
  check_no := 1; name := 'account:toll:payable_driver'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- tag_prepaid: top-ups - live tag charges + P19 tag refunds
  SELECT coalesce((SELECT sum(t.amount_minor) FROM toll.tag_topups t WHERE t.organization_id = p_company), 0)
       - coalesce((SELECT sum(c.amount_minor) FROM toll.v_live_charges c
                   WHERE c.organization_id = p_company AND c.paid_by = 'tag'
                     AND c.state NOT IN ('duplicate', 'rejected', 'unverified')), 0)
       + toll_system.rule_net(p_company, 'P19\_tag\_%')
  INTO v_expected;
  v_actual := toll_system.natural_balance(p_company, 'toll:tag_prepaid');
  check_no := 1; name := 'account:toll:tag_prepaid'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- receivable_platform: active fleet-received paybacks - P10 payouts - take-backs (P18a/P18b card)
  SELECT coalesce(sum(p.amount_minor), 0) INTO v_expected
  FROM toll.v_active_paybacks p WHERE p.organization_id = p_company AND p.received_by = 'fleet';
  v_expected := v_expected - toll_system.rule_net(p_company, 'P10\_%')
              - toll_system.rule_net(p_company, 'P18a\_leftover\_fleet') - toll_system.rule_net(p_company, 'P18b\_%\_card');
  v_actual := toll_system.natural_balance(p_company, 'toll:receivable_platform');
  check_no := 1; name := 'account:toll:receivable_platform'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- recovered_in_driver_cash: active driver-received paybacks - P12 settled - cash take-backs + P20
  SELECT coalesce(sum(p.amount_minor), 0) INTO v_expected
  FROM toll.v_active_paybacks p WHERE p.organization_id = p_company AND p.received_by = 'driver';
  v_expected := v_expected - toll_system.rule_net(p_company, 'P12\_%')
              - toll_system.rule_net(p_company, 'P18a\_leftover\_driver') - toll_system.rule_net(p_company, 'P18b\_%\_cash')
              + toll_system.rule_net(p_company, 'P20\_%');
  v_actual := toll_system.natural_balance(p_company, 'toll:recovered_in_driver_cash');
  check_no := 1; name := 'account:toll:recovered_in_driver_cash'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- platform_payout_clearing: always 0 today (P10 and P11 post together, A13 / O3)
  v_actual := toll_system.natural_balance(p_company, 'toll:platform_payout_clearing');
  check_no := 1; name := 'account:toll:platform_payout_clearing'; ok := v_actual = 0;
  detail := jsonb_build_object('ledger', v_actual, 'records', 0); RETURN NEXT;

  -- Check 2: every record's money is on the ledger, and every toll row points at a live record.
  -- 2a. each posted live charge: net P2/P3/P16 = its amount
  FOR r IN
    SELECT c.id, c.amount_minor,
           toll_system.rule_net(p_company, 'P2\_%', 'charge_id', c.id::text)
         + toll_system.rule_net(p_company, 'P3\_%', 'charge_id', c.id::text)
         + toll_system.rule_net(p_company, 'P16\_up\_%', 'charge_id', c.id::text)
         - toll_system.rule_net(p_company, 'P16\_down\_%', 'charge_id', c.id::text) AS posted
    FROM toll.v_live_charges c
    WHERE c.organization_id = p_company AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
  LOOP
    IF r.posted <> r.amount_minor THEN
      check_no := 2; name := 'charge_posted'; ok := false;
      detail := jsonb_build_object('charge_id', r.id, 'amount', r.amount_minor, 'posted', r.posted); RETURN NEXT;
    END IF;
  END LOOP;
  -- 2b. each charge's active allocations by bearer = net P6/P7/P8 for it
  FOR r IN
    SELECT c.id,
           coalesce(sum(a.amount_minor) FILTER (WHERE a.bearer = 'platform'), 0) AS plat,
           coalesce(sum(a.amount_minor) FILTER (WHERE a.bearer = 'driver'), 0)   AS drv,
           coalesce(sum(a.amount_minor) FILTER (WHERE a.bearer = 'fleet'), 0)    AS flt
    FROM toll.charges c
    LEFT JOIN toll.allocations a ON a.organization_id = c.organization_id AND a.charge_id = c.id AND a.reversed_by IS NULL
    WHERE c.organization_id = p_company AND NOT c.is_legacy
    GROUP BY c.id
  LOOP
    IF r.plat <> toll_system.rule_net(p_company, 'P6\_%', 'charge_id', r.id::text)
       OR r.drv <> toll_system.rule_net(p_company, 'P7\_%', 'charge_id', r.id::text)
       OR r.flt <> toll_system.rule_net(p_company, 'P8\_%', 'charge_id', r.id::text) THEN
      check_no := 2; name := 'allocations_posted'; ok := false;
      detail := jsonb_build_object('charge_id', r.id, 'platform', r.plat, 'driver', r.drv, 'fleet', r.flt); RETURN NEXT;
    END IF;
  END LOOP;
  -- 2c. each payback: net P4/P5 = its amount if active, 0 if reversed
  FOR r IN
    SELECT p.id, p.amount_minor,
           (EXISTS (SELECT 1 FROM toll.paybacks x WHERE x.organization_id = p.organization_id AND x.reversal_of = p.id)) AS reversed,
           toll_system.rule_net(p_company, 'P4\_%', 'payback_id', p.id::text)
         + toll_system.rule_net(p_company, 'P5\_%', 'payback_id', p.id::text) AS posted
    FROM toll.paybacks p
    WHERE p.organization_id = p_company AND NOT p.is_legacy AND NOT p.after_seal AND p.reversal_of IS NULL
  LOOP
    IF r.posted <> (CASE WHEN r.reversed THEN 0 ELSE r.amount_minor END) THEN
      check_no := 2; name := 'payback_posted'; ok := false;
      detail := jsonb_build_object('payback_id', r.id, 'amount', r.amount_minor, 'reversed', r.reversed, 'posted', r.posted);
      RETURN NEXT;
    END IF;
  END LOOP;
  -- 2d. no toll ledger row points at a missing or legacy record
  FOR r IN
    SELECT e.id, e.metadata
    FROM ledger.entries e
    WHERE e.organization_id = p_company AND e.reference_type = 'toll'
      AND ((e.metadata ? 'charge_id' AND NOT EXISTS (SELECT 1 FROM toll.charges c WHERE c.organization_id = p_company
               AND c.id = (e.metadata ->> 'charge_id')::uuid AND NOT c.is_legacy))
        OR (e.metadata ? 'payback_id' AND NOT EXISTS (SELECT 1 FROM toll.paybacks p WHERE p.organization_id = p_company
               AND p.id = (e.metadata ->> 'payback_id')::uuid AND NOT p.is_legacy)))
  LOOP
    check_no := 2; name := 'row_without_record'; ok := false;
    detail := jsonb_build_object('entry_id', r.id); RETURN NEXT;
  END LOOP;
  check_no := 2; name := 'records_vs_ledger'; ok := true; detail := '{}'::jsonb; RETURN NEXT;

  -- Check 3: per open week, the flow counted in the week of its record equals the week's answer (EC1).
  -- P1-R4: every account Phase 1 posts to. Charge legs count in the charge's week; payback legs in the payback's
  -- (the reversing payback's for a take-back); top-ups in the top-up's week; carried legs (P20) in the carried-to week.
  -- P18 / P19 legs join when Phase 2 builds those intents.
  FOR r IN
    WITH legs AS (
      SELECT CASE WHEN (e.metadata ->> 'reverse')::boolean THEN -e.amount_minor ELSE e.amount_minor END AS amt,
             e.metadata ->> 'toll_rule' AS rule,
             (e.metadata ->> 'charge_id')::uuid AS charge_id,
             -- P17 rows carry the original payback_id AND reversing_payback_id; they count in the reversing payback's week
             coalesce((e.metadata ->> 'reversing_payback_id')::uuid, (e.metadata ->> 'payback_id')::uuid) AS payback_id,
             (e.metadata ->> 'tag_topup_id')::uuid AS topup_id,
             (e.metadata ->> 'carried_fact_id')::uuid AS fact_id
      FROM ledger.entries e
      WHERE e.organization_id = p_company AND e.reference_type = 'toll'
    ),
    cl AS (                                   -- charge legs with the charge's counted week
      SELECT l.*, toll_system.charge_counted_week(p_company, c.id, c.week_key) AS wk
      FROM legs l JOIN toll.charges c ON c.organization_id = p_company AND c.id = l.charge_id
    ),
    pl AS (                                   -- payback legs with the payback's week
      SELECT l.*, p.week_key AS wk FROM legs l JOIN toll.paybacks p ON p.organization_id = p_company AND p.id = l.payback_id
    ),
    tl AS (                                   -- top-up legs with the top-up's week
      SELECT l.*, t.week_key AS wk FROM legs l JOIN toll.tag_topups t ON t.organization_id = p_company AND t.id = l.topup_id
    ),
    fl AS (                                   -- carried legs with the carried-to week
      SELECT l.*, f.to_week AS wk FROM legs l JOIN toll.carried_facts f ON f.organization_id = p_company AND f.id = l.fact_id
    ),
    weeks AS (
      SELECT wk FROM cl UNION SELECT wk FROM pl UNION SELECT wk FROM tl UNION SELECT wk FROM fl
      UNION SELECT toll_system.charge_counted_week(p_company, c.id, c.week_key) FROM toll.charges c
            WHERE c.organization_id = p_company AND NOT c.is_legacy AND NOT c.after_seal
      UNION SELECT p.week_key FROM toll.paybacks p WHERE p.organization_id = p_company AND NOT p.is_legacy AND NOT p.after_seal
    )
    SELECT w.wk,
      toll_system.week_is_sealed(p_company, w.wk) AS sealed,
      -- suspense: +P2 +P3 +P16up −P16down −P6 −P7 −P8 (charge week)
      coalesce((SELECT sum(CASE WHEN rule ~ '^(P2_|P3_|P16_up_)' THEN amt
                                WHEN rule ~ '^(P16_down_|P6_|P7_|P8_)' THEN -amt ELSE 0 END) FROM cl WHERE cl.wk = w.wk), 0) AS suspense_flow,
      coalesce((SELECT sum(c.amount_minor - c.allocated_minor) FROM toll.v_live_charges c
                WHERE c.organization_id = p_company AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0) AS suspense_expected,
      -- payback_unallocated: +P4 +P5 −P6 (payback week)
      coalesce((SELECT sum(CASE WHEN rule ~ '^(P4_|P5_)' THEN amt WHEN rule ~ '^P6_' THEN -amt ELSE 0 END)
                FROM pl WHERE pl.wk = w.wk), 0) AS unalloc_flow,
      (coalesce((SELECT sum(p.amount_minor - coalesce((
                   SELECT sum(a.amount_minor) FROM toll.allocations a
                   WHERE a.organization_id = p.organization_id AND a.payback_id = p.id
                     AND (a.reversed_by IS NULL OR a.reversed_by IN (
                       SELECT t.id FROM toll.paybacks t WHERE t.organization_id = p.organization_id AND t.reversal_of = p.id))), 0))
                FROM toll.paybacks p
                WHERE p.organization_id = p_company AND p.week_key = w.wk AND NOT p.is_legacy AND NOT p.after_seal
                  AND p.reversal_of IS NULL), 0)
       - coalesce((SELECT sum(o.amount_minor - coalesce((
                   SELECT sum(a.amount_minor) FROM toll.allocations a
                   WHERE a.organization_id = o.organization_id AND a.payback_id = o.id AND a.reversed_by = t.id), 0))
                FROM toll.paybacks t JOIN toll.paybacks o ON o.organization_id = t.organization_id AND o.id = t.reversal_of
                WHERE t.organization_id = p_company AND t.week_key = w.wk AND NOT t.is_legacy AND NOT t.after_seal), 0)
      ) AS unalloc_expected,
      -- expense: +P8 (charge week) −P20 (carried-to week)
      coalesce((SELECT sum(amt) FROM cl WHERE cl.wk = w.wk AND rule ~ '^P8_'), 0)
        - coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P20_'), 0) AS expense_flow,
      coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a JOIN toll.v_live_charges c
                  ON c.organization_id = a.organization_id AND c.id = a.charge_id
                WHERE a.organization_id = p_company AND a.bearer = 'fleet' AND a.reversed_by IS NULL
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0)
        - coalesce((SELECT sum(f.amount_minor) FROM toll.carried_facts f
                    WHERE f.organization_id = p_company AND f.kind = 'cash_recovered' AND f.to_week = w.wk), 0) AS expense_expected,
      -- receivable_driver: +P7 (charge week)
      coalesce((SELECT sum(amt) FROM cl WHERE cl.wk = w.wk AND rule ~ '^P7_'), 0) AS rd_flow,
      coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a JOIN toll.v_live_charges c
                  ON c.organization_id = a.organization_id AND c.id = a.charge_id
                WHERE a.organization_id = p_company AND a.bearer = 'driver' AND a.reversed_by IS NULL
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0) AS rd_expected,
      -- payable_driver: +P3 +P16up_cash −P16down_cash (charge week)
      coalesce((SELECT sum(CASE WHEN rule ~ '^(P3_|P16_up_cash)' THEN amt WHEN rule ~ '^P16_down_cash' THEN -amt ELSE 0 END)
                FROM cl WHERE cl.wk = w.wk), 0) AS pd_flow,
      coalesce((SELECT sum(c.amount_minor) FROM toll.v_live_charges c
                WHERE c.organization_id = p_company AND c.paid_by = 'cash' AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0) AS pd_expected,
      -- tag_prepaid: +P1 (top-up week) −P2 −P16up_tag +P16down_tag (charge week)
      coalesce((SELECT sum(amt) FROM tl WHERE tl.wk = w.wk AND rule ~ '^P1_'), 0)
        - coalesce((SELECT sum(CASE WHEN rule ~ '^(P2_|P16_up_tag)' THEN amt WHEN rule ~ '^P16_down_tag' THEN -amt ELSE 0 END)
                    FROM cl WHERE cl.wk = w.wk), 0) AS tag_flow,
      coalesce((SELECT sum(t.amount_minor) FROM toll.tag_topups t WHERE t.organization_id = p_company AND t.week_key = w.wk), 0)
        - coalesce((SELECT sum(c.amount_minor) FROM toll.v_live_charges c
                    WHERE c.organization_id = p_company AND c.paid_by = 'tag' AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0) AS tag_expected,
      -- receivable_platform: +P4 (payback week); recovered_in_driver_cash: +P5 (payback week) +P20 (carried-to week)
      coalesce((SELECT sum(amt) FROM pl WHERE pl.wk = w.wk AND rule ~ '^P4_'), 0) AS rp_flow,
      -- every recorded payback counts + in its week, every take-back − in the take-back's week (P17 reverses P4/P5)
      coalesce((SELECT sum(CASE WHEN p.reversal_of IS NULL THEN p.amount_minor ELSE -p.amount_minor END) FROM toll.paybacks p
                WHERE p.organization_id = p_company AND p.received_by = 'fleet' AND p.week_key = w.wk
                  AND NOT p.is_legacy AND NOT p.after_seal), 0) AS rp_expected,
      coalesce((SELECT sum(amt) FROM pl WHERE pl.wk = w.wk AND rule ~ '^P5_'), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P20_'), 0) AS rc_flow,
      coalesce((SELECT sum(CASE WHEN p.reversal_of IS NULL THEN p.amount_minor ELSE -p.amount_minor END) FROM toll.paybacks p
                WHERE p.organization_id = p_company AND p.received_by = 'driver' AND p.week_key = w.wk
                  AND NOT p.is_legacy AND NOT p.after_seal), 0)
        + coalesce((SELECT sum(f.amount_minor) FROM toll.carried_facts f
                    WHERE f.organization_id = p_company AND f.kind = 'cash_recovered' AND f.to_week = w.wk), 0) AS rc_expected
    FROM weeks w
    WHERE w.wk IS NOT NULL
  LOOP
    CONTINUE WHEN r.sealed;
    check_no := 3; name := 'week_flow:' || r.wk;
    ok := r.suspense_flow = r.suspense_expected AND r.unalloc_flow = r.unalloc_expected
      AND r.expense_flow = r.expense_expected AND r.rd_flow = r.rd_expected AND r.pd_flow = r.pd_expected
      AND r.tag_flow = r.tag_expected AND r.rp_flow = r.rp_expected AND r.rc_flow = r.rc_expected;
    detail := jsonb_build_object('week', r.wk,
      'suspense_flow', r.suspense_flow, 'suspense_expected', r.suspense_expected,
      'unallocated_flow', r.unalloc_flow, 'unallocated_expected', r.unalloc_expected,
      'expense_flow', r.expense_flow, 'expense_expected', r.expense_expected,
      'receivable_driver_flow', r.rd_flow, 'receivable_driver_expected', r.rd_expected,
      'payable_driver_flow', r.pd_flow, 'payable_driver_expected', r.pd_expected,
      'tag_prepaid_flow', r.tag_flow, 'tag_prepaid_expected', r.tag_expected,
      'receivable_platform_flow', r.rp_flow, 'receivable_platform_expected', r.rp_expected,
      'recovered_in_driver_cash_flow', r.rc_flow, 'recovered_in_driver_cash_expected', r.rc_expected);
    RETURN NEXT;
  END LOOP;

  -- Check 4: every sealed week still recomputes to its frozen hash (I10).
  FOR r IN
    SELECT DISTINCT ON (ws.week_key) ws.week_key, ws.status, ws.source_hash
    FROM ledger.week_statements ws
    WHERE ws.organization_id = p_company AND ws.kind = 'toll_week' AND ws.driver_id = '*'
    ORDER BY ws.week_key, ws.version DESC
  LOOP
    CONTINUE WHEN r.status <> 'closed';
    check_no := 4; name := 'sealed_week:' || r.week_key;
    ok := r.source_hash = toll_system.week_hash(p_company, r.week_key);
    detail := jsonb_build_object('week', r.week_key, 'frozen', r.source_hash, 'now', toll_system.week_hash(p_company, r.week_key));
    RETURN NEXT;
  END LOOP;

  -- Check 5: after_seal facts are never posted, and each belongs to a sealed week (count + sum per week).
  FOR r IN
    SELECT x.wk, count(*) AS n, sum(x.amount_minor) AS total,
           bool_and(toll_system.week_is_sealed(p_company, x.wk)) AS all_sealed,
           sum(CASE WHEN x.posted THEN 1 ELSE 0 END) AS posted_n
    FROM (
      SELECT c.week_key AS wk, c.amount_minor,
             EXISTS (SELECT 1 FROM ledger.entries e WHERE e.organization_id = p_company AND e.reference_type = 'toll'
                       AND e.metadata ->> 'charge_id' = c.id::text) AS posted
      FROM toll.charges c WHERE c.organization_id = p_company AND c.after_seal AND NOT c.is_legacy
      UNION ALL
      SELECT p.week_key, p.amount_minor,
             EXISTS (SELECT 1 FROM ledger.entries e WHERE e.organization_id = p_company AND e.reference_type = 'toll'
                       AND e.metadata ->> 'payback_id' = p.id::text)
      FROM toll.paybacks p WHERE p.organization_id = p_company AND p.after_seal AND NOT p.is_legacy
    ) x
    GROUP BY x.wk
  LOOP
    check_no := 5; name := 'after_seal:' || r.wk;
    ok := r.all_sealed AND r.posted_n = 0;
    detail := jsonb_build_object('week', r.wk, 'count', r.n, 'sum', r.total, 'week_sealed', r.all_sealed, 'posted', r.posted_n);
    RETURN NEXT;
  END LOOP;

  -- Check 7: every bank confirmation (tolls v2 companies) is posted at its current version (the sweep heals).
  FOR r IN
    SELECT k.key, md5(k.value::text) AS ver,
           (SELECT pp.source_version FROM toll.payout_postings pp
            WHERE pp.organization_id = p_company AND pp.source_ref = k.key AND pp.reversed_at IS NULL) AS posted_ver
    FROM public.kv_store_37f42386 k
    WHERE k.key ~ ('^fleet_bank_confirm:org:' || p_company || ':\d{4}-\d{2}-\d{2}:(uber|indrive|roam)$')
  LOOP
    check_no := 7; name := 'payout:' || r.key; ok := r.posted_ver IS NOT DISTINCT FROM r.ver;
    detail := jsonb_build_object('key', r.key, 'version', r.ver, 'posted_version', r.posted_ver); RETURN NEXT;
  END LOOP;
  FOR r IN
    SELECT pp.source_ref FROM toll.payout_postings pp
    WHERE pp.organization_id = p_company AND pp.reversed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.kv_store_37f42386 k WHERE k.key = pp.source_ref)
  LOOP
    check_no := 7; name := 'payout_deleted:' || r.source_ref; ok := false;
    detail := jsonb_build_object('key', r.source_ref); RETURN NEXT;
  END LOOP;
END;
$$;

-- 6. The router, with this round's intents wired in -----------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.command(p_intent text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company    uuid;
  v_user       uuid := auth.uid();
  v_command_id text := nullif(btrim(p_body ->> 'command_id'), '');
  v_permission text;
  v_decision   uuid;
  v_stored     jsonb;
  v_response   jsonb;
  v_text       text;
BEGIN
  -- 1. Company from the user's own token only (B7)
  v_company := toll_read.current_company();
  IF v_company IS NULL OR v_user IS NULL THEN
    PERFORM toll_write.refuse('NO_COMPANY');
  END IF;
  IF p_body ? 'organization_id' OR p_body ? 'organizationId' OR p_body ? 'company_id' THEN
    PERFORM toll_write.refuse('COMPANY_NOT_ACCEPTED');           -- no company parameter, ever
  END IF;

  -- 2. Permission (closed list of intents)
  v_permission := CASE p_intent
    WHEN 'seal_week'   THEN 'toll.manage'
    WHEN 'reopen_week' THEN 'toll.manage'
    WHEN 'carry_forward' THEN 'toll.manage'
    WHEN 'link_payback' THEN 'toll.manage'   WHEN 'driver_pays' THEN 'toll.manage'
    WHEN 'fleet_absorbs' THEN 'toll.manage'  WHEN 'leave_payback_unlinked' THEN 'toll.manage'
    WHEN 'undo_decision' THEN 'toll.manage'  WHEN 'reverse_payback' THEN 'toll.manage'
    WHEN 'correct_charge_amount' THEN 'toll.manage' WHEN 'correct_charge_week' THEN 'toll.manage'
    WHEN 'confirm_duplicate' THEN 'toll.manage' WHEN 'release_duplicate' THEN 'toll.manage'
    WHEN 'verify_cash_receipt' THEN 'toll.manage' WHEN 'reject_cash_receipt' THEN 'toll.manage'
    WHEN 'apply_suggestion' THEN 'toll.manage' WHEN 'import_batch' THEN 'toll.manage'
    ELSE NULL
  END;
  IF v_permission IS NULL THEN
    PERFORM toll_write.refuse('UNKNOWN_INTENT', jsonb_build_object('intent', p_intent));
  END IF;
  IF NOT toll_system.user_can_manage_tolls(v_user, v_company) THEN
    PERFORM toll_write.refuse('FORBIDDEN', jsonb_build_object('permission', v_permission));
  END IF;
  IF v_command_id IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('command_id')));
  END IF;

  -- 3. Replay: the command row is the lock. A second call with the same id waits here, then gets the first answer.
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id, reason_code, note, targets)
  VALUES (v_company, v_command_id, p_intent, 'user', v_user, p_body ->> 'reason_code', p_body ->> 'note', p_body)
  ON CONFLICT (organization_id, command_id) DO NOTHING
  RETURNING id INTO v_decision;

  IF v_decision IS NULL THEN
    SELECT d.response, d.intent INTO v_stored, v_text
    FROM toll.decisions d WHERE d.organization_id = v_company AND d.command_id = v_command_id;
    IF v_text IS DISTINCT FROM p_intent THEN
      PERFORM toll_write.refuse('COMMAND_ID_REUSED', jsonb_build_object('command_id', v_command_id));
    END IF;
    RETURN coalesce(v_stored, '{}'::jsonb) || jsonb_build_object('replay', true);
  END IF;

  -- 4-8. Locks, versions, week state, the decision, the ledger: inside each intent
  v_response := CASE p_intent
    WHEN 'seal_week'     THEN toll_write.intent_seal_week(v_company, v_decision, v_command_id, p_body)
    WHEN 'reopen_week'   THEN toll_write.intent_reopen_week(v_company, v_decision, v_command_id, p_body)
    WHEN 'carry_forward' THEN toll_write.intent_carry_forward(v_company, v_decision, v_command_id, p_body)
    WHEN 'import_batch'  THEN toll_write.intent_import_batch(v_company, v_decision, v_command_id, p_body)
    WHEN 'link_payback'  THEN toll_write.intent_link_payback(v_company, v_decision, v_command_id, p_body)
    WHEN 'apply_suggestion' THEN toll_write.intent_apply_suggestion(v_company, v_decision, v_command_id, p_body)
    WHEN 'driver_pays'   THEN toll_write.do_bear(v_company, v_decision, v_command_id, p_body, 'driver')
    WHEN 'fleet_absorbs' THEN toll_write.do_bear(v_company, v_decision, v_command_id, p_body, 'fleet')
    WHEN 'leave_payback_unlinked' THEN toll_write.intent_leave_payback_unlinked(v_company, v_decision, v_command_id, p_body)
    WHEN 'undo_decision' THEN toll_write.intent_undo_decision(v_company, v_decision, v_command_id, p_body)
    WHEN 'verify_cash_receipt' THEN toll_write.do_receipt(v_company, v_decision, v_command_id, p_body, true)
    WHEN 'reject_cash_receipt' THEN toll_write.do_receipt(v_company, v_decision, v_command_id, p_body, false)
    WHEN 'confirm_duplicate' THEN toll_write.do_duplicate(v_company, v_decision, v_command_id, p_body, true)
    WHEN 'release_duplicate' THEN toll_write.do_duplicate(v_company, v_decision, v_command_id, p_body, false)
    WHEN 'reverse_payback' THEN toll_write.intent_reverse_payback(v_company, v_decision, v_command_id, p_body)
    WHEN 'correct_charge_amount' THEN toll_write.intent_correct_charge_amount(v_company, v_decision, v_command_id, p_body)
    WHEN 'correct_charge_week' THEN toll_write.intent_correct_charge_week(v_company, v_decision, v_command_id, p_body)
    ELSE NULL
  END;
  IF v_response IS NULL THEN
    PERFORM toll_write.refuse('INTENT_NOT_BUILT', jsonb_build_object('intent', p_intent));
  END IF;

  -- 9. Store the answer (at most 64 KB; a larger one keeps decision, versions and per-week deltas only)
  IF octet_length(v_response::text) > 65536 THEN
    -- keep what replays and the batch identity need (an imported file's report can be large)
    v_response := jsonb_build_object('decision_id', v_decision, 'weeks', v_response -> 'weeks', 'truncated', true,
                                     'batch_hash', v_response -> 'batch_hash', 'counts', v_response -> 'counts');
    UPDATE toll.decisions SET response = v_response, response_truncated = true WHERE id = v_decision;
  ELSE
    UPDATE toll.decisions SET response = v_response WHERE id = v_decision;
  END IF;

  RETURN v_response;
END;
$$;

-- 7. Grants ----------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION toll_system.reduce_allocations(uuid, uuid, bigint, uuid, text, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_reverse_payback(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_correct_charge_amount(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_correct_charge_week(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.nightly_checks(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.nightly_checks(uuid) TO service_role;
REVOKE ALL ON FUNCTION toll_write.command(text, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION toll_write.command(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

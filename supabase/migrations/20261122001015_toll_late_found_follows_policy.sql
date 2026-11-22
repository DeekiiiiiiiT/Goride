-- Owner, 21 Nov 2026: a short payment Roam finds after Uber's 9 days (or with too little time left) no longer
-- falls on the fleet automatically. Who pays follows the company's "When the driver doesn't send it in time"
-- setting (dispute_policy.expired_bearer), the same as a dispute the driver didn't send. Found within the 9 days,
-- it still goes to the driver's app by itself. (Uber's CSV only arrives after the week ends; the fleet never sends.)
-- The four disputes already borne by the fleet this way in an open week move to the setting's bearer.

CREATE OR REPLACE FUNCTION toll_system.late_found_bearer(p_company uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT dp.expired_bearer FROM toll.dispute_policy dp WHERE dp.organization_id = p_company), 'driver');
$$;
REVOKE ALL ON FUNCTION toll_system.late_found_bearer(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION toll_system.dispute_apply_fleet_open_late(
  p_company uuid, p_dispute uuid, p_charge uuid, p_amount bigint, p_decision uuid, p_cmd text, p_line integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_bearer text := toll_system.late_found_bearer(p_company);
BEGIN
  -- (name kept for its callers) found after the 9 days: the company's "not sent in time" setting bears it
  PERFORM toll_system.dispute_insert_allocation(
    p_company, p_charge, v_bearer, p_amount, NULL, false, p_dispute, 'opened_late', p_decision, p_cmd, p_line);
  UPDATE toll.disputes d
  SET bearer = v_bearer,
      posted_in_week_key = toll_system.dispute_result_week(p_company, d.id, d.posted_in_week_key)
  WHERE d.organization_id = p_company AND d.id = p_dispute AND d.bearer IS NULL;
  RETURN p_line;
END;
$$;
REVOKE ALL ON FUNCTION toll_system.dispute_apply_fleet_open_late(uuid, uuid, uuid, bigint, uuid, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION toll_system.dispute_expire(
  p_company uuid, p_dispute uuid, p_decision uuid, p_cmd text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d        toll.disputes%ROWTYPE;
  v_bearer text;
BEGIN
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = p_dispute FOR UPDATE;
  IF d.state <> 'to_send' OR now() <= d.deadline THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', p_dispute, 'state', d.state));
  END IF;
  v_bearer := toll_system.late_found_bearer(p_company);
  PERFORM toll_system.dispute_apply_rule3_rest(p_company, d.id, d.charge_id, d.owed_minor, v_bearer, p_decision, p_cmd, 1);
  UPDATE toll.disputes SET state = 'expired', close_reason = 'window_closed', bearer = v_bearer,
         posted_in_week_key = toll_system.dispute_result_week(p_company, d.id, posted_in_week_key),
         decision_ids = array_append(decision_ids, p_decision)
  WHERE organization_id = p_company AND id = d.id;
  RETURN jsonb_build_object('dispute_id', d.id, 'state', 'expired');
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_settle_dispute(
  p_company uuid, p_decision uuid, p_cmd text, p_body jsonb, p_system boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d          toll.disputes%ROWTYPE;
  p          toll.paybacks%ROWTYPE;
  v_id       uuid := nullif(p_body ->> 'dispute_id', '')::uuid;
  v_pid      uuid := nullif(p_body ->> 'payback_id', '')::uuid;
  v_exp      bigint := (p_body ->> 'expected_dispute_version')::bigint;
  v_take     bigint;
  v_linked   bigint;
  v_line     int := 0;
  v_new_st   text;
  v_close    text;
  v_bearer   text;
  v_state_at text;
  v_from     date;
  v_to       date;
BEGIN
  PERFORM toll_write.require_disputes_on(p_company);
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('dispute_id', v_id));
  END IF;
  IF d.version <> v_exp THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object('dispute_id', v_id, 'dispute_version', d.version));
  END IF;

  p := toll_write.lock_payback(p_company, v_pid, (p_body ->> 'expected_payback_version')::bigint);
  PERFORM toll_write.require_payback_usable(p_company, p);

  -- Review S2a-R3 (C4.6): the system settles a dispute only with a refund paid inside its refund
  -- window; the engine checks this too, but the database must not trust the caller.
  IF p_system AND d.state IN ('sent', 'expired') THEN
    SELECT b.refund_from, b.refund_to INTO v_from, v_to
    FROM toll_system.dispute_refund_bounds(
           CASE WHEN d.state = 'expired' THEN d.deadline ELSE d.clock_from END,
           (SELECT ps.refund_periods FROM toll.platform_settings ps
            WHERE ps.organization_id = p_company AND ps.platform = d.platform)) b;
    IF v_from IS NULL OR p.paid_on < v_from OR p.paid_on > v_to THEN
      PERFORM toll_write.refuse('OUTSIDE_REFUND_WINDOW', jsonb_build_object(
        'dispute_id', d.id, 'payback_id', p.id, 'paid_on', p.paid_on, 'refund_from', v_from, 'refund_to', v_to));
    END IF;
  END IF;

  SELECT coalesce(sum(l.amount_minor), 0) INTO v_linked
  FROM toll.dispute_links l
  WHERE l.organization_id = p_company AND l.dispute_id = d.id AND l.reversed_by IS NULL;

  v_take := coalesce(toll_write.body_amount(p_body), least(toll_system.payback_open_minor(p_company, p.id), d.owed_minor - v_linked));
  IF v_take > d.owed_minor - v_linked OR v_take > toll_system.payback_open_minor(p_company, p.id) THEN
    v_take := least(d.owed_minor - v_linked, toll_system.payback_open_minor(p_company, p.id));
  END IF;
  IF v_take <= 0 THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', d.id, 'state', 'nothing_to_settle'));
  END IF;

  v_state_at := d.state;

  -- Review S2a-R4 (Y2, L2.4): a to_send dispute can't be settled; its refund clock starts at Mark as sent.
  IF d.state = 'to_send' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', d.id, 'state', 'to_send', 'use', 'mark_dispute_sent first'));
  ELSIF d.state = 'sent' THEN
    v_line := toll_system.dispute_apply_rule2_refund(
      p_company, d.id, d.charge_id, p.id, v_take, p_decision, p_cmd, v_line);
  ELSIF d.state = 'expired' THEN
    IF NOT p_system THEN
      PERFORM toll_write.refuse('EXPIRED_SYSTEM_ONLY', jsonb_build_object('dispute_id', d.id));
    END IF;
    IF p.kind <> 'adjustment' THEN
      PERFORM toll_write.refuse('WRONG_PAYBACK_KIND', jsonb_build_object('payback_id', p.id, 'kind', p.kind));
    END IF;
    v_bearer := coalesce(d.bearer, toll_system.late_found_bearer(p_company));
    v_line := toll_system.dispute_apply_rule4_expired_refund(
      p_company, d.id, d.charge_id, p.id, v_take, v_bearer, p_decision, p_cmd, v_line);
  ELSE
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', d.id, 'state', d.state));
  END IF;

  INSERT INTO toll.dispute_links (organization_id, dispute_id, payback_id, amount_minor, decision_id, state_at_settle)
  VALUES (p_company, d.id, p.id, v_take, p_decision, v_state_at);

  v_linked := v_linked + v_take;
  IF v_linked >= d.owed_minor THEN
    v_new_st := 'won';
    v_close := 'refund';
  ELSIF d.state = 'expired' THEN
    v_new_st := 'part_won';
    v_close := 'refund';
  ELSE
    v_new_st := 'sent';
    v_close := NULL;
  END IF;

  UPDATE toll.disputes SET recovered_minor = v_linked, state = v_new_st, close_reason = coalesce(v_close, close_reason),
         posted_in_week_key = CASE WHEN v_new_st IN ('won', 'part_won')
                              THEN toll_system.dispute_result_week(p_company, d.id, posted_in_week_key)
                              ELSE posted_in_week_key END,
         decision_ids = array_append(decision_ids, p_decision)
  WHERE organization_id = p_company AND id = d.id;

  UPDATE toll.paybacks SET version = version + 1, updated_at = now() WHERE organization_id = p_company AND id = p.id;
  UPDATE toll.charges SET version = version + 1, updated_at = now() WHERE organization_id = p_company AND id = d.charge_id;

  RETURN jsonb_build_object('decision_id', p_decision, 'dispute_id', d.id, 'amount_minor', v_take, 'state', v_new_st,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, d.charge_week_key,
              jsonb_build_object('dispute_settled_minor', v_take))));
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_reopen_after_link_reverse(
  p_company uuid, p_old_dispute uuid, p_link_amount bigint,
  p_state_at_settle text, p_decision uuid, p_cmd text, p_line int, p_sealed boolean DEFAULT false
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d_old     toll.disputes%ROWTYPE;
  v_new     uuid;
  v_bearer  text;
  v_line    int := p_line;
  v_now     timestamptz := now();
BEGIN
  SELECT * INTO d_old FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = p_old_dispute;
  IF NOT FOUND THEN RETURN v_line; END IF;

  IF p_state_at_settle = 'sent' THEN
    INSERT INTO toll.disputes (
      organization_id, charge_id, charge_week_key, platform, platform_trip_id, driver_id,
      owed_minor, recovered_minor, state, sent_at, clock_from, deadline, opened_late, text_version,
      reopens_id, decision_ids)
  VALUES (
      p_company, d_old.charge_id, d_old.charge_week_key, d_old.platform, d_old.platform_trip_id, d_old.driver_id,
      p_link_amount, 0, 'sent', v_now, v_now, d_old.deadline, d_old.opened_late, d_old.text_version,
      d_old.id, ARRAY[p_decision])
    RETURNING id INTO v_new;
    -- Sealed charge week: the allocations stay frozen (B13); the money moved back already by reversing
    -- the refund's P22 / P24 legs in the open week (dispute_reverse_settle_legs).
    IF NOT p_sealed THEN
      v_line := toll_system.dispute_apply_open_provisional(
        p_company, v_new, d_old.charge_id, p_link_amount, p_decision, p_cmd, v_line + 1);  -- helpers post AT p_line
    END IF;
  ELSIF p_state_at_settle = 'expired' THEN
    v_bearer := coalesce(d_old.bearer, toll_system.late_found_bearer(p_company));
    INSERT INTO toll.disputes (
      organization_id, charge_id, charge_week_key, platform, platform_trip_id, driver_id,
      owed_minor, recovered_minor, state, close_reason, deadline, opened_late, text_version, bearer,
      reopens_id, decision_ids)
    VALUES (
      p_company, d_old.charge_id, d_old.charge_week_key, d_old.platform, d_old.platform_trip_id, d_old.driver_id,
      p_link_amount, 0, 'expired', 'reversal', d_old.deadline, d_old.opened_late, d_old.text_version, v_bearer,
      d_old.id, ARRAY[p_decision])
    RETURNING id INTO v_new;
    IF NOT p_sealed THEN
      v_line := toll_system.dispute_apply_rule3_rest(
        p_company, v_new, d_old.charge_id, p_link_amount, v_bearer, p_decision, p_cmd, v_line + 1);
    END IF;
  END IF;

  RETURN v_line;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_row_json(p_company uuid, p_dispute uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d toll.disputes%ROWTYPE; c toll.charges%ROWTYPE;
  v_paid bigint; v_toll bigint; v_left bigint; v_days int; v_window int;
  v_closed boolean; v_red boolean; v_late boolean; v_hold boolean;
  v_exp_bearer text; v_bearer_ns text; v_reopened uuid;
  v_drv_name text; v_plaza text; v_plate text;
BEGIN
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = p_dispute;
  IF NOT FOUND OR d.close_reason = 'undo' THEN RETURN NULL; END IF;
  SELECT * INTO c FROM toll.charges ch WHERE ch.organization_id = p_company AND ch.id = d.charge_id;
  v_toll := c.amount_minor;
  SELECT coalesce(sum(a.amount_minor), 0) INTO v_paid FROM toll.allocations a
    WHERE a.organization_id = p_company AND a.charge_id = c.id AND a.reversed_by IS NULL
      AND a.bearer = 'platform' AND a.payback_id IS NOT NULL AND NOT a.provisional;
  v_left := greatest(d.owed_minor - d.recovered_minor, 0);
  SELECT ps.dispute_window_days INTO v_window FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.platform = d.platform;
  v_days := greatest(((d.deadline AT TIME ZONE 'America/Jamaica')::date - (now() AT TIME ZONE 'America/Jamaica')::date), 0);
  v_closed := d.state = 'to_send' AND now() > d.deadline;
  v_red := d.state = 'to_send' AND v_days <= 2;
  v_late := (d.state = 'to_send' AND v_days <= 2)
    OR (d.state = 'sent' AND d.recovered_minor = 0 AND toll_system.platform_week_in(
          p_company, d.platform, toll_system.dispute_refund_period_week_start(d.clock_from, 1)));
  v_hold := toll_system.dispute_sweep_hold(p_company, d.id);
  SELECT dp.expired_bearer INTO v_exp_bearer FROM toll.dispute_policy dp WHERE dp.organization_id = p_company;
  v_bearer_ns := CASE WHEN coalesce(v_exp_bearer, 'driver') = 'fleet' THEN 'fleet' ELSE 'driver' END;
  SELECT dr.name INTO v_drv_name FROM fleet.drivers dr
    WHERE dr.organization_id::text = p_company::text AND (dr.id::text = d.driver_id OR dr.legacy_kv_id = d.driver_id) LIMIT 1;
  SELECT tp.name INTO v_plaza FROM fleet.toll_plazas tp WHERE tp.id::text = c.plaza_id;
  SELECT v.license_plate INTO v_plate FROM fleet.vehicles v
    WHERE v.organization_id::text = p_company::text AND v.id::text = c.vehicle_id LIMIT 1;
  SELECT r.id INTO v_reopened FROM toll.disputes r
    WHERE r.organization_id = p_company AND r.reopens_id = d.id AND r.close_reason IS DISTINCT FROM 'undo' LIMIT 1;
  RETURN jsonb_build_object(
    'id', d.id, 'version', d.version, 'state', d.state, 'closeReason', d.close_reason,
    'platform', d.platform, 'driverId', d.driver_id, 'driverName', v_drv_name,
    'chargeId', d.charge_id, 'chargeWeekKey', d.charge_week_key, 'postedInWeekKey', d.posted_in_week_key,
    'openedLate', d.opened_late, 'reopensId', d.reopens_id,
    'occurredAt', c.occurred_at, 'plazaName', v_plaza, 'plate', v_plate,
    'tollMinor', v_toll, 'paidMinor', v_paid, 'owedMinor', d.owed_minor,
    'recoveredMinor', d.recovered_minor, 'leftMinor', v_left,
    'trip', toll_system.trip_json(p_company, d.platform, d.platform_trip_id),
    'deadline', d.deadline, 'windowDays', v_window, 'daysLeft', v_days,
    'windowClosed', v_closed, 'red', v_red, 'late', v_late, 'heldBySweep', v_hold,
    'canMarkSent', d.state = 'to_send' AND NOT v_closed,
    'canRefundReceived', d.state = 'sent',
    'canLost', d.state = 'sent',
    'bearerIfNotSent', jsonb_build_object('bearer', v_bearer_ns, 'amountMinor', v_left),
    'reopenedBy', v_reopened);
END; $$;

-- Result rows undo via intent_undo_dispute_result (decision_id only).
CREATE OR REPLACE FUNCTION toll_system.undo_body(p_company uuid, p_decision uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN d.intent IN ('settle_dispute', 'close_dispute_lost', 'dispute_expire', 'dispute_auto_close')
      THEN jsonb_build_object('decision_id', d.id)
    WHEN d.intent IN ('link_payback', 'driver_pays', 'fleet_absorbs', 'leave_payback_unlinked', 'apply_suggestion')
         AND (EXISTS (SELECT 1 FROM toll.allocations a WHERE a.organization_id = p_company AND a.decision_id = d.id
                        AND a.reversed_by IS NULL)
              OR EXISTS (SELECT 1 FROM toll.payback_unlinked_decisions u WHERE u.organization_id = p_company
                           AND u.decision_id = d.id AND u.reversed_by IS NULL))
      THEN jsonb_build_object('decision_id', d.id, 'expected_versions',
           coalesce((SELECT jsonb_object_agg(x.id, x.version) FROM (
               SELECT c.id::text AS id, c.version FROM toll.charges c
               WHERE c.organization_id = p_company
                 AND c.id IN (SELECT a.charge_id FROM toll.allocations a
                              WHERE a.organization_id = p_company AND a.decision_id = d.id)
               UNION
               SELECT p.id::text, p.version FROM toll.paybacks p
               WHERE p.organization_id = p_company
                 AND p.id IN (SELECT a.payback_id FROM toll.allocations a WHERE a.organization_id = p_company
                                AND a.decision_id = d.id AND a.payback_id IS NOT NULL
                              UNION
                              SELECT u.payback_id FROM toll.payback_unlinked_decisions u WHERE u.organization_id = p_company
                                AND u.decision_id = d.id AND u.payback_id IS NOT NULL)) x), '{}'::jsonb))
    END
  FROM toll.decisions d WHERE d.organization_id::text = p_company::text AND d.id = p_decision;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_undo_dispute_result(
  p_company uuid, p_target uuid, p_undo_decision uuid, p_cmd text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d_old            toll.disputes%ROWTYPE;
  d_dec            toll.decisions%ROWTYPE;
  v_new            uuid;
  v_line           int := 0;
  r                record;
  v_prior          text;
  v_sealed         boolean;
  v_link_amt       bigint;
  v_recovered      bigint;
  v_restore        bigint;
  v_bearer         text;
  v_refs           jsonb;
  v_prefix         text;
  -- P-02: the result's own entries sit in a week sealed since
  v_res_sealed     boolean;
  v_from_week      date;
  v_to_week        date;
  v_fact           uuid;
  v_driver         text;
  v_payback        uuid;
  n_p21            bigint;
  n_p6             bigint;
  n_p7             bigint;
  n_p8             bigint;
  a_p22            bigint;
  b_p23d           bigint;
  c_p23f           bigint;
  e_p24d           bigint;
  f_p24f           bigint;
BEGIN
  SELECT * INTO d_dec FROM toll.decisions x
  WHERE x.organization_id = p_company AND x.id = p_target;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('decision_id', p_target));
  END IF;

  SELECT d.* INTO d_old FROM toll.disputes d
  WHERE d.organization_id = p_company AND p_target = ANY (d.decision_ids)
  ORDER BY d.created_at DESC LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('decision_id', p_target));
  END IF;
  IF d_old.close_reason = 'undo' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('decision_id', p_target, 'state', 'already_undone'));
  END IF;

  SELECT coalesce(sum(l.amount_minor), 0) INTO v_link_amt
  FROM toll.dispute_links l
  WHERE l.organization_id = p_company AND l.decision_id = p_target AND l.reversed_by IS NULL;

  v_recovered := greatest(d_old.recovered_minor - v_link_amt, 0);
  v_sealed := toll_system.week_is_sealed(p_company, d_old.charge_week_key);

  IF d_dec.intent = 'dispute_expire' THEN
    v_prior := 'to_send';
  ELSIF d_dec.intent IN ('close_dispute_lost', 'dispute_auto_close') THEN
    v_prior := 'sent';
  ELSIF d_dec.intent = 'settle_dispute' AND d_old.sent_at IS NULL AND d_old.state IN ('won', 'part_won', 'expired') THEN
    v_prior := 'expired';
  ELSE
    v_prior := CASE WHEN d_old.sent_at IS NOT NULL THEN 'sent' ELSE 'to_send' END;
  END IF;

  v_prefix := 'toll:' || p_company::text || ':' || d_dec.command_id || ':';

  SELECT EXISTS (
    SELECT 1 FROM ledger.entries e
    WHERE e.organization_id = p_company AND e.reference_type = 'toll'
      AND e.idempotency_key LIKE v_prefix || '%'
      AND NOT (e.metadata ? 'carried_fact_id')
      AND toll_system.week_is_sealed(p_company, toll_system.entry_toll_week(e)))
  INTO v_res_sealed;

  -- Carried entries (and, when nothing of the result is sealed, every entry) are reversed one for one.
  FOR r IN
    SELECT e.amount_minor, e.effective_at, e.metadata
    FROM ledger.entries e
    WHERE e.organization_id = p_company AND e.reference_type = 'toll'
      AND e.idempotency_key LIKE v_prefix || '%'
      AND coalesce((e.metadata ->> 'reverse')::boolean, false) = false
      AND (NOT v_res_sealed OR e.metadata ? 'carried_fact_id')
    ORDER BY e.idempotency_key
  LOOP
    v_line := v_line + 1;
    v_refs := r.metadata - 'toll_rule' - 'design_ref' - 'reverse' - 'toll_week' - 'driverId';
    IF r.metadata ? 'driverId' THEN
      v_refs := v_refs || jsonb_build_object('driver_id', r.metadata ->> 'driverId');
    END IF;
    -- A reversal never lands in a sealed week (T1, B13): if the week the result posted in has
    -- been sealed since, the reversal posts in today's posting_week instead.
    PERFORM toll_system.post(
      p_company, r.metadata ->> 'toll_rule', r.amount_minor,
      CASE WHEN r.metadata ? 'carried_fact_id'
                AND toll_system.week_is_sealed(p_company, ledger.jamaica_week_start(r.effective_at))
           THEN ((toll_system.posting_week(p_company) + time '12:00') AT TIME ZONE 'America/Jamaica')
           ELSE r.effective_at END,
      p_cmd, v_line, v_refs, true);
  END LOOP;

  IF v_res_sealed THEN
    -- Net money the result moved through the charge's allocations (reversals count negative).
    SELECT
      coalesce(sum(s.amt) FILTER (WHERE s.rule LIKE 'P21\_%'), 0),
      coalesce(sum(s.amt) FILTER (WHERE s.rule LIKE 'P6\_%'), 0),
      coalesce(sum(s.amt) FILTER (WHERE s.rule LIKE 'P7\_%'), 0),
      coalesce(sum(s.amt) FILTER (WHERE s.rule LIKE 'P8\_%'), 0),
      (array_agg(s.payback_id) FILTER (WHERE s.payback_id IS NOT NULL))[1]
    INTO n_p21, n_p6, n_p7, n_p8, v_payback
    FROM (
      SELECT CASE WHEN coalesce((e.metadata ->> 'reverse')::boolean, false) THEN -e.amount_minor ELSE e.amount_minor END AS amt,
             e.metadata ->> 'toll_rule' AS rule,
             nullif(e.metadata ->> 'payback_id', '')::uuid AS payback_id
      FROM ledger.entries e
      WHERE e.organization_id = p_company AND e.reference_type = 'toll'
        AND e.idempotency_key LIKE v_prefix || '%'
        AND NOT (e.metadata ? 'carried_fact_id')
    ) s;

    -- The same move written as a sealed-week result would have written it (S1 apply helpers):
    -- P23 = the bearer took over the dispute receivable, P24 = a refund took over the bearer's share,
    -- P22 = a refund took over the dispute receivable.
    b_p23d := greatest(n_p7, 0);
    c_p23f := greatest(n_p8, 0);
    e_p24d := greatest(-n_p7, 0);
    f_p24f := greatest(-n_p8, 0);
    a_p22  := -n_p21 - b_p23d - c_p23f;
    IF a_p22 < 0 OR a_p22 + e_p24d + f_p24f <> n_p6
       OR ((a_p22 > 0 OR e_p24d > 0 OR f_p24f > 0) AND v_payback IS NULL) THEN
      RAISE EXCEPTION 'TOLL_UNDO_SEALED_UNEXPECTED: p21 % p6 % p7 % p8 %', n_p21, n_p6, n_p7, n_p8;
    END IF;

    SELECT c.driver_id, toll_system.charge_counted_week(p_company, c.id, c.week_key) INTO v_driver, v_from_week
    FROM toll.charges c WHERE c.organization_id = p_company AND c.id = d_old.charge_id;
    v_to_week := toll_system.posting_week(p_company);
  END IF;

  -- Allocations of a sealed charge week are never changed (allocations_sealed_week_guard).
  IF NOT v_res_sealed THEN
    UPDATE toll.allocations SET reversed_by = p_undo_decision
    WHERE organization_id = p_company AND decision_id = p_target AND reversed_by IS NULL;
  END IF;

  FOR r IN
    SELECT l.id FROM toll.dispute_links l
    WHERE l.organization_id = p_company AND l.decision_id = p_target AND l.reversed_by IS NULL
  LOOP
    UPDATE toll.dispute_links SET reversed_by = p_undo_decision WHERE organization_id = p_company AND id = r.id;
  END LOOP;

  UPDATE toll.disputes SET close_reason = 'undo'  -- state kept as it was (history is never relabelled)
  WHERE organization_id = p_company AND id = d_old.id;

  INSERT INTO toll.disputes (
    organization_id, charge_id, charge_week_key, platform, platform_trip_id, driver_id,
    owed_minor, recovered_minor, state, sent_at, clock_from, deadline, opened_late, text_version, reopens_id, decision_ids)
  VALUES (
    p_company, d_old.charge_id, d_old.charge_week_key, d_old.platform, d_old.platform_trip_id, d_old.driver_id,
    d_old.owed_minor, v_recovered, v_prior, d_old.sent_at, d_old.clock_from, d_old.deadline, d_old.opened_late,
    d_old.text_version, d_old.id, ARRAY[p_undo_decision])
  RETURNING id INTO v_new;

  IF v_res_sealed THEN
    INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, decision_id, dispute_id)
    VALUES (p_company, 'dispute_result', d_old.charge_id, v_from_week, v_to_week,
            a_p22 + b_p23d + c_p23f + e_p24d + f_p24f, p_undo_decision, v_new)
    RETURNING id INTO v_fact;

    IF a_p22 > 0 THEN
      v_line := v_line + 1;
      PERFORM toll_system.dispute_post_clear(p_company, 'P22_dispute_refund', a_p22, d_old.id, v_payback,
        d_old.charge_id, v_driver, p_cmd, v_line, v_to_week, v_fact, true);
    END IF;
    IF b_p23d > 0 THEN
      v_line := v_line + 1;
      PERFORM toll_system.dispute_post_clear(p_company, 'P23_dispute_to_driver', b_p23d, d_old.id, NULL,
        d_old.charge_id, v_driver, p_cmd, v_line, v_to_week, v_fact, true);
    END IF;
    IF c_p23f > 0 THEN
      v_line := v_line + 1;
      PERFORM toll_system.dispute_post_clear(p_company, 'P23_dispute_to_fleet', c_p23f, d_old.id, NULL,
        d_old.charge_id, v_driver, p_cmd, v_line, v_to_week, v_fact, true);
    END IF;
    IF e_p24d > 0 THEN
      v_line := v_line + 1;
      PERFORM toll_system.dispute_post_clear(p_company, 'P24_expired_refund_driver', e_p24d, d_old.id, v_payback,
        d_old.charge_id, v_driver, p_cmd, v_line, v_to_week, v_fact, true);
    END IF;
    IF f_p24f > 0 THEN
      v_line := v_line + 1;
      PERFORM toll_system.dispute_post_clear(p_company, 'P24_expired_refund_fleet', f_p24f, d_old.id, v_payback,
        d_old.charge_id, v_driver, p_cmd, v_line, v_to_week, v_fact, true);
    END IF;
  ELSIF NOT v_sealed THEN
    v_restore := d_old.owed_minor - v_recovered;
    IF v_restore > 0 THEN
      IF v_prior = 'expired' THEN
        v_bearer := coalesce(d_old.bearer, toll_system.late_found_bearer(p_company));
        v_line := v_line + 1;
        PERFORM toll_system.dispute_insert_allocation(
          p_company, d_old.charge_id, v_bearer, v_restore, NULL, false, v_new,
          'undo_restore_expired', p_undo_decision, p_cmd, v_line);
      ELSE
        v_line := v_line + 1;
        PERFORM toll_system.dispute_apply_open_provisional(
          p_company, v_new, d_old.charge_id, v_restore, p_undo_decision, p_cmd, v_line);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('dispute_id', v_new, 'reopens_id', d_old.id, 'state', v_prior);
END;
$$;

REVOKE ALL ON FUNCTION toll_system.dispute_expire(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_settle_dispute(uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_reopen_after_link_reverse(uuid, uuid, bigint, text, uuid, text, int, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_undo_dispute_result(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- Disputes already borne by the fleet only because they were found late, in a week still open and with nothing
-- refunded yet: move them to the setting's bearer (a system decision; the ledger moves in that open week).
DO $$
DECLARE
  r      record;
  v_dec  uuid;
  v_cmd  text;
  v_to   text;
BEGIN
  FOR r IN
    SELECT d.organization_id AS org, d.id AS dispute_id, d.charge_id, a.id AS alloc_id, a.amount_minor
    FROM toll.disputes d
    JOIN toll.charges c ON c.organization_id = d.organization_id AND c.id = d.charge_id
    JOIN toll.allocations a ON a.organization_id = d.organization_id AND a.charge_id = d.charge_id
      AND a.dispute_id = d.id AND a.bearer = 'fleet' AND a.reason = 'opened_late' AND a.reversed_by IS NULL
    WHERE d.opened_late AND d.state = 'expired' AND d.bearer = 'fleet' AND d.recovered_minor = 0
      AND d.close_reason IS DISTINCT FROM 'undo'
      AND toll_system.late_found_bearer(d.organization_id) <> 'fleet'
      AND NOT toll_system.week_is_sealed(d.organization_id, toll_system.charge_counted_week(d.organization_id, c.id, c.week_key))
  LOOP
    v_to := toll_system.late_found_bearer(r.org);
    v_cmd := 'late-found-bearer:' || r.dispute_id::text;
    INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_job, targets)
    VALUES (r.org, v_cmd, 'late_found_bearer', 'system', 'migration:20261122001015',
            jsonb_build_object('dispute_id', r.dispute_id, 'charge_id', r.charge_id, 'to', v_to))
    RETURNING id INTO v_dec;
    PERFORM toll_system.dispute_reverse_allocation(r.org, r.alloc_id, v_dec, v_cmd, 1);
    PERFORM toll_system.dispute_insert_allocation(
      r.org, r.charge_id, v_to, r.amount_minor, NULL, false, r.dispute_id, 'opened_late', v_dec, v_cmd, 2);
    UPDATE toll.disputes SET bearer = v_to, decision_ids = array_append(decision_ids, v_dec)
    WHERE organization_id = r.org AND id = r.dispute_id;
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = r.org AND id = r.charge_id;
  END LOOP;
END;
$$;

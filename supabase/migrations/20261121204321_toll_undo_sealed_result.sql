-- P-02 (R10, done-test 15): undo of a dispute result whose week was sealed after the result posted.
--
-- A result that arrives while its charge week is open moves money by reversing / inserting the charge's
-- allocations (P21 / P6 / P7 / P8 in the charge week). If that week is sealed afterwards, an undo could neither
-- post those reversals (WEEK_SEALED) nor touch the allocations (allocations_sealed_week_guard).
--
-- Now: when any of the result's own (not carried) entries sits in a sealed week, the undo leaves the allocations
-- as they are and posts the result's net money back in the open posting week, the way a result that arrives
-- after its charge week sealed posts it (S1 apply helpers): P22 / P23 / P24, reversed, tagged with a new
-- 'dispute_result' carried fact (from the sealed week to the posting week). That restores "owed by Uber" (or the
-- bearer's charge for an expired dispute). The new dispute row reopens as before; no provisional allocation is
-- added (the charge week is sealed), so its next result takes the sealed path.
--
-- A second undo of the same result is refused WRONG_STATE already_undone (was a raw DISPUTE_FINAL_LOCKED).
--
-- rule2 (refund on a sent dispute) with a sealed charge week no longer needs an active provisional allocation:
-- a dispute reopened this way has none, and its refund still clears the receivable by P22 in the open week.

CREATE OR REPLACE FUNCTION toll_system.dispute_apply_rule2_refund(
  p_company uuid, p_dispute uuid, p_charge uuid, p_payback uuid, p_amount bigint,
  p_decision uuid, p_cmd text, p_line int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cw          date;
  v_sealed      boolean;
  v_prov        uuid;
  v_prov_amt    bigint;
  v_remain      bigint;
  v_carried     record;
  v_fact        uuid;
  v_driver      text;
  v_root        uuid;
BEGIN
  SELECT c.driver_id, toll_system.charge_counted_week(p_company, c.id, c.week_key) INTO v_driver, v_cw
  FROM toll.charges c WHERE c.organization_id = p_company AND c.id = p_charge;

  v_sealed := toll_system.week_is_sealed(p_company, v_cw);
  v_root := toll_system.dispute_chain_root(p_company, p_dispute);

  SELECT a.id, a.amount_minor INTO v_prov, v_prov_amt
  FROM toll.allocations a
  WHERE a.organization_id = p_company AND a.charge_id = p_charge
    AND a.dispute_id IN (p_dispute, v_root)
    AND a.reversed_by IS NULL AND a.provisional AND a.bearer = 'platform'
  ORDER BY a.created_at, a.id LIMIT 1 FOR UPDATE;

  IF NOT v_sealed THEN
    IF v_prov IS NOT NULL THEN
      v_remain := v_prov_amt - p_amount;
      p_line := p_line + 1;
      PERFORM toll_system.dispute_reverse_allocation(p_company, v_prov, p_decision, p_cmd, p_line);
      IF p_amount > 0 THEN
        p_line := p_line + 1;
        PERFORM toll_system.dispute_insert_allocation(
          p_company, p_charge, 'platform', p_amount, p_payback, false, p_dispute, 'dispute_refund', p_decision, p_cmd, p_line);
      END IF;
      IF v_remain > 0 THEN
        p_line := p_line + 1;
        PERFORM toll_system.dispute_insert_allocation(
          p_company, p_charge, 'platform', v_remain, NULL, true, p_dispute, 'dispute_remainder', p_decision, p_cmd, p_line);
      END IF;
    END IF;
  ELSE
    SELECT c.to_week, c.fact_id INTO v_carried FROM toll_system.dispute_begin_carried_result(p_company, p_dispute, v_cw, p_decision) c;
    v_fact := v_carried.fact_id;
    IF p_amount > 0 THEN
      p_line := p_line + 1;
      PERFORM toll_system.dispute_post_clear(
        p_company, 'P22_dispute_refund', p_amount, p_dispute, p_payback, p_charge, v_driver, p_cmd, p_line,
        v_carried.to_week, v_fact);
    END IF;
    UPDATE toll.carried_facts SET amount_minor = p_amount
    WHERE organization_id = p_company AND id = v_fact;
    UPDATE toll.disputes SET posted_in_week_key = v_carried.to_week
    WHERE organization_id = p_company AND id = p_dispute;
  END IF;
  RETURN p_line;
END;
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
        IF d_old.opened_late THEN
          v_bearer := 'fleet';
        ELSE
          SELECT coalesce(dp.expired_bearer, 'driver') INTO v_bearer FROM toll.dispute_policy dp
          WHERE dp.organization_id = p_company;
        END IF;
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

REVOKE ALL ON FUNCTION toll_system.dispute_apply_rule2_refund(uuid, uuid, uuid, uuid, bigint, uuid, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_undo_dispute_result(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

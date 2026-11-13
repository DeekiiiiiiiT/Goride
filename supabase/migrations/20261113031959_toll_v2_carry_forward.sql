-- Toll rebuild Phase 2 P2-R4c: carry_forward (design G2, B3 "carry_forward", B5 P18 / P19, B6; Part F P2-R4).
--
-- A late fact against a week that is sealed AND whose drivers are paid can't reopen that week. carry_forward brings
-- it into an open week instead (to_week: the current week unless the body names a later open one). The paid week
-- never changes. Every carried fact gets a toll.carried_facts row, the record its ledger legs point at (I2), and the
-- only source of week_result.carriedIn.
--
--   kind            body                                          what happens in to_week
--   charge          charge_id (an after_seal charge)              counted in to_week; P2 / P3 now; decided like any charge
--   payback         payback_id (an after_seal payback)            its week becomes to_week; P4 / P5 now; decided as usual
--   take_back       payback_id (an active payback of the paid     P18: the leftover part clears (P18a); the covered part
--                   week), reference, paid_on, bearer             goes to the bearer (P18b). The paid week, the payback and
--                                                                 its slices stay exactly as sealed
--   correction_down charge_id, amount_minor (the right amount)    P19: the difference split by who bore the charge (C3
--                                                                 rounding). The platform share waits for a person
--                                                                 (leave_payback_unlinked with carried_fact_id) and blocks
--                                                                 to_week's seal until decided
--   correction_up   charge_id, amount_minor (the right amount)    a new charge of the difference (adjusts_charge_id),
--                                                                 counted in to_week, posted and decided like any charge
-- Refusals: WEEK_NOT_SEALED / REOPEN_INSTEAD (Phase 0 checks), WEEK_SEALED (to_week), WRONG_STATE, VERSION_CHANGED.
--
-- Decisions made here (one each):
--   * A carried CHARGE keeps its week_key (the fact's week) and counts in to_week through charge_counted_week, as
--     designed in Phase 0. Its postings must land in to_week, so every posting of a charge now uses
--     toll_system.charge_post_at (its crossing time, or noon on the Monday of the week it is counted in).
--   * A carried PAYBACK's week_key BECOMES to_week (the from_week stays on its carried row). A sealed week's facts hash
--     never included after_seal paybacks, so the paid week is unchanged, and every reader of a payback's week counts
--     it in to_week with no change.
--   * One carried row per posted leg (a P18 leftover and covered part, each P19 share; bearer NULL = the platform /
--     leftover part), so each check counts rows, never re-splits money.
--   * A take-back reverses the whole payback, as in R4b; a second take-back of the same payback is refused.

-- 1. Helpers -------------------------------------------------------------------------------------------------
-- When a charge's postings happen: its crossing time, or, once it is carried, noon on Monday of the week it counts in.
CREATE OR REPLACE FUNCTION toll_system.charge_post_at(p_company uuid, p_charge uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN w.cw = c.week_key THEN c.occurred_at
              ELSE (w.cw + time '12:00') AT TIME ZONE 'America/Jamaica' END
  FROM toll.charges c
  CROSS JOIN LATERAL (SELECT toll_system.charge_counted_week(p_company, c.id, c.week_key) AS cw) w
  WHERE c.organization_id = p_company AND c.id = p_charge;
$$;

-- Carried money landing in a week, by what it is (check 3 and the week result read the same rows).
CREATE OR REPLACE FUNCTION toll_system.carried_sum(p_company uuid, p_week date, p_what text)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(sum(f.amount_minor), 0)::bigint
  FROM toll.carried_facts f
  LEFT JOIN toll.charges c ON f.kind = 'correction_down' AND c.organization_id = f.organization_id AND c.id = f.original_id
  LEFT JOIN toll.paybacks p ON f.kind = 'take_back' AND p.organization_id = f.organization_id AND p.id = f.original_id
  WHERE f.organization_id = p_company AND f.to_week = p_week
    AND CASE p_what
      WHEN 'tb_leftover' THEN f.kind = 'take_back' AND f.bearer IS NULL
      WHEN 'tb_fleet'    THEN f.kind = 'take_back' AND f.bearer = 'fleet'
      WHEN 'tb_driver'   THEN f.kind = 'take_back' AND f.bearer = 'driver'
      WHEN 'tb_card'     THEN f.kind = 'take_back' AND p.received_by = 'fleet'
      WHEN 'tb_cash'     THEN f.kind = 'take_back' AND p.received_by = 'driver'
      WHEN 'cd_platform' THEN f.kind = 'correction_down' AND f.bearer IS NULL
      WHEN 'cd_fleet'    THEN f.kind = 'correction_down' AND f.bearer = 'fleet'
      WHEN 'cd_driver'   THEN f.kind = 'correction_down' AND f.bearer = 'driver'
      WHEN 'cd_tag'      THEN f.kind = 'correction_down' AND c.paid_by = 'tag'
      WHEN 'cd_cash'     THEN f.kind = 'correction_down' AND c.paid_by = 'cash'
      ELSE false END;
$$;

-- What of a carried platform share (P19) is still undecided.
CREATE OR REPLACE FUNCTION toll_system.carried_open_minor(p_company uuid, p_fact uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (f.amount_minor - coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                                     WHERE u.organization_id = f.organization_id AND u.carried_fact_id = f.id
                                       AND u.reversed_by IS NULL), 0))::bigint
  FROM toll.carried_facts f WHERE f.organization_id = p_company AND f.id = p_fact;
$$;

CREATE OR REPLACE FUNCTION toll_write.lock_carried(p_company uuid, p_id uuid, p_expected bigint,
                                                   p_field text DEFAULT 'expected_carried_version')
RETURNS toll.carried_facts LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE f toll.carried_facts%ROWTYPE;
BEGIN
  SELECT * INTO f FROM toll.carried_facts x WHERE x.organization_id = p_company AND x.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('carried_fact_id', p_id));
  END IF;
  IF p_expected IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array(p_field), 'carried_fact_id', p_id));
  END IF;
  IF f.version <> p_expected THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object('carried_fact_id', f.id, 'version', f.version,
                                                                    'open_minor', toll_system.carried_open_minor(p_company, f.id)));
  END IF;
  RETURN f;
END;
$$;

-- 2. carry_forward ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_carry_forward(p_company uuid, p_decision_id uuid, p_command_id text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from_week date := (p_body ->> 'from_week')::date;
  v_to_week   date := coalesce(nullif(p_body ->> 'to_week', '')::date, ledger.jamaica_week_start(now()));
  v_kind      text := p_body ->> 'kind';
  v_eff       timestamptz;
  v_fact      uuid;
  v_facts     jsonb := '[]'::jsonb;
  v_new       uuid;
  v_line      int := 0;
  v_amount    bigint;
  v_open      bigint;
  v_cut       bigint;
  v_total     bigint;
  v_share     jsonb := '{}'::jsonb;
  v_sum       bigint := 0;
  v_left      bigint;
  v_t         bigint;
  v_s         bigint;
  v_bearer    text;
  v_ver       bigint;
  v_extra     jsonb := '{}'::jsonb;
  b           text;
  c           toll.charges%ROWTYPE;
  p           toll.paybacks%ROWTYPE;
BEGIN
  IF v_from_week IS NULL OR v_kind IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('from_week', 'kind')));
  END IF;
  IF v_kind NOT IN ('charge', 'payback', 'take_back', 'correction_down', 'correction_up') THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('kind', v_kind,
      'allowed', jsonb_build_array('charge', 'payback', 'take_back', 'correction_down', 'correction_up')));
  END IF;
  v_to_week := ledger.jamaica_week_start((v_to_week + time '12:00') AT TIME ZONE 'America/Jamaica');   -- a Monday
  IF v_to_week <= v_from_week THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('to_week', v_to_week, 'must_be_after', v_from_week));
  END IF;

  -- Phase 0 checks: the from week is sealed and its drivers are paid (otherwise reopen it instead).
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_from_week, v_to_week]);
  IF NOT toll_system.week_is_sealed(p_company, v_from_week) THEN
    PERFORM toll_write.refuse('WEEK_NOT_SEALED', jsonb_build_object('week_key', v_from_week));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ledger.settlement_movements m
                 WHERE m.organization_id = p_company AND m.period_anchor = v_from_week
                   AND m.kind IN ('pay', 'write_off') AND m.status = 'posted') THEN
    PERFORM toll_write.refuse('REOPEN_INSTEAD', jsonb_build_object('week_key', v_from_week));
  END IF;
  PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_to_week]);
  v_eff := (v_to_week + time '12:00') AT TIME ZONE 'America/Jamaica';

  IF v_kind IN ('charge', 'correction_down', 'correction_up') THEN
    c := toll_write.lock_charge(p_company, nullif(p_body ->> 'charge_id', '')::uuid,
                                (p_body ->> 'expected_charge_version')::bigint);
    IF toll_system.charge_counted_week(p_company, c.id, c.week_key) <> v_from_week THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', 'not_in_from_week',
        'week_key', toll_system.charge_counted_week(p_company, c.id, c.week_key)));
    END IF;
  ELSE
    p := toll_write.lock_payback(p_company, nullif(p_body ->> 'payback_id', '')::uuid,
                                 (p_body ->> 'expected_payback_version')::bigint);
    IF p.week_key <> v_from_week THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id, 'state', 'not_in_from_week',
                                                                  'week_key', p.week_key));
    END IF;
  END IF;

  -- A late charge ---------------------------------------------------------------------------------------------
  IF v_kind = 'charge' THEN
    IF NOT c.after_seal THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', 'not_after_seal'));
    END IF;
    IF c.duplicate_of IS NOT NULL OR c.evidence_status = 'rejected' THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id,
        'state', CASE WHEN c.duplicate_of IS NOT NULL THEN 'duplicate' ELSE 'rejected' END));
    END IF;
    INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, decision_id)
    VALUES (p_company, 'charge', c.id, v_from_week, v_to_week, c.amount_minor, p_decision_id) RETURNING id INTO v_fact;
    UPDATE toll.charges SET after_seal = false, version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_ver;
    IF c.evidence_status = 'verified' THEN       -- an unverified cash receipt posts P3 when it is verified
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, CASE WHEN c.paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END,
                               c.amount_minor, toll_system.charge_post_at(p_company, c.id), p_command_id, v_line,
                               jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id));
    END IF;
    v_facts := jsonb_build_array(v_fact);
    v_amount := c.amount_minor;
    v_extra := jsonb_build_object('charge_version', v_ver);

  -- A late payback ---------------------------------------------------------------------------------------------
  ELSIF v_kind = 'payback' THEN
    IF NOT p.after_seal OR p.reversal_of IS NOT NULL OR p.kind = 'native' THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id,
        'state', CASE WHEN NOT p.after_seal THEN 'not_after_seal' WHEN p.kind = 'native' THEN 'roam_native'
                      ELSE 'reversing_payback' END));
    END IF;
    INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, decision_id)
    VALUES (p_company, 'payback', p.id, v_from_week, v_to_week, p.amount_minor, p_decision_id) RETURNING id INTO v_fact;
    UPDATE toll.paybacks SET after_seal = false, week_key = v_to_week, version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = p.id RETURNING version INTO v_ver;
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, CASE WHEN p.received_by = 'fleet' THEN 'P4_payback_fleet' ELSE 'P5_payback_driver' END,
                             p.amount_minor, v_eff, p_command_id, v_line,
                             jsonb_build_object('payback_id', p.id, 'driver_id', p.driver_id));
    v_facts := jsonb_build_array(v_fact);
    v_amount := p.amount_minor;
    v_extra := jsonb_build_object('payback_version', v_ver);

  -- A take-back of a payback in the paid week (P18) -------------------------------------------------------------
  ELSIF v_kind = 'take_back' THEN
    v_bearer := p_body ->> 'bearer';
    IF v_bearer IS NULL OR v_bearer NOT IN ('fleet', 'driver') OR nullif(btrim(p_body ->> 'reference'), '') IS NULL
       OR nullif(p_body ->> 'paid_on', '') IS NULL THEN
      PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('bearer (fleet | driver)', 'reference', 'paid_on')));
    END IF;
    IF v_bearer = 'driver' AND p.driver_id IS NULL THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id, 'state', 'no_driver'));
    END IF;
    IF p.after_seal OR p.reversal_of IS NOT NULL OR p.kind = 'native'
       OR EXISTS (SELECT 1 FROM toll.paybacks r WHERE r.organization_id = p_company AND r.reversal_of = p.id) THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id, 'state', 'not_an_active_payback'));
    END IF;
    IF EXISTS (SELECT 1 FROM toll.carried_facts f WHERE f.organization_id = p_company AND f.kind = 'take_back'
                 AND f.original_id = p.id) THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id, 'state', 'already_taken_back'));
    END IF;
    IF (p_body ? 'amount_minor') AND toll_write.body_amount(p_body) <> p.amount_minor THEN
      PERFORM toll_write.refuse('PARTIAL_TAKE_BACK', jsonb_build_object('payback_id', p.id, 'amount_minor', p.amount_minor,
                                                                        'taken_back_minor', toll_write.body_amount(p_body)));
    END IF;
    v_open := p.amount_minor - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                                         WHERE a.organization_id = p_company AND a.payback_id = p.id AND a.reversed_by IS NULL), 0);
    v_cut := p.amount_minor - v_open;               -- the part that covered tolls
    IF v_open > 0 THEN                              -- step a: the leftover never covered a toll; it just clears
      INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, decision_id)
      VALUES (p_company, 'take_back', p.id, v_from_week, v_to_week, v_open, p_decision_id) RETURNING id INTO v_fact;
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, CASE WHEN p.received_by = 'fleet' THEN 'P18a_leftover_fleet' ELSE 'P18a_leftover_driver' END,
                               v_open, v_eff, p_command_id, v_line,
                               jsonb_build_object('carried_fact_id', v_fact, 'driver_id', p.driver_id));
      v_facts := v_facts || to_jsonb(v_fact);
    END IF;
    IF v_cut > 0 THEN                               -- step b: the covered part, borne by the chosen bearer
      INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, bearer, decision_id)
      VALUES (p_company, 'take_back', p.id, v_from_week, v_to_week, v_cut, v_bearer, p_decision_id) RETURNING id INTO v_fact;
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, 'P18b_' || v_bearer || '_' || CASE WHEN p.received_by = 'fleet' THEN 'card' ELSE 'cash' END,
                               v_cut, v_eff, p_command_id, v_line,
                               jsonb_build_object('carried_fact_id', v_fact, 'driver_id', p.driver_id));
      v_facts := v_facts || to_jsonb(v_fact);
    END IF;
    UPDATE toll.paybacks SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = p.id RETURNING version INTO v_ver;
    v_amount := p.amount_minor;
    v_extra := jsonb_build_object('payback_version', v_ver, 'leftover_minor', v_open, 'covered_minor', v_cut, 'bearer', v_bearer,
                                  'reference', p_body ->> 'reference', 'paid_on', p_body ->> 'paid_on');

  -- An amount correction against the paid week ----------------------------------------------------------------
  ELSE
    v_amount := toll_write.body_amount(p_body);
    IF v_amount IS NULL OR nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
      PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('amount_minor', 'reason_code')));
    END IF;
    IF c.after_seal OR c.duplicate_of IS NOT NULL OR c.evidence_status <> 'verified' THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', toll_system.charge_state(p_company, c.id)));
    END IF;
    IF (v_kind = 'correction_down' AND v_amount >= c.amount_minor) OR (v_kind = 'correction_up' AND v_amount <= c.amount_minor) THEN
      PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('kind', v_kind, 'amount_minor', v_amount,
                                                                  'charge_amount_minor', c.amount_minor));
    END IF;
    -- the import may have left this correction waiting for a person: it is now decided
    UPDATE toll.charge_changes SET pending = false, decision_id = coalesce(decision_id, p_decision_id)
    WHERE organization_id = p_company AND charge_id = c.id AND field = 'amount_minor' AND pending;
    INSERT INTO toll.charge_changes (organization_id, charge_id, field, old_value, new_value, pending, decision_id)
    VALUES (p_company, c.id, 'amount_minor', c.amount_minor::text, v_amount::text, false, p_decision_id);

    IF v_kind = 'correction_up' THEN          -- a new charge of the difference, counted and decided in to_week
      INSERT INTO toll.charges (organization_id, vehicle_id, driver_id, plaza_id, occurred_at, week_key, time_precision,
                                amount_minor, paid_by, source, source_ref, evidence_status, adjusts_charge_id, evidence)
      VALUES (p_company, c.vehicle_id, c.driver_id, c.plaza_id, c.occurred_at, c.week_key, c.time_precision,
              v_amount - c.amount_minor, c.paid_by, c.source, c.source_ref || ':up:' || p_decision_id, 'verified', c.id,
              c.evidence)
      RETURNING id INTO v_new;
      INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, decision_id)
      VALUES (p_company, 'correction_up', v_new, v_from_week, v_to_week, v_amount - c.amount_minor, p_decision_id)
      RETURNING id INTO v_fact;
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, CASE WHEN c.paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END,
                               v_amount - c.amount_minor, toll_system.charge_post_at(p_company, v_new), p_command_id, v_line,
                               jsonb_build_object('charge_id', v_new, 'driver_id', c.driver_id));
      v_facts := jsonb_build_array(v_fact);
      v_extra := jsonb_build_object('adjusting_charge_id', v_new);
      v_amount := v_amount - c.amount_minor;
    ELSE                                      -- P19: split D by who bore the charge (C3 rounding)
      v_amount := c.amount_minor - v_amount;   -- D
      SELECT coalesce(sum(a.amount_minor), 0) INTO v_total FROM toll.allocations a
      WHERE a.organization_id = p_company AND a.charge_id = c.id AND a.reversed_by IS NULL;
      IF v_total <= 0 THEN
        PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', 'no_decision_to_split'));
      END IF;
      FOREACH b IN ARRAY ARRAY['driver', 'fleet', 'platform'] LOOP
        SELECT coalesce(sum(a.amount_minor), 0) INTO v_t FROM toll.allocations a
        WHERE a.organization_id = p_company AND a.charge_id = c.id AND a.reversed_by IS NULL AND a.bearer = b;
        v_s := (v_amount * v_t) / v_total;
        v_share := v_share || jsonb_build_object(b, v_s);
        v_sum := v_sum + v_s;
      END LOOP;
      v_left := v_amount - v_sum;
      FOREACH b IN ARRAY ARRAY['driver', 'fleet', 'platform'] LOOP
        EXIT WHEN v_left = 0;
        SELECT coalesce(sum(a.amount_minor), 0) INTO v_t FROM toll.allocations a
        WHERE a.organization_id = p_company AND a.charge_id = c.id AND a.reversed_by IS NULL AND a.bearer = b;
        v_s := (v_share ->> b)::bigint;
        v_cut := least(v_left, v_t - v_s);
        v_share := v_share || jsonb_build_object(b, v_s + v_cut);
        v_left := v_left - v_cut;
      END LOOP;
      FOREACH b IN ARRAY ARRAY['driver', 'fleet', 'platform'] LOOP
        v_s := (v_share ->> b)::bigint;
        CONTINUE WHEN v_s <= 0;
        INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, bearer, decision_id)
        VALUES (p_company, 'correction_down', c.id, v_from_week, v_to_week, v_s, CASE WHEN b = 'platform' THEN NULL ELSE b END,
                p_decision_id)
        RETURNING id INTO v_fact;
        v_line := v_line + 1;
        PERFORM toll_system.post(p_company, 'P19_' || c.paid_by || '_' || b, v_s, v_eff, p_command_id, v_line,
                                 jsonb_build_object('carried_fact_id', v_fact, 'driver_id', c.driver_id));
        v_facts := v_facts || to_jsonb(v_fact);
      END LOOP;
      v_extra := jsonb_build_object('shares', v_share);
    END IF;
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_ver;
    v_extra := v_extra || jsonb_build_object('charge_version', v_ver);
  END IF;

  RETURN jsonb_build_object('decision_id', p_decision_id, 'kind', v_kind, 'from_week', v_from_week, 'to_week', v_to_week,
                            'carried_fact_ids', v_facts, 'amount_minor', v_amount)
         || v_extra
         || jsonb_build_object('weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_to_week,
                                 jsonb_build_object('carried_' || v_kind || '_minor', v_amount, 'from_week', v_from_week))));
END;
$$;

-- 3. leave_payback_unlinked, now also for a carried P19 platform share ------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_leave_payback_unlinked(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p      toll.paybacks%ROWTYPE;
  f      toll.carried_facts%ROWTYPE;
  v_id   uuid := nullif(p_body ->> 'payback_id', '')::uuid;
  v_fid  uuid := nullif(p_body ->> 'carried_fact_id', '')::uuid;
  v_pw   date;
  v_open bigint;
  v_take bigint;
  v_pv   bigint;
BEGIN
  IF nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('reason_code')));
  END IF;

  IF v_fid IS NOT NULL THEN     -- a P19 platform share, decided on its carried row in the open week (B3)
    SELECT x.to_week INTO v_pw FROM toll.carried_facts x WHERE x.organization_id = p_company AND x.id = v_fid;
    PERFORM toll_write.lock_weeks(p_company, ARRAY[v_pw]);
    f := toll_write.lock_carried(p_company, v_fid, (p_body ->> 'expected_carried_version')::bigint);
    IF f.kind <> 'correction_down' OR f.bearer IS NOT NULL THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('carried_fact_id', f.id, 'state', 'not_a_platform_share'));
    END IF;
    PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_pw]);
    v_open := toll_system.carried_open_minor(p_company, f.id);
    IF v_open <= 0 THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('carried_fact_id', f.id, 'state', 'nothing_left'));
    END IF;
    v_take := coalesce(toll_write.body_amount(p_body), v_open);
    IF v_take > v_open THEN
      PERFORM toll_write.refuse('AMOUNT_TOO_LARGE', jsonb_build_object('amount_minor', v_take, 'carried_open_minor', v_open));
    END IF;
    INSERT INTO toll.payback_unlinked_decisions (organization_id, carried_fact_id, amount_minor, reason, decision_id)
    VALUES (p_company, f.id, v_take, p_body ->> 'reason_code', p_decision);
    UPDATE toll.carried_facts SET version = version + 1 WHERE organization_id = p_company AND id = f.id RETURNING version INTO v_pv;
    RETURN jsonb_build_object('decision_id', p_decision, 'carried_version', v_pv, 'amount_minor', v_take,
      'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_pw,
                 jsonb_build_object('left_unlinked_minor', v_take))));
  END IF;

  SELECT x.week_key INTO v_pw FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = v_id;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_pw]);
  p := toll_write.lock_payback(p_company, v_id, (p_body ->> 'expected_payback_version')::bigint);
  PERFORM toll_write.require_payback_usable(p_company, p);
  PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_pw]);

  v_open := toll_system.payback_open_minor(p_company, p.id);
  IF v_open <= 0 THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id, 'state', 'nothing_left', 'open_minor', v_open));
  END IF;
  v_take := coalesce(toll_write.body_amount(p_body), v_open);
  IF v_take > v_open THEN
    PERFORM toll_write.refuse('AMOUNT_TOO_LARGE', jsonb_build_object('amount_minor', v_take, 'payback_open_minor', v_open));
  END IF;

  INSERT INTO toll.payback_unlinked_decisions (organization_id, payback_id, amount_minor, reason, decision_id)
  VALUES (p_company, p.id, v_take, p_body ->> 'reason_code', p_decision);
  UPDATE toll.paybacks SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = p.id RETURNING version INTO v_pv;

  RETURN jsonb_build_object('decision_id', p_decision, 'payback_version', v_pv, 'amount_minor', v_take,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_pw,
               jsonb_build_object('left_unlinked_minor', v_take))));
END;
$$;

-- 4. undo_decision, now also for unlinked rows on a carried share ---------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_undo_decision(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d          toll.decisions%ROWTYPE;
  v_target   uuid := nullif(p_body ->> 'decision_id', '')::uuid;
  v_exp      jsonb := coalesce(p_body -> 'expected_versions', '{}'::jsonb);
  v_charges  uuid[];
  v_paybacks uuid[];
  v_facts    uuid[];
  v_weeks    date[];
  v_id       uuid;
  v_line     int := 0;
  v_amt      bigint;
  v_deltas   jsonb := '{}'::jsonb;
  v_versions jsonb := '{}'::jsonb;
  v_ver      bigint;
  r          record;
  c          toll.charges%ROWTYPE;
  p          toll.paybacks%ROWTYPE;
  f          toll.carried_facts%ROWTYPE;
BEGIN
  IF v_target IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('decision_id')));
  END IF;
  SELECT * INTO d FROM toll.decisions x WHERE x.organization_id = p_company AND x.id = v_target;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('decision_id', v_target));
  END IF;
  IF d.intent NOT IN ('link_payback', 'driver_pays', 'fleet_absorbs', 'leave_payback_unlinked', 'apply_suggestion') THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('decision_id', v_target, 'intent', d.intent,
      'state', 'not_undoable',
      'use', CASE d.intent WHEN 'confirm_duplicate' THEN 'release_duplicate'
                           WHEN 'verify_cash_receipt' THEN 'correct_charge_amount or a new decision'
                           WHEN 'seal_week' THEN 'reopen_week' ELSE NULL END));
  END IF;

  v_charges := array(SELECT DISTINCT a.charge_id FROM toll.allocations a
                     WHERE a.organization_id = p_company AND a.decision_id = v_target ORDER BY 1);
  v_paybacks := array(SELECT DISTINCT x FROM (
                        SELECT a.payback_id AS x FROM toll.allocations a
                        WHERE a.organization_id = p_company AND a.decision_id = v_target AND a.payback_id IS NOT NULL
                        UNION
                        SELECT u.payback_id FROM toll.payback_unlinked_decisions u
                        WHERE u.organization_id = p_company AND u.decision_id = v_target AND u.payback_id IS NOT NULL) y
                      ORDER BY 1);
  v_facts := array(SELECT DISTINCT u.carried_fact_id FROM toll.payback_unlinked_decisions u
                   WHERE u.organization_id = p_company AND u.decision_id = v_target AND u.carried_fact_id IS NOT NULL ORDER BY 1);
  IF NOT EXISTS (SELECT 1 FROM toll.allocations a WHERE a.organization_id = p_company AND a.decision_id = v_target
                   AND a.reversed_by IS NULL)
     AND NOT EXISTS (SELECT 1 FROM toll.payback_unlinked_decisions u WHERE u.organization_id = p_company
                       AND u.decision_id = v_target AND u.reversed_by IS NULL) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('decision_id', v_target, 'state', 'already_undone'));
  END IF;

  v_weeks := array(SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) FROM toll.charges x
                   WHERE x.organization_id = p_company AND x.id = ANY (v_charges)
                   UNION SELECT x.week_key FROM toll.paybacks x
                   WHERE x.organization_id = p_company AND x.id = ANY (v_paybacks)
                   UNION SELECT x.to_week FROM toll.carried_facts x
                   WHERE x.organization_id = p_company AND x.id = ANY (v_facts));
  PERFORM toll_write.lock_weeks(p_company, v_weeks);

  -- Every touched record's version (paybacks and carried rows before charges).
  FOREACH v_id IN ARRAY v_paybacks LOOP
    p := toll_write.lock_payback(p_company, v_id, (v_exp ->> v_id::text)::bigint, 'expected_versions.' || v_id);
  END LOOP;
  FOREACH v_id IN ARRAY v_facts LOOP
    f := toll_write.lock_carried(p_company, v_id, (v_exp ->> v_id::text)::bigint, 'expected_versions.' || v_id);
  END LOOP;
  FOREACH v_id IN ARRAY v_charges LOOP
    c := toll_write.lock_charge(p_company, v_id, (v_exp ->> v_id::text)::bigint, 'expected_versions.' || v_id);
  END LOOP;
  PERFORM toll_write.refuse_if_sealed(p_company, v_weeks);

  FOR r IN
    SELECT a.id, a.amount_minor, a.payback_id,
           toll_system.charge_counted_week(p_company, ch.id, ch.week_key) AS cw
    FROM toll.allocations a JOIN toll.charges ch ON ch.organization_id = a.organization_id AND ch.id = a.charge_id
    WHERE a.organization_id = p_company AND a.decision_id = v_target AND a.reversed_by IS NULL
    ORDER BY a.created_at, a.id
  LOOP
    v_line := v_line + 1;
    v_amt := toll_system.reverse_allocation(p_company, r.id, p_decision, p_cmd, v_line);
    v_deltas := toll_write.add_delta(v_deltas, r.cw, jsonb_build_object(
                  'undone_minor', coalesce((v_deltas -> (r.cw::text) ->> 'undone_minor')::bigint, 0) + v_amt));
  END LOOP;

  FOR r IN
    SELECT u.id, u.amount_minor, coalesce(pb.week_key, cf.to_week) AS week_key
    FROM toll.payback_unlinked_decisions u
    LEFT JOIN toll.paybacks pb ON pb.organization_id = u.organization_id AND pb.id = u.payback_id
    LEFT JOIN toll.carried_facts cf ON cf.organization_id = u.organization_id AND cf.id = u.carried_fact_id
    WHERE u.organization_id = p_company AND u.decision_id = v_target AND u.reversed_by IS NULL
  LOOP
    UPDATE toll.payback_unlinked_decisions SET reversed_by = p_decision WHERE organization_id = p_company AND id = r.id;
    v_deltas := toll_write.add_delta(v_deltas, r.week_key, jsonb_build_object(
                  'unlinked_undone_minor', coalesce((v_deltas -> (r.week_key::text) ->> 'unlinked_undone_minor')::bigint, 0)
                                           + r.amount_minor));
  END LOOP;

  FOREACH v_id IN ARRAY v_paybacks LOOP
    UPDATE toll.paybacks SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = v_id RETURNING version INTO v_ver;
    v_versions := v_versions || jsonb_build_object(v_id::text, v_ver);
  END LOOP;
  FOREACH v_id IN ARRAY v_facts LOOP
    UPDATE toll.carried_facts SET version = version + 1 WHERE organization_id = p_company AND id = v_id RETURNING version INTO v_ver;
    v_versions := v_versions || jsonb_build_object(v_id::text, v_ver);
  END LOOP;
  FOREACH v_id IN ARRAY v_charges LOOP
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = v_id RETURNING version INTO v_ver;
    v_versions := v_versions || jsonb_build_object(v_id::text, v_ver);
  END LOOP;

  RETURN jsonb_build_object('decision_id', p_decision, 'undone_decision_id', v_target, 'versions', v_versions,
                            'weeks', toll_write.weeks_answer(p_company, v_deltas));
END;
$$;

-- 5. The postings of a charge now land in the week it counts in (charge_post_at) --------------------------------
CREATE OR REPLACE FUNCTION toll_system.allocate(p_company uuid, p_charge uuid, p_bearer text, p_amount bigint,
                                               p_payback uuid, p_reason text, p_decision uuid, p_cmd text, p_line int)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c    toll.charges%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO c FROM toll.charges x WHERE x.organization_id = p_company AND x.id = p_charge;
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id)
  VALUES (p_company, p_charge, p_bearer, p_amount, p_payback, p_reason, p_decision)
  RETURNING id INTO v_id;
  PERFORM toll_system.post(p_company, toll_system.bearer_rule(p_bearer), p_amount, toll_system.charge_post_at(p_company, c.id), p_cmd, p_line,
                           jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id)
                           || CASE WHEN p_payback IS NOT NULL THEN jsonb_build_object('payback_id', p_payback)
                                   ELSE '{}'::jsonb END);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.reverse_allocation(p_company uuid, p_allocation uuid, p_decision uuid,
                                                         p_cmd text, p_line int)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  SELECT a.id, a.charge_id, a.bearer, a.amount_minor, a.payback_id, c.occurred_at, c.driver_id INTO r
  FROM toll.allocations a JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
  WHERE a.organization_id = p_company AND a.id = p_allocation AND a.reversed_by IS NULL
  FOR UPDATE OF a;
  IF NOT FOUND THEN RETURN 0; END IF;
  UPDATE toll.allocations SET reversed_by = p_decision WHERE organization_id = p_company AND id = r.id;
  PERFORM toll_system.post(p_company, toll_system.bearer_rule(r.bearer), r.amount_minor, toll_system.charge_post_at(p_company, r.charge_id), p_cmd, p_line,
                           jsonb_build_object('charge_id', r.charge_id, 'driver_id', r.driver_id)
                           || CASE WHEN r.payback_id IS NOT NULL THEN jsonb_build_object('payback_id', r.payback_id)
                                   ELSE '{}'::jsonb END,
                           true);
  RETURN r.amount_minor;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.do_receipt(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb, p_verify boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c    toll.charges%ROWTYPE;
  v_id uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_cw date;
  v_cv bigint;
BEGIN
  IF NOT p_verify AND nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('reason_code')));
  END IF;
  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_cw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_id;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_cw]);
  c := toll_write.lock_charge(p_company, v_id, (p_body ->> 'expected_charge_version')::bigint);
  IF c.paid_by <> 'cash' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', 'not_cash'));
  END IF;
  PERFORM toll_write.require_charge_state(p_company, c, ARRAY['unverified']);
  PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_cw]);

  UPDATE toll.charges SET evidence_status = CASE WHEN p_verify THEN 'verified' ELSE 'rejected' END,
                          version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  IF p_verify THEN   -- P3 posts at verification (B5); the charge becomes pending
    PERFORM toll_system.post(p_company, 'P3_cash_verified', c.amount_minor, toll_system.charge_post_at(p_company, c.id), p_cmd, 1,
                             jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id));
  END IF;

  RETURN jsonb_build_object('decision_id', p_decision, 'charge_version', v_cv,
    'state', toll_system.charge_state(p_company, c.id),
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
               CASE WHEN p_verify THEN jsonb_build_object('verified_minor', c.amount_minor)
                    ELSE jsonb_build_object('rejected_minor', c.amount_minor) END)));
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.do_duplicate(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb, p_confirm boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_copy   uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_keep   uuid := nullif(p_body ->> 'other_charge_id', '')::uuid;
  v_rev    toll.duplicate_reviews%ROWTYPE;
  c        toll.charges%ROWTYPE;
  k        toll.charges%ROWTYPE;
  v_cw     date;
  v_kw     date;
  v_line   int := 0;
  v_net    bigint;
  v_undone bigint := 0;
  v_cv     bigint;
  v_kv     bigint;
  a        record;
BEGIN
  IF v_copy IS NULL OR v_keep IS NULL OR v_copy = v_keep THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('charge_id', 'other_charge_id')));
  END IF;
  SELECT * INTO v_rev FROM toll.duplicate_reviews r
  WHERE r.organization_id = p_company AND r.charge_a = least(v_copy, v_keep) AND r.charge_b = greatest(v_copy, v_keep)
  FOR UPDATE;
  IF NOT FOUND OR v_rev.status <> 'open' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', v_copy, 'other_charge_id', v_keep,
                                                                'state', coalesce(v_rev.status, 'no_review_pair')));
  END IF;

  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_cw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_copy;
  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_kw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_keep;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_cw, v_kw]);
  IF v_copy < v_keep THEN   -- two charges: lock in id order
    c := toll_write.lock_charge(p_company, v_copy, (p_body ->> 'expected_charge_version')::bigint);
    k := toll_write.lock_charge(p_company, v_keep, (p_body ->> 'expected_other_version')::bigint, 'expected_other_version');
  ELSE
    k := toll_write.lock_charge(p_company, v_keep, (p_body ->> 'expected_other_version')::bigint, 'expected_other_version');
    c := toll_write.lock_charge(p_company, v_copy, (p_body ->> 'expected_charge_version')::bigint);
  END IF;

  IF p_confirm THEN
    PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_cw]);
    IF k.duplicate_of IS NOT NULL OR c.duplicate_of IS NOT NULL THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', CASE WHEN k.duplicate_of IS NOT NULL
                                                                   THEN k.id ELSE c.id END, 'state', 'duplicate'));
    END IF;
    -- The copy's decisions are reversed first, then its arrival (P2 / P3, with any P16 corrections) is reversed.
    FOR a IN SELECT al.id FROM toll.allocations al
             WHERE al.organization_id = p_company AND al.charge_id = c.id AND al.reversed_by IS NULL
             ORDER BY al.created_at, al.id LOOP
      v_line := v_line + 1;
      v_undone := v_undone + toll_system.reverse_allocation(p_company, a.id, p_decision, p_cmd, v_line);
    END LOOP;
    v_net := toll_system.rule_net(p_company, CASE WHEN c.paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END,
                                  'charge_id', c.id::text)
           + toll_system.rule_net(p_company, 'P16_up_%', 'charge_id', c.id::text)
           - toll_system.rule_net(p_company, 'P16_down_%', 'charge_id', c.id::text);
    IF v_net < 0 THEN
      RAISE EXCEPTION 'TOLL_DUPLICATE_NET_NEGATIVE: charge % nets %', c.id, v_net;
    END IF;
    IF v_net > 0 THEN
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, CASE WHEN c.paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END,
                               v_net, toll_system.charge_post_at(p_company, c.id), p_cmd, v_line,
                               jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id), true);
    END IF;
    UPDATE toll.charges SET duplicate_of = k.id, version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  ELSE
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  END IF;
  UPDATE toll.charges SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = k.id RETURNING version INTO v_kv;
  UPDATE toll.duplicate_reviews SET status = CASE WHEN p_confirm THEN 'confirmed' ELSE 'released' END,
                                   decision_id = p_decision, updated_at = now()
  WHERE organization_id = p_company AND id = v_rev.id;

  RETURN jsonb_build_object('decision_id', p_decision, 'review_id', v_rev.id,
    'charge_version', v_cv, 'other_version', v_kv,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
               CASE WHEN p_confirm THEN jsonb_build_object('duplicate_removed_minor', coalesce(v_net, 0),
                                                            'undone_minor', v_undone)
                    ELSE jsonb_build_object('review_released', true) END)));
END;
$$;

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
      abs(v_new - c.amount_minor), toll_system.charge_post_at(p_company, c.id), p_cmd, v_line,
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
    PERFORM toll_system.post(p_company, 'P6_allocate_platform', r.amount_minor, toll_system.charge_post_at(p_company, r.charge_id), p_cmd, v_line,
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

-- 6. The seal rule: an undecided carried platform share blocks its week (B6, C2) -----------------------------
CREATE OR REPLACE FUNCTION toll_system.seal_blockers(p_company uuid, p_week date)
RETURNS TABLE (kind text, id uuid, amount_minor bigint, reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH week_charges AS (
    SELECT c.id, c.amount_minor, toll_system.charge_state(p_company, c.id) AS state
    FROM toll.charges c
    WHERE c.organization_id = p_company
      AND NOT c.is_legacy AND NOT c.after_seal
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week
  ),
  week_paybacks AS (
    SELECT p.id, (p.amount_minor
         - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                     WHERE a.organization_id = p_company AND a.payback_id = p.id AND a.reversed_by IS NULL), 0)
         - coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                     WHERE u.organization_id = p_company AND u.payback_id = p.id AND u.reversed_by IS NULL), 0)
           )::bigint AS unallocated
    FROM toll.paybacks p
    WHERE p.organization_id = p_company
      AND p.week_key = p_week
      AND NOT p.is_legacy AND NOT p.after_seal
      AND p.reversal_of IS NULL                                   -- a reversing payback has no state of its own
      AND NOT EXISTS (SELECT 1 FROM toll.paybacks r             -- a reversed payback is final
                      WHERE r.organization_id = p_company AND r.reversal_of = p.id)
  )
  SELECT 'charge'::text, wc.id, wc.amount_minor, wc.state
  FROM week_charges wc WHERE wc.state IN ('pending', 'unverified')
  UNION ALL
  SELECT 'review_pair'::text, d.id, NULL::bigint, 'review_pair'::text
  FROM toll.duplicate_reviews d
  WHERE d.organization_id = p_company AND d.status = 'open'
    AND (d.charge_a IN (SELECT id FROM week_charges) OR d.charge_b IN (SELECT id FROM week_charges))
  UNION ALL
  SELECT 'payback'::text, wp.id, wp.unallocated, 'unallocated_payback'::text
  FROM week_paybacks wp WHERE wp.unallocated > 0
  UNION ALL                                                     -- R4c: a carried P19 platform share not yet decided
  SELECT 'carried'::text, f.id, toll_system.carried_open_minor(p_company, f.id), 'unallocated_payback'::text
  FROM toll.carried_facts f
  WHERE f.organization_id = p_company AND f.to_week = p_week AND f.kind = 'correction_down' AND f.bearer IS NULL
    AND toll_system.carried_open_minor(p_company, f.id) > 0;
$$;

-- 7. The week result: carried money in drivers' lines and carriedMoney (only in weeks that have some) --------
CREATE OR REPLACE FUNCTION toll_system.week_result_live(p_company uuid, p_week date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_body jsonb;
  v_after jsonb;
BEGIN
  WITH ch AS (                                          -- the week's counted, live charges
    SELECT c.*
    FROM toll.v_live_charges c
    WHERE c.organization_id = p_company
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week
  ),
  posted AS (SELECT * FROM ch WHERE state NOT IN ('duplicate', 'rejected', 'unverified')),
  al AS (                                               -- active allocations of those charges
    SELECT a.* FROM toll.allocations a JOIN posted p ON p.id = a.charge_id
    WHERE a.organization_id = p_company AND a.reversed_by IS NULL
  ),
  pb AS (                                               -- the week's active paybacks
    SELECT p.*,
           coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                     WHERE u.organization_id = p_company AND u.payback_id = p.id AND u.reversed_by IS NULL), 0)::bigint
             AS unlinked_minor
    FROM toll.v_active_paybacks p
    WHERE p.organization_id = p_company AND p.week_key = p_week
  ),
  taken AS (                                            -- take-backs landing this week
    SELECT r.* FROM toll.paybacks r
    WHERE r.organization_id = p_company AND r.reversal_of IS NOT NULL AND r.week_key = p_week
      AND NOT r.is_legacy AND NOT r.after_seal
  ),
  cf AS (                                               -- R4c: money carried into this week from a paid week (P18, P19)
    SELECT f.kind, f.bearer, f.amount_minor, coalesce(c.driver_id, p.driver_id) AS driver_id, c.paid_by, p.received_by
    FROM toll.carried_facts f
    LEFT JOIN toll.charges c ON f.kind = 'correction_down' AND c.organization_id = f.organization_id AND c.id = f.original_id
    LEFT JOIN toll.paybacks p ON f.kind = 'take_back' AND p.organization_id = f.organization_id AND p.id = f.original_id
    WHERE f.organization_id = p_company AND f.to_week = p_week AND f.kind IN ('take_back', 'correction_down')
  ),
  topups AS (
    SELECT t.* FROM toll.tag_topups t WHERE t.organization_id = p_company
  ),
  tag_usage AS (                                        -- tag charges, by counted week
    SELECT toll_system.charge_counted_week(p_company, c.id, c.week_key) AS wk, c.amount_minor
    FROM toll.v_live_charges c
    WHERE c.organization_id = p_company AND c.paid_by = 'tag' AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
  ),
  drivers AS (
    SELECT d.driver_id,
           coalesce((SELECT sum(a.amount_minor) FROM al a JOIN posted p ON p.id = a.charge_id
                     WHERE a.bearer = 'driver' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint
           + coalesce((SELECT sum(f.amount_minor) FROM cf f WHERE f.driver_id IS NOT DISTINCT FROM d.driver_id
                       AND ((f.kind = 'take_back' AND f.bearer = 'driver') OR (f.kind = 'correction_down' AND f.paid_by = 'cash'))), 0)::bigint AS owes,
           coalesce((SELECT sum(p.amount_minor) FROM posted p
                     WHERE p.paid_by = 'cash' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint
           + coalesce((SELECT sum(f.amount_minor) FROM cf f WHERE f.driver_id IS NOT DISTINCT FROM d.driver_id
                       AND f.kind = 'correction_down' AND f.bearer = 'driver'), 0)::bigint AS fleet_owes,
           coalesce((SELECT sum(b.amount_minor) FROM pb b
                     WHERE b.received_by = 'driver' AND b.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint
           - coalesce((SELECT sum(f.amount_minor) FROM cf f WHERE f.driver_id IS NOT DISTINCT FROM d.driver_id
                       AND f.kind = 'take_back' AND f.received_by = 'driver'), 0)::bigint AS recovered,
           coalesce((SELECT sum(p.amount_minor) FROM posted p WHERE p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS spend,
           coalesce((SELECT sum(p.amount_minor) FROM posted p
                     WHERE p.paid_by = 'tag' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS tag_spend,
           coalesce((SELECT sum(a.amount_minor) FROM al a JOIN posted p ON p.id = a.charge_id
                     WHERE a.bearer = 'platform' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS platform_borne,
           coalesce((SELECT sum(a.amount_minor) FROM al a JOIN posted p ON p.id = a.charge_id
                     WHERE a.bearer = 'fleet' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS fleet_borne
    FROM (SELECT driver_id FROM posted UNION SELECT driver_id FROM pb WHERE received_by = 'driver'
          UNION SELECT driver_id FROM cf) d
    WHERE d.driver_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'contractVersion', 1,
    'companyId', p_company,
    'weekKey', p_week,
    'spend', jsonb_build_object(
      'tagMinor',   (SELECT coalesce(sum(amount_minor), 0) FROM posted WHERE paid_by = 'tag'),
      'cashMinor',  (SELECT coalesce(sum(amount_minor), 0) FROM posted WHERE paid_by = 'cash'),
      'totalMinor', (SELECT coalesce(sum(amount_minor), 0) FROM posted)),
    'bearers', jsonb_build_object(
      'platformMinor', (SELECT coalesce(sum(amount_minor), 0) FROM al WHERE bearer = 'platform'),
      'driverMinor',   (SELECT coalesce(sum(amount_minor), 0) FROM al WHERE bearer = 'driver'),
      'fleetMinor',    (SELECT coalesce(sum(amount_minor), 0) FROM al WHERE bearer = 'fleet')),
    'pending', jsonb_build_object(
      'charges',     (SELECT count(*) FROM ch WHERE state = 'pending'),
      'amountMinor', (SELECT coalesce(sum(amount_minor - allocated_minor), 0) FROM ch WHERE state = 'pending')),
    'unverified', jsonb_build_object(
      'charges',     (SELECT count(*) FROM ch WHERE state = 'unverified'),
      'amountMinor', (SELECT coalesce(sum(amount_minor), 0) FROM ch WHERE state = 'unverified')),
    'awaitingCash', jsonb_build_object(
      'charges',     (SELECT count(*) FROM ch WHERE state = 'awaiting_cash'),
      'amountMinor', (SELECT coalesce(sum(amount_minor - allocated_minor), 0) FROM ch WHERE state = 'awaiting_cash')),
    'paybacks', jsonb_build_object(
      'receivedMinor',     (SELECT coalesce(sum(amount_minor), 0) FROM pb),
      'allocatedMinor',    (SELECT coalesce(sum(allocated_minor), 0) FROM pb),
      'unallocatedMinor',  (SELECT coalesce(sum(greatest(amount_minor - allocated_minor - unlinked_minor, 0)), 0) FROM pb),
      'leftUnlinkedMinor', (SELECT coalesce(sum(unlinked_minor), 0) FROM pb),
      'takenBackMinor',    (SELECT coalesce(sum(amount_minor), 0) FROM taken)),
    'carriedIn', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'kind', f.kind, 'id', f.original_id, 'fromWeekKey', f.from_week, 'amountMinor', f.amount_minor,
                    'bearer', f.bearer) ORDER BY f.created_at, f.id), '[]'::jsonb)
                  FROM toll.carried_facts f WHERE f.organization_id = p_company AND f.to_week = p_week),
    'tagAccount', jsonb_build_object(
      'openingMinor', (SELECT coalesce(sum(amount_minor), 0) FROM topups WHERE week_key < p_week)
                    - (SELECT coalesce(sum(amount_minor), 0) FROM tag_usage WHERE wk < p_week),
      'topUpsMinor',  (SELECT coalesce(sum(amount_minor), 0) FROM topups WHERE week_key = p_week),
      'usageMinor',   (SELECT coalesce(sum(amount_minor), 0) FROM tag_usage WHERE wk = p_week),
      'closingMinor', (SELECT coalesce(sum(amount_minor), 0) FROM topups WHERE week_key <= p_week)
                    - (SELECT coalesce(sum(amount_minor), 0) FROM tag_usage WHERE wk <= p_week)),
    'drivers', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'driverId', driver_id, 'owesFleetMinor', owes, 'fleetOwesMinor', fleet_owes,
                  'recoveredInPassengerCashMinor', recovered,
                  -- P1-R4: the lines driver settlement and the per-driver toll statement use
                  'spendMinor', spend, 'tagSpendMinor', tag_spend, 'cashSpendMinor', spend - tag_spend,
                  'platformMinor', platform_borne, 'fleetMinor', fleet_borne) ORDER BY driver_id), '[]'::jsonb)
                FROM drivers),
    -- bank movements dated in this week (debit bank = money in, credit bank = money out), for Business Finance
    'ledgerMovements', jsonb_build_object('bankMinor', (
      SELECT coalesce(sum(
        CASE WHEN e.metadata ->> 'toll_rule' ~ '^P(11|12|14)_' THEN 1 ELSE -1 END
        * CASE WHEN (e.metadata ->> 'reverse')::boolean THEN -1 ELSE 1 END
        * e.amount_minor), 0)
      FROM ledger.entries e
      WHERE e.organization_id = p_company AND e.reference_type = 'toll'
        AND e.metadata ->> 'toll_rule' ~ '^P(1|11|12|13|14)_'
        AND (e.metadata ->> 'toll_week')::date = p_week))
  ) INTO v_body;

  -- R4c: carried money, only in a week that has some (so the facts hash of every other week is unchanged)
  v_body := v_body || coalesce((
    SELECT jsonb_build_object('carriedMoney', jsonb_build_object(
      'takeBackLeftoverMinor',  coalesce(sum(f.amount_minor) FILTER (WHERE f.kind = 'take_back' AND f.bearer IS NULL), 0),
      'takeBackFleetMinor',     coalesce(sum(f.amount_minor) FILTER (WHERE f.kind = 'take_back' AND f.bearer = 'fleet'), 0),
      'takeBackDriverMinor',    coalesce(sum(f.amount_minor) FILTER (WHERE f.kind = 'take_back' AND f.bearer = 'driver'), 0),
      'correctionDriverMinor',  coalesce(sum(f.amount_minor) FILTER (WHERE f.kind = 'correction_down' AND f.bearer = 'driver'), 0),
      'correctionFleetMinor',   coalesce(sum(f.amount_minor) FILTER (WHERE f.kind = 'correction_down' AND f.bearer = 'fleet'), 0),
      'correctionPlatformMinor', coalesce(sum(f.amount_minor) FILTER (WHERE f.kind = 'correction_down' AND f.bearer IS NULL), 0),
      'correctionPlatformUndecidedMinor', coalesce(sum(toll_system.carried_open_minor(p_company, f.id))
                                                     FILTER (WHERE f.kind = 'correction_down' AND f.bearer IS NULL), 0)))
    FROM toll.carried_facts f
    WHERE f.organization_id = p_company AND f.to_week = p_week AND f.kind IN ('take_back', 'correction_down')
    HAVING count(*) > 0), '{}'::jsonb);

  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'arrivedAt', x ->> 'id'), '[]'::jsonb) INTO v_after
  FROM (
    SELECT jsonb_build_object('kind', 'charge', 'id', c.id, 'amountMinor', c.amount_minor,
                              'arrivedAt', c.created_at, 'relatedWeekKey', c.week_key) AS x
    FROM toll.charges c WHERE c.organization_id = p_company AND c.after_seal AND NOT c.is_legacy AND c.week_key = p_week
    UNION ALL
    SELECT jsonb_build_object('kind', CASE WHEN p.reversal_of IS NULL THEN 'payback' ELSE 'reversal' END, 'id', p.id,
                              'amountMinor', p.amount_minor, 'arrivedAt', p.created_at,
                              'relatedWeekKey', coalesce(o.week_key, p.week_key))
    FROM toll.paybacks p
    LEFT JOIN toll.paybacks o ON o.organization_id = p.organization_id AND o.id = p.reversal_of
    WHERE p.organization_id = p_company AND p.after_seal AND NOT p.is_legacy
      AND coalesce(o.week_key, p.week_key) = p_week
  ) s;

  RETURN v_body
         || jsonb_build_object('afterSeal', v_after,
                               'state', 'open',
                               'weekVersion', toll_system.week_version(p_company, p_week),
                               -- the week's own facts only: the tag opening / closing depend on earlier weeks,
                               -- which may still be open when this week is sealed
                               'factsHash', md5((v_body #- '{tagAccount,openingMinor}' #- '{tagAccount,closingMinor}')::text),
                               'engineVersion', 'toll_v2_phase1');
END;
$$;

-- 8. Nightly checks: check 3 counts the P18 / P19 legs in their carried row's to_week --------------------------
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
  -- P2-R4c: P18 / P19 legs count in their carried row's to_week, against toll_system.carried_sum.
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
                FROM pl WHERE pl.wk = w.wk), 0)
        + coalesce((SELECT sum(CASE WHEN rule ~ '^P19_.*_platform$' THEN amt WHEN rule ~ '^P18a_' THEN -amt ELSE 0 END)
                    FROM fl WHERE fl.wk = w.wk), 0) AS unalloc_flow,
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

        + toll_system.carried_sum(p_company, w.wk, 'cd_platform')
        - toll_system.carried_sum(p_company, w.wk, 'tb_leftover')
      ) AS unalloc_expected,
      -- expense: +P8 (charge week) −P20 (carried-to week)
      coalesce((SELECT sum(amt) FROM cl WHERE cl.wk = w.wk AND rule ~ '^P8_'), 0)
        - coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P20_'), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P18b_fleet_'), 0)
        - coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P19_.*_fleet$'), 0) AS expense_flow,
      coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a JOIN toll.v_live_charges c
                  ON c.organization_id = a.organization_id AND c.id = a.charge_id
                WHERE a.organization_id = p_company AND a.bearer = 'fleet' AND a.reversed_by IS NULL
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0)
        - coalesce((SELECT sum(f.amount_minor) FROM toll.carried_facts f
                    WHERE f.organization_id = p_company AND f.kind = 'cash_recovered' AND f.to_week = w.wk), 0)
        + toll_system.carried_sum(p_company, w.wk, 'tb_fleet')
        - toll_system.carried_sum(p_company, w.wk, 'cd_fleet') AS expense_expected,
      -- receivable_driver: +P7 (charge week)
      coalesce((SELECT sum(amt) FROM cl WHERE cl.wk = w.wk AND rule ~ '^P7_'), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^(P18b_driver_|P19_cash_)'), 0) AS rd_flow,
      coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a JOIN toll.v_live_charges c
                  ON c.organization_id = a.organization_id AND c.id = a.charge_id
                WHERE a.organization_id = p_company AND a.bearer = 'driver' AND a.reversed_by IS NULL
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0)
        + toll_system.carried_sum(p_company, w.wk, 'tb_driver')
        + toll_system.carried_sum(p_company, w.wk, 'cd_cash') AS rd_expected,
      -- payable_driver: +P3 +P16up_cash −P16down_cash (charge week)
      coalesce((SELECT sum(CASE WHEN rule ~ '^(P3_|P16_up_cash)' THEN amt WHEN rule ~ '^P16_down_cash' THEN -amt ELSE 0 END)
                FROM cl WHERE cl.wk = w.wk), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P19_.*_driver$'), 0) AS pd_flow,
      coalesce((SELECT sum(c.amount_minor) FROM toll.v_live_charges c
                WHERE c.organization_id = p_company AND c.paid_by = 'cash' AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0)
        + toll_system.carried_sum(p_company, w.wk, 'cd_driver') AS pd_expected,
      -- tag_prepaid: +P1 (top-up week) −P2 −P16up_tag +P16down_tag (charge week)
      coalesce((SELECT sum(amt) FROM tl WHERE tl.wk = w.wk AND rule ~ '^P1_'), 0)
        - coalesce((SELECT sum(CASE WHEN rule ~ '^(P2_|P16_up_tag)' THEN amt WHEN rule ~ '^P16_down_tag' THEN -amt ELSE 0 END)
                    FROM cl WHERE cl.wk = w.wk), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P19_tag_'), 0) AS tag_flow,
      coalesce((SELECT sum(t.amount_minor) FROM toll.tag_topups t WHERE t.organization_id = p_company AND t.week_key = w.wk), 0)
        - coalesce((SELECT sum(c.amount_minor) FROM toll.v_live_charges c
                    WHERE c.organization_id = p_company AND c.paid_by = 'tag' AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0)
        + toll_system.carried_sum(p_company, w.wk, 'cd_tag') AS tag_expected,
      -- receivable_platform: +P4 (payback week); recovered_in_driver_cash: +P5 (payback week) +P20 (carried-to week)
      coalesce((SELECT sum(amt) FROM pl WHERE pl.wk = w.wk AND rule ~ '^P4_'), 0)
        - coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^(P18a_leftover_fleet|P18b_.*_card)$'), 0) AS rp_flow,
      -- every recorded payback counts + in its week, every take-back − in the take-back's week (P17 reverses P4/P5)
      coalesce((SELECT sum(CASE WHEN p.reversal_of IS NULL THEN p.amount_minor ELSE -p.amount_minor END) FROM toll.paybacks p
                WHERE p.organization_id = p_company AND p.received_by = 'fleet' AND p.week_key = w.wk
                  AND NOT p.is_legacy AND NOT p.after_seal), 0)
        - toll_system.carried_sum(p_company, w.wk, 'tb_card') AS rp_expected,
      coalesce((SELECT sum(amt) FROM pl WHERE pl.wk = w.wk AND rule ~ '^P5_'), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P20_'), 0)
        - coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^(P18a_leftover_driver|P18b_.*_cash)$'), 0) AS rc_flow,
      coalesce((SELECT sum(CASE WHEN p.reversal_of IS NULL THEN p.amount_minor ELSE -p.amount_minor END) FROM toll.paybacks p
                WHERE p.organization_id = p_company AND p.received_by = 'driver' AND p.week_key = w.wk
                  AND NOT p.is_legacy AND NOT p.after_seal), 0)
        + coalesce((SELECT sum(f.amount_minor) FROM toll.carried_facts f
                    WHERE f.organization_id = p_company AND f.kind = 'cash_recovered' AND f.to_week = w.wk), 0)
        - toll_system.carried_sum(p_company, w.wk, 'tb_cash') AS rc_expected
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

-- 9. Grants ----------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION toll_system.charge_post_at(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.carried_sum(uuid, date, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.carried_open_minor(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.lock_carried(uuid, uuid, bigint, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_carry_forward(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

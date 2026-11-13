-- Toll rebuild Phase 2 P2-R4a: the everyday decisions (design B3 intents, B5 postings, I4, I7; Part F P2-R4).
--
--   link_payback            a payback covers a charge (or part)             P6
--   driver_pays             the driver bears a charge (or part)             P7
--   fleet_absorbs           the fleet bears a charge (or part)              P8
--   leave_payback_unlinked  a payback (or its leftover) has no toll         P9 = no posting
--   undo_decision           a person made the wrong call: reverse what that decision wrote (P15)
--   apply_suggestion        accept a current matcher suggestion = link_payback for its pair
--   verify_cash_receipt     a driver cash toll is checked                   P3 posts now
--   reject_cash_receipt     a driver cash toll is refused                   final, never posted
--   confirm_duplicate       one charge of an open review pair is a copy     its posting and allocations reversed (P15)
--   release_duplicate       the pair is two real crossings                  no money
--
-- P2-R4b brings the decisions that change facts: reverse_payback (P17), correct_charge_amount (P16), correct_charge_week
-- (PB2) and carry_forward (P18-P20), plus leave_payback_unlinked on a carried P19 leftover.
--
-- Every decision follows B3: the router has already done company, permission and replay. Here, in order:
--   lock the weeks touched (the same advisory lock seal / reopen take) → lock the records (payback before charge) and
--   check their versions (VERSION_CHANGED) → check states → refuse sealed weeks (WEEK_SEALED) → write and post →
--   bump versions → answer { decision_id, charge_version?, payback_version?, weeks: [{week_key, week_version, delta}] }.
-- A refusal raises, so the whole command (its decision row included) rolls back and writes nothing.
-- Allocation rows post at the charge's crossing time (the charge's week), as the Roam and seal paths already do.

-- 1. Amount helpers ----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.charge_open_minor(p_company uuid, p_charge uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (c.amount_minor - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                                     WHERE a.organization_id = c.organization_id AND a.charge_id = c.id
                                       AND a.reversed_by IS NULL), 0))::bigint
  FROM toll.charges c WHERE c.organization_id = p_company AND c.id = p_charge;
$$;

CREATE OR REPLACE FUNCTION toll_system.payback_open_minor(p_company uuid, p_payback uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (p.amount_minor
          - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                      WHERE a.organization_id = p.organization_id AND a.payback_id = p.id AND a.reversed_by IS NULL), 0)
          - coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                      WHERE u.organization_id = p.organization_id AND u.payback_id = p.id AND u.reversed_by IS NULL), 0))::bigint
  FROM toll.paybacks p WHERE p.organization_id = p_company AND p.id = p_payback;
$$;

-- 2. I4: a charge's slices never exceed its amount; a payback's never exceed its amount ------------------------
CREATE OR REPLACE FUNCTION toll.tg_allocation_caps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_charge  uuid;
  v_payback uuid;
BEGIN
  IF TG_TABLE_NAME = 'allocations' THEN
    v_charge := NEW.charge_id; v_payback := NEW.payback_id;
  ELSIF TG_TABLE_NAME = 'payback_unlinked_decisions' THEN
    v_payback := NEW.payback_id;
  ELSIF TG_TABLE_NAME = 'charges' THEN
    v_charge := NEW.id;
  ELSIF TG_TABLE_NAME = 'paybacks' THEN
    v_payback := NEW.id;
  END IF;
  IF v_charge IS NOT NULL AND toll_system.charge_open_minor(NEW.organization_id, v_charge) < 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'ALLOCATIONS_EXCEED_AMOUNT', ERRCODE = 'P0001',
      DETAIL = jsonb_build_object('charge_id', v_charge)::text;
  END IF;
  IF v_payback IS NOT NULL AND toll_system.payback_open_minor(NEW.organization_id, v_payback) < 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'ALLOCATIONS_EXCEED_AMOUNT', ERRCODE = 'P0001',
      DETAIL = jsonb_build_object('payback_id', v_payback)::text;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER allocations_caps AFTER INSERT OR UPDATE ON toll.allocations
  FOR EACH ROW EXECUTE FUNCTION toll.tg_allocation_caps();
CREATE TRIGGER payback_unlinked_caps AFTER INSERT OR UPDATE ON toll.payback_unlinked_decisions
  FOR EACH ROW EXECUTE FUNCTION toll.tg_allocation_caps();
CREATE TRIGGER charges_amount_caps AFTER UPDATE OF amount_minor ON toll.charges
  FOR EACH ROW EXECUTE FUNCTION toll.tg_allocation_caps();
CREATE TRIGGER paybacks_amount_caps AFTER UPDATE OF amount_minor ON toll.paybacks
  FOR EACH ROW EXECUTE FUNCTION toll.tg_allocation_caps();

-- 3. Locks and checks ---------------------------------------------------------------------------------------
-- The week lock is the one seal / reopen take, so a decision and a seal of the same week never interleave.
CREATE OR REPLACE FUNCTION toll_write.lock_weeks(p_company uuid, p_weeks date[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE w date;
BEGIN
  FOR w IN SELECT DISTINCT x FROM unnest(p_weeks) x WHERE x IS NOT NULL ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('toll_week:' || p_company || ':' || w, 0));
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.refuse_if_sealed(p_company uuid, p_weeks date[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sealed date[];
BEGIN
  v_sealed := array(SELECT DISTINCT x FROM unnest(p_weeks) x
                    WHERE x IS NOT NULL AND toll_system.week_is_sealed(p_company, x) ORDER BY 1);
  IF cardinality(v_sealed) > 0 THEN
    PERFORM toll_write.refuse('WEEK_SEALED', jsonb_build_object('sealed_weeks', to_jsonb(v_sealed)));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.lock_charge(p_company uuid, p_id uuid, p_expected bigint,
                                                  p_field text DEFAULT 'expected_charge_version')
RETURNS toll.charges LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c toll.charges%ROWTYPE;
BEGIN
  IF p_id IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('charge_id')));
  END IF;
  SELECT * INTO c FROM toll.charges x WHERE x.organization_id = p_company AND x.id = p_id FOR UPDATE;
  IF NOT FOUND OR c.is_legacy THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('charge_id', p_id));
  END IF;
  IF p_expected IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array(p_field), 'charge_id', p_id));
  END IF;
  IF c.version <> p_expected THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object(
      'charge_id', c.id, 'version', c.version, 'state', toll_system.charge_state(p_company, c.id)));
  END IF;
  RETURN c;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.lock_payback(p_company uuid, p_id uuid, p_expected bigint,
                                                   p_field text DEFAULT 'expected_payback_version')
RETURNS toll.paybacks LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p toll.paybacks%ROWTYPE;
BEGIN
  IF p_id IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('payback_id')));
  END IF;
  SELECT * INTO p FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = p_id FOR UPDATE;
  IF NOT FOUND OR p.is_legacy THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('payback_id', p_id));
  END IF;
  IF p_expected IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array(p_field), 'payback_id', p_id));
  END IF;
  IF p.version <> p_expected THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object(
      'payback_id', p.id, 'version', p.version, 'open_minor', toll_system.payback_open_minor(p_company, p.id)));
  END IF;
  RETURN p;
END;
$$;

-- A charge a person may decide: not after_seal, and in one of the given states.
CREATE OR REPLACE FUNCTION toll_write.require_charge_state(p_company uuid, p_charge toll.charges, p_states text[])
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_state text;
BEGIN
  IF p_charge.after_seal THEN
    PERFORM toll_write.refuse('AFTER_SEAL', jsonb_build_object('charge_id', p_charge.id, 'week_key', p_charge.week_key,
                                                               'use', 'reopen_week or carry_forward'));
  END IF;
  v_state := toll_system.charge_state(p_company, p_charge.id);
  IF NOT v_state = ANY (p_states) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', p_charge.id, 'state', v_state,
                                                                'allowed', to_jsonb(p_states)));
  END IF;
  RETURN v_state;
END;
$$;

-- A payback a person may allocate or leave unlinked: live, not native, not a reversal, not reversed.
CREATE OR REPLACE FUNCTION toll_write.require_payback_usable(p_company uuid, p_payback toll.paybacks)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_payback.after_seal THEN
    PERFORM toll_write.refuse('AFTER_SEAL', jsonb_build_object('payback_id', p_payback.id, 'week_key', p_payback.week_key,
                                                               'use', 'reopen_week or carry_forward'));
  END IF;
  IF p_payback.kind = 'native' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p_payback.id, 'state', 'roam_native'));
  END IF;
  IF p_payback.reversal_of IS NOT NULL THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p_payback.id, 'state', 'reversing_payback'));
  END IF;
  IF EXISTS (SELECT 1 FROM toll.paybacks r WHERE r.organization_id = p_company AND r.reversal_of = p_payback.id) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p_payback.id, 'state', 'reversed'));
  END IF;
END;
$$;

-- 4. Allocation writers (one ledger line each) --------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.bearer_rule(p_bearer text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_bearer WHEN 'platform' THEN 'P6_allocate_platform' WHEN 'driver' THEN 'P7_allocate_driver'
                       WHEN 'fleet' THEN 'P8_allocate_fleet' END;
$$;

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
  PERFORM toll_system.post(p_company, toll_system.bearer_rule(p_bearer), p_amount, c.occurred_at, p_cmd, p_line,
                           jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id)
                           || CASE WHEN p_payback IS NOT NULL THEN jsonb_build_object('payback_id', p_payback)
                                   ELSE '{}'::jsonb END);
  RETURN v_id;
END;
$$;

-- Reverse one active allocation (P15): mark it and post the exact reverse of its row. Returns its amount (0 if none).
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
  PERFORM toll_system.post(p_company, toll_system.bearer_rule(r.bearer), r.amount_minor, r.occurred_at, p_cmd, p_line,
                           jsonb_build_object('charge_id', r.charge_id, 'driver_id', r.driver_id)
                           || CASE WHEN r.payback_id IS NOT NULL THEN jsonb_build_object('payback_id', r.payback_id)
                                   ELSE '{}'::jsonb END,
                           true);
  RETURN r.amount_minor;
END;
$$;

-- 5. Answer helpers -----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.add_delta(p_acc jsonb, p_week date, p_delta jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_week IS NULL THEN coalesce(p_acc, '{}'::jsonb)
              ELSE coalesce(p_acc, '{}'::jsonb)
                   || jsonb_build_object(p_week::text, coalesce(p_acc -> (p_week::text), '{}'::jsonb) || p_delta) END;
$$;

CREATE OR REPLACE FUNCTION toll_write.weeks_answer(p_company uuid, p_deltas jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('week_key', k, 'week_version', toll_system.week_version(p_company, k::date),
                                               'delta', v) ORDER BY k), '[]'::jsonb)
  FROM jsonb_each(coalesce(p_deltas, '{}'::jsonb)) AS e(k, v);
$$;

CREATE OR REPLACE FUNCTION toll_write.body_amount(p_body jsonb)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v bigint;
BEGIN
  IF p_body ? 'amount_minor' AND jsonb_typeof(p_body -> 'amount_minor') <> 'null' THEN
    v := (p_body ->> 'amount_minor')::bigint;
    IF v IS NULL OR v <= 0 THEN
      PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('amount_minor', 'must be > 0'));
    END IF;
  END IF;
  RETURN v;
END;
$$;

-- 6. link_payback (and apply_suggestion) ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.do_link(p_company uuid, p_decision uuid, p_cmd text, p_charge uuid, p_payback uuid,
                                              p_charge_ver bigint, p_payback_ver bigint, p_amount bigint, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c       toll.charges%ROWTYPE;
  p       toll.paybacks%ROWTYPE;
  v_cw    date;
  v_pw    date;
  v_copen bigint;
  v_popen bigint;
  v_take  bigint;
  v_cv    bigint;
  v_pv    bigint;
BEGIN
  IF p_charge IS NULL OR p_payback IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('charge_id', 'payback_id')));
  END IF;
  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_cw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = p_charge;
  SELECT x.week_key INTO v_pw FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = p_payback;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_cw, v_pw]);

  p := toll_write.lock_payback(p_company, p_payback, p_payback_ver);      -- payback before charge (B3 locks)
  c := toll_write.lock_charge(p_company, p_charge, p_charge_ver);
  PERFORM toll_write.require_payback_usable(p_company, p);
  PERFORM toll_write.require_charge_state(p_company, c, ARRAY['pending']);
  PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_cw, v_pw]);

  v_copen := toll_system.charge_open_minor(p_company, c.id);
  v_popen := toll_system.payback_open_minor(p_company, p.id);
  IF v_popen <= 0 THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id, 'state', 'nothing_left', 'open_minor', v_popen));
  END IF;
  v_take := coalesce(p_amount, least(v_copen, v_popen));
  IF v_take > v_copen OR v_take > v_popen THEN
    PERFORM toll_write.refuse('AMOUNT_TOO_LARGE', jsonb_build_object('amount_minor', v_take,
      'charge_open_minor', v_copen, 'payback_open_minor', v_popen));
  END IF;

  PERFORM toll_system.allocate(p_company, c.id, 'platform', v_take, p.id, p_reason, p_decision, p_cmd, 1);
  UPDATE toll.charges SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  UPDATE toll.paybacks SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = p.id RETURNING version INTO v_pv;

  RETURN jsonb_build_object('decision_id', p_decision, 'charge_version', v_cv, 'payback_version', v_pv,
    'amount_minor', v_take,
    'weeks', toll_write.weeks_answer(p_company,
               toll_write.add_delta(toll_write.add_delta('{}'::jsonb, v_cw, jsonb_build_object('decided_minor', v_take)),
                                    v_pw, jsonb_build_object('payback_allocated_minor', v_take))));
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_link_payback(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT toll_write.do_link(p_company, p_decision, p_cmd,
           nullif(p_body ->> 'charge_id', '')::uuid, nullif(p_body ->> 'payback_id', '')::uuid,
           (p_body ->> 'expected_charge_version')::bigint, (p_body ->> 'expected_payback_version')::bigint,
           toll_write.body_amount(p_body), coalesce(nullif(p_body ->> 'reason_code', ''), 'link_payback'));
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_apply_suggestion(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s     toll.suggestions%ROWTYPE;
  v_res jsonb;
BEGIN
  IF nullif(p_body ->> 'suggestion_id', '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('suggestion_id')));
  END IF;
  SELECT * INTO s FROM toll.suggestions x
  WHERE x.organization_id = p_company AND x.id = (p_body ->> 'suggestion_id')::uuid;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('suggestion_id', p_body ->> 'suggestion_id'));
  END IF;
  IF s.superseded_by IS NOT NULL OR 'withdrawn' = ANY (s.rules_fired) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('suggestion_id', s.id, 'state', 'suggestion_stale',
                                                                'charge_id', s.charge_id, 'payback_id', s.payback_id));
  END IF;
  v_res := toll_write.do_link(p_company, p_decision, p_cmd, s.charge_id, s.payback_id,
                              (p_body ->> 'expected_charge_version')::bigint, (p_body ->> 'expected_payback_version')::bigint,
                              NULL, 'apply_suggestion');
  RETURN v_res || jsonb_build_object('suggestion_id', s.id, 'engine_version', s.engine_version,
                                     'score', s.score_parts -> 'total');
END;
$$;

-- 7. driver_pays / fleet_absorbs --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.do_bear(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb, p_bearer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c       toll.charges%ROWTYPE;
  v_id    uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_cw    date;
  v_open  bigint;
  v_take  bigint;
  v_cv    bigint;
BEGIN
  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_cw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_id;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_cw]);
  c := toll_write.lock_charge(p_company, v_id, (p_body ->> 'expected_charge_version')::bigint);
  PERFORM toll_write.require_charge_state(p_company, c, ARRAY['pending']);
  PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_cw]);
  IF p_bearer = 'driver' AND c.driver_id IS NULL THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', 'no_driver'));
  END IF;

  v_open := toll_system.charge_open_minor(p_company, c.id);
  v_take := coalesce(toll_write.body_amount(p_body), v_open);
  IF v_take > v_open THEN
    PERFORM toll_write.refuse('AMOUNT_TOO_LARGE', jsonb_build_object('amount_minor', v_take, 'charge_open_minor', v_open));
  END IF;

  PERFORM toll_system.allocate(p_company, c.id, p_bearer, v_take, NULL,
                               coalesce(nullif(p_body ->> 'reason_code', ''), p_bearer || '_' || 'decision'),
                               p_decision, p_cmd, 1);
  UPDATE toll.charges SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;

  RETURN jsonb_build_object('decision_id', p_decision, 'charge_version', v_cv, 'amount_minor', v_take, 'bearer', p_bearer,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
               jsonb_build_object('decided_minor', v_take, 'bearer', p_bearer))));
END;
$$;

-- 8. leave_payback_unlinked (P9: no posting; the amount stays in toll:payback_unallocated) -------------------
CREATE OR REPLACE FUNCTION toll_write.intent_leave_payback_unlinked(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p      toll.paybacks%ROWTYPE;
  v_id   uuid := nullif(p_body ->> 'payback_id', '')::uuid;
  v_pw   date;
  v_open bigint;
  v_take bigint;
  v_pv   bigint;
BEGIN
  IF p_body ? 'carried_fact_id' THEN   -- a P19 leftover is decided on its carried row: P2-R4b
    PERFORM toll_write.refuse('INTENT_NOT_BUILT', jsonb_build_object('intent', 'leave_payback_unlinked',
                                                                     'part', 'carried P19 leftover', 'round', 'P2-R4b'));
  END IF;
  IF nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('reason_code')));
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

-- 9. undo_decision --------------------------------------------------------------------------------------------
-- Reverses what one person decision wrote: its active allocations (P15 rows) and its "left unlinked" rows (no
-- posting). The facts stay. Body: decision_id + expected_versions {"<charge or payback id>": version} for EVERY
-- distinct charge and payback the decision touched; a missing or stale one → BAD_REQUEST / VERSION_CHANGED.
CREATE OR REPLACE FUNCTION toll_write.intent_undo_decision(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d          toll.decisions%ROWTYPE;
  v_target   uuid := nullif(p_body ->> 'decision_id', '')::uuid;
  v_exp      jsonb := coalesce(p_body -> 'expected_versions', '{}'::jsonb);
  v_charges  uuid[];
  v_paybacks uuid[];
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
  IF NOT EXISTS (SELECT 1 FROM toll.allocations a WHERE a.organization_id = p_company AND a.decision_id = v_target
                   AND a.reversed_by IS NULL)
     AND NOT EXISTS (SELECT 1 FROM toll.payback_unlinked_decisions u WHERE u.organization_id = p_company
                       AND u.decision_id = v_target AND u.reversed_by IS NULL) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('decision_id', v_target, 'state', 'already_undone'));
  END IF;

  v_weeks := array(SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) FROM toll.charges x
                   WHERE x.organization_id = p_company AND x.id = ANY (v_charges)
                   UNION SELECT x.week_key FROM toll.paybacks x
                   WHERE x.organization_id = p_company AND x.id = ANY (v_paybacks));
  PERFORM toll_write.lock_weeks(p_company, v_weeks);

  -- Every touched record's version (paybacks before charges).
  FOREACH v_id IN ARRAY v_paybacks LOOP
    p := toll_write.lock_payback(p_company, v_id, (v_exp ->> v_id::text)::bigint, 'expected_versions.' || v_id);
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
    SELECT u.id, u.amount_minor, pb.week_key
    FROM toll.payback_unlinked_decisions u JOIN toll.paybacks pb ON pb.organization_id = u.organization_id AND pb.id = u.payback_id
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
  FOREACH v_id IN ARRAY v_charges LOOP
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = v_id RETURNING version INTO v_ver;
    v_versions := v_versions || jsonb_build_object(v_id::text, v_ver);
  END LOOP;

  RETURN jsonb_build_object('decision_id', p_decision, 'undone_decision_id', v_target, 'versions', v_versions,
                            'weeks', toll_write.weeks_answer(p_company, v_deltas));
END;
$$;

-- 10. verify / reject a cash receipt ------------------------------------------------------------------------
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
    PERFORM toll_system.post(p_company, 'P3_cash_verified', c.amount_minor, c.occurred_at, p_cmd, 1,
                             jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id));
  END IF;

  RETURN jsonb_build_object('decision_id', p_decision, 'charge_version', v_cv,
    'state', toll_system.charge_state(p_company, c.id),
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
               CASE WHEN p_verify THEN jsonb_build_object('verified_minor', c.amount_minor)
                    ELSE jsonb_build_object('rejected_minor', c.amount_minor) END)));
END;
$$;

-- 11. confirm / release a duplicate review pair -------------------------------------------------------------
-- Body: charge_id = the copy, other_charge_id = the one kept (release: either order), expected_charge_version,
-- expected_other_version. Confirm reverses the copy's arrival posting and its allocations (P15), then marks it.
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
                               v_net, c.occurred_at, p_cmd, v_line,
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

-- 12. The router: the same B3 order as before, with this round's intents wired in --------------------------------
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

-- 13. Grants: everything here runs only inside the router (definer); nobody calls it directly -------------------
REVOKE ALL ON FUNCTION toll_system.charge_open_minor(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.payback_open_minor(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll.tg_allocation_caps() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.lock_weeks(uuid, date[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.refuse_if_sealed(uuid, date[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.lock_charge(uuid, uuid, bigint, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.lock_payback(uuid, uuid, bigint, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.require_charge_state(uuid, toll.charges, text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.require_payback_usable(uuid, toll.paybacks) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.bearer_rule(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.allocate(uuid, uuid, text, bigint, uuid, text, uuid, text, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.reverse_allocation(uuid, uuid, uuid, text, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.add_delta(jsonb, date, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.weeks_answer(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.body_amount(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.do_link(uuid, uuid, text, uuid, uuid, bigint, bigint, bigint, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_link_payback(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_apply_suggestion(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.do_bear(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_leave_payback_unlinked(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_undo_decision(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.do_receipt(uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.do_duplicate(uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.command(text, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION toll_write.command(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Toll Round S2a: matcher opens and settles disputes (docs/toll-build/cursor-S2a-matcher-disputes.md).

-- 1. Suggestion kinds -------------------------------------------------------------------------------
ALTER TABLE toll.suggestions
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'payback',
  ADD COLUMN IF NOT EXISTS dispute_id uuid;

ALTER TABLE toll.suggestions DROP CONSTRAINT IF EXISTS suggestions_kind_check;
ALTER TABLE toll.suggestions
  ADD CONSTRAINT suggestions_kind_check CHECK (kind IN ('payback', 'dispute_refund'));

ALTER TABLE toll.suggestions DROP CONSTRAINT IF EXISTS suggestions_dispute_id_kind_check;
ALTER TABLE toll.suggestions
  ADD CONSTRAINT suggestions_dispute_id_kind_check CHECK (
    (kind = 'dispute_refund' AND dispute_id IS NOT NULL)
    OR (kind = 'payback' AND dispute_id IS NULL)
  );

ALTER TABLE toll.suggestions DROP CONSTRAINT IF EXISTS suggestions_dispute_id_fkey;
ALTER TABLE toll.suggestions
  ADD CONSTRAINT suggestions_dispute_id_fkey
    FOREIGN KEY (organization_id, dispute_id) REFERENCES toll.disputes (organization_id, id);

-- 2. Remember dispute state when a refund link settles it (R7) --------------------------------------
ALTER TABLE toll.dispute_links
  ADD COLUMN IF NOT EXISTS state_at_settle text;

-- 3. Refund window (Jamaica pay periods, T6) ------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.dispute_refund_bounds(
  p_anchor   timestamptz,
  p_periods  int,
  OUT refund_from date,
  OUT refund_to   date
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_periods int := greatest(coalesce(p_periods, 2), 1);
  v_ws      date;
BEGIN
  IF p_anchor IS NULL THEN
    refund_from := NULL;
    refund_to := NULL;
    RETURN;
  END IF;
  refund_from := (p_anchor AT TIME ZONE 'America/Jamaica')::date;
  v_ws := ledger.jamaica_week_start(p_anchor);
  -- First full Monday–Sunday week after the anchor's week, then p_periods full weeks (end = Sunday).
  refund_to := v_ws + 7 + (v_periods * 7) - 1;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.charge_has_active_dispute(p_company uuid, p_charge uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM toll.disputes d
    WHERE d.organization_id = p_company AND d.charge_id = p_charge
      AND d.state IN ('to_send', 'sent', 'expired')
      AND d.close_reason IS DISTINCT FROM 'undo');
$$;

-- 4. System decisions (matcher / auto-dispute; replay like system_import; no four-eyes) ------------
CREATE OR REPLACE FUNCTION toll_system.run_system_command(
  p_company    uuid,
  p_intent     text,
  p_command_id text,
  p_body       jsonb,
  p_actor_job  text DEFAULT 'matcher:system'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_decision uuid;
  v_stored   jsonb;
  v_intent   text;
  v_response jsonb;
BEGIN
  IF p_company IS NULL OR nullif(btrim(p_command_id), '') IS NULL OR p_intent IS NULL THEN
    RAISE EXCEPTION 'BAD_REQUEST: company, intent and command_id required';
  END IF;

  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_job, targets)
  VALUES (p_company, p_command_id, p_intent, 'system', coalesce(p_actor_job, 'matcher:system'), p_body)
  ON CONFLICT (organization_id, command_id) DO NOTHING
  RETURNING id INTO v_decision;

  IF v_decision IS NULL THEN
    SELECT d.response, d.intent INTO v_stored, v_intent
    FROM toll.decisions d WHERE d.organization_id = p_company AND d.command_id = p_command_id;
    IF v_intent IS DISTINCT FROM p_intent THEN
      PERFORM toll_write.refuse('COMMAND_ID_REUSED', jsonb_build_object('command_id', p_command_id));
    END IF;
    RETURN coalesce(v_stored, '{}'::jsonb) || jsonb_build_object('replay', true);
  END IF;

  v_response := CASE p_intent
    WHEN 'link_payback'  THEN toll_write.intent_link_payback(p_company, v_decision, p_command_id, p_body)
    WHEN 'open_dispute'  THEN toll_write.intent_open_dispute(p_company, v_decision, p_command_id, p_body)
    WHEN 'settle_dispute' THEN toll_write.intent_settle_dispute(p_company, v_decision, p_command_id, p_body, true)
    ELSE NULL
  END;

  IF v_response IS NULL THEN
    PERFORM toll_write.refuse('INTENT_NOT_BUILT', jsonb_build_object('intent', p_intent));
  END IF;

  IF octet_length(v_response::text) > 65536 THEN
    v_response := jsonb_build_object('decision_id', v_decision, 'weeks', v_response -> 'weeks', 'truncated', true);
    UPDATE toll.decisions SET response = v_response, response_truncated = true WHERE id = v_decision;
  ELSE
    UPDATE toll.decisions SET response = v_response WHERE id = v_decision;
  END IF;

  RETURN v_response;
END;
$$;

-- 5. Auto-open dispute after a person's link leaves a remainder -----------------------------------
CREATE OR REPLACE FUNCTION toll_system.try_auto_dispute_after_link(
  p_company     uuid,
  p_link_decision uuid,
  p_cmd         text,
  p_charge      uuid,
  p_payback     uuid,
  p_defer_provisional boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c      toll.charges%ROWTYPE;
  p      toll.paybacks%ROWTYPE;
  v_plat text;
  v_open bigint;
BEGIN
  IF NOT coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false) THEN
    RETURN;
  END IF;

  SELECT * INTO c FROM toll.charges x WHERE x.organization_id = p_company AND x.id = p_charge;
  SELECT * INTO p FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = p_payback;

  IF p.kind <> 'trip_line' THEN RETURN; END IF;
  v_plat := p.platform;
  IF NOT coalesce((SELECT ps.takes_disputes FROM toll.platform_settings ps
                   WHERE ps.organization_id = p_company AND ps.platform = v_plat), false) THEN
    RETURN;
  END IF;

  v_open := toll_system.charge_open_minor(p_company, c.id);
  IF v_open <= 0 OR toll_system.charge_has_active_dispute(p_company, c.id) THEN
    RETURN;
  END IF;

  PERFORM toll_system.run_system_command(
    p_company, 'open_dispute', 'auto-dispute:' || p_link_decision::text,
    jsonb_build_object(
      'charge_id', c.id, 'payback_id', p.id,
      'expected_charge_version', c.version,
      'expected_payback_version', p.version,
      'defer_provisional', p_defer_provisional),
    'matcher:auto_dispute');
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_withdraw_on_link_undo(
  p_company       uuid,
  p_dispute       uuid,
  p_undo_decision uuid,
  p_cmd           text
)
RETURNS int   -- the last ledger line used, so the caller keeps numbering after it
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d      toll.disputes%ROWTYPE;
  v_line int := 0;
  r      record;
  v_root uuid;
BEGIN
  SELECT * INTO d FROM toll.disputes x
  WHERE x.organization_id = p_company AND x.id = p_dispute FOR UPDATE;
  IF NOT FOUND OR d.state <> 'to_send' THEN RETURN v_line; END IF;

  v_root := toll_system.dispute_chain_root(p_company, d.id);
  FOR r IN
    SELECT a.id FROM toll.allocations a
    WHERE a.organization_id = p_company AND a.charge_id = d.charge_id
      AND a.dispute_id IN (d.id, v_root) AND a.reversed_by IS NULL AND a.provisional
    ORDER BY a.created_at, a.id
  LOOP
    v_line := v_line + 1;
    PERFORM toll_system.dispute_reverse_allocation(p_company, r.id, p_undo_decision, p_cmd, v_line);
  END LOOP;

  UPDATE toll.disputes SET close_reason = 'undo', state = 'lost'
  WHERE organization_id = p_company AND id = d.id;
  RETURN v_line;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_companion_open_command(p_link_cmd text, p_link_decision uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_link_cmd LIKE 'matcher:link:%' THEN replace(p_link_cmd, 'matcher:link:', 'matcher:dispute:')
    ELSE 'auto-dispute:' || p_link_decision::text
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
    v_bearer := CASE WHEN d_old.opened_late THEN 'fleet'
                     ELSE coalesce(d_old.bearer,
                       (SELECT dp.expired_bearer FROM toll.dispute_policy dp WHERE dp.organization_id = p_company),
                       'driver') END;
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

-- Review S2a-R7: a take-back of a refund that settled a dispute on a SEALED charge week. That refund
-- moved its money by one net posting (P22 refund, or P24 refund on an expired dispute) tied to a
-- dispute_result carried fact, never by allocations (the S1 money rule). The take-back reverses
-- exactly those legs of the settling command, in the open week (a reversal never lands in a sealed
-- week), the same way intent_undo_dispute_result does. Returns the last ledger line used.
CREATE OR REPLACE FUNCTION toll_system.dispute_reverse_settle_legs(
  p_company uuid, p_settle_decision uuid, p_cmd text, p_line int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_line   int := p_line;
  v_prefix text;
  v_refs   jsonb;
  r        record;
BEGIN
  SELECT 'toll:' || p_company::text || ':' || dec.command_id || ':' INTO v_prefix
  FROM toll.decisions dec WHERE dec.organization_id = p_company AND dec.id = p_settle_decision;
  IF v_prefix IS NULL THEN RETURN v_line; END IF;

  FOR r IN
    SELECT e.amount_minor, e.effective_at, e.metadata
    FROM ledger.entries e
    WHERE e.organization_id = p_company AND e.reference_type = 'toll'
      AND e.idempotency_key LIKE v_prefix || '%'
      AND coalesce((e.metadata ->> 'reverse')::boolean, false) = false
      AND e.metadata ->> 'toll_rule' ~ '^(P22_|P24_)'
    ORDER BY e.idempotency_key
  LOOP
    v_line := v_line + 1;
    v_refs := r.metadata - 'toll_rule' - 'design_ref' - 'reverse' - 'toll_week' - 'driverId';
    IF r.metadata ? 'driverId' THEN
      v_refs := v_refs || jsonb_build_object('driver_id', r.metadata ->> 'driverId');
    END IF;
    PERFORM toll_system.post(
      p_company, r.metadata ->> 'toll_rule', r.amount_minor,
      CASE WHEN toll_system.week_is_sealed(p_company, ledger.jamaica_week_start(r.effective_at))
           THEN ((toll_system.posting_week(p_company) + time '12:00') AT TIME ZONE 'America/Jamaica')
           ELSE r.effective_at END,
      p_cmd, v_line, v_refs, true);
  END LOOP;
  RETURN v_line;
END;
$$;

-- 6. match_scope: pull in dispute drivers' charges when toll_disputes is on -----------------------
CREATE OR REPLACE FUNCTION toll_system.match_scope(p_company uuid, p_claim uuid, OUT charge_ids uuid[], OUT payback_ids uuid[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c uuid[];
  v_p uuid[];
  v_dis boolean;
BEGIN
  v_c := array(SELECT q.record_id FROM toll.match_queue q
               WHERE q.organization_id = p_company AND q.claim_id = p_claim AND q.record_kind = 'charge');
  v_p := array(SELECT q.record_id FROM toll.match_queue q
               WHERE q.organization_id = p_company AND q.claim_id = p_claim AND q.record_kind = 'payback'
               UNION
               SELECT p.id FROM toll.match_queue q
               JOIN toll.platform_trips t ON t.organization_id = q.organization_id AND t.id = q.record_id
               JOIN toll.paybacks p ON p.organization_id = t.organization_id AND p.platform = t.platform
                                   AND p.platform_trip_id = t.platform_trip_id
               WHERE q.organization_id = p_company AND q.claim_id = p_claim AND q.record_kind = 'trip');

  charge_ids := array(
    SELECT unnest(v_c)
    UNION SELECT toll_system.match_charges_near(p_company, v_p)
    UNION SELECT s.charge_id FROM toll.suggestions s
          WHERE s.organization_id = p_company AND s.superseded_by IS NULL AND s.payback_id = ANY (v_p)
            AND NOT ('withdrawn' = ANY (s.rules_fired)));
  payback_ids := array(
    SELECT unnest(v_p)
    UNION SELECT toll_system.match_paybacks_near(p_company, v_c)
    UNION SELECT s.payback_id FROM toll.suggestions s
          WHERE s.organization_id = p_company AND s.superseded_by IS NULL AND s.charge_id = ANY (v_c)
            AND NOT ('withdrawn' = ANY (s.rules_fired)));

  v_dis := coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false);
  IF v_dis THEN
    charge_ids := array(
      SELECT unnest(charge_ids)
      UNION SELECT d.charge_id FROM toll.disputes d
            WHERE d.organization_id = p_company
              AND d.state IN ('to_send', 'sent', 'expired')
              AND d.close_reason IS DISTINCT FROM 'undo'
              AND (
                d.charge_id = ANY (charge_ids)
                OR d.driver_id IN (
                  SELECT p.driver_id FROM toll.paybacks p
                  WHERE p.organization_id = p_company AND p.id = ANY (payback_ids) AND p.driver_id IS NOT NULL)));
    payback_ids := array(
      SELECT unnest(payback_ids)
      UNION SELECT p.id FROM toll.paybacks p
            WHERE p.organization_id = p_company AND NOT p.is_legacy
              AND p.kind <> 'native'
              AND p.driver_id IN (
                SELECT d.driver_id FROM toll.disputes d
                WHERE d.organization_id = p_company
                  AND d.state IN ('sent', 'expired')
                  AND d.close_reason IS DISTINCT FROM 'undo'
                  AND d.driver_id IS NOT NULL
                  AND (
                    d.charge_id = ANY (charge_ids)
                    OR d.driver_id IN (
                      SELECT x.driver_id FROM toll.paybacks x
                      WHERE x.organization_id = p_company AND x.id = ANY (payback_ids) AND x.driver_id IS NOT NULL))));
  END IF;
END;
$$;

-- 7. match_claim (S1b + rates / disputes / takes_disputes when switch on) --------------------------
CREATE OR REPLACE FUNCTION toll_system.match_claim(p_company uuid, p_limit int DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim uuid := gen_random_uuid();
  v_n     int;
  v_fc    uuid[];
  v_fp    uuid[];
  v_c0    uuid[];
  v_p0    uuid[];
  v_c     uuid[];
  v_p     uuid[];
  v_dis   boolean;
  v_bundle jsonb;
BEGIN
  IF p_company IS NULL THEN RAISE EXCEPTION 'BAD_REQUEST: company required'; END IF;

  v_dis := coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false);
  IF v_dis THEN
    PERFORM toll_system.match_refuse_missing_settings(p_company);
  END IF;

  UPDATE toll.match_queue q SET claim_id = v_claim, claimed_at = now()
  WHERE (q.organization_id, q.record_kind, q.record_id) IN (
    SELECT x.organization_id, x.record_kind, x.record_id
    FROM toll.match_queue x
    WHERE x.organization_id = p_company
      AND (x.claim_id IS NULL OR x.claimed_at < now() - interval '10 minutes')
    ORDER BY x.enqueued_at, x.record_kind, x.record_id
    LIMIT greatest(1, least(coalesce(p_limit, 500), 2000))
    FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('claim_id', NULL);
  END IF;

  SELECT f.charge_ids, f.payback_ids INTO v_fc, v_fp FROM toll_system.match_scope(p_company, v_claim) f;
  v_c0 := array(SELECT unnest(v_fc) UNION SELECT toll_system.match_charges_near(p_company, v_fp));
  v_p0 := array(SELECT unnest(v_fp) UNION SELECT toll_system.match_paybacks_near(p_company, v_fc));
  v_c  := array(SELECT unnest(v_c0) UNION SELECT toll_system.match_charges_near(p_company, v_p0));
  v_p  := array(SELECT unnest(v_p0) UNION SELECT toll_system.match_paybacks_near(p_company, v_c0));

  v_bundle := jsonb_build_object(
    'claim_id', v_claim,
    'queued', v_n,
    'focal', jsonb_build_object('charge_ids', to_jsonb(v_fc), 'payback_ids', to_jsonb(v_fp)),
    'charges', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id, 'source', c.source, 'vehicle_id', c.vehicle_id, 'driver_id', c.driver_id,
               'plaza_id', c.plaza_id, 'occurred_at', c.occurred_at, 'time_precision', c.time_precision,
               'amount_minor', c.amount_minor,
               'remaining_minor', c.amount_minor - coalesce((
                  SELECT sum(a.amount_minor) FROM toll.allocations a
                  WHERE a.organization_id = c.organization_id AND a.charge_id = c.id AND a.reversed_by IS NULL), 0),
               'evidence_status', c.evidence_status, 'duplicate_of', c.duplicate_of, 'after_seal', c.after_seal,
               'is_legacy', c.is_legacy, 'week_sealed', toll_system.week_is_sealed(p_company, c.week_key))
             ORDER BY c.id), '[]'::jsonb)
      FROM toll.charges c WHERE c.organization_id = p_company AND c.id = ANY (v_c)),
    'paybacks', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', p.id, 'platform', p.platform, 'kind', p.kind, 'platform_trip_id', p.platform_trip_id,
               'driver_id', p.driver_id, 'paid_on', p.paid_on, 'amount_minor', p.amount_minor,
               'remaining_minor', p.amount_minor
                  - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                              WHERE a.organization_id = p.organization_id AND a.payback_id = p.id AND a.reversed_by IS NULL), 0)
                  - coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                              WHERE u.organization_id = p.organization_id AND u.payback_id = p.id AND u.reversed_by IS NULL), 0),
               'received_by', p.received_by, 'reversal_of', p.reversal_of,
               'reversed', EXISTS (SELECT 1 FROM toll.paybacks r WHERE r.organization_id = p.organization_id AND r.reversal_of = p.id),
               'after_seal', p.after_seal, 'is_legacy', p.is_legacy,
               'week_sealed', toll_system.week_is_sealed(p_company, p.week_key))
             ORDER BY p.id), '[]'::jsonb)
      FROM toll.paybacks p WHERE p.organization_id = p_company AND p.id = ANY (v_p)),
    'trips', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'platform', t.platform, 'platform_trip_id', t.platform_trip_id, 'vehicle_id', t.vehicle_id,
               'driver_id', t.driver_id, 'request_at', t.request_at, 'pickup_at', t.pickup_at, 'dropoff_at', t.dropoff_at,
               'time_precision', t.time_precision, 'payment_method', t.payment_method, 'is_legacy', t.is_legacy)
             ORDER BY t.platform, t.platform_trip_id), '[]'::jsonb)
      FROM toll.platform_trips t
      WHERE t.organization_id = p_company
        AND EXISTS (SELECT 1 FROM toll.paybacks p WHERE p.organization_id = t.organization_id AND p.id = ANY (v_p)
                      AND p.platform = t.platform AND p.platform_trip_id = t.platform_trip_id)),
    'settings', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('platform', s.platform, 'auto_apply', s.auto_apply, 'payback_mode', s.payback_mode)
          || CASE WHEN v_dis THEN jsonb_build_object('takes_disputes', s.takes_disputes) ELSE '{}'::jsonb END
        ORDER BY s.platform), '[]'::jsonb)
      FROM toll.platform_settings s WHERE s.organization_id = p_company));

  IF v_dis THEN
    v_bundle := v_bundle || jsonb_build_object(
      'rates', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'plaza_id', r.plaza_id, 'platform', r.platform, 'amount_minor', r.amount_minor, 'valid_from', r.valid_from)
               ORDER BY r.plaza_id, r.platform, r.valid_from), '[]'::jsonb)
        FROM toll.plaza_rates r
        WHERE r.rate_kind = 'platform_refund'
          AND r.plaza_id IN (SELECT DISTINCT c.plaza_id FROM toll.charges c
                             WHERE c.organization_id = p_company AND c.id = ANY (v_c) AND c.plaza_id IS NOT NULL)),
      'disputes', (
        SELECT coalesce(jsonb_agg(row_data ORDER BY (row_data ->> 'id')), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object(
                   'id', d.id, 'charge_id', d.charge_id, 'state', d.state, 'platform', d.platform,
                   'platform_trip_id', d.platform_trip_id, 'driver_id', d.driver_id,
                   'owed_minor', d.owed_minor, 'recovered_minor', d.recovered_minor,
                   'opened_late', d.opened_late, 'version', d.version,
                   'refund_from', b.refund_from, 'refund_to', b.refund_to) AS row_data
          FROM toll.disputes d
          JOIN toll.platform_settings ps ON ps.organization_id = d.organization_id AND ps.platform = d.platform
          LEFT JOIN LATERAL toll_system.dispute_refund_bounds(
            CASE WHEN d.state = 'expired' THEN d.deadline ELSE d.clock_from END,
            ps.refund_periods) b ON d.state IN ('sent', 'expired')
          WHERE d.organization_id = p_company
            AND d.state IN ('to_send', 'sent', 'expired')
            AND d.close_reason IS DISTINCT FROM 'undo'
            AND (
              d.charge_id = ANY (v_c)
              OR (d.state IN ('sent', 'expired') AND d.driver_id IN (
                SELECT p.driver_id FROM toll.paybacks p
                WHERE p.organization_id = p_company AND p.id = ANY (v_p) AND p.driver_id IS NOT NULL)))
        ) x));
  END IF;

  RETURN v_bundle;
END;
$$;

-- 8. match_store: kinds, system actions, actions response ------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.match_store(p_company uuid, p_claim uuid, p_result jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ev            text := nullif(btrim(p_result ->> 'engine_version'), '');
  v_fc            uuid[];
  v_fp            uuid[];
  r               jsonb;
  v_c             uuid;
  v_p             uuid;
  v_d             uuid;
  v_kind          text;
  v_inputs        jsonb;
  v_hash          text;
  v_open          toll.suggestions%ROWTYPE;
  v_has_open      boolean;
  v_new           uuid;
  v_seen          text[] := '{}';
  v_pair_key      text;
  n_new           int := 0;
  n_same          int := 0;
  n_replaced      int := 0;
  n_withdrawn     int := 0;
  n_skipped       int := 0;
  v_dis           boolean;
  v_eligible      uuid[] := '{}';
  v_parts         jsonb;
  v_open_elig     boolean;
  v_settle_elig   boolean;
  v_s             toll.suggestions%ROWTYPE;
  v_opened        int := 0;
  v_settled       int := 0;
  v_skip_actions  jsonb := '[]'::jsonb;
  v_err           text;
  v_chr           toll.charges%ROWTYPE;
  v_pb            toll.paybacks%ROWTYPE;
  v_dsp           toll.disputes%ROWTYPE;
  v_amt           bigint;
  v_body          jsonb;
  v_rr            jsonb;
BEGIN
  IF p_company IS NULL OR p_claim IS NULL OR v_ev IS NULL
     OR jsonb_typeof(p_result -> 'candidates') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'BAD_REQUEST: company, claim_id, engine_version and candidates[] are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('toll_match:' || p_company::text, 0));

  IF NOT EXISTS (SELECT 1 FROM toll.match_queue q WHERE q.organization_id = p_company AND q.claim_id = p_claim) THEN
    RETURN jsonb_build_object('status', 'claim_gone', 'claim_id', p_claim);
  END IF;
  SELECT f.charge_ids, f.payback_ids INTO v_fc, v_fp FROM toll_system.match_scope(p_company, p_claim) f;
  v_dis := coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false);

  FOR r IN SELECT value FROM jsonb_array_elements(p_result -> 'candidates') LOOP
    v_kind := coalesce(nullif(r ->> 'kind', ''), 'payback');
    v_c := nullif(r ->> 'charge_id', '')::uuid;
    v_p := nullif(r ->> 'payback_id', '')::uuid;
    v_d := nullif(r ->> 'dispute_id', '')::uuid;
    v_inputs := r -> 'inputs';
  IF v_c IS NULL OR v_p IS NULL
       OR v_kind = 'dispute_refund' AND v_d IS NULL
       OR jsonb_typeof(v_inputs) IS DISTINCT FROM 'object'
       OR jsonb_typeof(r -> 'score_parts') IS DISTINCT FROM 'object'
       OR jsonb_typeof(r -> 'rules_fired') IS DISTINCT FROM 'array'
       OR NOT (v_c = ANY (v_fc) OR v_p = ANY (v_fp))
       OR NOT EXISTS (SELECT 1 FROM toll.charges ch WHERE ch.organization_id = p_company AND ch.id = v_c)
       OR NOT EXISTS (SELECT 1 FROM toll.paybacks pb WHERE pb.organization_id = p_company AND pb.id = v_p) THEN
      n_skipped := n_skipped + 1;
      CONTINUE;
    END IF;
    v_pair_key := v_c::text || ':' || v_p::text || ':' || coalesce(v_d::text, '');
    IF v_pair_key = ANY (v_seen) THEN CONTINUE; END IF;
    v_seen := v_seen || v_pair_key;
    v_hash := md5(v_inputs::text);
    v_parts := r -> 'score_parts';

    SELECT * INTO v_open FROM toll.suggestions s
    WHERE s.organization_id = p_company AND s.charge_id = v_c AND s.payback_id = v_p
      AND s.kind = v_kind AND s.dispute_id IS NOT DISTINCT FROM v_d AND s.superseded_by IS NULL
    ORDER BY s.created_at DESC, s.id LIMIT 1;
    v_has_open := FOUND;

    IF v_has_open AND v_open.engine_version = v_ev AND v_open.inputs_hash = v_hash
       AND NOT ('withdrawn' = ANY (v_open.rules_fired)) THEN
      n_same := n_same + 1;
      -- Review S2a-R5: an unchanged eligible suggestion is acted on again. A refused attempt left no
      -- decision row, so it is retried; a done one replays (same command id) and moves nothing.
      IF v_dis AND ('dispute_open_eligible' = ANY (v_open.rules_fired)
                    OR 'dispute_settle_eligible' = ANY (v_open.rules_fired)
                    OR coalesce((v_open.score_parts ->> 'dispute_open_eligible')::boolean, false)
                    OR coalesce((v_open.score_parts ->> 'dispute_settle_eligible')::boolean, false)) THEN
        v_eligible := v_eligible || v_open.id;
      END IF;
      CONTINUE;
    END IF;

    INSERT INTO toll.suggestions (organization_id, charge_id, payback_id, kind, dispute_id, score_parts, rules_fired,
                                  engine_version, inputs, inputs_hash)
    VALUES (p_company, v_c, v_p, v_kind, v_d,
            v_parts || jsonb_build_object('auto_apply', coalesce((r ->> 'auto_apply')::boolean, false)),
            ARRAY(SELECT jsonb_array_elements_text(r -> 'rules_fired')), v_ev, v_inputs, v_hash)
    RETURNING id INTO v_new;

    IF v_has_open THEN
      UPDATE toll.suggestions SET superseded_by = v_new WHERE organization_id = p_company AND id = v_open.id;
      n_replaced := n_replaced + 1;
    ELSE
      n_new := n_new + 1;
    END IF;

    IF v_dis AND (
           coalesce((r ->> 'dispute_open_eligible')::boolean, false)
        OR coalesce((r ->> 'dispute_settle_eligible')::boolean, false)
        OR coalesce((r -> 'score_parts' ->> 'dispute_open_eligible')::boolean, false)
        OR coalesce((r -> 'score_parts' ->> 'dispute_settle_eligible')::boolean, false)
        OR 'dispute_open_eligible' = ANY (ARRAY(SELECT jsonb_array_elements_text(r -> 'rules_fired')))
        OR 'dispute_settle_eligible' = ANY (ARRAY(SELECT jsonb_array_elements_text(r -> 'rules_fired')))) THEN
      v_eligible := v_eligible || v_new;
    END IF;
  END LOOP;

  FOR v_open IN
    SELECT * FROM toll.suggestions s
    WHERE s.organization_id = p_company AND s.superseded_by IS NULL
      AND NOT ('withdrawn' = ANY (s.rules_fired))
      AND (s.charge_id = ANY (v_fc) OR s.payback_id = ANY (v_fp))
      AND NOT ((s.charge_id::text || ':' || s.payback_id::text || ':' || coalesce(s.dispute_id::text, '')) = ANY (v_seen))
    ORDER BY s.id
  LOOP
    v_inputs := jsonb_build_object('withdrawn_from', v_open.id, 'reason', 'no_longer_a_candidate');
    INSERT INTO toll.suggestions (organization_id, charge_id, payback_id, kind, dispute_id, score_parts, rules_fired,
                                  engine_version, inputs, inputs_hash)
    VALUES (p_company, v_open.charge_id, v_open.payback_id, v_open.kind, v_open.dispute_id,
            jsonb_build_object('total', 0, 'auto_apply', false),
            ARRAY['withdrawn'], v_ev, v_inputs, md5(v_inputs::text))
    RETURNING id INTO v_new;
    UPDATE toll.suggestions SET superseded_by = v_new WHERE organization_id = p_company AND id = v_open.id;
    n_withdrawn := n_withdrawn + 1;
  END LOOP;

  IF v_dis THEN
    FOREACH v_new IN ARRAY v_eligible LOOP
      SELECT * INTO v_s FROM toll.suggestions s WHERE s.organization_id = p_company AND s.id = v_new;
      v_parts := v_s.score_parts;
      v_open_elig := 'dispute_open_eligible' = ANY (v_s.rules_fired)
        OR coalesce((v_s.score_parts ->> 'dispute_open_eligible')::boolean, false);
      v_settle_elig := 'dispute_settle_eligible' = ANY (v_s.rules_fired)
        OR coalesce((v_s.score_parts ->> 'dispute_settle_eligible')::boolean, false);

      IF v_settle_elig AND v_s.kind = 'dispute_refund' AND v_s.dispute_id IS NOT NULL THEN
        BEGIN
          SELECT * INTO v_dsp FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = v_s.dispute_id;
          SELECT * INTO v_pb FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = v_s.payback_id;
          v_amt := coalesce(nullif(v_parts ->> 'amount_minor', '')::bigint,
            least(toll_system.payback_open_minor(p_company, v_pb.id), v_dsp.owed_minor - v_dsp.recovered_minor));
          v_body := jsonb_build_object(
            'dispute_id', v_dsp.id, 'payback_id', v_pb.id,
            'expected_dispute_version', v_dsp.version, 'expected_payback_version', v_pb.version,
            'amount_minor', v_amt, 'system', true);
          v_rr := toll_system.run_system_command(p_company, 'settle_dispute', 'matcher:settle:' || v_s.id::text,
                                                 v_body, 'matcher:settle');
          IF NOT coalesce((v_rr ->> 'replay')::boolean, false) THEN v_settled := v_settled + 1; END IF;
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
          v_skip_actions := v_skip_actions || jsonb_build_array(jsonb_build_object('suggestion_id', v_s.id, 'code', v_err));
        END;
      ELSIF v_open_elig AND v_s.kind = 'payback' THEN
        BEGIN
          SELECT * INTO v_chr FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_s.charge_id;
          SELECT * INTO v_pb FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = v_s.payback_id;
          v_amt := toll_system.payback_open_minor(p_company, v_pb.id);
          PERFORM toll_system.run_system_command(
            p_company, 'link_payback', 'matcher:link:' || v_s.id::text,
            jsonb_build_object(
              'charge_id', v_chr.id, 'payback_id', v_pb.id,
              'expected_charge_version', v_chr.version, 'expected_payback_version', v_pb.version,
              'amount_minor', v_amt, 'reason_code', 'matcher_auto'),
            'matcher:link');
          SELECT * INTO v_chr FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_s.charge_id;
          SELECT * INTO v_pb FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = v_s.payback_id;
          v_rr := toll_system.run_system_command(
            p_company, 'open_dispute', 'matcher:dispute:' || v_s.id::text,
            jsonb_build_object(
              'charge_id', v_chr.id, 'payback_id', v_pb.id,
              'expected_charge_version', v_chr.version, 'expected_payback_version', v_pb.version),
            'matcher:dispute');
          IF NOT coalesce((v_rr ->> 'replay')::boolean, false) THEN v_opened := v_opened + 1; END IF;
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
          v_skip_actions := v_skip_actions || jsonb_build_array(jsonb_build_object('suggestion_id', v_s.id, 'code', v_err));
        END;
      END IF;
    END LOOP;
  END IF;

  DELETE FROM toll.match_queue q WHERE q.organization_id = p_company AND q.claim_id = p_claim;

  RETURN jsonb_build_object(
    'status', 'stored', 'claim_id', p_claim, 'engine_version', v_ev,
    'new', n_new, 'unchanged', n_same, 'replaced', n_replaced,
    'withdrawn', n_withdrawn, 'skipped', n_skipped,
    'actions', jsonb_build_object('opened', v_opened, 'settled', v_settled, 'skipped', v_skip_actions));
END;
$$;

-- 9. Person link / apply: auto-open + refuse dispute_refund apply ---------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_link_payback(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_res jsonb;
  v_c   uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_p   uuid := nullif(p_body ->> 'payback_id', '')::uuid;
BEGIN
  v_res := toll_write.do_link(p_company, p_decision, p_cmd, v_c, v_p,
           (p_body ->> 'expected_charge_version')::bigint, (p_body ->> 'expected_payback_version')::bigint,
           toll_write.body_amount(p_body), coalesce(nullif(p_body ->> 'reason_code', ''), 'link_payback'));
  IF NOT EXISTS (SELECT 1 FROM toll.decisions d WHERE d.id = p_decision AND d.actor = 'system') THEN
    PERFORM toll_system.try_auto_dispute_after_link(p_company, p_decision, p_cmd, v_c, v_p, false);
  END IF;
  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_apply_suggestion(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
  IF s.kind = 'dispute_refund' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('suggestion_id', s.id, 'state', 'dispute_refund',
      'use', 'refund received'));
  END IF;
  IF s.superseded_by IS NOT NULL OR 'withdrawn' = ANY (s.rules_fired) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('suggestion_id', s.id, 'state', 'suggestion_stale',
                                                                'charge_id', s.charge_id, 'payback_id', s.payback_id));
  END IF;
  v_res := toll_write.do_link(p_company, p_decision, p_cmd, s.charge_id, s.payback_id,
                              (p_body ->> 'expected_charge_version')::bigint, (p_body ->> 'expected_payback_version')::bigint,
                              NULL, 'apply_suggestion');
  PERFORM toll_system.try_auto_dispute_after_link(
    p_company, p_decision, p_cmd, s.charge_id, s.payback_id, false);
  RETURN v_res || jsonb_build_object('suggestion_id', s.id, 'engine_version', s.engine_version,
                                     'score', s.score_parts -> 'total');
END;
$$;

-- 10. Undo link: cascade to_send dispute opened with the link ------------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_undo_decision(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
  v_eff      timestamptz;
  v_amt      bigint;
  v_deltas   jsonb := '{}'::jsonb;
  v_versions jsonb := '{}'::jsonb;
  v_ver      bigint;
  r          record;
  c          toll.charges%ROWTYPE;
  p          toll.paybacks%ROWTYPE;
  f          toll.carried_facts%ROWTYPE;
  v_dispute  jsonb;
  v_carve    bigint;
  v_no_p25   boolean;
  v_open_cmd text;
  v_dis      toll.disputes%ROWTYPE;
  v_dis_id   uuid;
BEGIN
  IF v_target IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('decision_id')));
  END IF;
  SELECT * INTO d FROM toll.decisions x WHERE x.organization_id = p_company AND x.id = v_target;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('decision_id', v_target));
  END IF;

  IF d.intent IN ('settle_dispute', 'close_dispute_lost', 'dispute_expire') THEN
    v_dispute := toll_write.intent_undo_dispute_result(p_company, v_target, p_decision, p_cmd);
    RETURN v_dispute || jsonb_build_object('undone_decision_id', v_target);
  END IF;

  IF d.intent = 'leave_payback_unlinked' THEN
    v_carve := toll_system.legacy_carve_amount(p_company, 'toll:payback_unallocated');
    IF v_carve IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM toll.payback_unlinked_decisions u
        WHERE u.organization_id = p_company AND u.decision_id = v_target AND u.reversed_by IS NULL
          AND NOT toll_system.unlinked_has_p25(p_company, u.decision_id))
      INTO v_no_p25;
      IF v_no_p25 THEN
        PERFORM toll_write.refuse('LEGACY_KEEP_FINAL', jsonb_build_object('decision_id', v_target, 'carve_out_minor', v_carve));
      END IF;
    END IF;
  END IF;

  IF d.intent NOT IN ('link_payback', 'driver_pays', 'fleet_absorbs', 'leave_payback_unlinked', 'apply_suggestion') THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('decision_id', v_target, 'intent', d.intent,
      'state', 'not_undoable',
      'use', CASE d.intent WHEN 'confirm_duplicate' THEN 'release_duplicate'
                           WHEN 'verify_cash_receipt' THEN 'correct_charge_amount or a new decision'
                           WHEN 'seal_week' THEN 'reopen_week' ELSE NULL END));
  END IF;

  IF d.intent IN ('link_payback', 'apply_suggestion')
     AND coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false) THEN
    v_open_cmd := toll_system.dispute_companion_open_command(d.command_id, v_target);
    SELECT dec.id INTO v_dis_id FROM toll.decisions dec
    WHERE dec.organization_id = p_company AND dec.command_id = v_open_cmd
    LIMIT 1;
    IF v_dis_id IS NOT NULL THEN
      SELECT dsp.* INTO v_dis FROM toll.disputes dsp
      WHERE dsp.organization_id = p_company AND v_dis_id = ANY (dsp.decision_ids)
      ORDER BY dsp.created_at DESC LIMIT 1;
      IF FOUND THEN
        IF v_dis.state IN ('sent', 'expired', 'won', 'part_won', 'lost') AND v_dis.close_reason IS DISTINCT FROM 'undo' THEN
          PERFORM toll_write.refuse('DISPUTE_IN_PROGRESS', jsonb_build_object('dispute_id', v_dis.id, 'state', v_dis.state));
        ELSIF v_dis.state = 'to_send' THEN
          v_line := toll_system.dispute_withdraw_on_link_undo(p_company, v_dis.id, p_decision, p_cmd);
        END IF;
      END IF;
    END IF;
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
    SELECT u.id, u.amount_minor, u.payback_id, u.carried_fact_id, coalesce(pb.week_key, cf.to_week) AS week_key
    FROM toll.payback_unlinked_decisions u
    LEFT JOIN toll.paybacks pb ON pb.organization_id = u.organization_id AND pb.id = u.payback_id
    LEFT JOIN toll.carried_facts cf ON cf.organization_id = u.organization_id AND cf.id = u.carried_fact_id
    WHERE u.organization_id = p_company AND u.decision_id = v_target AND u.reversed_by IS NULL
  LOOP
    v_eff := (r.week_key + time '12:00') AT TIME ZONE 'America/Jamaica';
    IF toll_system.unlinked_has_p25(p_company, v_target) THEN
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, 'P25_kept_to_income', r.amount_minor, v_eff, p_cmd, v_line,
        jsonb_build_object('decision_id', v_target)
          || CASE WHEN r.payback_id IS NOT NULL THEN jsonb_build_object('payback_id', r.payback_id)
                  ELSE jsonb_build_object('carried_fact_id', r.carried_fact_id) END,
        true);
    END IF;
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

-- 11. mark_dispute_sent: re-queue charge + recent driver paybacks ----------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_mark_dispute_sent(
  p_company uuid, p_decision uuid, p_cmd text, p_body jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d          toll.disputes%ROWTYPE;
  v_id       uuid := nullif(p_body ->> 'dispute_id', '')::uuid;
  v_exp      bigint := (p_body ->> 'expected_dispute_version')::bigint;
  v_user     uuid := auth.uid();
  v_can      boolean;
  v_cut      date;
  r          record;
BEGIN
  PERFORM toll_write.require_disputes_on(p_company);
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('dispute_id', v_id));
  END IF;
  IF d.version <> v_exp THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object('dispute_id', v_id, 'dispute_version', d.version));
  END IF;
  IF d.state <> 'to_send' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', v_id, 'state', d.state));
  END IF;
  IF now() > d.deadline THEN
    PERFORM toll_write.refuse('window_closed', jsonb_build_object('dispute_id', v_id));
  END IF;

  v_can := toll_system.user_can_manage_tolls(v_user, p_company);
  IF NOT v_can AND d.driver_id IS NOT NULL THEN
    v_can := EXISTS (
      SELECT 1 FROM toll.platform_trips t
      WHERE t.organization_id = p_company AND t.platform = d.platform AND t.platform_trip_id = d.platform_trip_id
        AND t.driver_id = d.driver_id);
  END IF;
  IF NOT v_can THEN
    PERFORM toll_write.refuse('FORBIDDEN', jsonb_build_object('dispute_id', v_id));
  END IF;

  UPDATE toll.disputes SET state = 'sent', sent_at = now(), clock_from = now(),
         decision_ids = array_append(decision_ids, p_decision)
  WHERE organization_id = p_company AND id = d.id;

  v_cut := ((now() AT TIME ZONE 'America/Jamaica')::date - 14);
  PERFORM toll_system.match_enqueue(p_company, 'charge', d.charge_id);
  FOR r IN
    SELECT p.id FROM toll.paybacks p
    WHERE p.organization_id = p_company AND NOT p.is_legacy AND p.kind <> 'native'
      AND p.driver_id IS NOT DISTINCT FROM d.driver_id
      AND p.paid_on >= v_cut
      AND NOT EXISTS (SELECT 1 FROM toll.paybacks x WHERE x.organization_id = p_company AND x.reversal_of = p.id)
  LOOP
    PERFORM toll_system.match_enqueue(p_company, 'payback', r.id);
  END LOOP;

  RETURN jsonb_build_object('decision_id', p_decision, 'dispute_id', d.id, 'state', 'sent',
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, d.charge_week_key,
              jsonb_build_object('dispute_sent', true))));
END;
$$;

-- 12. settle_dispute: remember state_at_settle on each link --------------------------------------
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
    SELECT CASE WHEN d.opened_late THEN 'fleet' ELSE coalesce(dp.expired_bearer, 'driver') END INTO v_bearer
    FROM toll.dispute_policy dp WHERE dp.organization_id = p_company;
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
         decision_ids = array_append(decision_ids, p_decision)
  WHERE organization_id = p_company AND id = d.id;

  UPDATE toll.paybacks SET version = version + 1, updated_at = now() WHERE organization_id = p_company AND id = p.id;
  UPDATE toll.charges SET version = version + 1, updated_at = now() WHERE organization_id = p_company AND id = d.charge_id;

  RETURN jsonb_build_object('decision_id', p_decision, 'dispute_id', d.id, 'amount_minor', v_take, 'state', v_new_st,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, d.charge_week_key,
              jsonb_build_object('dispute_settled_minor', v_take))));
END;
$$;

-- 13. reverse_payback: R7 dispute_links reopen -----------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_reverse_payback(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
  l          toll.dispute_links%ROWTYPE;
  v_st       text;
  v_reopened jsonb := '[]'::jsonb;
  v_sealed   boolean;
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
  PERFORM 1 FROM toll.charges c WHERE c.organization_id = p_company AND c.id = ANY (v_charges) ORDER BY c.id FOR UPDATE;
  PERFORM toll_write.refuse_if_sealed(p_company, v_weeks);

  INSERT INTO toll.paybacks (organization_id, platform, kind, platform_trip_id, reference, driver_id, paid_on, week_key,
                             amount_minor, reversal_of, received_by)
  VALUES (p_company, p.platform, p.kind, p.platform_trip_id, v_ref, p.driver_id, v_paid_on, v_rw,
          p.amount_minor, p.id, p.received_by)
  RETURNING id INTO v_rev;

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

  UPDATE toll.payback_unlinked_decisions SET reversed_by = v_rev
  WHERE organization_id = p_company AND payback_id = p.id AND reversed_by IS NULL;

  FOR l IN
    SELECT * FROM toll.dispute_links dl
    WHERE dl.organization_id = p_company AND dl.payback_id = p.id AND dl.reversed_by IS NULL
    ORDER BY dl.created_at, dl.id
  LOOP
    -- Links made before S2a have no state_at_settle; the dispute's state now is its final one (won),
    -- so infer the settled-from state: it had been sent if it has a sent_at, otherwise it was expired.
    v_st := coalesce(l.state_at_settle,
      (SELECT CASE WHEN d.sent_at IS NOT NULL THEN 'sent' ELSE 'expired' END
       FROM toll.disputes d WHERE d.organization_id = p_company AND d.id = l.dispute_id),
      'sent');
    UPDATE toll.dispute_links SET reversed_by = p_decision WHERE organization_id = p_company AND id = l.id;
    v_sealed := toll_system.dispute_charge_week_sealed(p_company,
                  (SELECT x.charge_id FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = l.dispute_id));
    IF v_sealed THEN
      v_line := toll_system.dispute_reverse_settle_legs(p_company, l.decision_id, p_cmd, v_line);
    END IF;
    IF v_st IN ('sent', 'expired') THEN
      v_line := toll_system.dispute_reopen_after_link_reverse(
        p_company, l.dispute_id, l.amount_minor, v_st, p_decision, p_cmd, v_line, v_sealed);
      v_reopened := v_reopened || jsonb_build_array(jsonb_build_object(
        'dispute_id', l.dispute_id, 'amount_minor', l.amount_minor, 'state_at_settle', v_st));
    END IF;
  END LOOP;

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
                            'charge_versions', v_versions, 'uncovered_minor', v_taken, 'disputes_reopened', v_reopened,
                            'weeks', toll_write.weeks_answer(p_company, v_deltas));
END;
$$;

-- 14. open_dispute idempotent when auto-open already created to_send (S1 tests + S2a) --------------
CREATE OR REPLACE FUNCTION toll_write.intent_open_dispute(
  p_company uuid, p_decision uuid, p_cmd text, p_body jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c           toll.charges%ROWTYPE;
  p           toll.paybacks%ROWTYPE;
  v_cid       uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_pid       uuid := nullif(p_body ->> 'payback_id', '')::uuid;
  v_cw        date;
  v_remain    bigint;
  v_platform  text;
  v_trip      text;
  v_driver    text;
  v_window    int;
  v_deadline  timestamptz;
  v_trip_date date;
  v_tpl       int;
  v_dispute   uuid;
  v_state     text := 'to_send';
  v_late      boolean := false;
  v_close     text;
  v_line      int := 0;
  v_cv        bigint;
  v_defer     boolean;
  v_weeks     jsonb;
  d_open      toll.disputes%ROWTYPE;
BEGIN
  PERFORM toll_write.require_disputes_on(p_company);
  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_cw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_cid;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_cw]);
  c := toll_write.lock_charge(p_company, v_cid, (p_body ->> 'expected_charge_version')::bigint);
  p := toll_write.lock_payback(p_company, v_pid, (p_body ->> 'expected_payback_version')::bigint);
  PERFORM toll_write.require_payback_usable(p_company, p);

  IF toll_system.dispute_charge_week_sealed(p_company, c.id) THEN
    PERFORM toll_write.refuse('charge_sealed', jsonb_build_object('charge_id', c.id, 'week_key', v_cw));
  END IF;

  v_platform := p.platform;
  IF NOT coalesce((SELECT ps.takes_disputes FROM toll.platform_settings ps
                   WHERE ps.organization_id = p_company AND ps.platform = v_platform), false) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('platform', v_platform, 'state', 'no_disputes'));
  END IF;

  SELECT * INTO d_open FROM toll.disputes d
  WHERE d.organization_id = p_company AND d.charge_id = c.id
    AND d.state IN ('to_send', 'expired')
    AND d.close_reason IS DISTINCT FROM 'undo'
  ORDER BY d.created_at DESC LIMIT 1;
  IF FOUND THEN
    IF EXISTS (
      SELECT 1 FROM toll.decisions dec
      WHERE dec.organization_id = p_company AND dec.intent = 'open_dispute'
        AND dec.actor = 'user' AND dec.command_id IS DISTINCT FROM p_cmd
        AND dec.id = ANY (d_open.decision_ids)) THEN
      PERFORM toll_write.refuse('DISPUTE_SECOND_OPEN', jsonb_build_object('charge_id', c.id));
    END IF;
    IF NOT p_decision = ANY (d_open.decision_ids) THEN
      UPDATE toll.disputes SET decision_ids = array_append(decision_ids, p_decision)
      WHERE organization_id = p_company AND id = d_open.id;
    END IF;
  -- Review S2a-R1: the open dispute already holds its money (it is never deferred), so a person's
  -- open_dispute on it only answers "already open" and moves nothing. (Writing money here again
  -- would charge the fleet twice for an opened-late dispute, whose allocation is not provisional.)
  v_weeks := '{}'::jsonb;
  v_cv := c.version;
  RETURN jsonb_build_object(
    'decision_id', p_decision, 'dispute_id', d_open.id, 'charge_version', v_cv,
    'state', d_open.state, 'owed_minor', d_open.owed_minor, 'already_open', true,
    'weeks', v_weeks);
  END IF;

  IF EXISTS (
    SELECT 1 FROM toll.disputes d
    WHERE d.organization_id = p_company AND d.charge_id = c.id
      AND d.state NOT IN ('won', 'part_won', 'lost')
      AND d.close_reason IS DISTINCT FROM 'undo') THEN
    PERFORM toll_write.refuse('DISPUTE_SECOND_OPEN', jsonb_build_object('charge_id', c.id));
  END IF;

  v_remain := toll_system.charge_open_minor(p_company, c.id);
  IF v_remain <= 0 THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', 'no_remainder'));
  END IF;

  v_trip := p.platform_trip_id;
  v_driver := coalesce(p.driver_id, c.driver_id);
  IF v_driver IS NULL OR v_trip IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', 'payback trip'));
  END IF;

  SELECT ps.dispute_window_days INTO v_window FROM toll.platform_settings ps
  WHERE ps.organization_id = p_company AND ps.platform = v_platform;
  v_trip_date := coalesce(p.paid_on, (c.occurred_at AT TIME ZONE 'America/Jamaica')::date);
  v_deadline := toll_system.dispute_deadline(v_trip_date, v_window);

  SELECT t.version INTO v_tpl FROM toll.dispute_text_templates t
  WHERE t.organization_id = p_company AND t.platform = v_platform AND t.retired_at IS NULL
  ORDER BY t.version DESC LIMIT 1;

  IF now() > v_deadline THEN
    v_state := 'expired';
    v_late := true;
    v_close := 'opened_late';
  ELSIF now() > v_deadline - interval '2 days' THEN
    v_late := true;
  END IF;

  INSERT INTO toll.disputes (
    organization_id, charge_id, charge_week_key, platform, platform_trip_id, driver_id,
    owed_minor, state, close_reason, deadline, opened_late, text_version, decision_ids)
  VALUES (
    p_company, c.id, v_cw, v_platform, v_trip, v_driver, v_remain, v_state, v_close,
    v_deadline, v_late, v_tpl, ARRAY[p_decision])
  RETURNING id INTO v_dispute;

  -- Review S2a-R1: a dispute always opens with its money (provisional or, when late, the fleet's
  -- allocation), whoever opens it. Never deferred.
  v_defer := false;
  v_weeks := '{}'::jsonb;
  IF NOT v_defer THEN
    IF v_state = 'expired' THEN
      v_line := toll_system.dispute_apply_fleet_open_late(p_company, v_dispute, c.id, v_remain, p_decision, p_cmd, 1);
    ELSE
      v_line := toll_system.dispute_apply_open_provisional(p_company, v_dispute, c.id, v_remain, p_decision, p_cmd, 1);
    END IF;
    v_weeks := toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
      jsonb_build_object('dispute_opened_minor', v_remain)));
  END IF;

  IF v_defer THEN
    v_cv := c.version;
  ELSE
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  END IF;

  RETURN jsonb_build_object(
    'decision_id', p_decision, 'dispute_id', v_dispute, 'charge_version', v_cv,
    'state', v_state, 'owed_minor', v_remain, 'weeks', v_weeks);
END;
$$;

-- 15. Grants -------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION toll_system.dispute_refund_bounds(timestamptz, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.charge_has_active_dispute(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.run_system_command(uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.run_system_command(uuid, text, text, jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION toll_system.try_auto_dispute_after_link(uuid, uuid, text, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_withdraw_on_link_undo(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_companion_open_command(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_reopen_after_link_reverse(uuid, uuid, bigint, text, uuid, text, int, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_reverse_settle_legs(uuid, uuid, text, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.match_scope(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.match_claim(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.match_claim(uuid, int) TO service_role;
REVOKE ALL ON FUNCTION toll_system.match_store(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.match_store(uuid, uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION toll_write.intent_link_payback(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_apply_suggestion(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_undo_decision(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_mark_dispute_sent(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_settle_dispute(uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_reverse_payback(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
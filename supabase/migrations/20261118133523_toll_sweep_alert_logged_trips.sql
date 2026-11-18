-- Toll Round S2b: sweep, report-late alert, logged trips, rider_pays_driver suggestions.
-- Spec: docs/toll-build/cursor-S2b-sweep-alert-logged-trips.md


-- 1. Schema -------------------------------------------------------------------------------------
ALTER TABLE toll.platform_settings ADD COLUMN IF NOT EXISTS coverage_source_id text;

ALTER TABLE toll.switch_state ADD COLUMN IF NOT EXISTS toll_disputes_on_at timestamptz;

ALTER TABLE toll.platform_trips
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'import',
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

ALTER TABLE toll.platform_trips DROP CONSTRAINT IF EXISTS platform_trips_source_check;
ALTER TABLE toll.platform_trips
  ADD CONSTRAINT platform_trips_source_check CHECK (source IN ('import', 'logged'));

ALTER TABLE toll.suggestions ALTER COLUMN payback_id DROP NOT NULL;
ALTER TABLE toll.suggestions ADD COLUMN IF NOT EXISTS trip_platform text;
ALTER TABLE toll.suggestions ADD COLUMN IF NOT EXISTS trip_id text;

ALTER TABLE toll.suggestions DROP CONSTRAINT IF EXISTS suggestions_kind_check;
ALTER TABLE toll.suggestions
  ADD CONSTRAINT suggestions_kind_check CHECK (kind IN ('payback', 'dispute_refund', 'rider_pays_driver'));

ALTER TABLE toll.suggestions DROP CONSTRAINT IF EXISTS suggestions_dispute_id_kind_check;
ALTER TABLE toll.suggestions
  ADD CONSTRAINT suggestions_dispute_id_kind_check CHECK (
    (kind = 'dispute_refund' AND dispute_id IS NOT NULL AND payback_id IS NOT NULL AND trip_id IS NULL)
    OR (kind = 'payback' AND dispute_id IS NULL AND payback_id IS NOT NULL AND trip_id IS NULL)
    OR (kind = 'rider_pays_driver' AND dispute_id IS NULL AND payback_id IS NULL AND trip_id IS NOT NULL AND trip_platform IS NOT NULL)
  );

ALTER TABLE toll.alerts DROP CONSTRAINT IF EXISTS alerts_kind_check;
ALTER TABLE toll.alerts
  ADD CONSTRAINT alerts_kind_check CHECK (kind IN ('nightly_check', 'aging', 'payout_trigger', 'report_late'));

-- 2. toll_disputes_on_at trigger ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll.tg_switch_toll_disputes_on_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.toll_disputes AND NOT OLD.toll_disputes THEN
    NEW.toll_disputes_on_at := coalesce(NEW.toll_disputes_on_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS switch_state_toll_disputes_on_at ON toll.switch_state;
CREATE TRIGGER switch_state_toll_disputes_on_at
  BEFORE UPDATE OF toll_disputes ON toll.switch_state
  FOR EACH ROW EXECUTE FUNCTION toll.tg_switch_toll_disputes_on_at();

-- 3. Pay period helpers ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.dispute_refund_period_week_start(p_clock_from timestamptz, p_n int)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ledger.jamaica_week_start(p_clock_from) + 7 + (greatest(coalesce(p_n, 1), 1) - 1) * 7;
$$;

CREATE OR REPLACE FUNCTION toll_system.platform_week_in(p_company uuid, p_platform text, p_week_start date)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_src text;
  i int;
  d date;
BEGIN
  IF p_week_start IS NULL OR extract(isodow FROM p_week_start) <> 1 THEN
    RETURN false;
  END IF;
  SELECT ps.coverage_source_id INTO v_src FROM toll.platform_settings ps
  WHERE ps.organization_id = p_company AND ps.platform = p_platform;
  IF v_src IS NULL OR btrim(v_src) = '' THEN
    RETURN false;
  END IF;
  FOR i IN 0..6 LOOP
    d := p_week_start + i;
    IF NOT recon._day_covered_by_batch(p_company::text, v_src, d) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_refund_periods_all_in(
  p_company uuid, p_platform text, p_clock_from timestamptz, p_periods int
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n int;
BEGIN
  IF p_clock_from IS NULL THEN RETURN false; END IF;
  FOR n IN 1..greatest(coalesce(p_periods, 2), 1) LOOP
    IF NOT toll_system.platform_week_in(
      p_company, p_platform, toll_system.dispute_refund_period_week_start(p_clock_from, n)) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_sweep_hold(p_company uuid, p_dispute uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d toll.disputes%ROWTYPE;
  v_from date;
  v_to date;
  v_periods int;
BEGIN
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = p_dispute;
  IF NOT FOUND OR d.clock_from IS NULL THEN RETURN false; END IF;
  SELECT ps.refund_periods INTO v_periods FROM toll.platform_settings ps
  WHERE ps.organization_id = p_company AND ps.platform = d.platform;
  SELECT b.refund_from, b.refund_to INTO v_from, v_to
  FROM toll_system.dispute_refund_bounds(d.clock_from, v_periods) b;
  RETURN EXISTS (
    SELECT 1 FROM toll.paybacks p
    WHERE p.organization_id = p_company AND p.kind = 'adjustment'
      AND p.platform = d.platform AND p.driver_id IS NOT DISTINCT FROM d.driver_id
      AND p.paid_on BETWEEN v_from AND v_to AND NOT p.is_legacy
      AND toll_system.payback_open_minor(p_company, p.id) > 0);
END;
$$;

-- 4. System dispute intents ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_system_dispute_expire(
  p_company uuid, p_decision uuid, p_cmd text, p_body jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid := nullif(p_body ->> 'dispute_id', '')::uuid;
BEGIN
  PERFORM toll_system.dispute_expire(p_company, v_id, p_decision, p_cmd);
  RETURN jsonb_build_object('decision_id', p_decision, 'dispute_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_system_dispute_auto_close(
  p_company uuid, p_decision uuid, p_cmd text, p_body jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid := nullif(p_body ->> 'dispute_id', '')::uuid;
  v_reason text := coalesce(nullif(p_body ->> 'reason', ''), 'no_refund_two_periods');
BEGIN
  PERFORM toll_system.dispute_auto_close(p_company, v_id, p_decision, p_cmd, v_reason);
  RETURN jsonb_build_object('decision_id', p_decision, 'dispute_id', v_id, 'reason', v_reason);
END;
$$;

-- 5. Dispute sweep ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.dispute_sweep(p_company uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d record;
  v_reason text;
  v_periods int;
  v_fallback int;
  v_expired int := 0;
  v_closed int := 0;
  v_no_report int := 0;
  v_held uuid[] := '{}';
  v_skipped jsonb := '[]'::jsonb;
  v_rr jsonb;
BEGIN
  IF NOT coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false) THEN
    RETURN jsonb_build_object('expired', 0, 'closed', 0, 'no_report', 0, 'held', v_held, 'skipped', v_skipped);
  END IF;

  FOR d IN
    SELECT dsp.* FROM toll.disputes dsp
    WHERE dsp.organization_id = p_company
      AND dsp.close_reason IS DISTINCT FROM 'undo'
      AND dsp.state IN ('to_send', 'sent')
    ORDER BY dsp.id
  LOOP
    BEGIN
      IF d.state = 'to_send' AND now() > d.deadline THEN
        v_rr := toll_system.run_system_command(
          p_company, 'dispute_expire', 'sweep:expire:' || d.id::text,
          jsonb_build_object('dispute_id', d.id), 'sweep:expire');
        IF NOT coalesce((v_rr ->> 'replay')::boolean, false) THEN v_expired := v_expired + 1; END IF;
        CONTINUE;
      END IF;

      IF d.state = 'sent' AND d.clock_from IS NOT NULL THEN
        IF EXISTS (
          SELECT 1 FROM toll.platform_settings ps
          WHERE ps.organization_id = p_company AND ps.platform = d.platform AND ps.payback_mode = 'rider_pays_driver') THEN
          CONTINUE;
        END IF;
        SELECT ps.refund_periods, ps.no_report_fallback_days INTO v_periods, v_fallback
        FROM toll.platform_settings ps WHERE ps.organization_id = p_company AND ps.platform = d.platform;

        IF toll_system.dispute_refund_periods_all_in(p_company, d.platform, d.clock_from, v_periods) THEN
          IF toll_system.dispute_sweep_hold(p_company, d.id) THEN
            v_held := v_held || d.id;
            CONTINUE;
          END IF;
          v_reason := CASE WHEN d.recovered_minor > 0 THEN 'partial_refund_two_periods' ELSE 'no_refund_two_periods' END;
          v_rr := toll_system.run_system_command(
            p_company, 'dispute_auto_close', 'sweep:close:' || d.id::text,
            jsonb_build_object('dispute_id', d.id, 'reason', v_reason), 'sweep:close');
          IF NOT coalesce((v_rr ->> 'replay')::boolean, false) THEN v_closed := v_closed + 1; END IF;
          CONTINUE;
        END IF;

        IF now() > d.clock_from + make_interval(days => coalesce(v_fallback, 23))
           AND NOT toll_system.dispute_refund_periods_all_in(p_company, d.platform, d.clock_from, v_periods) THEN
          v_rr := toll_system.run_system_command(
            p_company, 'dispute_auto_close', 'sweep:close:' || d.id::text,
            jsonb_build_object('dispute_id', d.id, 'reason', 'no_report'), 'sweep:close');
          IF NOT coalesce((v_rr ->> 'replay')::boolean, false) THEN v_no_report := v_no_report + 1; END IF;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('dispute_id', d.id, 'code', SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'expired', v_expired, 'closed', v_closed, 'no_report', v_no_report,
    'held', v_held, 'skipped', v_skipped);
END;
$$;

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


  -- S2b: logged trip focal — same vehicle, Jamaica days request-1 .. dropoff+1
  charge_ids := array(
    SELECT unnest(charge_ids)
    UNION SELECT c.id
    FROM toll.match_queue q
    JOIN toll.platform_trips t ON t.organization_id = q.organization_id AND t.id = q.record_id
    JOIN toll.charges c ON c.organization_id = t.organization_id AND c.vehicle_id IS NOT DISTINCT FROM t.vehicle_id
    WHERE q.organization_id = p_company AND q.claim_id = p_claim AND q.record_kind = 'trip'
      AND t.withdrawn_at IS NULL AND NOT t.is_legacy
      AND NOT EXISTS (
        SELECT 1 FROM toll.paybacks p
        WHERE p.organization_id = t.organization_id AND p.platform = t.platform
          AND p.platform_trip_id = t.platform_trip_id)
      AND (c.occurred_at AT TIME ZONE 'America/Jamaica')::date BETWEEN
            ((coalesce(t.request_at, t.pickup_at, t.dropoff_at) AT TIME ZONE 'America/Jamaica')::date - 1)
        AND ((coalesce(t.dropoff_at, t.pickup_at, t.request_at) AT TIME ZONE 'America/Jamaica')::date + 1)
      AND c.source <> 'roam_ride' AND NOT c.is_legacy);

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
  v_rider boolean;
  v_bundle jsonb;
BEGIN
  IF p_company IS NULL THEN RAISE EXCEPTION 'BAD_REQUEST: company required'; END IF;

  v_rider := coalesce((SELECT s.rider_pays_driver FROM toll.switch_state s WHERE s.organization_id = p_company), false);
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
      WHERE t.organization_id = p_company AND t.withdrawn_at IS NULL
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

  IF v_rider THEN
    v_bundle := v_bundle || jsonb_build_object(
      'rider_trips', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'platform', t.platform, 'platform_trip_id', t.platform_trip_id, 'vehicle_id', t.vehicle_id,
                 'driver_id', t.driver_id, 'request_at', t.request_at, 'pickup_at', t.pickup_at, 'dropoff_at', t.dropoff_at,
                 'time_precision', t.time_precision, 'payment_method', t.payment_method, 'is_legacy', t.is_legacy)
               ORDER BY t.platform, t.platform_trip_id), '[]'::jsonb)
        FROM toll.platform_trips t
        JOIN toll.platform_settings ps ON ps.organization_id = t.organization_id AND ps.platform = t.platform
        WHERE t.organization_id = p_company AND t.withdrawn_at IS NULL AND NOT t.is_legacy
          AND ps.payback_mode = 'rider_pays_driver'
          AND EXISTS (
            SELECT 1 FROM toll.charges c
            WHERE c.organization_id = p_company AND c.id = ANY (v_c) AND c.vehicle_id IS NOT DISTINCT FROM t.vehicle_id
              AND c.occurred_at BETWEEN coalesce(t.pickup_at, t.request_at, t.dropoff_at) - interval '1 day'
                                    AND coalesce(t.dropoff_at, t.pickup_at, t.request_at) + interval '1 day')));
  END IF;

  RETURN v_bundle;
END;
$$;

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
    WHEN 'dispute_expire' THEN toll_write.intent_system_dispute_expire(p_company, v_decision, p_command_id, p_body)
    WHEN 'dispute_auto_close' THEN toll_write.intent_system_dispute_auto_close(p_company, v_decision, p_command_id, p_body)
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
  v_t_plat        text;
  v_t_ptid        text;
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
    v_t_plat := nullif(r ->> 'trip_platform', '');
    v_t_ptid := nullif(r ->> 'trip_id', '');
    IF v_c IS NULL
       OR jsonb_typeof(v_inputs) IS DISTINCT FROM 'object'
       OR jsonb_typeof(r -> 'score_parts') IS DISTINCT FROM 'object'
       OR jsonb_typeof(r -> 'rules_fired') IS DISTINCT FROM 'array'
       OR NOT (v_c = ANY (v_fc) OR v_p = ANY (v_fp) OR v_kind = 'rider_pays_driver' AND v_c = ANY (v_fc))
       OR NOT EXISTS (SELECT 1 FROM toll.charges ch WHERE ch.organization_id = p_company AND ch.id = v_c)
       OR (
         v_kind = 'rider_pays_driver' AND (
           v_p IS NOT NULL OR v_d IS NOT NULL OR v_t_plat IS NULL OR v_t_ptid IS NULL
           OR NOT EXISTS (SELECT 1 FROM toll.platform_trips t
             WHERE t.organization_id = p_company AND t.platform = v_t_plat AND t.platform_trip_id = v_t_ptid
               AND t.withdrawn_at IS NULL))
       )
       OR (
         v_kind IN ('payback', 'dispute_refund') AND (
           v_p IS NULL
           OR v_kind = 'dispute_refund' AND v_d IS NULL
           OR NOT EXISTS (SELECT 1 FROM toll.paybacks pb WHERE pb.organization_id = p_company AND pb.id = v_p)
         )
       ) THEN
      n_skipped := n_skipped + 1;
      CONTINUE;
    END IF;
    v_pair_key := v_c::text || ':' || coalesce(v_p::text, '') || ':' || coalesce(v_d::text, '')
      || ':' || coalesce(v_t_plat, '') || ':' || coalesce(v_t_ptid, '');
    IF v_pair_key = ANY (v_seen) THEN CONTINUE; END IF;
    v_seen := v_seen || v_pair_key;
    v_hash := md5(v_inputs::text);
    v_parts := r -> 'score_parts';

    SELECT * INTO v_open FROM toll.suggestions s
    WHERE s.organization_id = p_company AND s.charge_id = v_c AND s.kind = v_kind
      AND s.payback_id IS NOT DISTINCT FROM v_p AND s.dispute_id IS NOT DISTINCT FROM v_d
      AND s.trip_platform IS NOT DISTINCT FROM v_t_plat AND s.trip_id IS NOT DISTINCT FROM v_t_ptid
      AND s.superseded_by IS NULL
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

    INSERT INTO toll.suggestions (organization_id, charge_id, payback_id, kind, dispute_id, trip_platform, trip_id,
                                  score_parts, rules_fired, engine_version, inputs, inputs_hash)
    VALUES (p_company, v_c, v_p, v_kind, v_d, v_t_plat, v_t_ptid,
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
      AND (s.charge_id = ANY (v_fc) OR s.payback_id = ANY (v_fp)
           OR s.kind = 'rider_pays_driver' AND s.charge_id = ANY (v_fc))
      AND NOT ((s.charge_id::text || ':' || coalesce(s.payback_id::text, '') || ':' || coalesce(s.dispute_id::text, '')
                || ':' || coalesce(s.trip_platform, '') || ':' || coalesce(s.trip_id, '')) = ANY (v_seen))
    ORDER BY s.id
  LOOP
    v_inputs := jsonb_build_object('withdrawn_from', v_open.id, 'reason', 'no_longer_a_candidate');
    INSERT INTO toll.suggestions (organization_id, charge_id, payback_id, kind, dispute_id, trip_platform, trip_id,
                                  score_parts, rules_fired, engine_version, inputs, inputs_hash)
    VALUES (p_company, v_open.charge_id, v_open.payback_id, v_open.kind, v_open.dispute_id,
          v_open.trip_platform, v_open.trip_id,
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
      ELSIF v_open_elig AND v_s.kind IN ('payback') THEN
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

  IF d.intent IN ('settle_dispute', 'close_dispute_lost', 'dispute_expire', 'dispute_auto_close') THEN
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
  FOR r IN
    SELECT e.amount_minor, e.effective_at, e.metadata
    FROM ledger.entries e
    WHERE e.organization_id = p_company AND e.reference_type = 'toll'
      AND e.idempotency_key LIKE v_prefix || '%'
      AND coalesce((e.metadata ->> 'reverse')::boolean, false) = false
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

  UPDATE toll.allocations SET reversed_by = p_undo_decision
  WHERE organization_id = p_company AND decision_id = p_target AND reversed_by IS NULL;

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

  IF NOT v_sealed THEN
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
  IF s.kind = 'rider_pays_driver' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('suggestion_id', s.id, 'state', 'rider_pays_driver',
      'use', 'driver_pays or fleet_absorbs'));
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

CREATE OR REPLACE FUNCTION toll_write.withdraw_suggestion(
  p_company uuid, p_suggestion uuid, p_decision uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s    toll.suggestions%ROWTYPE;
  v_ev text;
  v_in jsonb;
  v_new uuid;
BEGIN
  SELECT * INTO s FROM toll.suggestions x WHERE x.organization_id = p_company AND x.id = p_suggestion;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_ev := coalesce(s.engine_version, 'toll_matcher_v1');
  v_in := jsonb_build_object('withdrawn_from', s.id, 'reason', 'driver_fleet_decision', 'decision_id', p_decision);
  INSERT INTO toll.suggestions (organization_id, charge_id, payback_id, kind, dispute_id, trip_platform, trip_id,
          score_parts, rules_fired, engine_version, inputs, inputs_hash)
  VALUES (p_company, s.charge_id, s.payback_id, s.kind, s.dispute_id, s.trip_platform, s.trip_id,
          jsonb_build_object('total', 0, 'auto_apply', false),
          ARRAY['withdrawn'], v_ev, v_in, md5(v_in::text))
  RETURNING id INTO v_new;
  UPDATE toll.suggestions SET superseded_by = v_new WHERE organization_id = p_company AND id = s.id;
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.match_refuse_missing_settings(p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_missing jsonb := '[]'::jsonb;
  v_plat text;
  v_plaza text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM toll.dispute_policy dp WHERE dp.organization_id = p_company) THEN
    v_missing := v_missing || jsonb_build_array(jsonb_build_object('kind', 'dispute_policy'));
  END IF;
  FOR v_plat IN
    SELECT DISTINCT x.platform FROM (
      SELECT p.platform FROM toll.paybacks p WHERE p.organization_id = p_company AND NOT p.is_legacy
      UNION
      SELECT t.platform FROM toll.platform_trips t WHERE t.organization_id = p_company AND NOT t.is_legacy
    ) x
  LOOP
    IF NOT EXISTS (SELECT 1 FROM toll.platform_settings ps WHERE ps.organization_id = p_company AND ps.platform = v_plat) THEN
      v_missing := v_missing || jsonb_build_array(jsonb_build_object('kind', 'platform_settings', 'platform', v_plat));
    END IF;
  END LOOP;
  FOR v_plaza IN SELECT DISTINCT c.plaza_id FROM toll.charges c
    WHERE c.organization_id = p_company AND NOT c.is_legacy AND c.plaza_id IS NOT NULL
  LOOP
    IF NOT EXISTS (SELECT 1 FROM toll.plaza_rules pr WHERE pr.plaza_id = v_plaza) THEN
      v_missing := v_missing || jsonb_build_array(jsonb_build_object('kind', 'plaza_rules', 'plaza_id', v_plaza));
    END IF;
  END LOOP;
  FOR v_plat IN
    SELECT ps.platform FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.takes_disputes
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM toll.platform_settings ps2
      WHERE ps2.organization_id = p_company AND ps2.platform = v_plat
        AND ps2.coverage_source_id IS NOT NULL AND btrim(ps2.coverage_source_id) <> '') THEN
      v_missing := v_missing || jsonb_build_array(jsonb_build_object('kind', 'coverage_source', 'platform', v_plat));
    END IF;
  END LOOP;
  IF jsonb_array_length(v_missing) > 0 THEN
    PERFORM toll_write.refuse('SETTINGS_MISSING', jsonb_build_object('missing', v_missing));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_change_toll_settings(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k text;
  v_plat text;
  v_obj jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_row record;
  v_allowed_plat text[] := ARRAY['uber', 'indrive', 'roam'];
  v_field text;
  v_changes jsonb := '[]'::jsonb;
BEGIN
  IF nullif(btrim(p_body ->> 'reason_code'), '') IS NULL AND nullif(btrim(p_body ->> 'note'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('reason_code or note')));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_body) AS key
    WHERE key NOT IN ('reason_code', 'note', 'command_id', 'self_approval_reason')) THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', 'at least one settings key'));
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_body) LOOP
    CONTINUE WHEN k IN ('reason_code', 'note', 'command_id', 'self_approval_reason');
    IF k NOT IN ('platform_settings', 'dispute_policy', 'plaza_rates_add') THEN
      PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('unknown_key', k));
    END IF;
  END LOOP;

  IF p_body ? 'platform_settings' THEN
    v_obj := p_body -> 'platform_settings';
    IF jsonb_typeof(v_obj) <> 'object' THEN
      PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('platform_settings', 'must be object'));
    END IF;
    FOR v_plat IN SELECT jsonb_object_keys(v_obj) LOOP
      IF NOT (v_plat = ANY (v_allowed_plat)) THEN
        PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('unknown_platform', v_plat));
      END IF;
      FOR v_field IN SELECT jsonb_object_keys(v_obj -> v_plat) LOOP
        IF v_field NOT IN ('pays_tolls_back','payback_mode','takes_disputes','dispute_window_days','refund_periods','no_report_fallback_days','auto_apply','coverage_source_id') THEN
          PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('field', v_field));
        END IF;
      END LOOP;
      IF NOT EXISTS (SELECT 1 FROM toll.platform_settings ps WHERE ps.organization_id = p_company AND ps.platform = v_plat) THEN
        INSERT INTO toll.platform_settings (organization_id, platform) VALUES (p_company, v_plat);
      END IF;
      SELECT to_jsonb(ps) INTO v_before FROM toll.platform_settings ps WHERE ps.organization_id = p_company AND ps.platform = v_plat;
      UPDATE toll.platform_settings ps SET
        pays_tolls_back = CASE WHEN (v_obj -> v_plat) ? 'pays_tolls_back' THEN (v_obj -> v_plat ->> 'pays_tolls_back')::boolean ELSE ps.pays_tolls_back END,
        payback_mode = CASE WHEN (v_obj -> v_plat) ? 'payback_mode' THEN (v_obj -> v_plat ->> 'payback_mode') ELSE ps.payback_mode END,
        takes_disputes = CASE WHEN (v_obj -> v_plat) ? 'takes_disputes' THEN (v_obj -> v_plat ->> 'takes_disputes')::boolean ELSE ps.takes_disputes END,
        dispute_window_days = CASE WHEN (v_obj -> v_plat) ? 'dispute_window_days' THEN nullif(v_obj -> v_plat ->> 'dispute_window_days','')::int ELSE ps.dispute_window_days END,
        refund_periods = CASE WHEN (v_obj -> v_plat) ? 'refund_periods' THEN nullif(v_obj -> v_plat ->> 'refund_periods','')::int ELSE ps.refund_periods END,
        no_report_fallback_days = CASE WHEN (v_obj -> v_plat) ? 'no_report_fallback_days' THEN nullif(v_obj -> v_plat ->> 'no_report_fallback_days','')::int ELSE ps.no_report_fallback_days END,
        auto_apply = CASE WHEN (v_obj -> v_plat) ? 'auto_apply' THEN (v_obj -> v_plat ->> 'auto_apply')::boolean ELSE ps.auto_apply END,
        coverage_source_id = CASE WHEN (v_obj -> v_plat) ? 'coverage_source_id' THEN nullif(v_obj -> v_plat ->> 'coverage_source_id', '') ELSE ps.coverage_source_id END,
        updated_at = now()
      WHERE ps.organization_id = p_company AND ps.platform = v_plat;
      SELECT to_jsonb(ps) INTO v_after FROM toll.platform_settings ps WHERE ps.organization_id = p_company AND ps.platform = v_plat;
      INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, old_row, new_row, actor_user_id)
      VALUES (p_company, 'toll.platform_settings', v_plat, 'update', v_before, v_after, auth.uid());
      v_changes := v_changes || jsonb_build_array(jsonb_build_object(
        'table', 'toll.platform_settings', 'row_key', v_plat, 'before', v_before, 'after', v_after));
    END LOOP;
  END IF;

  IF p_body ? 'dispute_policy' THEN
    v_obj := p_body -> 'dispute_policy';
    IF jsonb_typeof(v_obj) <> 'object' THEN PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('dispute_policy', 'object')); END IF;
    IF NOT EXISTS (SELECT 1 FROM toll.dispute_policy dp WHERE dp.organization_id = p_company) THEN
      INSERT INTO toll.dispute_policy (organization_id) VALUES (p_company);
    END IF;
    SELECT to_jsonb(dp) INTO v_before FROM toll.dispute_policy dp WHERE dp.organization_id = p_company;
    UPDATE toll.dispute_policy dp SET
      lost_bearer = CASE WHEN v_obj ? 'lost_bearer' THEN v_obj ->> 'lost_bearer' ELSE dp.lost_bearer END,
      expired_bearer = CASE WHEN v_obj ? 'expired_bearer' THEN v_obj ->> 'expired_bearer' ELSE dp.expired_bearer END,
      changed_by = auth.uid(), changed_at = now()
    WHERE dp.organization_id = p_company;
    SELECT to_jsonb(dp) INTO v_after FROM toll.dispute_policy dp WHERE dp.organization_id = p_company;
    INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, old_row, new_row, actor_user_id)
    VALUES (p_company, 'toll.dispute_policy', p_company::text, 'update', v_before, v_after, auth.uid());
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'table', 'toll.dispute_policy', 'row_key', p_company::text, 'before', v_before, 'after', v_after));
  END IF;

  IF p_body ? 'plaza_rates_add' THEN
    IF jsonb_typeof(p_body -> 'plaza_rates_add') <> 'array' THEN
      PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('plaza_rates_add', 'array'));
    END IF;
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_body -> 'plaza_rates_add') LOOP
      INSERT INTO toll.plaza_rates (plaza_id, rate_kind, platform, amount_minor, valid_from, created_by)
      VALUES (v_row.value ->> 'plaza_id', 'platform_refund', v_row.value ->> 'platform',
              (v_row.value ->> 'rate_minor')::bigint, (v_row.value ->> 'effective_from')::date, auth.uid());
      INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, new_row, actor_user_id)
      VALUES (p_company, 'toll.plaza_rates', (v_row.value ->> 'plaza_id') || ':' || (v_row.value ->> 'platform'), 'insert', v_row.value, auth.uid());
      v_changes := v_changes || jsonb_build_array(jsonb_build_object(
        'table', 'toll.plaza_rates', 'row_key', (v_row.value ->> 'plaza_id') || ':' || (v_row.value ->> 'platform'),
        'before', NULL, 'after', v_row.value));
    END LOOP;
  END IF;

  RETURN jsonb_build_object('decision_id', p_decision, 'changed', jsonb_array_length(v_changes) > 0,
                            'changes', v_changes);
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.seed_dispute_setup(p_company uuid, p_dry_run boolean DEFAULT true)
RETURNS TABLE (
  tbl text,
  row_key text,
  col text,
  current_value text,
  new_value text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uber_body constant text :=
    'Hi, on {trip_date} at {trip_time} I drove through the {plaza} toll during this trip. '
    || 'The toll cost {toll} and I was refunded {paid}, so {owed} is still owed. '
    || 'Please refund the remaining {owed}. Thank you.';
  v_cur record;
  v_field text;
  v_pair record;
BEGIN
  IF p_company IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'TOLL_COMPANY_REQUIRED', ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.platform = 'uber'
  ) THEN
    FOR v_pair IN
      SELECT * FROM (VALUES
        ('payback_mode', 'per_trip'),
        ('takes_disputes', 'true'),
        ('dispute_window_days', '9'),
        ('refund_periods', '2'),
        ('no_report_fallback_days', '23'),
        ('coverage_source_id', 'uber_bundle'),
        ('auto_apply', 'false')
      ) AS v(c, n)
    LOOP
      tbl := 'platform_settings'; row_key := 'uber'; col := v_pair.c;
      current_value := null; new_value := v_pair.n;
      RETURN NEXT;
    END LOOP;
    IF NOT p_dry_run THEN
      INSERT INTO toll.platform_settings (
        organization_id, platform, payback_mode, takes_disputes,
        dispute_window_days, refund_periods, no_report_fallback_days, coverage_source_id, auto_apply, pays_tolls_back
      ) VALUES (p_company, 'uber', 'per_trip', true, 9, 2, 23, 'uber_bundle', false, true);
    END IF;
  ELSE
    SELECT * INTO v_cur FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.platform = 'uber';
    FOREACH v_field IN ARRAY ARRAY[
      'payback_mode', 'takes_disputes', 'dispute_window_days', 'refund_periods',
      'no_report_fallback_days', 'coverage_source_id', 'auto_apply'
    ] LOOP
      tbl := 'platform_settings'; row_key := 'uber'; col := v_field;
      current_value := to_jsonb(v_cur) ->> v_field;
      new_value := CASE WHEN v_field = 'coverage_source_id' AND (to_jsonb(v_cur) ->> v_field) IS NULL
                           THEN 'uber_bundle' ELSE 'kept' END;
      RETURN NEXT;
    END LOOP;
    IF NOT p_dry_run AND (to_jsonb(v_cur) ->> 'coverage_source_id') IS NULL THEN
      UPDATE toll.platform_settings SET coverage_source_id = 'uber_bundle'
      WHERE organization_id = p_company AND platform = 'uber';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.platform = 'indrive'
  ) THEN
    FOR v_pair IN
      SELECT * FROM (VALUES
        ('payback_mode', 'rider_pays_driver'),
        ('takes_disputes', 'false'),
        ('auto_apply', 'false')
      ) AS v(c, n)
    LOOP
      tbl := 'platform_settings'; row_key := 'indrive'; col := v_pair.c;
      current_value := null; new_value := v_pair.n;
      RETURN NEXT;
    END LOOP;
    IF NOT p_dry_run THEN
      INSERT INTO toll.platform_settings (
        organization_id, platform, payback_mode, takes_disputes, auto_apply, pays_tolls_back
      ) VALUES (p_company, 'indrive', 'rider_pays_driver', false, false, false);
    END IF;
  ELSE
    SELECT * INTO v_cur FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.platform = 'indrive';
    FOREACH v_field IN ARRAY ARRAY['payback_mode', 'takes_disputes', 'auto_apply'] LOOP
      tbl := 'platform_settings'; row_key := 'indrive'; col := v_field;
      current_value := to_jsonb(v_cur) ->> v_field;
      new_value := 'kept';
      RETURN NEXT;
    END LOOP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.platform = 'roam'
  ) THEN
    tbl := 'platform_settings'; row_key := 'roam'; col := 'payback_mode';
    current_value := null; new_value := 'native';
    RETURN NEXT;
    IF NOT p_dry_run THEN
      INSERT INTO toll.platform_settings (organization_id, platform, payback_mode, pays_tolls_back)
      VALUES (p_company, 'roam', 'native', true);
    END IF;
  ELSE
    SELECT * INTO v_cur FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.platform = 'roam';
    tbl := 'platform_settings'; row_key := 'roam'; col := 'payback_mode';
    current_value := v_cur.payback_mode;
    new_value := 'kept';
    RETURN NEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM toll.dispute_policy dp WHERE dp.organization_id = p_company) THEN
    tbl := 'dispute_policy'; row_key := p_company::text; col := 'lost_bearer'; current_value := null; new_value := 'fleet';
    RETURN NEXT;
    tbl := 'dispute_policy'; row_key := p_company::text; col := 'expired_bearer'; current_value := null; new_value := 'driver';
    RETURN NEXT;
    IF NOT p_dry_run THEN
      INSERT INTO toll.dispute_policy (organization_id, lost_bearer, expired_bearer)
      VALUES (p_company, 'fleet', 'driver');
    END IF;
  ELSE
    SELECT * INTO v_cur FROM toll.dispute_policy dp WHERE dp.organization_id = p_company;
    FOREACH v_field IN ARRAY ARRAY['lost_bearer', 'expired_bearer'] LOOP
      tbl := 'dispute_policy'; row_key := p_company::text; col := v_field;
      current_value := to_jsonb(v_cur) ->> v_field;
      new_value := 'kept';
      RETURN NEXT;
    END LOOP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM toll.dispute_text_templates t
    WHERE t.organization_id = p_company AND t.platform = 'uber' AND t.version = 1
  ) THEN
    tbl := 'dispute_text_templates'; row_key := 'uber:1'; col := 'body';
    current_value := null; new_value := v_uber_body;
    RETURN NEXT;
    IF NOT p_dry_run THEN
      INSERT INTO toll.dispute_text_templates (organization_id, platform, version, body)
      VALUES (p_company, 'uber', 1, v_uber_body);
    END IF;
  ELSE
    SELECT * INTO v_cur FROM toll.dispute_text_templates t
    WHERE t.organization_id = p_company AND t.platform = 'uber' AND t.version = 1;
    tbl := 'dispute_text_templates'; row_key := 'uber:1'; col := 'body';
    current_value := left(v_cur.body, 80);
    new_value := 'kept';
    RETURN NEXT;
  END IF;

  FOR v_pair IN
    SELECT DISTINCT c.plaza_id AS pid
    FROM toll.charges c
    WHERE c.organization_id = p_company AND NOT c.is_legacy AND c.plaza_id IS NOT NULL
  LOOP
    IF NOT EXISTS (SELECT 1 FROM toll.plaza_rules pr WHERE pr.plaza_id = v_pair.pid) THEN
      tbl := 'plaza_rules'; row_key := v_pair.pid;
      col := 'auto_duplicate_window_minutes'; current_value := null; new_value := '10';
      RETURN NEXT;
      tbl := 'plaza_rules'; row_key := v_pair.pid;
      col := 'review_duplicate_window'; current_value := null; new_value := 'same_day';
      RETURN NEXT;
      IF NOT p_dry_run THEN
        INSERT INTO toll.plaza_rules (plaza_id, auto_duplicate_window_minutes, review_duplicate_window)
        VALUES (v_pair.pid, 10, 'same_day')
        ON CONFLICT (plaza_id) DO NOTHING;
        INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, new_row, actor_user_id)
        VALUES (p_company, 'toll.plaza_rules', v_pair.pid, 'insert',
                (SELECT to_jsonb(pr) FROM toll.plaza_rules pr WHERE pr.plaza_id = v_pair.pid), NULL);
      END IF;
    ELSE
      tbl := 'plaza_rules'; row_key := v_pair.pid; col := 'auto_duplicate_window_minutes';
      current_value := (SELECT pr.auto_duplicate_window_minutes::text FROM toll.plaza_rules pr WHERE pr.plaza_id = v_pair.pid);
      new_value := 'kept'; RETURN NEXT;
      tbl := 'plaza_rules'; row_key := v_pair.pid; col := 'review_duplicate_window';
      current_value := (SELECT pr.review_duplicate_window FROM toll.plaza_rules pr WHERE pr.plaza_id = v_pair.pid);
      new_value := 'kept'; RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;


-- 6. Report late ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.report_late_check(p_company uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ps record;
  v_today date;
  v_ws date;
  v_end date;
  v_on date;
  v_key text;
  v_open int;
  v_n int := 0;
  v_resolved int := 0;
BEGIN
  IF NOT coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false) THEN
    RETURN jsonb_build_object('opened', 0, 'resolved', 0);
  END IF;
  v_today := (now() AT TIME ZONE 'America/Jamaica')::date;
  SELECT ledger.jamaica_week_start(s.toll_disputes_on_at) INTO v_on
  FROM toll.switch_state s WHERE s.organization_id = p_company;
  IF v_on IS NULL THEN
  RETURN jsonb_build_object('opened', 0, 'resolved', 0);
  END IF;

  FOR ps IN
    SELECT platform, coverage_source_id FROM toll.platform_settings
    WHERE organization_id = p_company AND takes_disputes AND coverage_source_id IS NOT NULL
  LOOP
    v_ws := v_on;
    WHILE v_ws + 6 <= v_today - 3 LOOP
      v_end := v_ws + 6;
      v_key := 'report_late:' || ps.platform || ':' || v_ws::text;
      IF toll_system.platform_week_in(p_company, ps.platform, v_ws) THEN
        UPDATE toll.alerts SET resolved_at = now()
        WHERE organization_id = p_company AND dedupe_key = v_key AND resolved_at IS NULL;
        GET DIAGNOSTICS v_open = ROW_COUNT;
        v_resolved := v_resolved + v_open;
      ELSE
        SELECT count(*)::int INTO v_open FROM toll.disputes d
        WHERE d.organization_id = p_company AND d.platform = ps.platform
          AND d.state = 'sent' AND d.close_reason IS DISTINCT FROM 'undo';
        PERFORM toll_system.raise_alert(
          p_company, 'report_late', 'page', v_key,
          format('Uber report for the week of %s is not uploaded', to_char(v_ws, 'Dy Mon FMDD')),
          jsonb_build_object(
            'platform', ps.platform, 'week_start', v_ws,
            'days_late', v_today - v_end - 2,
            'open_disputes_waiting', v_open,
            'runbook', 'docs/runbooks/toll-uber-report-late.md'));
        v_n := v_n + 1;
      END IF;
      v_ws := v_ws + 7;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('opened', v_n, 'resolved', v_resolved);
END;
$$;

-- 7. Logged trips helpers --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.fleet_trip_is_app_logged(p_payload jsonb, p_id text, p_batch_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce((p_payload ->> 'isManual') IN ('true', 't'), false)
    OR p_id LIKE 'manual\_%'
    OR p_batch_id IN ('live_driver_app', 'manual_entry');
$$;

CREATE OR REPLACE FUNCTION toll_system.parse_app_trip_time(p_text text, p_fallback date)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v text;
  v_ms double precision;
BEGIN
  v := nullif(btrim(p_text), '');
  IF v IS NULL THEN
    IF p_fallback IS NOT NULL THEN
      RETURN (p_fallback + time '12:00') AT TIME ZONE 'America/Jamaica';
    END IF;
    RETURN NULL;
  END IF;
  IF v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN ((v::date + time '12:00') AT TIME ZONE 'America/Jamaica');
  END IF;
  BEGIN v_ms := extract(epoch FROM v::timestamptz) * 1000; EXCEPTION WHEN OTHERS THEN v_ms := NULL; END;
  IF v_ms IS NOT NULL AND (v ~ '[zZ]$' OR v ~ '[+-][0-9]{2}(:?[0-9]{2})?$') THEN
    RETURN to_timestamp(v_ms / 1000.0);
  END IF;
  BEGIN
    RETURN (replace(v, 'T', ' ')::timestamp AT TIME ZONE 'America/Jamaica');
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.mirror_logged_fleet_trip(p_row fleet.trips, p_withdraw boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_plat text;
  v_ptid text;
  v_pay text;
  v_prec text;
  v_req timestamptz;
  v_pick timestamptz;
  v_drop timestamptz;
  v_id uuid;
  p jsonb;
BEGIN
  -- Review S2b-R1: fleet.trips.organization_id is text; only a real uuid can be a toll company.
  IF p_row.organization_id IS NULL
     OR btrim(p_row.organization_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  v_org := btrim(p_row.organization_id)::uuid;
  IF NOT coalesce((SELECT s.logged_trips FROM toll.switch_state s WHERE s.organization_id = v_org), false) THEN
    RETURN NULL;
  END IF;
  p := coalesce(p_row.payload_json, '{}'::jsonb);

  IF lower(coalesce(p_row.service_line, '')) <> 'rideshare' THEN RETURN NULL; END IF;
  IF lower(p_row.platform) LIKE '%uber%' THEN RETURN NULL; END IF;
  IF lower(p_row.platform) IN ('roam', 'goride') OR lower(p_row.platform) LIKE '%roam rush%' THEN RETURN NULL; END IF;

  IF p_withdraw OR NOT toll_system.fleet_trip_is_app_logged(p, p_row.id, p_row.batch_id)
     OR lower(coalesce(p_row.status, '')) IN ('cancelled', 'canceled', 'deleted') THEN
    UPDATE toll.platform_trips SET withdrawn_at = coalesce(withdrawn_at, now())
    WHERE organization_id = v_org AND platform_trip_id = 'logged:' || p_row.id AND source = 'logged';
    RETURN NULL;
  END IF;

  v_plat := CASE WHEN lower(p_row.platform) LIKE '%indrive%' THEN 'indrive' ELSE lower(p_row.platform) END;
  v_ptid := 'logged:' || p_row.id;
  -- Review S2b-R2: only a real clock time counts. A missing time, or a bare date, is NOT a time: the
  -- old code filled each with 12:00 from the trip date and then called the trip 'minute' precise, so a
  -- date-only trip matched only a toll at exactly noon. A trip without request/pickup + drop-off
  -- times is 'date_only', anchored on its day (request_at = that day 12:00 Jamaica, the rest null).
  v_req := CASE WHEN coalesce(p ->> 'requestTime', p ->> 'request_time', '') ~ '^\s*[0-9]{4}-[0-9]{2}-[0-9]{2}\s*$' THEN NULL
                ELSE toll_system.parse_app_trip_time(coalesce(p ->> 'requestTime', p ->> 'request_time'), NULL) END;
  v_pick := CASE WHEN coalesce(p ->> 'pickupTime', p ->> 'pickup_time', '') ~ '^\s*[0-9]{4}-[0-9]{2}-[0-9]{2}\s*$' THEN NULL
                 ELSE toll_system.parse_app_trip_time(coalesce(p ->> 'pickupTime', p ->> 'pickup_time'), NULL) END;
  v_drop := CASE WHEN coalesce(p ->> 'dropoffTime', p ->> 'dropoff_time', '') ~ '^\s*[0-9]{4}-[0-9]{2}-[0-9]{2}\s*$' THEN NULL
                 ELSE toll_system.parse_app_trip_time(coalesce(p ->> 'dropoffTime', p ->> 'dropoff_time'), NULL) END;
  IF coalesce(v_req, v_pick) IS NOT NULL AND v_drop IS NOT NULL THEN
    v_prec := 'minute';
  ELSE
    v_prec := 'date_only';
    v_req := coalesce(v_req, v_pick, v_drop,
                      CASE WHEN p_row.date IS NOT NULL THEN (p_row.date + time '12:00') AT TIME ZONE 'America/Jamaica' END);
    v_pick := NULL;
    v_drop := NULL;
    IF v_req IS NULL THEN RETURN NULL; END IF;   -- no day at all: nothing to match on
  END IF;
  v_pay := CASE lower(coalesce(p_row.payment_method, p ->> 'paymentMethod', ''))
    WHEN 'cash' THEN 'cash' WHEN 'card' THEN 'card' ELSE 'unknown' END;

  INSERT INTO toll.platform_trips (
    organization_id, platform, platform_trip_id, driver_id, vehicle_id,
    request_at, pickup_at, dropoff_at, time_precision, payment_method, source, withdrawn_at)
  VALUES (
    v_org, v_plat, v_ptid, p_row.driver_id, p_row.vehicle_id,
    v_req, v_pick, v_drop, v_prec, v_pay, 'logged', NULL)
  ON CONFLICT (organization_id, platform, platform_trip_id) DO UPDATE SET
    driver_id = excluded.driver_id, vehicle_id = excluded.vehicle_id,
    request_at = excluded.request_at, pickup_at = excluded.pickup_at, dropoff_at = excluded.dropoff_at,
    time_precision = excluded.time_precision, payment_method = excluded.payment_method,
  source = 'logged', withdrawn_at = NULL
  RETURNING id INTO v_id;

  PERFORM toll_system.match_enqueue(v_org, 'trip', v_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION fleet.tg_trips_logged_mirror()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = fleet, toll, public AS $$
BEGIN
  -- Review S2b-R1: this trigger runs on EVERY fleet.trips write for every company, switch on or off.
  -- A toll mirror must never stop a trip from saving: any error is logged as a warning and the trip
  -- saves; toll_system.logged_trips_sync re-mirrors it on the nightly run.
  BEGIN
    IF TG_OP = 'DELETE' THEN
      PERFORM toll_system.mirror_logged_fleet_trip(OLD, true);
    ELSE
      PERFORM toll_system.mirror_logged_fleet_trip(NEW, false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'toll logged-trip mirror skipped for fleet.trips %: %',
      coalesce(NEW.id, OLD.id), SQLERRM;
  END;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trips_logged_mirror ON fleet.trips;
CREATE TRIGGER trips_logged_mirror
  AFTER INSERT OR UPDATE OR DELETE ON fleet.trips
  FOR EACH ROW EXECUTE FUNCTION fleet.tg_trips_logged_mirror();

CREATE OR REPLACE FUNCTION toll_system.logged_trips_sync(p_company uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n int := 0;
  r fleet.trips%ROWTYPE;
  v_cut date := ((now() AT TIME ZONE 'America/Jamaica')::date - 35);
BEGIN
  IF NOT coalesce((SELECT s.logged_trips FROM toll.switch_state s WHERE s.organization_id = p_company), false) THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT * FROM fleet.trips t
    WHERE t.organization_id = p_company::text AND t.date >= v_cut
  LOOP
    IF toll_system.mirror_logged_fleet_trip(r) IS NOT NULL THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;

-- 8. Public sweep RPC ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toll_sys_dispute_sweep(p_company uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sweep jsonb;
  v_late jsonb;
BEGIN
  v_sweep := toll_system.dispute_sweep(p_company);
  v_late := toll_system.report_late_check(p_company);
  RETURN v_sweep || jsonb_build_object('report_late', v_late);
END;
$$;

REVOKE ALL ON FUNCTION public.toll_sys_dispute_sweep(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_dispute_sweep(uuid) TO service_role;

-- 9. nightly_run -----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.nightly_run()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_company uuid;
  v_run     uuid;
  v_start   timestamptz;
  k         record;
  c         record;
BEGIN
  FOR v_company IN
    SELECT s.organization_id FROM toll.switch_state s WHERE s.tolls_v2
    UNION SELECT DISTINCT organization_id FROM toll.charges
    UNION SELECT DISTINCT organization_id FROM toll.paybacks
  LOOP
    v_run := gen_random_uuid();
    v_start := clock_timestamp();
    BEGIN
      FOR k IN
        SELECT kv.key, kv.value FROM public.kv_store_37f42386 kv
        WHERE kv.key ~ ('^fleet_bank_confirm:org:' || v_company || ':\d{4}-\d{2}-\d{2}:(uber|indrive|roam)$')
          AND NOT EXISTS (SELECT 1 FROM toll.payout_postings pp WHERE pp.organization_id = v_company
                            AND pp.source_ref = kv.key AND pp.reversed_at IS NULL AND pp.source_version = md5(kv.value::text))
        UNION ALL
        SELECT pp.source_ref, NULL::jsonb FROM toll.payout_postings pp
        WHERE pp.organization_id = v_company AND pp.reversed_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.kv_store_37f42386 kv WHERE kv.key = pp.source_ref)
      LOOP
        PERFORM toll_system.payout_received(k.key, k.value);
        PERFORM toll_system.raise_alert(v_company, 'payout_trigger', 'watch', 'payout_healed:' || k.key,
          'The nightly sweep posted a bank confirmation the trigger had missed', jsonb_build_object('key', k.key));
      END LOOP;

      PERFORM toll_system.logged_trips_sync(v_company);
      PERFORM toll_system.dispute_sweep(v_company);
      PERFORM toll_system.report_late_check(v_company);

      FOR c IN SELECT * FROM toll_system.nightly_checks(v_company) LOOP
        INSERT INTO toll.nightly_results (organization_id, run_id, check_no, name, ok, detail)
        VALUES (v_company, v_run, c.check_no, c.name, c.ok, c.detail);
        IF NOT c.ok THEN
          PERFORM toll_system.raise_alert(v_company, 'nightly_check', 'page', 'check' || c.check_no || ':' || c.name,
            'Nightly toll check failed: ' || c.name, c.detail);
        END IF;
      END LOOP;
      PERFORM toll_system.resolve_alerts_not_seen(v_company, 'nightly_check', v_start);

      PERFORM toll_system.aging_alerts(v_company);
      PERFORM toll_system.resolve_alerts_not_seen(v_company, 'aging', v_start);
    EXCEPTION WHEN OTHERS THEN
      PERFORM toll_system.raise_alert(v_company, 'nightly_check', 'page', 'nightly_run_failed',
        'The nightly toll check could not run', jsonb_build_object('error', SQLERRM));
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION toll_write.intent_system_dispute_expire(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_system_dispute_auto_close(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION toll_system.dispute_refund_period_week_start(timestamptz, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.platform_week_in(uuid, text, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_refund_periods_all_in(uuid, text, timestamptz, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_sweep_hold(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_sweep(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.report_late_check(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.fleet_trip_is_app_logged(jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.parse_app_trip_time(text, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.mirror_logged_fleet_trip(fleet.trips, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.logged_trips_sync(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.run_system_command(uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll_system.match_claim(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll_system.match_store(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.report_late_check(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
-- Toll rebuild Phase 2 P2-R3: the matcher's database side (design B4, B2 "toll.suggestions"; Part F P2-R3).
--
-- The scoring engine is pure TypeScript (packages/toll-core/src/v2/matcher). This file gives it:
--   1. toll.match_queue: one row per record whose matching may have changed. Triggers fill it whenever data
--      arrives (a charge, payback or trip is written or changes; an allocation or "left unlinked" decision is
--      made or reversed; a toll week is sealed or reopened). Roam native records are never queued.
--   2. toll_system.match_claim(company): claims queued records and returns the engine's input bundle: the
--      records in scope (the changed records, their candidates and their previous partners) plus two hops of neighbours, so competitor counts are complete.
--   3. toll_system.match_store(company, claim_id, result): stores the engine's suggestions append-only.
--      Same pair + same engine version + same inputs hash → unchanged. Different → a new row; the old one is
--      superseded. A pair in scope that is no longer a candidate gets a 'withdrawn' row that supersedes it.
--      Nothing is applied: auto_apply stays a shadow flag in score_parts (apply comes with P2-R4).
--   4. toll_system.match_pending(): companies with queued work (for the sweep).
-- Only service_role may call the public wrappers; the Fleet server runs claim → engine → store.

-- 1. Queue ------------------------------------------------------------------------------------------------
CREATE TABLE toll.match_queue (
  organization_id uuid NOT NULL,
  record_kind text NOT NULL CHECK (record_kind IN ('charge', 'payback', 'trip')),
  record_id uuid NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  claim_id uuid,
  claimed_at timestamptz,
  PRIMARY KEY (organization_id, record_kind, record_id)
);
CREATE INDEX toll_match_queue_organization_id_claim_id_idx ON toll.match_queue (organization_id, claim_id);

REVOKE ALL ON toll.match_queue FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON toll.match_queue TO authenticated;
ALTER TABLE toll.match_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY match_queue_company_read ON toll.match_queue FOR SELECT TO authenticated
  USING (organization_id = toll_read.current_company());

-- Lookups the neighbour search needs.
CREATE INDEX IF NOT EXISTS toll_charges_organization_id_vehicle_id_occurred_at_idx ON toll.charges (organization_id, vehicle_id, occurred_at);
CREATE INDEX IF NOT EXISTS toll_charges_organization_id_driver_id_occurred_at_idx ON toll.charges (organization_id, driver_id, occurred_at);
CREATE INDEX IF NOT EXISTS toll_platform_trips_organization_id_vehicle_id_idx ON toll.platform_trips (organization_id, vehicle_id);
CREATE INDEX IF NOT EXISTS toll_paybacks_organization_id_platform_trip_idx ON toll.paybacks (organization_id, platform, platform_trip_id);
CREATE INDEX IF NOT EXISTS toll_paybacks_organization_id_driver_id_paid_on_idx ON toll.paybacks (organization_id, driver_id, paid_on);
CREATE INDEX IF NOT EXISTS toll_suggestions_organization_id_pair_idx ON toll.suggestions (organization_id, charge_id, payback_id)
  WHERE superseded_by IS NULL;

CREATE OR REPLACE FUNCTION toll_system.match_enqueue(p_company uuid, p_kind text, p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  -- A record queued again while claimed is released, so it is matched once more after the current run.
  INSERT INTO toll.match_queue (organization_id, record_kind, record_id)
  VALUES (p_company, p_kind, p_id)
  ON CONFLICT (organization_id, record_kind, record_id)
  DO UPDATE SET enqueued_at = now(), claim_id = NULL, claimed_at = NULL;
$$;

CREATE OR REPLACE FUNCTION toll.tg_match_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_src text;
BEGIN
  IF TG_TABLE_NAME = 'charges' THEN
    IF NEW.source <> 'roam_ride' THEN
      PERFORM toll_system.match_enqueue(NEW.organization_id, 'charge', NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'paybacks' THEN
    IF NEW.kind <> 'native' THEN
      PERFORM toll_system.match_enqueue(NEW.organization_id, 'payback', NEW.id);
    END IF;
    IF TG_OP = 'INSERT' AND NEW.reversal_of IS NOT NULL THEN
      PERFORM toll_system.match_enqueue(NEW.organization_id, 'payback', NEW.reversal_of);  -- the original is now reversed
    END IF;
  ELSIF TG_TABLE_NAME = 'platform_trips' THEN
    PERFORM toll_system.match_enqueue(NEW.organization_id, 'trip', NEW.id);
  ELSIF TG_TABLE_NAME = 'allocations' THEN
    SELECT c.source INTO v_src FROM toll.charges c WHERE c.organization_id = NEW.organization_id AND c.id = NEW.charge_id;
    IF v_src IS DISTINCT FROM 'roam_ride' THEN
      PERFORM toll_system.match_enqueue(NEW.organization_id, 'charge', NEW.charge_id);
      IF NEW.payback_id IS NOT NULL THEN
        PERFORM toll_system.match_enqueue(NEW.organization_id, 'payback', NEW.payback_id);
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'payback_unlinked_decisions' THEN
    IF NEW.payback_id IS NOT NULL THEN
      PERFORM toll_system.match_enqueue(NEW.organization_id, 'payback', NEW.payback_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER charges_match_enqueue_ins AFTER INSERT ON toll.charges
  FOR EACH ROW EXECUTE FUNCTION toll.tg_match_enqueue();
CREATE TRIGGER charges_match_enqueue_upd AFTER UPDATE ON toll.charges
  FOR EACH ROW WHEN (
    OLD.amount_minor IS DISTINCT FROM NEW.amount_minor OR OLD.occurred_at IS DISTINCT FROM NEW.occurred_at
    OR OLD.vehicle_id IS DISTINCT FROM NEW.vehicle_id OR OLD.driver_id IS DISTINCT FROM NEW.driver_id
    OR OLD.time_precision IS DISTINCT FROM NEW.time_precision OR OLD.week_key IS DISTINCT FROM NEW.week_key
    OR OLD.duplicate_of IS DISTINCT FROM NEW.duplicate_of OR OLD.evidence_status IS DISTINCT FROM NEW.evidence_status
    OR OLD.after_seal IS DISTINCT FROM NEW.after_seal OR OLD.is_legacy IS DISTINCT FROM NEW.is_legacy)
  EXECUTE FUNCTION toll.tg_match_enqueue();

CREATE TRIGGER paybacks_match_enqueue_ins AFTER INSERT ON toll.paybacks
  FOR EACH ROW EXECUTE FUNCTION toll.tg_match_enqueue();
CREATE TRIGGER paybacks_match_enqueue_upd AFTER UPDATE ON toll.paybacks
  FOR EACH ROW WHEN (
    OLD.amount_minor IS DISTINCT FROM NEW.amount_minor OR OLD.platform_trip_id IS DISTINCT FROM NEW.platform_trip_id
    OR OLD.driver_id IS DISTINCT FROM NEW.driver_id OR OLD.paid_on IS DISTINCT FROM NEW.paid_on
    OR OLD.week_key IS DISTINCT FROM NEW.week_key OR OLD.after_seal IS DISTINCT FROM NEW.after_seal
    OR OLD.is_legacy IS DISTINCT FROM NEW.is_legacy)
  EXECUTE FUNCTION toll.tg_match_enqueue();

CREATE TRIGGER platform_trips_match_enqueue_ins AFTER INSERT ON toll.platform_trips
  FOR EACH ROW EXECUTE FUNCTION toll.tg_match_enqueue();
CREATE TRIGGER platform_trips_match_enqueue_upd AFTER UPDATE ON toll.platform_trips
  FOR EACH ROW WHEN (
    OLD.vehicle_id IS DISTINCT FROM NEW.vehicle_id OR OLD.driver_id IS DISTINCT FROM NEW.driver_id
    OR OLD.request_at IS DISTINCT FROM NEW.request_at OR OLD.pickup_at IS DISTINCT FROM NEW.pickup_at
    OR OLD.dropoff_at IS DISTINCT FROM NEW.dropoff_at OR OLD.time_precision IS DISTINCT FROM NEW.time_precision
    OR OLD.is_legacy IS DISTINCT FROM NEW.is_legacy)
  EXECUTE FUNCTION toll.tg_match_enqueue();

CREATE TRIGGER allocations_match_enqueue_ins AFTER INSERT ON toll.allocations
  FOR EACH ROW EXECUTE FUNCTION toll.tg_match_enqueue();
CREATE TRIGGER allocations_match_enqueue_upd AFTER UPDATE ON toll.allocations
  FOR EACH ROW WHEN (OLD.reversed_by IS DISTINCT FROM NEW.reversed_by OR OLD.amount_minor IS DISTINCT FROM NEW.amount_minor)
  EXECUTE FUNCTION toll.tg_match_enqueue();

CREATE TRIGGER payback_unlinked_match_enqueue_ins AFTER INSERT ON toll.payback_unlinked_decisions
  FOR EACH ROW EXECUTE FUNCTION toll.tg_match_enqueue();
CREATE TRIGGER payback_unlinked_match_enqueue_upd AFTER UPDATE ON toll.payback_unlinked_decisions
  FOR EACH ROW WHEN (OLD.reversed_by IS DISTINCT FROM NEW.reversed_by OR OLD.amount_minor IS DISTINCT FROM NEW.amount_minor)
  EXECUTE FUNCTION toll.tg_match_enqueue();

-- A seal makes a week's records ineligible; a reopen makes them eligible again. Queue that week's records.
CREATE OR REPLACE FUNCTION toll.tg_match_week_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.kind = 'toll_week' AND NEW.driver_id = '*' THEN
    PERFORM toll_system.match_enqueue(NEW.organization_id, 'charge', c.id)
    FROM toll.charges c
    WHERE c.organization_id = NEW.organization_id AND c.week_key = NEW.week_key
      AND c.source <> 'roam_ride' AND NOT c.is_legacy;
    PERFORM toll_system.match_enqueue(NEW.organization_id, 'payback', p.id)
    FROM toll.paybacks p
    WHERE p.organization_id = NEW.organization_id AND p.week_key = NEW.week_key
      AND p.kind <> 'native' AND NOT p.is_legacy;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER week_statements_toll_match_enqueue AFTER INSERT OR UPDATE OF status ON ledger.week_statements
  FOR EACH ROW WHEN (NEW.kind = 'toll_week')
  EXECUTE FUNCTION toll.tg_match_week_change();

-- 2. Neighbours (generous supersets; the engine applies the exact windows) ----------------------------------
-- Anchor of a trip = pickup, else request, else drop-off. ±2 days covers every B4 window (−45 / +15 min,
-- date_only by day). Adjustments: same driver, paid 0–7 days after the crossing (±1 day for the day edge).
CREATE OR REPLACE FUNCTION toll_system.match_paybacks_near(p_company uuid, p_charges uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id
  FROM toll.charges c
  JOIN toll.platform_trips t
    ON t.organization_id = c.organization_id AND t.vehicle_id = c.vehicle_id AND NOT t.is_legacy
   AND coalesce(t.pickup_at, t.request_at, t.dropoff_at) BETWEEN c.occurred_at - interval '2 days' AND c.occurred_at + interval '2 days'
  JOIN toll.paybacks p
    ON p.organization_id = t.organization_id AND p.platform = t.platform AND p.platform_trip_id = t.platform_trip_id
   AND p.kind = 'trip_line' AND NOT p.is_legacy
  WHERE c.organization_id = p_company AND c.id = ANY (p_charges)
  UNION
  SELECT p.id
  FROM toll.charges c
  JOIN toll.paybacks p
    ON p.organization_id = c.organization_id AND p.kind = 'adjustment' AND p.driver_id = c.driver_id AND NOT p.is_legacy
   AND p.paid_on BETWEEN (c.occurred_at AT TIME ZONE 'America/Jamaica')::date - 1
                     AND (c.occurred_at AT TIME ZONE 'America/Jamaica')::date + 8
  WHERE c.organization_id = p_company AND c.id = ANY (p_charges);
$$;

CREATE OR REPLACE FUNCTION toll_system.match_charges_near(p_company uuid, p_paybacks uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id
  FROM toll.paybacks p
  JOIN toll.platform_trips t
    ON t.organization_id = p.organization_id AND t.platform = p.platform AND t.platform_trip_id = p.platform_trip_id
   AND NOT t.is_legacy
  JOIN toll.charges c
    ON c.organization_id = t.organization_id AND c.vehicle_id = t.vehicle_id
   AND c.source <> 'roam_ride' AND NOT c.is_legacy
   AND c.occurred_at BETWEEN coalesce(t.pickup_at, t.request_at, t.dropoff_at) - interval '2 days'
                         AND coalesce(t.pickup_at, t.request_at, t.dropoff_at) + interval '2 days'
  WHERE p.organization_id = p_company AND p.id = ANY (p_paybacks) AND p.kind = 'trip_line'
  UNION
  SELECT c.id
  FROM toll.paybacks p
  JOIN toll.charges c
    ON c.organization_id = p.organization_id AND c.driver_id = p.driver_id
   AND c.source <> 'roam_ride' AND NOT c.is_legacy
   AND (c.occurred_at AT TIME ZONE 'America/Jamaica')::date BETWEEN p.paid_on - 8 AND p.paid_on + 1
  WHERE p.organization_id = p_company AND p.id = ANY (p_paybacks) AND p.kind = 'adjustment';
$$;

-- The scope of a claim: every record whose pairs are re-scored in this run.
--   changed  = queued charges and paybacks, plus the paybacks of queued trips;
--   scope    = changed + their candidates now (near) + their partners before (open suggestions).
-- A new record changes the competitor count of every record it competes with, and a record that moved away
-- changes the count of its old partners, so both are re-scored. Records further out keep their counts.
CREATE OR REPLACE FUNCTION toll_system.match_scope(p_company uuid, p_claim uuid, OUT charge_ids uuid[], OUT payback_ids uuid[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c uuid[];
  v_p uuid[];
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
END;
$$;

-- 3. Claim -----------------------------------------------------------------------------------------------
-- A claim older than 10 minutes is treated as abandoned and can be claimed again.
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
BEGIN
  IF p_company IS NULL THEN RAISE EXCEPTION 'BAD_REQUEST: company required'; END IF;

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

  -- Scope (re-scored), then their partners, then the partners' competitors, so every scoped pair's
  -- competitor counts are complete.
  SELECT f.charge_ids, f.payback_ids INTO v_fc, v_fp FROM toll_system.match_scope(p_company, v_claim) f;
  v_c0 := array(SELECT unnest(v_fc) UNION SELECT toll_system.match_charges_near(p_company, v_fp));
  v_p0 := array(SELECT unnest(v_fp) UNION SELECT toll_system.match_paybacks_near(p_company, v_fc));
  v_c  := array(SELECT unnest(v_c0) UNION SELECT toll_system.match_charges_near(p_company, v_p0));
  v_p  := array(SELECT unnest(v_p0) UNION SELECT toll_system.match_paybacks_near(p_company, v_c0));

  RETURN jsonb_build_object(
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
      SELECT coalesce(jsonb_agg(jsonb_build_object('platform', s.platform, 'auto_apply', s.auto_apply,
                                                   'payback_mode', s.payback_mode) ORDER BY s.platform), '[]'::jsonb)
      FROM toll.platform_settings s WHERE s.organization_id = p_company));
END;
$$;

-- 4. Store (append-only) ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.match_store(p_company uuid, p_claim uuid, p_result jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ev       text := nullif(btrim(p_result ->> 'engine_version'), '');
  v_fc       uuid[];
  v_fp       uuid[];
  r          jsonb;
  v_c        uuid;
  v_p        uuid;
  v_inputs   jsonb;
  v_hash     text;
  v_open     toll.suggestions%ROWTYPE;
  v_has_open boolean;
  v_new      uuid;
  v_seen     text[] := '{}';
  n_new      int := 0;
  n_same     int := 0;
  n_replaced int := 0;
  n_withdrawn int := 0;
  n_skipped  int := 0;
BEGIN
  IF p_company IS NULL OR p_claim IS NULL OR v_ev IS NULL
     OR jsonb_typeof(p_result -> 'candidates') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'BAD_REQUEST: company, claim_id, engine_version and candidates[] are required';
  END IF;

  -- One store per company at a time, so two runs never fork a pair's chain.
  PERFORM pg_advisory_xact_lock(hashtextextended('toll_match:' || p_company::text, 0));

  IF NOT EXISTS (SELECT 1 FROM toll.match_queue q WHERE q.organization_id = p_company AND q.claim_id = p_claim) THEN
    RETURN jsonb_build_object('status', 'claim_gone', 'claim_id', p_claim);
  END IF;
  SELECT f.charge_ids, f.payback_ids INTO v_fc, v_fp FROM toll_system.match_scope(p_company, p_claim) f;

  FOR r IN SELECT value FROM jsonb_array_elements(p_result -> 'candidates') LOOP
    v_c := nullif(r ->> 'charge_id', '')::uuid;
    v_p := nullif(r ->> 'payback_id', '')::uuid;
    v_inputs := r -> 'inputs';
    IF v_c IS NULL OR v_p IS NULL
       OR jsonb_typeof(v_inputs) IS DISTINCT FROM 'object'
       OR jsonb_typeof(r -> 'score_parts') IS DISTINCT FROM 'object'
       OR jsonb_typeof(r -> 'rules_fired') IS DISTINCT FROM 'array'
       OR NOT (v_c = ANY (v_fc) OR v_p = ANY (v_fp))
       OR NOT EXISTS (SELECT 1 FROM toll.charges c WHERE c.organization_id = p_company AND c.id = v_c)
       OR NOT EXISTS (SELECT 1 FROM toll.paybacks p WHERE p.organization_id = p_company AND p.id = v_p) THEN
      n_skipped := n_skipped + 1;
      CONTINUE;
    END IF;
    v_seen := v_seen || (v_c::text || ':' || v_p::text);
    v_hash := md5(v_inputs::text);

    SELECT * INTO v_open FROM toll.suggestions s
    WHERE s.organization_id = p_company AND s.charge_id = v_c AND s.payback_id = v_p AND s.superseded_by IS NULL
    ORDER BY s.created_at DESC, s.id LIMIT 1;
    v_has_open := FOUND;

    IF v_has_open AND v_open.engine_version = v_ev AND v_open.inputs_hash = v_hash
       AND NOT ('withdrawn' = ANY (v_open.rules_fired)) THEN
      n_same := n_same + 1;
      CONTINUE;
    END IF;

    INSERT INTO toll.suggestions (organization_id, charge_id, payback_id, score_parts, rules_fired, engine_version,
                                  inputs, inputs_hash)
    VALUES (p_company, v_c, v_p,
            (r -> 'score_parts') || jsonb_build_object('auto_apply', coalesce((r ->> 'auto_apply')::boolean, false)),
            ARRAY(SELECT jsonb_array_elements_text(r -> 'rules_fired')), v_ev, v_inputs, v_hash)
    RETURNING id INTO v_new;

    IF v_has_open THEN
      UPDATE toll.suggestions SET superseded_by = v_new WHERE organization_id = p_company AND id = v_open.id;
      n_replaced := n_replaced + 1;
    ELSE
      n_new := n_new + 1;
    END IF;
  END LOOP;

  -- A pair in scope that the engine no longer returns is withdrawn (append-only: a new row supersedes it).
  FOR v_open IN
    SELECT * FROM toll.suggestions s
    WHERE s.organization_id = p_company AND s.superseded_by IS NULL
      AND NOT ('withdrawn' = ANY (s.rules_fired))
      AND (s.charge_id = ANY (v_fc) OR s.payback_id = ANY (v_fp))
      AND NOT ((s.charge_id::text || ':' || s.payback_id::text) = ANY (v_seen))
    ORDER BY s.id
  LOOP
    v_inputs := jsonb_build_object('withdrawn_from', v_open.id, 'reason', 'no_longer_a_candidate');
    INSERT INTO toll.suggestions (organization_id, charge_id, payback_id, score_parts, rules_fired, engine_version,
                                  inputs, inputs_hash)
    VALUES (p_company, v_open.charge_id, v_open.payback_id, jsonb_build_object('total', 0, 'auto_apply', false),
            ARRAY['withdrawn'], v_ev, v_inputs, md5(v_inputs::text))
    RETURNING id INTO v_new;
    UPDATE toll.suggestions SET superseded_by = v_new WHERE organization_id = p_company AND id = v_open.id;
    n_withdrawn := n_withdrawn + 1;
  END LOOP;

  DELETE FROM toll.match_queue q WHERE q.organization_id = p_company AND q.claim_id = p_claim;

  RETURN jsonb_build_object('status', 'stored', 'claim_id', p_claim, 'engine_version', v_ev,
                            'new', n_new, 'unchanged', n_same, 'replaced', n_replaced,
                            'withdrawn', n_withdrawn, 'skipped', n_skipped);
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.match_pending()
RETURNS TABLE (organization_id uuid, queued bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT q.organization_id, count(*)
  FROM toll.match_queue q
  WHERE q.claim_id IS NULL OR q.claimed_at < now() - interval '10 minutes'
  GROUP BY q.organization_id
  ORDER BY q.organization_id;
$$;

-- 5. Service wrappers ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toll_sys_match_claim(p_company uuid, p_limit int DEFAULT 500)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT toll_system.match_claim(p_company, p_limit);
$$;

CREATE OR REPLACE FUNCTION public.toll_sys_match_store(p_company uuid, p_claim_id uuid, p_result jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT toll_system.match_store(p_company, p_claim_id, p_result);
$$;

CREATE OR REPLACE FUNCTION public.toll_sys_match_pending()
RETURNS TABLE (organization_id uuid, queued bigint) LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM toll_system.match_pending();
$$;

REVOKE ALL ON FUNCTION toll_system.match_enqueue(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll.tg_match_enqueue() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll.tg_match_week_change() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.match_paybacks_near(uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.match_charges_near(uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.match_scope(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.match_claim(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.match_claim(uuid, int) TO service_role;
REVOKE ALL ON FUNCTION toll_system.match_store(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.match_store(uuid, uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION toll_system.match_pending() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.match_pending() TO service_role;
REVOKE ALL ON FUNCTION public.toll_sys_match_claim(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_match_claim(uuid, int) TO service_role;
REVOKE ALL ON FUNCTION public.toll_sys_match_store(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_match_store(uuid, uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.toll_sys_match_pending() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_match_pending() TO service_role;

NOTIFY pgrst, 'reload schema';

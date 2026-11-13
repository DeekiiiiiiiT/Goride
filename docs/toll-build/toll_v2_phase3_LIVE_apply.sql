-- Toll rebuild Phase 3: the screen reads migration, all or nothing, with its logbook line.
-- Run BEFORE deploying fleet-core / fleet-toll / the Fleet site (fleet-core writes plate_aliases on every car save).
-- Paste the WHOLE file into the Supabase SQL editor and run it once. Nothing changes for any fleet (tolls_v2 stays off).
BEGIN;

-- ===== 20261113162537_toll_v2_screen_reads =====
-- Toll rebuild Phase 3 P3-R1: the reads the toll screens need (docs/toll-phase3-screens-audit.md).
--   public.toll_v2_week_desk(week)      : every row of the Tolls step, by section, with the numbers from week_result.
--   public.toll_v2_weeks()              : the weeks list, last night's checks, and Uber take-backs waiting for a person.
--   public.toll_v2_import_reports(week) : the stored import reports that touched the week (Step 1 "See what was read").
-- All three: signed-in users only, company from the token only, toll.view (owner, manager, accountant). (B7)
-- Also:
--   toll.reported_take_backs : an Uber take-back (negative adjustment) is kept when it's imported, so the screens can
--                              list it until a person records it (carry_forward take_back, or reverse_payback). It was
--                              only in the import report before. import_batch is re-created with that one change.
--   fleet.vehicles.plate_aliases : extra plates a car is known by on platform files ("Which car is this?").
-- Section rules (one each):
--   decided / rejected / duplicate -> "decided";  unverified -> "receipts";  awaiting_cash -> "awaiting_cash";
--   pending in an open review pair -> "duplicates";  pending with 2+ current suggestions at the top score -> "pick";
--   pending with a current suggestion -> "suggested";  pending with none -> "no_trip".
--   A current suggestion = not superseded, not withdrawn, and its payback still has an open amount.
--   Confidence: "two_trips" (2+ at the top score), "sure" (top one fired sole_candidate + on_trip), else "likely".

-- 1. Reported take-backs ---------------------------------------------------------------------------------------
CREATE TABLE toll.reported_take_backs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  platform text NOT NULL,
  reference text NOT NULL,
  driver_id text,
  paid_on date,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  import_decision_id uuid NOT NULL,
  CONSTRAINT reported_take_backs_organization_id_platform_reference_key UNIQUE (organization_id, platform, reference),
  CONSTRAINT reported_take_backs_import_decision_id_fkey
    FOREIGN KEY (organization_id, import_decision_id) REFERENCES toll.decisions (organization_id, id)
);
REVOKE ALL ON toll.reported_take_backs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON toll.reported_take_backs TO authenticated;
ALTER TABLE toll.reported_take_backs ENABLE ROW LEVEL SECURITY;
CREATE POLICY reported_take_backs_company_read ON toll.reported_take_backs FOR SELECT TO authenticated
  USING (organization_id = toll_read.current_company());

-- 2. import_batch: unchanged except the take-back branch keeps the row (see above) ------------------------------
CREATE OR REPLACE FUNCTION toll_system.import_batch(p_company uuid, p_kind text, p_rows jsonb, p_decision uuid, p_cmd text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r        jsonb;
  v_i      int := 0;
  v_line   int := 0;
  v_res    jsonb;
  v_report jsonb := '[]'::jsonb;
  v_at     timestamptz;
  v_amt    bigint;
  v_acct   uuid;
  v_week   date;
  v_new    uuid;
  v_platform text;
  v_trip   text;
BEGIN
  IF p_kind NOT IN ('tag_statement', 'topups', 'driver_cash', 'uber', 'indrive') THEN
    RAISE EXCEPTION 'BAD_REQUEST: kind must be tag_statement, topups, driver_cash, uber or indrive';
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) LOOP
    v_i := v_i + 1;
    v_res := NULL;

    IF p_kind IN ('tag_statement', 'driver_cash') THEN
      v_res := toll_system.import_charge_row(p_company, p_kind, CASE WHEN p_kind = 'tag_statement' THEN 'tag' ELSE 'cash' END,
                                             r, p_decision, p_cmd, v_line);

    ELSIF p_kind = 'topups' THEN
      v_amt := (r ->> 'amount_minor')::bigint;
      IF nullif(r ->> 'source_ref', '') IS NULL OR v_amt IS NULL OR v_amt <= 0 OR (r ->> 'topped_up_on') IS NULL THEN
        v_res := jsonb_build_object('status', 'rejected', 'reason', 'source_ref, topped_up_on and amount_minor > 0 are required');
      ELSIF EXISTS (SELECT 1 FROM toll.tag_topups t WHERE t.organization_id = p_company AND t.source_ref = r ->> 'source_ref') THEN
        v_res := jsonb_build_object('status', CASE WHEN (SELECT t.amount_minor FROM toll.tag_topups t WHERE t.organization_id = p_company
                                                          AND t.source_ref = r ->> 'source_ref') = v_amt
                                                   THEN 'unchanged' ELSE 'topup_changed_needs_person' END);
      ELSE
        v_week := date_trunc('week', (r ->> 'topped_up_on')::date)::date;
        IF toll_system.week_is_sealed(p_company, v_week) THEN
          v_res := jsonb_build_object('status', 'refused_sealed_week', 'week_key', v_week);
        ELSE
          INSERT INTO toll.tag_accounts (organization_id, provider, account_ref, vehicle_id)
          VALUES (p_company, coalesce(nullif(r ->> 'provider', ''), 'tag'), coalesce(nullif(r ->> 'account_ref', ''), 'default'),
                  nullif(r ->> 'vehicle_id', ''))
          ON CONFLICT (organization_id, provider, account_ref) DO UPDATE SET vehicle_id = coalesce(excluded.vehicle_id, toll.tag_accounts.vehicle_id)
          RETURNING id INTO v_acct;
          INSERT INTO toll.tag_topups (organization_id, tag_account_id, amount_minor, topped_up_on, week_key, source_ref)
          VALUES (p_company, v_acct, v_amt, (r ->> 'topped_up_on')::date, v_week, r ->> 'source_ref')
          RETURNING id INTO v_new;
          v_line := v_line + 1;
          PERFORM toll_system.post(p_company, 'P1_tag_topup', v_amt,
                                   ((r ->> 'topped_up_on')::date + time '12:00') AT TIME ZONE 'America/Jamaica', p_cmd, v_line,
                                   jsonb_build_object('tag_topup_id', v_new));
          v_res := jsonb_build_object('status', 'new', 'id', v_new);
        END IF;
      END IF;

    ELSE  -- uber / indrive
      v_platform := p_kind;
      IF r ->> 'row_type' = 'trip' THEN
        v_trip := nullif(r ->> 'platform_trip_id', '');
        IF v_trip IS NULL THEN
          v_res := jsonb_build_object('status', 'rejected', 'reason', 'platform_trip_id is required');
        ELSE
          INSERT INTO toll.platform_trips (organization_id, platform, platform_trip_id, driver_id, vehicle_id, request_at,
                                           pickup_at, dropoff_at, time_precision, payment_method)
          VALUES (p_company, v_platform, v_trip, nullif(r ->> 'driver_id', ''), nullif(r ->> 'vehicle_id', ''),
                  (r ->> 'request_at')::timestamptz, (r ->> 'pickup_at')::timestamptz, (r ->> 'dropoff_at')::timestamptz,
                  coalesce(nullif(r ->> 'time_precision', ''), 'minute'), coalesce(nullif(r ->> 'payment_method', ''), 'unknown'))
          ON CONFLICT (organization_id, platform, platform_trip_id) DO UPDATE
            -- A re-import never blanks what an earlier file knew (a missing plate or time keeps the stored value).
            SET driver_id      = coalesce(excluded.driver_id, toll.platform_trips.driver_id),
                vehicle_id     = coalesce(excluded.vehicle_id, toll.platform_trips.vehicle_id),
                request_at     = coalesce(excluded.request_at, toll.platform_trips.request_at),
                pickup_at      = coalesce(excluded.pickup_at, toll.platform_trips.pickup_at),
                dropoff_at     = coalesce(excluded.dropoff_at, toll.platform_trips.dropoff_at),
                time_precision = excluded.time_precision,
                payment_method = CASE WHEN excluded.payment_method = 'unknown' THEN toll.platform_trips.payment_method
                                      ELSE excluded.payment_method END;
          v_amt := coalesce((r ->> 'toll_payback_minor')::bigint, 0);
          IF v_amt > 0 THEN
            v_at := coalesce((r ->> 'dropoff_at')::timestamptz, (r ->> 'request_at')::timestamptz);
            v_res := toll_system.import_payback_row(p_company, v_platform, 'trip_line', 'trip:' || v_trip, v_trip,
                       nullif(r ->> 'driver_id', ''), (v_at AT TIME ZONE 'America/Jamaica')::date, ledger.jamaica_week_start(v_at),
                       v_amt, CASE WHEN r ->> 'payment_method' = 'cash' THEN 'driver' ELSE 'fleet' END, v_at, p_cmd, v_line);
          ELSE
            v_res := jsonb_build_object('status', 'trip_only');
          END IF;
        END IF;
      ELSIF r ->> 'row_type' = 'adjustment' THEN
        v_amt := (r ->> 'amount_minor')::bigint;
        IF nullif(r ->> 'reference', '') IS NULL OR v_amt IS NULL OR v_amt = 0 OR (r ->> 'paid_on') IS NULL THEN
          v_res := jsonb_build_object('status', 'rejected', 'reason', 'reference, paid_on and a non-zero amount_minor are required');
        ELSIF v_amt < 0 THEN
          -- A take-back. Never stored as a refund; a person matches it to the payback it reverses (reverse_payback).
          -- P3-R1: keep the take-back so the screens can list it until a person records it (carry_forward take_back
          -- or reverse_payback with the same reference).
          INSERT INTO toll.reported_take_backs (organization_id, platform, reference, driver_id, paid_on, amount_minor,
                                                import_decision_id)
          VALUES (p_company, v_platform, r ->> 'reference', nullif(r ->> 'driver_id', ''), (r ->> 'paid_on')::date, -v_amt, p_decision)
          ON CONFLICT (organization_id, platform, reference) DO NOTHING;
          v_res := jsonb_build_object('status', 'take_back_needs_person', 'amount_minor', v_amt, 'reference', r ->> 'reference',
                                      'driver_id', nullif(r ->> 'driver_id', ''), 'paid_on', r ->> 'paid_on');
        ELSE
          v_week := ledger.jamaica_week_start(((r ->> 'paid_on')::date + time '12:00') AT TIME ZONE 'America/Jamaica');
          v_res := toll_system.import_payback_row(p_company, v_platform, 'adjustment', r ->> 'reference', NULL,
                     nullif(r ->> 'driver_id', ''), (r ->> 'paid_on')::date, v_week, v_amt, 'fleet',
                     ((r ->> 'paid_on')::date + time '12:00') AT TIME ZONE 'America/Jamaica', p_cmd, v_line);
        END IF;
      ELSE
        v_res := jsonb_build_object('status', 'rejected', 'reason', 'row_type must be trip or adjustment');
      END IF;
    END IF;

    IF v_res ? 'line' THEN v_line := (v_res ->> 'line')::int; END IF;
    -- P3-R4: each report row carries its amount, so Step 1 can show "12 tolls read · J$4,250.00".
    v_report := v_report || jsonb_build_array((v_res - 'line') || jsonb_build_object('row', v_i,
                  'ref', coalesce(r ->> 'source_ref', r ->> 'reference', r ->> 'platform_trip_id'))
                  || CASE WHEN v_res ? 'amount_minor' THEN '{}'::jsonb
                          ELSE jsonb_strip_nulls(jsonb_build_object('amount_minor',
                                 coalesce(nullif(r ->> 'toll_payback_minor', '')::bigint, nullif(r ->> 'amount_minor', '')::bigint)))
                     END);
  END LOOP;

  RETURN jsonb_build_object(
    'kind', p_kind, 'rows', v_i,
    'counts', (SELECT coalesce(jsonb_object_agg(s, n), '{}'::jsonb) FROM (
                 SELECT x ->> 'status' AS s, count(*) AS n FROM jsonb_array_elements(v_report) x GROUP BY 1) c),
    'report', v_report);
END;
$$;

REVOKE ALL ON FUNCTION toll_system.import_batch(uuid, text, jsonb, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- 3. Extra plates for a car ------------------------------------------------------------------------------------
ALTER TABLE fleet.vehicles ADD COLUMN IF NOT EXISTS plate_aliases text[] NOT NULL DEFAULT '{}'::text[];
COMMENT ON COLUMN fleet.vehicles.plate_aliases IS
  'Other plates this car appears under on platform files (normalized, no spaces). Set from Week Reconciliation "Which car is this?".';
-- P3-R4: every car save writes plate_aliases through this wrapper, so it must expose the new column
-- (same refresh as 20261106131700); without it every Fleet car save fails once fleet-core is deployed.
CREATE OR REPLACE VIEW public.fleet_vehicles AS
  SELECT * FROM fleet.vehicles;
ALTER VIEW public.fleet_vehicles SET (security_invoker = true);

-- 4. Helpers -----------------------------------------------------------------------------------------------------
-- What undo_decision needs for one decision: its id and the version of every charge and payback it touched.
-- NULL when the decision can't be undone (not one of the five undoable intents, or already undone).
CREATE OR REPLACE FUNCTION toll_system.undo_body(p_company uuid, p_decision uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN d.intent IN ('link_payback', 'driver_pays', 'fleet_absorbs', 'leave_payback_unlinked', 'apply_suggestion')
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

-- Who decided and when, in words for the screen ("Roam" for system decisions).
CREATE OR REPLACE FUNCTION toll_system.decider(p_company uuid, p_decision uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('decisionId', d.id, 'intent', d.intent, 'at', d.created_at, 'actor', d.actor,
           'actorJob', d.actor_job, 'reasonCode', d.reason_code, 'note', d.note,
           'by', CASE WHEN d.actor = 'system' THEN 'Roam'
                      ELSE coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), nullif(u.raw_user_meta_data ->> 'full_name', ''),
                                    u.email) END)
  FROM toll.decisions d LEFT JOIN auth.users u ON u.id = d.actor_user_id
  WHERE d.organization_id::text = p_company::text AND d.id = p_decision;
$$;

-- One platform trip, in the shape the screens use.
CREATE OR REPLACE FUNCTION toll_system.trip_json(p_company uuid, p_platform text, p_trip text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('platform', t.platform, 'tripId', t.platform_trip_id, 'requestAt', t.request_at,
           'pickupAt', t.pickup_at, 'dropoffAt', t.dropoff_at, 'paymentMethod', t.payment_method,
           'timePrecision', t.time_precision)
  FROM toll.platform_trips t
  WHERE t.organization_id = p_company AND t.platform = p_platform AND t.platform_trip_id = p_trip;
$$;

-- 5. The Tolls step ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.week_desk(p_company uuid, p_week date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sealed   boolean := toll_system.week_is_sealed(p_company, p_week);
  v_paid     boolean := EXISTS (SELECT 1 FROM ledger.settlement_movements m
                                WHERE m.organization_id = p_company AND m.period_anchor = p_week
                                  AND m.kind IN ('pay', 'write_off') AND m.status = 'posted');
  v_charges  jsonb;
  v_paybacks jsonb;
  v_kept     jsonb;
  v_pairs    jsonb;
  v_late     jsonb;
  v_blockers jsonb;
BEGIN
  WITH ch AS (
    SELECT c.*, toll_system.charge_state(p_company, c.id) AS state,
           coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                     WHERE a.organization_id = p_company AND a.charge_id = c.id AND a.reversed_by IS NULL), 0)::bigint AS allocated
    FROM toll.charges c
    WHERE c.organization_id = p_company AND NOT c.is_legacy AND NOT c.after_seal
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week
  ),
  sug AS (
    SELECT s.charge_id, s.id AS suggestion_id, coalesce((s.score_parts ->> 'total')::int, 0) AS score, s.rules_fired,
           p.id AS payback_id, p.version AS payback_version, p.amount_minor AS payback_minor, p.platform, p.platform_trip_id,
           toll_system.payback_open_minor(p_company, p.id) AS payback_open_minor
    FROM toll.suggestions s
    JOIN ch ON ch.id = s.charge_id AND ch.state = 'pending'
    JOIN toll.paybacks p ON p.organization_id = p_company AND p.id = s.payback_id
    WHERE s.organization_id = p_company AND s.superseded_by IS NULL AND NOT ('withdrawn' = ANY (s.rules_fired))
      AND toll_system.payback_open_minor(p_company, p.id) > 0
  ),
  ranked AS (
    SELECT sug.*, max(score) OVER (PARTITION BY charge_id) AS top_score,
           count(*) OVER (PARTITION BY charge_id, score) AS same_score_n
    FROM sug
  ),
  conf AS (
    SELECT charge_id,
           CASE WHEN max(same_score_n) FILTER (WHERE score = top_score) >= 2 THEN 'two_trips'
                WHEN bool_or(score = top_score AND 'sole_candidate' = ANY (rules_fired) AND 'on_trip' = ANY (rules_fired))
                  THEN 'sure'
                ELSE 'likely' END AS confidence
    FROM ranked GROUP BY charge_id
  ),
  pairs AS (
    SELECT d.id, d.charge_a, d.charge_b FROM toll.duplicate_reviews d
    WHERE d.organization_id::text = p_company::text AND d.status = 'open'
      AND (d.charge_a IN (SELECT id FROM ch) OR d.charge_b IN (SELECT id FROM ch))
  ),
  rows AS (
    SELECT ch.*, cf.confidence,
           (SELECT pr.id FROM pairs pr WHERE ch.id IN (pr.charge_a, pr.charge_b) LIMIT 1) AS pair_id,
           CASE WHEN ch.state IN ('decided', 'rejected', 'duplicate') THEN 'decided'
                WHEN ch.state = 'unverified' THEN 'receipts'
                WHEN ch.state = 'awaiting_cash' THEN 'awaiting_cash'
                WHEN EXISTS (SELECT 1 FROM pairs pr WHERE ch.id IN (pr.charge_a, pr.charge_b)) THEN 'duplicates'
                WHEN cf.confidence = 'two_trips' THEN 'pick'
                WHEN cf.confidence IS NOT NULL THEN 'suggested'
                ELSE 'no_trip' END AS section
    FROM ch LEFT JOIN conf cf ON cf.charge_id = ch.id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'version', r.version, 'section', r.section, 'state', r.state,
           'occurredAt', r.occurred_at, 'timePrecision', r.time_precision, 'weekKey', r.week_key,
           'amountMinor', r.amount_minor, 'allocatedMinor', r.allocated, 'openMinor', greatest(r.amount_minor - r.allocated, 0),
           'paidBy', r.paid_by, 'source', r.source,
           'plazaId', r.plaza_id, 'plazaName', tp.name,
           'vehicleId', r.vehicle_id, 'plate', v.license_plate,
           'driverId', r.driver_id, 'driverName', dr.name,
           'receipt', CASE WHEN r.paid_by = 'cash' THEN r.evidence || jsonb_build_object('sourceRef', r.source_ref) END,
           'confidence', r.confidence, 'reviewPairId', r.pair_id,
           'suggestions', CASE WHEN r.state = 'pending' THEN (
               SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'suggestionId', k.suggestion_id, 'score', k.score, 'top', k.score = k.top_score,
                        'confidence', CASE WHEN k.score < k.top_score THEN 'likely' ELSE r.confidence END,
                        'rules', to_jsonb(k.rules_fired),
                        'paybackId', k.payback_id, 'paybackVersion', k.payback_version,
                        'paidBackMinor', k.payback_minor, 'paybackOpenMinor', k.payback_open_minor,
                        'trip', toll_system.trip_json(p_company, k.platform, k.platform_trip_id),
                        'alsoFits', (SELECT coalesce(jsonb_agg(jsonb_build_object('chargeId', o.charge_id,
                                        'occurredAt', oc.occurred_at, 'plazaName', otp.name) ORDER BY oc.occurred_at), '[]'::jsonb)
                                     FROM ranked o JOIN ch oc ON oc.id = o.charge_id
                                     LEFT JOIN fleet.toll_plazas otp ON otp.id::text = oc.plaza_id
                                     WHERE o.payback_id = k.payback_id AND o.charge_id <> k.charge_id))
                      ORDER BY k.score DESC, k.suggestion_id), '[]'::jsonb)
               FROM ranked k WHERE k.charge_id = r.id) ELSE '[]'::jsonb END,
           'decision', CASE
               WHEN r.state = 'rejected' THEN (
                 SELECT jsonb_build_object('kind', 'receipt_rejected', 'undo', NULL)
                        || toll_system.decider(p_company, d.id)
                 FROM toll.decisions d
                 WHERE d.organization_id::text = p_company::text AND d.intent = 'reject_cash_receipt'
                   AND d.targets ->> 'charge_id' = r.id::text
                 ORDER BY d.created_at DESC LIMIT 1)
               -- P3-R4: a duplicate a person confirmed shows who and when; an automatic one has no decider.
               WHEN r.state = 'duplicate' THEN jsonb_build_object('kind', 'duplicate', 'keptChargeId', r.duplicate_of, 'undo', NULL)
                 || coalesce((SELECT toll_system.decider(p_company, d.id)
                              FROM toll.decisions d
                              WHERE d.organization_id::text = p_company::text AND d.intent = 'confirm_duplicate'
                                AND d.targets ->> 'charge_id' = r.id::text
                              ORDER BY d.created_at DESC LIMIT 1), '{}'::jsonb)
               WHEN r.state = 'decided' OR r.allocated > 0 THEN (
                 SELECT jsonb_build_object(
                          'kind', CASE WHEN a.payback_id IS NOT NULL THEN 'matched'
                                       WHEN a.bearer = 'driver' THEN 'driver_pays' ELSE 'fleet_pays' END,
                          'allocations', (SELECT jsonb_agg(jsonb_build_object('bearer', x.bearer, 'amountMinor', x.amount_minor,
                                            'paybackId', x.payback_id, 'provisional', x.provisional, 'decisionId', x.decision_id)
                                            ORDER BY x.created_at)
                                          FROM toll.allocations x WHERE x.organization_id = p_company AND x.charge_id = r.id
                                            AND x.reversed_by IS NULL),
                          'trip', (SELECT toll_system.trip_json(p_company, pb.platform, pb.platform_trip_id)
                                   FROM toll.paybacks pb WHERE pb.organization_id = p_company AND pb.id = a.payback_id),
                          'undo', CASE WHEN v_sealed THEN NULL ELSE toll_system.undo_body(p_company, a.decision_id) END)
                        || toll_system.decider(p_company, a.decision_id)
                 FROM toll.allocations a
                 WHERE a.organization_id = p_company AND a.charge_id = r.id AND a.reversed_by IS NULL
                 ORDER BY a.created_at DESC LIMIT 1)
             END
         ) ORDER BY r.occurred_at, r.id), '[]'::jsonb)
  INTO v_charges
  FROM rows r
  LEFT JOIN fleet.toll_plazas tp ON tp.id::text = r.plaza_id
  LEFT JOIN fleet.vehicles v ON v.organization_id::text = p_company::text AND v.id::text = r.vehicle_id
  LEFT JOIN LATERAL (SELECT d.name FROM fleet.drivers d
                     WHERE d.organization_id::text = p_company::text AND (d.id::text = r.driver_id OR d.legacy_kv_id = r.driver_id)
                     LIMIT 1) dr ON true;

  -- Paybacks of the week with an open amount that no current suggestion points at ("Uber paybacks with no toll").
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'version', p.version, 'platform', p.platform, 'kind', p.kind, 'reference', p.reference,
           'paidOn', p.paid_on, 'amountMinor', p.amount_minor, 'openMinor', toll_system.payback_open_minor(p_company, p.id),
           'receivedBy', p.received_by, 'driverId', p.driver_id,
           'trip', toll_system.trip_json(p_company, p.platform, p.platform_trip_id)) ORDER BY p.paid_on, p.id), '[]'::jsonb)
  INTO v_paybacks
  FROM toll.v_active_paybacks p
  WHERE p.organization_id = p_company AND p.week_key = p_week
    AND toll_system.payback_open_minor(p_company, p.id) > 0
    AND NOT EXISTS (SELECT 1 FROM toll.suggestions s
                    JOIN toll.charges c ON c.organization_id = p_company AND c.id = s.charge_id
                    WHERE s.organization_id = p_company AND s.payback_id = p.id AND s.superseded_by IS NULL
                      AND NOT ('withdrawn' = ANY (s.rules_fired))
                      AND toll_system.charge_state(p_company, c.id) = 'pending');

  -- Paybacks (or carried platform shares) a person kept with no toll — shown in "Decided" with their Undo.
  SELECT coalesce(jsonb_agg((jsonb_build_object(
           'id', u.id, 'paybackId', u.payback_id, 'carriedFactId', u.carried_fact_id, 'amountMinor', u.amount_minor,
           'reason', u.reason, 'reference', p.reference, 'paidOn', p.paid_on,
           'trip', toll_system.trip_json(p_company, p.platform, p.platform_trip_id),
           'undo', CASE WHEN v_sealed THEN NULL ELSE toll_system.undo_body(p_company, u.decision_id) END) || toll_system.decider(p_company, u.decision_id))
           ORDER BY u.created_at), '[]'::jsonb)
  INTO v_kept
  FROM toll.payback_unlinked_decisions u
  LEFT JOIN toll.paybacks p ON p.organization_id = p_company AND p.id = u.payback_id
  LEFT JOIN toll.carried_facts f ON f.organization_id = p_company AND f.id = u.carried_fact_id
  WHERE u.organization_id = p_company AND u.reversed_by IS NULL
    AND coalesce(p.week_key, f.to_week) = p_week;

  -- Open review pairs touching the week, with both charges' versions (confirm / release need both).
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'chargeA', d.charge_a, 'chargeAVersion', a.version,
           'chargeB', d.charge_b, 'chargeBVersion', b.version) ORDER BY d.created_at), '[]'::jsonb)
  INTO v_pairs
  FROM toll.duplicate_reviews d
  JOIN toll.charges a ON a.organization_id = p_company AND a.id = d.charge_a
  JOIN toll.charges b ON b.organization_id = p_company AND b.id = d.charge_b
  WHERE d.organization_id::text = p_company::text AND d.status = 'open'
    AND (toll_system.charge_counted_week(p_company, a.id, a.week_key) = p_week
         OR toll_system.charge_counted_week(p_company, b.id, b.week_key) = p_week);

  -- Facts that arrived after the week was sealed, and pending amount corrections of its charges.
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'at'), '[]'::jsonb) INTO v_late FROM (
    SELECT jsonb_build_object('kind', 'late_charge', 'id', c.id, 'version', c.version, 'at', c.occurred_at,
             'amountMinor', c.amount_minor, 'paidBy', c.paid_by, 'plazaName', tp.name, 'driverId', c.driver_id,
             'evidenceStatus', c.evidence_status) AS x
    FROM toll.charges c LEFT JOIN fleet.toll_plazas tp ON tp.id::text = c.plaza_id
    WHERE c.organization_id = p_company AND c.after_seal AND NOT c.is_legacy AND c.week_key = p_week
    UNION ALL
    SELECT jsonb_build_object('kind', 'late_payback', 'id', p.id, 'version', p.version, 'at', p.paid_on,
             'amountMinor', p.amount_minor, 'platform', p.platform, 'reference', p.reference, 'driverId', p.driver_id,
             'trip', toll_system.trip_json(p_company, p.platform, p.platform_trip_id))
    FROM toll.paybacks p
    WHERE p.organization_id = p_company AND p.after_seal AND NOT p.is_legacy AND p.week_key = p_week
    UNION ALL
    SELECT jsonb_build_object('kind', 'correction', 'id', c.id, 'version', c.version, 'changeId', g.id, 'at', g.created_at,
             'oldAmountMinor', c.amount_minor, 'newAmountMinor', (g.new_value)::bigint,
             'direction', CASE WHEN (g.new_value)::bigint < c.amount_minor THEN 'down' ELSE 'up' END,
             'occurredAt', c.occurred_at, 'plazaName', tp.name)
    FROM toll.charge_changes g
    JOIN toll.charges c ON c.organization_id = p_company AND c.id = g.charge_id
    LEFT JOIN fleet.toll_plazas tp ON tp.id::text = c.plaza_id
    WHERE g.organization_id = p_company AND g.pending AND g.field = 'amount_minor'
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week
  ) late;

  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'id', b.id, 'amountMinor', b.amount_minor, 'reason', b.reason)),
                  '[]'::jsonb)
  INTO v_blockers FROM toll_system.seal_blockers(p_company, p_week) b;

  RETURN jsonb_build_object(
    'weekKey', p_week, 'sealed', v_sealed, 'paid', v_paid,
    'weekVersion', toll_system.week_version(p_company, p_week),
    'openWeek', ledger.jamaica_week_start(now()),
    'matcherBusy', EXISTS (SELECT 1 FROM toll.match_queue q WHERE q.organization_id = p_company),
    'result', toll_system.week_result(p_company, p_week),
    'charges', v_charges, 'paybacks', v_paybacks, 'kept', v_kept, 'reviewPairs', v_pairs,
    'late', v_late, 'blockers', v_blockers);
END;
$$;

-- 6. The weeks list, last night's checks, take-backs waiting for a person ----------------------------------------
CREATE OR REPLACE FUNCTION toll_system.weeks_overview(p_company uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH wk AS (
    SELECT toll_system.charge_counted_week(p_company, c.id, c.week_key) AS week_key FROM toll.charges c
    WHERE c.organization_id = p_company AND NOT c.is_legacy AND NOT c.after_seal
    UNION
    SELECT p.week_key FROM toll.paybacks p WHERE p.organization_id = p_company AND NOT p.is_legacy
  ),
  per AS (
    SELECT w.week_key,
           toll_system.week_is_sealed(p_company, w.week_key) AS sealed,
           (SELECT count(*) FROM toll.charges c WHERE c.organization_id = p_company AND NOT c.is_legacy AND NOT c.after_seal
              AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.week_key
              AND toll_system.charge_state(p_company, c.id) NOT IN ('rejected', 'duplicate')) AS tolls,
           (SELECT coalesce(sum(c.amount_minor), 0) FROM toll.charges c WHERE c.organization_id = p_company AND NOT c.is_legacy
              AND NOT c.after_seal AND c.evidence_status = 'verified' AND c.duplicate_of IS NULL
              AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.week_key) AS spend_minor,
           -- tolls still to decide (charges only), and the other blockers counted on their own
           (SELECT count(*) FROM toll_system.seal_blockers(p_company, w.week_key) b WHERE b.kind = 'charge') AS to_decide,
           (SELECT coalesce(sum(b.amount_minor), 0) FROM toll_system.seal_blockers(p_company, w.week_key) b
              WHERE b.kind = 'charge') AS to_decide_minor,
           (SELECT count(*) FROM toll_system.seal_blockers(p_company, w.week_key) b
              WHERE b.kind IN ('payback', 'carried')) AS paybacks_open,
           (SELECT count(*) FROM toll_system.seal_blockers(p_company, w.week_key) b WHERE b.kind = 'review_pair') AS review_pairs,
           (SELECT count(*) FROM toll.charges c WHERE c.organization_id = p_company AND c.after_seal AND NOT c.is_legacy
              AND c.week_key = w.week_key)
           + (SELECT count(*) FROM toll.paybacks p WHERE p.organization_id = p_company AND p.after_seal AND NOT p.is_legacy
              AND p.week_key = w.week_key) AS late
    FROM (SELECT DISTINCT week_key FROM wk WHERE week_key IS NOT NULL) w
  ),
  night AS (
    SELECT n.run_id, max(n.created_at) AS at FROM toll.nightly_results n
    WHERE n.organization_id = p_company GROUP BY n.run_id ORDER BY max(n.created_at) DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'openWeek', ledger.jamaica_week_start(now()),
    'weeks', coalesce((SELECT jsonb_agg(jsonb_build_object('weekKey', p.week_key, 'sealed', p.sealed, 'tolls', p.tolls,
                        'spendMinor', p.spend_minor, 'toDecide', p.to_decide, 'toDecideMinor', p.to_decide_minor,
                        'paybacksOpen', p.paybacks_open, 'reviewPairs', p.review_pairs, 'late', p.late)
                        ORDER BY p.week_key DESC) FROM per p), '[]'::jsonb),
    'nightly', (SELECT jsonb_build_object('at', nt.at, 'ok', bool_and(n.ok),
                  'checks', jsonb_agg(jsonb_build_object('checkNo', n.check_no, 'name', n.name, 'ok', n.ok, 'detail', n.detail)
                                      ORDER BY n.check_no, n.name))
                FROM night nt JOIN toll.nightly_results n ON n.organization_id = p_company AND n.run_id = nt.run_id
                GROUP BY nt.at),
    'takeBacks', coalesce((SELECT jsonb_agg(jsonb_build_object(
                     'id', t.id, 'platform', t.platform, 'reference', t.reference, 'driverId', t.driver_id,
                     'driverName', (SELECT d.name FROM fleet.drivers d WHERE d.organization_id::text = p_company::text
                                      AND (d.id::text = t.driver_id OR d.legacy_kv_id = t.driver_id) LIMIT 1),
                     'paidOn', t.paid_on, 'amountMinor', t.amount_minor, 'reportedAt', t.created_at,
                     -- the paybacks it may take back: the same driver's active paybacks of exactly this amount
                     -- (a take-back reverses a whole payback; another amount is refused as PARTIAL_TAKE_BACK)
                     'candidates', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                       'paybackId', p.id, 'version', p.version, 'weekKey', p.week_key, 'paidOn', p.paid_on,
                                       'amountMinor', p.amount_minor, 'kind', p.kind, 'reference', p.reference,
                                       'weekSealed', toll_system.week_is_sealed(p_company, p.week_key),
                                       'weekPaid', EXISTS (SELECT 1 FROM ledger.settlement_movements m
                                                           WHERE m.organization_id = p_company AND m.period_anchor = p.week_key
                                                             AND m.kind IN ('pay', 'write_off') AND m.status = 'posted'),
                                       'trip', toll_system.trip_json(p_company, p.platform, p.platform_trip_id))
                                       ORDER BY p.paid_on DESC), '[]'::jsonb)
                                    FROM toll.v_active_paybacks p
                                    WHERE p.organization_id = p_company AND p.platform = t.platform
                                      AND p.driver_id IS NOT DISTINCT FROM t.driver_id AND p.amount_minor = t.amount_minor))
                     ORDER BY t.created_at)
                   FROM toll.reported_take_backs t
                   WHERE t.organization_id = p_company
                     -- recorded already: a carried take-back of the same platform's payback with this reference,
                     -- or a reversing payback of the same platform with this reference
                     AND NOT EXISTS (SELECT 1 FROM toll.decisions d
                                     JOIN toll.carried_facts f ON f.organization_id = p_company AND f.decision_id = d.id
                                                              AND f.kind = 'take_back'
                                     JOIN toll.paybacks op ON op.organization_id = p_company AND op.id = f.original_id
                                     WHERE d.organization_id::text = p_company::text AND d.intent = 'carry_forward'
                                       AND d.response ->> 'reference' = t.reference AND op.platform = t.platform)
                     AND NOT EXISTS (SELECT 1 FROM toll.paybacks r WHERE r.organization_id = p_company
                                       AND r.reversal_of IS NOT NULL AND r.platform = t.platform
                                       AND r.reference = t.reference)), '[]'::jsonb));
$$;

-- 7. Import reports that touched a week ----------------------------------------------------------------------------
-- An import "touched" the week when a row of its report is a charge or payback of the week. An import with no such
-- row at all (only problems, or only trips) is listed for imports made from the week's Monday up to 21 days later.
CREATE OR REPLACE FUNCTION toll_system.import_reports(p_company uuid, p_week date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH ids AS (
    SELECT c.id FROM toll.charges c WHERE c.organization_id = p_company
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week
    UNION
    SELECT p.id FROM toll.paybacks p WHERE p.organization_id = p_company AND p.week_key = p_week
    UNION
    SELECT t.id FROM toll.tag_topups t WHERE t.organization_id = p_company AND t.week_key = p_week
  ),
  imp AS (
    SELECT d.* FROM toll.decisions d
    WHERE d.organization_id::text = p_company::text AND d.intent = 'import_batch' AND d.response IS NOT NULL
      AND (EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(d.response -> 'report', '[]'::jsonb)) x
                   WHERE (x ->> 'id') IN (SELECT id::text FROM ids))
           OR (NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(d.response -> 'report', '[]'::jsonb)) x
                           WHERE x ? 'id')
               AND d.created_at >= (p_week + time '00:00') AT TIME ZONE 'America/Jamaica'
               AND d.created_at < (p_week + 21 + time '00:00') AT TIME ZONE 'America/Jamaica'))
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'decisionId', i.id, 'at', i.created_at, 'kind', i.response ->> 'kind', 'fileName', i.response ->> 'file_name',
           'rows', (i.response ->> 'rows')::int, 'counts', i.response -> 'counts', 'report', i.response -> 'report',
           'truncated', i.response_truncated, 'by', toll_system.decider(p_company, i.id) -> 'by')
           ORDER BY i.created_at DESC), '[]'::jsonb)
  FROM (SELECT * FROM imp ORDER BY created_at DESC LIMIT 20) i;
$$;

-- 8. The user reads (company from the token, toll.view) ------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_read.check_view()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_company uuid := toll_read.current_company();
BEGIN
  IF v_company IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'NO_COMPANY', DETAIL = '{}', ERRCODE = 'P0001';
  END IF;
  IF NOT toll_system.user_can_view_tolls(auth.uid(), v_company) THEN
    RAISE EXCEPTION USING MESSAGE = 'FORBIDDEN', DETAIL = '{"permission":"toll.view"}', ERRCODE = 'P0001';
  END IF;
  RETURN v_company;
END;
$$;

CREATE OR REPLACE FUNCTION toll_read.check_week(p_week date)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF p_week IS NULL OR p_week <> date_trunc('week', p_week)::date THEN
    RAISE EXCEPTION USING MESSAGE = 'BAD_REQUEST', DETAIL = '{"week_key":"must be a Monday (ADR 0007)"}', ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION toll_read.week_desk(p_week date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_company uuid := toll_read.check_view();
BEGIN
  PERFORM toll_read.check_week(p_week);
  RETURN toll_system.week_desk(v_company, p_week);
END;
$$;

CREATE OR REPLACE FUNCTION toll_read.weeks()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_company uuid := toll_read.check_view();
BEGIN
  RETURN toll_system.weeks_overview(v_company);
END;
$$;

CREATE OR REPLACE FUNCTION toll_read.import_reports(p_week date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_company uuid := toll_read.check_view();
BEGIN
  PERFORM toll_read.check_week(p_week);
  RETURN toll_system.import_reports(v_company, p_week);
END;
$$;

CREATE OR REPLACE FUNCTION public.toll_v2_week_desk(p_week date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT toll_read.week_desk(p_week); $$;
CREATE OR REPLACE FUNCTION public.toll_v2_weeks()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT toll_read.weeks(); $$;
CREATE OR REPLACE FUNCTION public.toll_v2_import_reports(p_week date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT toll_read.import_reports(p_week); $$;

-- 9. Grants: system functions to no one; the reads to signed-in users only (never anon, never the service key).
REVOKE ALL ON FUNCTION toll_system.undo_body(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.decider(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.trip_json(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.week_desk(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.weeks_overview(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.import_reports(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_read.check_view() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_read.check_week(date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_read.week_desk(date) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION toll_read.weeks() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION toll_read.import_reports(date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION toll_read.week_desk(date) TO authenticated;
GRANT EXECUTE ON FUNCTION toll_read.weeks() TO authenticated;
GRANT EXECUTE ON FUNCTION toll_read.import_reports(date) TO authenticated;
REVOKE ALL ON FUNCTION public.toll_v2_week_desk(date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.toll_v2_weeks() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.toll_v2_import_reports(date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toll_v2_week_desk(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toll_v2_weeks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.toll_v2_import_reports(date) TO authenticated;

NOTIFY pgrst, 'reload schema';

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261113162537', 'toll_v2_screen_reads') ON CONFLICT (version) DO NOTHING;
COMMIT;
SELECT (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261113162537') AS logbook_row, to_regclass('toll.reported_take_backs') IS NOT NULL AS take_backs_table, (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fleet_vehicles' AND column_name = 'plate_aliases') AS view_has_plate_aliases, to_regprocedure('public.toll_v2_week_desk(date)') IS NOT NULL AS desk_read, to_regprocedure('public.toll_v2_weeks()') IS NOT NULL AS weeks_read, to_regprocedure('public.toll_v2_import_reports(date)') IS NOT NULL AS reports_read;

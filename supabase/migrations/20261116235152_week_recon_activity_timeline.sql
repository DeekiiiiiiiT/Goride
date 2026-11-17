-- Week recon: Uber activity timeline (D1-D3)

-- D1: driver status at a tag crossing minute (timeline + platform trips)
CREATE OR REPLACE FUNCTION toll_system.driver_status_at(
  p_company uuid,
  p_driver_id text,
  p_vehicle_id text,
  p_at timestamptz,
  p_precision text
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day date;
  v_ids text[];
  v_approach interval := interval '45 minutes';
  v_post interval := interval '15 minutes';
BEGIN
  IF coalesce(p_precision, '') = 'date_only' OR nullif(trim(coalesce(p_driver_id, '')), '') IS NULL THEN
    RETURN 'unknown';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM toll.platform_trips t
    WHERE t.organization_id = p_company
      AND (
        nullif(trim(coalesce(p_driver_id, '')), '') IS NOT NULL AND t.driver_id = p_driver_id
        OR nullif(trim(coalesce(p_vehicle_id, '')), '') IS NOT NULL AND t.vehicle_id = p_vehicle_id
      )
      AND p_at >= (t.request_at - v_approach)
      AND p_at <= (coalesce(t.dropoff_at, t.pickup_at, t.request_at) + v_post)
  ) THEN
    RETURN 'on_trip';
  END IF;

  v_day := (p_at AT TIME ZONE 'America/Jamaica')::date;

  -- Every id this driver can appear under (the charge may carry the legacy kv id).
  v_ids := ARRAY[p_driver_id] || coalesce((
    SELECT array_agg(x) FROM (
      SELECT d.id::text AS x FROM fleet.drivers d
      WHERE d.organization_id::text = p_company::text
        AND (d.id::text = p_driver_id OR d.legacy_kv_id = p_driver_id)
      UNION
      SELECT d.legacy_kv_id FROM fleet.drivers d
      WHERE d.organization_id::text = p_company::text
        AND (d.id::text = p_driver_id OR d.legacy_kv_id = p_driver_id)
        AND d.legacy_kv_id IS NOT NULL
    ) ids), ARRAY[]::text[]);

  IF NOT EXISTS (
    SELECT 1
    FROM fleet.driver_activity_events e
    WHERE e.organization_id = p_company::text
      AND e.service_line = 'uber'
      AND e.driver_id = ANY (v_ids)
      AND (e.occurred_at AT TIME ZONE 'America/Jamaica')::date = v_day
  ) THEN
    RETURN 'no_timeline';
  END IF;

  -- Online if the driver was online on ANY app (Uber or Roam) at any moment within 5 minutes
  -- either side of the crossing (tag and Uber clocks differ; the doubt goes to the driver).
  -- Each app has its own on/off state, so the latest event is taken per service line.
  IF EXISTS (
    SELECT 1 FROM (
      SELECT DISTINCT ON (e.service_line) e.event_type
      FROM fleet.driver_activity_events e
      WHERE e.organization_id = p_company::text
        AND e.driver_id = ANY (v_ids)
        AND e.event_type IN ('went_online', 'went_offline')
        AND e.occurred_at <= p_at - interval '5 minutes'
      ORDER BY e.service_line, e.occurred_at DESC, e.id DESC
    ) last_per_app
    WHERE last_per_app.event_type = 'went_online'
  ) OR EXISTS (
    SELECT 1
    FROM fleet.driver_activity_events e
    WHERE e.organization_id = p_company::text
      AND e.driver_id = ANY (v_ids)
      AND e.event_type = 'went_online'
      AND e.occurred_at > p_at - interval '5 minutes'
      AND e.occurred_at <= p_at + interval '5 minutes'
  ) THEN
    RETURN 'online';
  END IF;

  RETURN 'offline';
END;
$$;

REVOKE ALL ON FUNCTION toll_system.driver_status_at(uuid, text, text, timestamptz, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- D2: week_desk adds driverStatus, offlineFlag, summary.offlineFlagged*
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
  v_offline_flagged int;
  v_offline_minor bigint;
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
           'driverStatus', st.driver_status,
           'offlineFlag', (r.section = 'no_trip' AND r.state = 'pending' AND st.driver_status = 'offline'),
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
                     LIMIT 1) dr ON true
  LEFT JOIN LATERAL (
    SELECT toll_system.driver_status_at(p_company, r.driver_id, r.vehicle_id, r.occurred_at, r.time_precision) AS driver_status
  ) st ON true;

  SELECT count(*)::int, coalesce(sum((e ->> 'openMinor')::bigint), 0)::bigint
  INTO v_offline_flagged, v_offline_minor
  FROM jsonb_array_elements(v_charges) e
  WHERE coalesce((e ->> 'offlineFlag')::boolean, false);

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
    'late', v_late, 'blockers', v_blockers,
    'summary', jsonb_build_object(
      'offlineFlagged', coalesce(v_offline_flagged, 0),
      'offlineFlaggedMinor', coalesce(v_offline_minor, 0)));
END;
$$;

-- D3: source coverage for uber_activity_timeline
CREATE OR REPLACE FUNCTION recon._day_has_daily_rows(
  p_org text,
  p_line text,
  p_source_id text,
  p_day date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  CASE p_source_id
    WHEN 'indrive_trips' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.trips t
        WHERE t.organization_id = p_org
          AND t.date::date = p_day
          AND lower(coalesce(t.platform, '')) LIKE '%indrive%'
          AND (p_line <> 'rideshare' OR coalesce(t.service_line, 'rideshare') = 'rideshare')
      );
    WHEN 'roam_trips' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.trips t
        WHERE t.organization_id = p_org
          AND t.date::date = p_day
          AND coalesce(t.platform, '') = 'Roam'
          AND coalesce(t.service_line, 'rideshare') = 'rideshare'
      );
    WHEN 'cash_tolls' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.toll_ledger l
        WHERE l.organization_id = p_org
          AND l.date::date = p_day
          AND (
            lower(coalesce(l.payment_method, '')) = 'cash'
            OR lower(coalesce(l.type, '')) = 'cash'
          )
      );
    WHEN 'cash_fuel' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.fuel_entries f
        WHERE f.organization_id = p_org
          AND f.date::date = p_day
          AND (
            nullif(trim(coalesce(f.payload_json->>'batchId', '')), '') IS NULL
            OR coalesce(f.payload_json->>'source', '') IN ('driver', 'receipt', 'ocr')
          )
      );
    WHEN 'rush_deliveries' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.trips t
        WHERE t.organization_id = p_org
          AND t.date::date = p_day
          AND coalesce(t.service_line, '') = 'rush_delivery'
      );
    WHEN 'uber_activity_timeline' THEN
      RETURN EXISTS (
        SELECT 1
        FROM fleet.driver_activity_events e
        WHERE e.organization_id = p_org
          AND e.source = 'uber_app_activity'
          AND (e.occurred_at AT TIME ZONE 'America/Jamaica')::date = p_day
      );
    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION recon.compute_source_coverage(
  p_org text,
  p_line text,
  p_source_id text,
  p_week_key date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = recon, fleet, public
AS $$
DECLARE
  d date;
  days date[];
  day_status text;
  out jsonb := '{}'::jsonb;
  week_status text;
  stmt_sources text[] := ARRAY[
    'uber_bundle',
    'indrive_trips',
    'toll_usage',
    'toll_topup',
    'fuel_card_roam',
    'fuel_card_self'
  ];
  daily_sources text[] := ARRAY[
    'roam_trips',
    'cash_tolls',
    'cash_fuel',
    'rush_deliveries',
    'uber_activity_timeline'
  ];
BEGIN
  IF extract(isodow FROM p_week_key) <> 1 THEN
    RAISE EXCEPTION 'week_key must be a Monday (ADR 0007)';
  END IF;

  IF p_source_id = 'cod_remittance' THEN
    RETURN '{}'::jsonb;
  END IF;

  IF p_source_id = ANY (stmt_sources) THEN
    IF recon._week_all_days_attest_none(p_org, p_line, p_source_id, p_week_key) THEN
      week_status := 'zero_attested';
    ELSIF recon._week_statement_received(p_org, p_source_id, p_week_key) THEN
      week_status := 'covered';
    ELSE
      week_status := 'missing';
    END IF;
    RETURN jsonb_build_object('week', week_status);
  END IF;

  days := recon._week_day_keys(p_week_key);
  FOREACH d IN ARRAY days
  LOOP
    IF EXISTS (
      SELECT 1
      FROM recon.source_attestations a
      WHERE a.organization_id = p_org
        AND a.service_line = p_line
        AND a.week_key = p_week_key
        AND a.source_id = p_source_id
        AND a.day = d
        AND a.kind = 'attest_none'
    ) THEN
      day_status := 'zero_attested';
    ELSIF p_source_id = ANY (daily_sources)
      AND recon._day_has_daily_rows(p_org, p_line, p_source_id, d) THEN
      day_status := 'covered';
    ELSE
      day_status := 'missing';
    END IF;
    out := out || jsonb_build_object(to_char(d, 'YYYY-MM-DD'), day_status);
  END LOOP;

  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_source_coverage(
  p_org text,
  p_line text,
  p_source_id text,
  p_week_key date
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = recon, fleet, public
AS $$
  SELECT recon.compute_source_coverage(p_org, p_line, p_source_id, p_week_key);
$$;

REVOKE ALL ON FUNCTION recon.compute_source_coverage(text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_source_coverage(text, text, text, date)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION recon.compute_source_coverage(text, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_source_coverage(text, text, text, date) TO service_role;

NOTIFY pgrst, 'reload schema';

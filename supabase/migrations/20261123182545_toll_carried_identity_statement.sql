-- Carried dispute / take-back / correction-down legs in owesFleetMinor are not part of this week's spend.
-- week_result_live exposes carriedOwesMinor and the three parts (same dres/cf CTEs as owes). Statements copy from
-- week_result (frozen when sealed); identity subtracts carried in finance-core only. Forward republish adds carried
-- keys to toll_week + driver statements for open-recon weeks that already have carried money — never restate frozen weeks.

DROP FUNCTION IF EXISTS toll_system.driver_carried_charged_minors(uuid, date, text);

CREATE OR REPLACE FUNCTION toll_system.week_result_live(p_company uuid, p_week date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_body jsonb;
  v_after jsonb;
BEGIN
  WITH ch AS (
    SELECT c.*
    FROM toll.v_live_charges c
    WHERE c.organization_id = p_company
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week
  ),
  posted AS (SELECT * FROM ch WHERE state NOT IN ('duplicate', 'rejected', 'unverified')),
  al AS (
    SELECT a.* FROM toll.allocations a JOIN posted p ON p.id = a.charge_id
    WHERE a.organization_id = p_company AND a.reversed_by IS NULL
  ),
  pb AS (
    SELECT p.*,
           coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                     WHERE u.organization_id = p_company AND u.payback_id = p.id AND u.reversed_by IS NULL), 0)::bigint
             AS unlinked_minor
    FROM toll.v_active_paybacks p
    WHERE p.organization_id = p_company AND p.week_key = p_week
  ),
  taken AS (
    SELECT r.* FROM toll.paybacks r
    WHERE r.organization_id = p_company AND r.reversal_of IS NOT NULL AND r.week_key = p_week
      AND NOT r.is_legacy AND NOT r.after_seal
  ),
  cf AS (
    SELECT f.kind, f.bearer, f.amount_minor, coalesce(c.driver_id, p.driver_id) AS driver_id, c.paid_by, p.received_by
    FROM toll.carried_facts f
    LEFT JOIN toll.charges c ON f.kind = 'correction_down' AND c.organization_id = f.organization_id AND c.id = f.original_id
    LEFT JOIN toll.paybacks p ON f.kind = 'take_back' AND p.organization_id = f.organization_id AND p.id = f.original_id
    WHERE f.organization_id = p_company AND f.to_week = p_week AND f.kind IN ('take_back', 'correction_down')
  ),
  dres AS (
    SELECT e.metadata ->> 'driverId' AS driver_id,
           sum(CASE WHEN e.metadata ->> 'toll_rule' LIKE 'P24%' THEN -1 ELSE 1 END
               * CASE WHEN (e.metadata ->> 'reverse')::boolean THEN -1 ELSE 1 END
               * e.amount_minor)::bigint AS amount_minor
    FROM ledger.entries e
    WHERE e.organization_id = p_company AND e.reference_type = 'toll'
      AND (e.metadata ->> 'toll_rule' LIKE 'P23\_dispute\_to\_driver%'
           OR e.metadata ->> 'toll_rule' LIKE 'P24\_expired\_refund\_driver%')
      AND e.metadata ? 'carried_fact_id'
      AND (e.metadata ->> 'toll_week')::date = p_week
    GROUP BY 1
  ),
  topups AS (
    SELECT t.* FROM toll.tag_topups t WHERE t.organization_id = p_company
  ),
  tag_usage AS (
    SELECT toll_system.charge_counted_week(p_company, c.id, c.week_key) AS wk, c.amount_minor
    FROM toll.v_live_charges c
    WHERE c.organization_id = p_company AND c.paid_by = 'tag' AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
  ),
  drivers AS (
    SELECT d.driver_id,
           coalesce((SELECT sum(a.amount_minor) FROM al a JOIN posted p ON p.id = a.charge_id
                     WHERE a.bearer = 'driver' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint
           + coalesce((SELECT sum(f.amount_minor) FROM cf f WHERE f.driver_id IS NOT DISTINCT FROM d.driver_id
                       AND ((f.kind = 'take_back' AND f.bearer = 'driver') OR (f.kind = 'correction_down' AND f.paid_by = 'cash'))), 0)::bigint
           + coalesce((SELECT sum(r.amount_minor) FROM dres r WHERE r.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS owes,
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
                     WHERE a.bearer = 'platform' AND NOT (a.provisional AND a.dispute_id IS NOT NULL)
                     AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS platform_borne,
           coalesce((SELECT sum(a.amount_minor) FROM al a JOIN posted p ON p.id = a.charge_id
                     WHERE a.bearer = 'fleet' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS fleet_borne,
           coalesce((SELECT sum(r.amount_minor) FROM dres r WHERE r.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS carried_dispute,
           coalesce((SELECT sum(f.amount_minor) FROM cf f WHERE f.driver_id IS NOT DISTINCT FROM d.driver_id
                       AND f.kind = 'take_back' AND f.bearer = 'driver'), 0)::bigint AS carried_take_back,
           coalesce((SELECT sum(f.amount_minor) FROM cf f WHERE f.driver_id IS NOT DISTINCT FROM d.driver_id
                       AND f.kind = 'correction_down' AND f.paid_by = 'cash'), 0)::bigint AS carried_corr_cash
    FROM (SELECT driver_id FROM posted UNION SELECT driver_id FROM pb WHERE received_by = 'driver'
          UNION SELECT driver_id FROM cf UNION SELECT driver_id FROM dres) d
    WHERE d.driver_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'contractVersion', 1,
    'companyId', p_company,
    'weekKey', p_week,
    'spend', jsonb_build_object(
      'tagMinor',   (SELECT coalesce(sum(amount_minor), 0) FROM posted WHERE paid_by = 'tag'),
      'cashMinor',  (SELECT coalesce(sum(amount_minor), 0) FROM posted WHERE paid_by = 'cash'),
      'totalMinor', (SELECT coalesce(sum(amount_minor), 0) FROM posted),
      'disputedMinor', (SELECT coalesce(sum(a.amount_minor), 0) FROM al a JOIN posted p ON p.id = a.charge_id
                              WHERE a.bearer = 'platform' AND a.provisional AND a.dispute_id IS NOT NULL)),
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
                  'spendMinor', spend, 'tagSpendMinor', tag_spend, 'cashSpendMinor', spend - tag_spend,
                  'platformMinor', platform_borne, 'fleetMinor', fleet_borne,
                  'carriedDisputeToDriver', carried_dispute,
                  'carriedTakeBackToDriver', carried_take_back,
                  'carriedCorrectionCashToDriver', carried_corr_cash,
                  'carriedOwesMinor', carried_dispute + carried_take_back + carried_corr_cash
                ) ORDER BY driver_id), '[]'::jsonb)
                FROM drivers),
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
                               'factsHash', md5((CASE WHEN coalesce((v_body #>> '{spend,disputedMinor}')::bigint, 0) = 0
                                                  THEN v_body #- '{spend,disputedMinor}' ELSE v_body END
                                             #- '{tagAccount,openingMinor}' #- '{tagAccount,closingMinor}')::text),
                               'engineVersion', 'toll_v2_phase1');
END;
$function$;

CREATE OR REPLACE FUNCTION toll_system.publish_driver_toll_statements(p_company uuid, p_week date, p_status text, p_actor text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result  jsonb := toll_system.week_result(p_company, p_week);
  d         record;
  v_line    jsonb;
  v_amounts jsonb;
  v_prior_closed uuid;
  v_next    int;
  v_n       int := 0;
BEGIN
  IF p_status NOT IN ('closed', 'draft') THEN RAISE EXCEPTION 'BAD_REQUEST: status closed or draft'; END IF;
  FOR d IN
    SELECT DISTINCT x.driver_id FROM (
      SELECT dfp.driver_id::text AS driver_id FROM public.driver_financial_periods dfp
      WHERE dfp.organization_id = p_company AND dfp.period_anchor = p_week
      UNION
      SELECT l ->> 'driverId' FROM jsonb_array_elements(coalesce(v_result -> 'drivers', '[]'::jsonb)) l
    ) x WHERE x.driver_id IS NOT NULL AND x.driver_id <> '' AND x.driver_id <> '*'
  LOOP
    v_line := NULL;
    SELECT l INTO v_line FROM jsonb_array_elements(coalesce(v_result -> 'drivers', '[]'::jsonb)) l
    WHERE l ->> 'driverId' = d.driver_id LIMIT 1;
    v_amounts := jsonb_build_object(
      'totalSpend',      coalesce((v_line ->> 'spendMinor')::bigint, 0),
      'chargedToDriver', coalesce((v_line ->> 'owesFleetMinor')::bigint, 0),
      'reimbursed',      coalesce((v_line ->> 'platformMinor')::bigint, 0),
      'netLoss',         coalesce((v_line ->> 'fleetMinor')::bigint, 0),
      'cashWashSpend',   coalesce((v_line ->> 'fleetOwesMinor')::bigint, 0),
      'tagSpend',        coalesce((v_line ->> 'tagSpendMinor')::bigint, 0),
      'disputed',        coalesce((
        SELECT sum(a.amount_minor) FROM toll.allocations a
        JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
        WHERE a.organization_id = p_company AND a.reversed_by IS NULL AND a.provisional AND a.bearer = 'platform'
          AND a.dispute_id IS NOT NULL AND c.driver_id = d.driver_id AND NOT c.is_legacy
          AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week), 0),
      'carriedDisputeToDriver',      coalesce((v_line ->> 'carriedDisputeToDriver')::bigint, 0),
      'carriedTakeBackToDriver',     coalesce((v_line ->> 'carriedTakeBackToDriver')::bigint, 0),
      'carriedCorrectionCashToDriver', coalesce((v_line ->> 'carriedCorrectionCashToDriver')::bigint, 0),
      'carriedOwesMinor',            coalesce((v_line ->> 'carriedOwesMinor')::bigint, 0));
    SELECT coalesce(max(ws.version), 0) + 1 INTO v_next FROM ledger.week_statements ws
    WHERE ws.organization_id = p_company AND ws.driver_id = d.driver_id AND ws.week_key = p_week AND ws.kind = 'toll';
    SELECT ws.id INTO v_prior_closed FROM ledger.week_statements ws
    WHERE ws.organization_id = p_company AND ws.driver_id = d.driver_id AND ws.week_key = p_week
      AND ws.kind = 'toll' AND ws.status = 'closed' ORDER BY ws.version DESC LIMIT 1;
    INSERT INTO ledger.week_statements (kind, organization_id, driver_id, week_key, version, status, amounts_minor,
                                        source_row_ids, source_hash, engine_version, closed_at, closed_by, close_reason,
                                        supersedes)
    VALUES ('toll', p_company, d.driver_id, p_week, v_next, p_status, v_amounts, '[]'::jsonb,
            md5(v_amounts::text || ':' || coalesce(v_result ->> 'factsHash', '')), 'toll_v2_phase1',
            CASE WHEN p_status = 'closed' THEN now() END, CASE WHEN p_status = 'closed' THEN p_actor END,
            CASE WHEN p_status = 'closed' THEN 'toll_v2_seal' END, v_prior_closed);
    IF p_status = 'closed' AND v_prior_closed IS NOT NULL THEN
      UPDATE ledger.week_statements SET status = 'restated' WHERE id = v_prior_closed;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.toll_sys_week_drivers(p_company uuid, p_week date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_row ledger.week_statements%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM ledger.week_statements ws
  WHERE ws.organization_id = p_company AND ws.kind = 'toll_week' AND ws.driver_id = '*' AND ws.week_key = p_week
  ORDER BY ws.version DESC LIMIT 1;
  IF FOUND AND v_row.status = 'closed' AND v_row.amounts_minor ? 'contractVersion' THEN
    RETURN jsonb_build_object('state', 'sealed', 'weekKey', p_week, 'drivers', coalesce(v_row.amounts_minor -> 'drivers', '[]'::jsonb));
  END IF;
  RETURN jsonb_build_object('state', 'open', 'weekKey', p_week,
                            'drivers', coalesce(toll_system.week_result_live(p_company, p_week) -> 'drivers', '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION toll_system.publish_driver_toll_statements(uuid, date, text, text) FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  r            record;
  v_live_drvs  jsonb;
  v_tw         ledger.week_statements%ROWTYPE;
  v_drv        jsonb;
  v_live       jsonb;
  v_patched    jsonb;
  v_new_drvs   jsonb;
BEGIN
  FOR r IN
    SELECT DISTINCT s.org, s.wk
    FROM (
      SELECT ws.organization_id AS org, ws.week_key AS wk
      FROM ledger.week_statements ws
      WHERE ws.kind = 'toll' AND ws.status = 'closed'
    ) s
    WHERE toll_system.week_is_sealed(s.org, s.wk)
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(toll_system.week_result_live(s.org, s.wk) -> 'drivers') d
        WHERE coalesce((d ->> 'carriedOwesMinor')::bigint, 0) > 0)
      AND EXISTS (
        SELECT 1 FROM ledger.week_statements ws
        WHERE ws.organization_id = s.org AND ws.week_key = s.wk AND ws.kind = 'toll'
          AND ws.status = 'closed' AND NOT (ws.amounts_minor ? 'carriedOwesMinor'))
      AND NOT EXISTS (
        SELECT 1 FROM recon.week_runs wr
        WHERE wr.organization_id = s.org::text AND wr.week_key = s.wk AND wr.state = 'closed')
      AND NOT EXISTS (
        SELECT 1 FROM public.driver_financial_periods p
        WHERE p.organization_id = s.org AND p.period_anchor = s.wk
          AND recon.dfp_period_is_frozen(
                p.metadata, p.settlement_status::text, p.status::text, p.closed_at))
  LOOP
    v_live_drvs := coalesce(toll_system.week_result_live(r.org, r.wk) -> 'drivers', '[]'::jsonb);
    SELECT * INTO v_tw FROM ledger.week_statements ws
    WHERE ws.organization_id = r.org AND ws.kind = 'toll_week' AND ws.driver_id = '*' AND ws.week_key = r.wk
    ORDER BY ws.version DESC LIMIT 1;
    IF FOUND AND v_tw.status = 'closed' THEN
      v_new_drvs := '[]'::jsonb;
      FOR v_drv IN SELECT * FROM jsonb_array_elements(coalesce(v_tw.amounts_minor -> 'drivers', '[]'::jsonb)) LOOP
        v_live := NULL;
        SELECT l INTO v_live FROM jsonb_array_elements(v_live_drvs) l
        WHERE l ->> 'driverId' IS NOT DISTINCT FROM (v_drv ->> 'driverId') LIMIT 1;
        v_patched := v_drv;
        IF v_live IS NOT NULL THEN
          v_patched := v_patched || jsonb_build_object(
            'carriedDisputeToDriver',      coalesce((v_live ->> 'carriedDisputeToDriver')::bigint, 0),
            'carriedTakeBackToDriver',     coalesce((v_live ->> 'carriedTakeBackToDriver')::bigint, 0),
            'carriedCorrectionCashToDriver', coalesce((v_live ->> 'carriedCorrectionCashToDriver')::bigint, 0),
            'carriedOwesMinor',            coalesce((v_live ->> 'carriedOwesMinor')::bigint, 0));
        END IF;
        v_new_drvs := v_new_drvs || jsonb_build_array(v_patched);
      END LOOP;
      UPDATE ledger.week_statements
      SET amounts_minor = jsonb_set(v_tw.amounts_minor, '{drivers}', v_new_drvs)
      WHERE id = v_tw.id;
    END IF;
    PERFORM toll_system.publish_driver_toll_statements(r.org, r.wk, 'closed', 'migration:20261123182545');
  END LOOP;
END;
$$;
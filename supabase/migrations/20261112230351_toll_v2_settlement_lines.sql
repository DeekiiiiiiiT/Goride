-- Toll rebuild Phase 1 P1-R4: driver settlement lines from toll v2.
--   1. TollWeekResultV1.drivers[] gains spendMinor, tagSpendMinor, cashSpendMinor, platformMinor, fleetMinor.
--   2. seal_week also writes each driver's toll statement (kind 'toll', closed); reopen writes a draft for each.
--   3. public.toll_sys_driver_week_tolls(company, week, driver): the settlement seam's v2 source (service key only).
-- Mapping used by settlement for v2 companies: tollPersonal = owesFleetMinor, tollCashWash = fleetOwesMinor,
-- tollSpend = spendMinor, tollReimbursed = platformMinor (Part F, P1-R4 plan).

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
                     WHERE a.bearer = 'driver' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS owes,
           coalesce((SELECT sum(p.amount_minor) FROM posted p
                     WHERE p.paid_by = 'cash' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS fleet_owes,
           coalesce((SELECT sum(b.amount_minor) FROM pb b
                     WHERE b.received_by = 'driver' AND b.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS recovered,
           coalesce((SELECT sum(p.amount_minor) FROM posted p WHERE p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS spend,
           coalesce((SELECT sum(p.amount_minor) FROM posted p
                     WHERE p.paid_by = 'tag' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS tag_spend,
           coalesce((SELECT sum(a.amount_minor) FROM al a JOIN posted p ON p.id = a.charge_id
                     WHERE a.bearer = 'platform' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS platform_borne,
           coalesce((SELECT sum(a.amount_minor) FROM al a JOIN posted p ON p.id = a.charge_id
                     WHERE a.bearer = 'fleet' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS fleet_borne
    FROM (SELECT driver_id FROM posted UNION SELECT driver_id FROM pb WHERE received_by = 'driver') d
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

-- Each driver's toll statement for a week (ledger.week_statements kind 'toll'), in the format today's close checks
-- read (closeInvariantInput.tollStatementForClose; amounts in minor units). Same versioning as publishWeekStatement
-- (week_statements.ts): next version, supersedes the prior closed row, which becomes 'restated' when a new closed row
-- lands. Every driver with a week in this period gets one, zero when they had no tolls (like zero_activity_na today).
CREATE OR REPLACE FUNCTION toll_system.publish_driver_toll_statements(p_company uuid, p_week date, p_status text, p_actor text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
      'tagSpend',        coalesce((v_line ->> 'tagSpendMinor')::bigint, 0));
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

-- Every driver's toll lines for one company-week, in one call (code review #10: settlement fetches this once per
-- company-week and caches it for the rebuild run, instead of recomputing the whole week per driver). Sealed: the frozen
-- lines straight from the statement (no live recompute). Open: the live lines. Service key only.
CREATE OR REPLACE FUNCTION public.toll_sys_week_drivers(p_company uuid, p_week date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
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
REVOKE ALL ON FUNCTION public.toll_sys_week_drivers(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_week_drivers(uuid, date) TO service_role;

-- The driver's toll line for settlement (service key only; the settlement seam reads it for v2 companies).
-- Sealed result once sealed, live before (I17). line is null when the driver has no tolls that week.
CREATE OR REPLACE FUNCTION public.toll_sys_driver_week_tolls(p_company uuid, p_week date, p_driver text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object('state', r ->> 'state', 'weekKey', p_week, 'line',
           (SELECT l FROM jsonb_array_elements(coalesce(r -> 'drivers', '[]'::jsonb)) l WHERE l ->> 'driverId' = p_driver LIMIT 1))
  FROM (SELECT toll_system.week_result(p_company, p_week) AS r) x;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_seal_week(p_company uuid, p_decision_id uuid, p_command_id text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_week      date := (p_body ->> 'week_key')::date;
  v_expected  integer := (p_body ->> 'expected_week_version')::integer;
  v_current   integer;
  v_blockers  jsonb;
  v_line      integer := 0;
  v_awaiting  record;
  v_new_ver   integer;
BEGIN
  IF v_week IS NULL OR v_expected IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('week_key', 'expected_week_version')));
  END IF;
  IF v_week <> date_trunc('week', v_week)::date THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('week_key', 'must be a Monday (ADR 0007)'));
  END IF;
  -- P1-R2: a week can only be sealed once it has ended (Sunday 23:59:59 Jamaica has passed). More tolls can still
  -- arrive in an unfinished week, and late facts must always have an open (current) week to be carried into.
  IF v_week + 7 > (now() AT TIME ZONE 'America/Jamaica')::date THEN
    PERFORM toll_write.refuse('WEEK_NOT_ENDED', jsonb_build_object('week_key', v_week));
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('toll_week:' || p_company || ':' || v_week, 0));

  v_current := toll_system.week_version(p_company, v_week);
  IF v_current <> v_expected THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object('week_key', v_week, 'week_version', v_current));
  END IF;
  IF toll_system.week_is_sealed(p_company, v_week) THEN
    PERFORM toll_write.refuse('WEEK_SEALED', jsonb_build_object('sealed_weeks', jsonb_build_array(v_week)));
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'id', b.id, 'amountMinor', b.amount_minor, 'reason', b.reason)
                            ORDER BY b.kind, b.id), '[]'::jsonb)
  INTO v_blockers
  FROM toll_system.seal_blockers(p_company, v_week) b;
  IF jsonb_array_length(v_blockers) > 0 THEN
    PERFORM toll_write.refuse('PENDING_NOT_RESOLVED', jsonb_build_object('week_key', v_week, 'blocking', v_blockers));
  END IF;

  FOR v_awaiting IN
    SELECT c.id, c.occurred_at, c.driver_id, (c.amount_minor - c.allocated_minor)::bigint AS open_minor
    FROM toll.v_live_charges c
    WHERE c.organization_id = p_company AND c.state = 'awaiting_cash'
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = v_week
  LOOP
    CONTINUE WHEN v_awaiting.open_minor <= 0;
    v_line := v_line + 1;
    INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, provisional, decision_id)
    VALUES (p_company, v_awaiting.id, 'fleet', v_awaiting.open_minor, 'awaiting_cash_at_seal', true, p_decision_id);
    PERFORM toll_system.post(p_company, 'P8_allocate_fleet', v_awaiting.open_minor, v_awaiting.occurred_at,
                             p_command_id, v_line,
                             jsonb_build_object('charge_id', v_awaiting.id, 'driver_id', v_awaiting.driver_id));
  END LOOP;

  v_new_ver := v_current + 1;
  INSERT INTO ledger.week_statements (kind, organization_id, driver_id, week_key, version, status,
                                      amounts_minor, source_row_ids, source_hash, engine_version,
                                      closed_at, closed_by, close_reason)
  VALUES ('toll_week', p_company, '*', v_week, v_new_ver, 'closed',
          toll_system.week_summary(p_company, v_week), '[]'::jsonb, toll_system.week_hash(p_company, v_week),
          'toll_v2_phase0', now(), auth.uid()::text, 'seal_week');

  -- P1-R4: each driver's toll statement (kind 'toll'), so today's driver close checks and settlement agree with v2.
  PERFORM toll_system.publish_driver_toll_statements(p_company, v_week, 'closed', auth.uid()::text);

  RETURN jsonb_build_object(
    'decision_id', p_decision_id,
    'weeks', jsonb_build_array(jsonb_build_object('week_key', v_week, 'week_version', v_new_ver,
                                                  'delta', jsonb_build_object('sealed', true, 'provisional', v_line))));
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_reopen_week(p_company uuid, p_decision_id uuid, p_command_id text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_week     date := (p_body ->> 'week_key')::date;
  v_expected integer := (p_body ->> 'expected_week_version')::integer;
  v_reason   text := nullif(btrim(p_body ->> 'reason'), '');
  v_current  integer;
  v_new_ver  integer;
BEGIN
  IF v_week IS NULL OR v_expected IS NULL OR v_reason IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('week_key', 'expected_week_version', 'reason')));
  END IF;

  -- Exclusive week lock: an import arriving now waits, then sees the reopened state (B3 "WEEK_REOPENING")
  PERFORM pg_advisory_xact_lock(hashtextextended('toll_week:' || p_company || ':' || v_week, 0));

  v_current := toll_system.week_version(p_company, v_week);
  IF v_current <> v_expected THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object('week_key', v_week, 'week_version', v_current));
  END IF;
  IF NOT toll_system.week_is_sealed(p_company, v_week) THEN
    PERFORM toll_write.refuse('WEEK_NOT_SEALED', jsonb_build_object('week_key', v_week));
  END IF;

  -- B6: refused once any driver of that week has been paid (a late fact then uses carry_forward)
  IF EXISTS (SELECT 1 FROM ledger.settlement_movements m
             WHERE m.organization_id = p_company AND m.period_anchor = v_week
               AND m.kind IN ('pay', 'write_off') AND m.status = 'posted') THEN
    PERFORM toll_write.refuse('DRIVERS_ALREADY_PAID', jsonb_build_object('week_key', v_week, 'use', 'carry_forward'));
  END IF;

  v_new_ver := v_current + 1;
  INSERT INTO ledger.week_statements (kind, organization_id, driver_id, week_key, version, status,
                                      amounts_minor, source_row_ids, engine_version, close_reason)
  VALUES ('toll_week', p_company, '*', v_week, v_new_ver, 'draft',
          '{}'::jsonb, '[]'::jsonb, 'toll_v2_phase0', 'reopen: ' || v_reason);

  PERFORM toll_system.publish_driver_toll_statements(p_company, v_week, 'draft', auth.uid()::text);

  INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, new_row, actor_user_id)
  VALUES (p_company, 'ledger.week_statements', 'toll_week:' || v_week, 'reopen',
          jsonb_build_object('week_version', v_new_ver, 'reason', v_reason, 'decision_id', p_decision_id), auth.uid());

  RETURN jsonb_build_object(
    'decision_id', p_decision_id,
    'weeks', jsonb_build_array(jsonb_build_object('week_key', v_week, 'week_version', v_new_ver,
                                                  'delta', jsonb_build_object('sealed', false))));
END;
$$;

REVOKE ALL ON FUNCTION toll_system.publish_driver_toll_statements(uuid, date, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.toll_sys_driver_week_tolls(uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_driver_week_tolls(uuid, date, text) TO service_role;

-- P1-R4: check 3 covers every account Phase 1 posts to.
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
  -- P18 / P19 legs join when Phase 2 builds those intents.
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
                FROM pl WHERE pl.wk = w.wk), 0) AS unalloc_flow,
      coalesce((SELECT sum(p.amount_minor - p.allocated_minor) FROM toll.v_active_paybacks p
                WHERE p.organization_id = p_company AND p.week_key = w.wk), 0) AS unalloc_expected,
      -- expense: +P8 (charge week) −P20 (carried-to week)
      coalesce((SELECT sum(amt) FROM cl WHERE cl.wk = w.wk AND rule ~ '^P8_'), 0)
        - coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P20_'), 0) AS expense_flow,
      coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a JOIN toll.v_live_charges c
                  ON c.organization_id = a.organization_id AND c.id = a.charge_id
                WHERE a.organization_id = p_company AND a.bearer = 'fleet' AND a.reversed_by IS NULL
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0)
        - coalesce((SELECT sum(f.amount_minor) FROM toll.carried_facts f
                    WHERE f.organization_id = p_company AND f.kind = 'cash_recovered' AND f.to_week = w.wk), 0) AS expense_expected,
      -- receivable_driver: +P7 (charge week)
      coalesce((SELECT sum(amt) FROM cl WHERE cl.wk = w.wk AND rule ~ '^P7_'), 0) AS rd_flow,
      coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a JOIN toll.v_live_charges c
                  ON c.organization_id = a.organization_id AND c.id = a.charge_id
                WHERE a.organization_id = p_company AND a.bearer = 'driver' AND a.reversed_by IS NULL
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0) AS rd_expected,
      -- payable_driver: +P3 +P16up_cash −P16down_cash (charge week)
      coalesce((SELECT sum(CASE WHEN rule ~ '^(P3_|P16_up_cash)' THEN amt WHEN rule ~ '^P16_down_cash' THEN -amt ELSE 0 END)
                FROM cl WHERE cl.wk = w.wk), 0) AS pd_flow,
      coalesce((SELECT sum(c.amount_minor) FROM toll.v_live_charges c
                WHERE c.organization_id = p_company AND c.paid_by = 'cash' AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0) AS pd_expected,
      -- tag_prepaid: +P1 (top-up week) −P2 −P16up_tag +P16down_tag (charge week)
      coalesce((SELECT sum(amt) FROM tl WHERE tl.wk = w.wk AND rule ~ '^P1_'), 0)
        - coalesce((SELECT sum(CASE WHEN rule ~ '^(P2_|P16_up_tag)' THEN amt WHEN rule ~ '^P16_down_tag' THEN -amt ELSE 0 END)
                    FROM cl WHERE cl.wk = w.wk), 0) AS tag_flow,
      coalesce((SELECT sum(t.amount_minor) FROM toll.tag_topups t WHERE t.organization_id = p_company AND t.week_key = w.wk), 0)
        - coalesce((SELECT sum(c.amount_minor) FROM toll.v_live_charges c
                    WHERE c.organization_id = p_company AND c.paid_by = 'tag' AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0) AS tag_expected,
      -- receivable_platform: +P4 (payback week); recovered_in_driver_cash: +P5 (payback week) +P20 (carried-to week)
      coalesce((SELECT sum(amt) FROM pl WHERE pl.wk = w.wk AND rule ~ '^P4_'), 0) AS rp_flow,
      -- every recorded payback counts + in its week, every take-back − in the take-back's week (P17 reverses P4/P5)
      coalesce((SELECT sum(CASE WHEN p.reversal_of IS NULL THEN p.amount_minor ELSE -p.amount_minor END) FROM toll.paybacks p
                WHERE p.organization_id = p_company AND p.received_by = 'fleet' AND p.week_key = w.wk
                  AND NOT p.is_legacy AND NOT p.after_seal), 0) AS rp_expected,
      coalesce((SELECT sum(amt) FROM pl WHERE pl.wk = w.wk AND rule ~ '^P5_'), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P20_'), 0) AS rc_flow,
      coalesce((SELECT sum(CASE WHEN p.reversal_of IS NULL THEN p.amount_minor ELSE -p.amount_minor END) FROM toll.paybacks p
                WHERE p.organization_id = p_company AND p.received_by = 'driver' AND p.week_key = w.wk
                  AND NOT p.is_legacy AND NOT p.after_seal), 0)
        + coalesce((SELECT sum(f.amount_minor) FROM toll.carried_facts f
                    WHERE f.organization_id = p_company AND f.kind = 'cash_recovered' AND f.to_week = w.wk), 0) AS rc_expected
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

-- P1-R4: any toll v2 change that moves a driver's toll lines asks for that driver week to be rebuilt, through the same
-- outbox the old system uses (ledger.financial_outbox, period_projection_refresh → processFinancialOutbox, which skips
-- signed weeks by itself). One trigger covers every path: commands, Roam native, seal, and Phase 2's intents.
CREATE OR REPLACE FUNCTION toll.tg_enqueue_period_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org     uuid;
  v_driver  text;
  v_week    date;
  v_odriver text;      -- the row's driver / week BEFORE an update (a moved toll must refresh both sides)
  v_oweek   date;
BEGIN
  IF TG_TABLE_NAME = 'allocations' THEN
    SELECT c.organization_id, c.driver_id, toll_system.charge_counted_week(c.organization_id, c.id, c.week_key)
      INTO v_org, v_driver, v_week
    FROM toll.charges c WHERE c.organization_id = NEW.organization_id AND c.id = NEW.charge_id;
  ELSIF TG_TABLE_NAME = 'charges' THEN
    v_org := NEW.organization_id; v_driver := NEW.driver_id;
    v_week := toll_system.charge_counted_week(NEW.organization_id, NEW.id, NEW.week_key);
    IF TG_OP = 'UPDATE' THEN
      v_odriver := OLD.driver_id;
      v_oweek := toll_system.charge_counted_week(OLD.organization_id, OLD.id, OLD.week_key);
    END IF;
  ELSE  -- paybacks
    v_org := NEW.organization_id; v_driver := NEW.driver_id; v_week := NEW.week_key;
    IF TG_OP = 'UPDATE' THEN v_odriver := OLD.driver_id; v_oweek := OLD.week_key; END IF;
  END IF;

  IF NOT toll_system.tolls_v2_on(v_org) THEN
    RETURN NULL;
  END IF;

  IF v_driver IS NOT NULL AND v_week IS NOT NULL THEN
    INSERT INTO ledger.financial_outbox (topic, payload)
    VALUES ('period_projection_refresh',
            jsonb_build_object('driver_id', v_driver, 'period_anchor', v_week, 'domain', 'toll_v2',
                               'event_type', 'toll_v2_' || TG_TABLE_NAME || '_' || lower(TG_OP), 'organization_id', v_org));
  END IF;
  IF v_odriver IS NOT NULL AND v_oweek IS NOT NULL
     AND (v_odriver IS DISTINCT FROM v_driver OR v_oweek IS DISTINCT FROM v_week) THEN
    INSERT INTO ledger.financial_outbox (topic, payload)
    VALUES ('period_projection_refresh',
            jsonb_build_object('driver_id', v_odriver, 'period_anchor', v_oweek, 'domain', 'toll_v2',
                               'event_type', 'toll_v2_' || TG_TABLE_NAME || '_moved_from', 'organization_id', v_org));
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER toll_allocations_period_refresh AFTER INSERT OR UPDATE ON toll.allocations
  FOR EACH ROW EXECUTE FUNCTION toll.tg_enqueue_period_refresh();
CREATE TRIGGER toll_charges_period_refresh AFTER INSERT OR UPDATE ON toll.charges
  FOR EACH ROW EXECUTE FUNCTION toll.tg_enqueue_period_refresh();
CREATE TRIGGER toll_paybacks_period_refresh AFTER INSERT OR UPDATE ON toll.paybacks
  FOR EACH ROW EXECUTE FUNCTION toll.tg_enqueue_period_refresh();
REVOKE ALL ON FUNCTION toll.tg_enqueue_period_refresh() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

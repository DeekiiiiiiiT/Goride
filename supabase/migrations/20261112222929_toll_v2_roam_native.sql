-- Toll rebuild Phase 1 P1-R2: Roam rides into toll v2 (native, no matching).
-- Design: docs/toll-architecture.md B2 (Roam), B6 (provisional seal), B10, Part F Phase 1 decisions.
--   toll_system.native_ride_charge(company, ride)  : at ride end. Charges per crossing (P2 tag / P3 cash, verified);
--       a card ride also gets its payback + allocations now; a cash ride's charges wait (awaiting_cash).
--   toll_system.native_cash_settled(company, ride) : when the ride's cash is settled. Three-way branch (C1):
--       week open → payback + allocations (reversing a provisional seal decision first if the week was reopened);
--       week sealed → a cash_recovered carried fact in the open week + P20.
--   public.toll_sys_native_ride_charge / public.toll_sys_native_cash_settled : service key only, for the rides service.
-- Both are no-ops unless the company has tolls_v2 on (one system per company, B11), and repeat-safe per ride.
--
-- Rider toll paid = estimated + max(0, actual − estimated) (the quote holds the estimate; a lower actual is not
-- refunded). The part above the actual crossings is left unlinked by the system (reason roam_estimate_over_actual).
-- received_by: card → 'fleet' when organizations.fleet_org_payout_enabled, else 'driver' (wallet); cash → 'driver'.
-- Known limit (Part E): crossings of one ride are assumed to fall in one toll week.

CREATE OR REPLACE FUNCTION toll_system.tolls_v2_on(p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT s.tolls_v2 FROM toll.switch_state s WHERE s.organization_id = p_company), false);
$$;

-- Link a payback to the ride's undecided charges (P6), then leave any leftover unlinked by the system.
-- Returns the next free ledger line.
CREATE OR REPLACE FUNCTION toll_system.native_link_payback(p_company uuid, p_ride text, p_payback uuid,
                                                          p_decision uuid, p_cmd text, p_line int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_left bigint;
  v_take bigint;
  c record;
  v_line int := p_line;
BEGIN
  SELECT p.amount_minor INTO v_left FROM toll.paybacks p WHERE p.organization_id = p_company AND p.id = p_payback;

  FOR c IN
    SELECT ch.id, ch.occurred_at, ch.driver_id, (ch.amount_minor - ch.allocated_minor)::bigint AS open_minor
    FROM toll.v_live_charges ch
    WHERE ch.organization_id = p_company AND ch.native_ride_id = p_ride
      AND ch.state IN ('pending', 'awaiting_cash')
    ORDER BY ch.occurred_at, ch.id
  LOOP
    EXIT WHEN v_left <= 0;
    CONTINUE WHEN c.open_minor <= 0;
    v_take := least(v_left, c.open_minor);
    INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id)
    VALUES (p_company, c.id, 'platform', v_take, p_payback, 'roam_native', p_decision);
    PERFORM toll_system.post(p_company, 'P6_allocate_platform', v_take, c.occurred_at, p_cmd, v_line,
                             jsonb_build_object('charge_id', c.id, 'payback_id', p_payback, 'driver_id', c.driver_id));
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = c.id;
    v_line := v_line + 1;
    v_left := v_left - v_take;
  END LOOP;

  IF v_left > 0 THEN
    INSERT INTO toll.payback_unlinked_decisions (organization_id, payback_id, amount_minor, reason, decision_id)
    VALUES (p_company, p_payback, v_left, 'roam_estimate_over_actual', p_decision);
  END IF;
  RETURN v_line;
END;
$$;

-- Ride end.
CREATE OR REPLACE FUNCTION toll_system.native_ride_charge(p_company uuid, p_ride jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ride      text := nullif(btrim(p_ride ->> 'ride_id'), '');
  v_cmd       text;
  v_decision  uuid;
  v_stored    jsonb;
  v_cash      boolean := (p_ride ->> 'payment_method') = 'cash';
  v_driver    text := nullif(p_ride ->> 'driver_id', '');
  v_vehicle   text := nullif(p_ride ->> 'vehicle_id', '');
  v_ended     timestamptz := coalesce((p_ride ->> 'ended_at')::timestamptz, now());
  v_est       bigint := greatest(coalesce((p_ride ->> 'estimated_tolls_minor')::bigint, 0), 0);
  v_actual    bigint := 0;
  v_paid      bigint;
  v_line      int := 0;
  v_charge    uuid;
  v_payback   uuid;
  v_received  text;
  x           jsonb;
  v_charges   int := 0;
  v_paid_by   text;
  v_evidence  text;
BEGIN
  IF p_company IS NULL OR v_ride IS NULL THEN RAISE EXCEPTION 'BAD_REQUEST: company and ride_id required'; END IF;
  IF NOT toll_system.tolls_v2_on(p_company) THEN RETURN jsonb_build_object('skipped', 'tolls_v2_off'); END IF;
  IF (p_ride ->> 'payment_method') NOT IN ('cash', 'card') THEN RAISE EXCEPTION 'BAD_REQUEST: payment_method cash or card'; END IF;

  v_cmd := 'native_ride:' || v_ride;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_job, targets)
  VALUES (p_company, v_cmd, 'native_ride_charge', 'system', 'native_ride_charge', p_ride)
  ON CONFLICT (organization_id, command_id) DO NOTHING
  RETURNING id INTO v_decision;
  IF v_decision IS NULL THEN
    SELECT d.response INTO v_stored FROM toll.decisions d WHERE d.organization_id = p_company AND d.command_id = v_cmd;
    RETURN coalesce(v_stored, '{}'::jsonb) || jsonb_build_object('replay', true);
  END IF;

  -- One charge per crossing (certain: the app saw the plaza). Tag or cash: the caller's paid_by if given; otherwise
  -- tag when the ride's vehicle had an active toll tag at the crossing (fleet.toll_tag_assignments), else cash.
  -- Vehicle unknown → cash but UNVERIFIED: not posted (I19), blocks the seal until a person verifies or rejects it.
  FOR x IN SELECT value FROM jsonb_array_elements(coalesce(p_ride -> 'crossings', '[]'::jsonb))
           ORDER BY (value ->> 'crossed_at')::timestamptz, value ->> 'id'
  LOOP
    IF coalesce((x ->> 'amount_minor')::bigint, 0) <= 0 OR coalesce(x ->> 'paid_by', 'tag') NOT IN ('tag', 'cash') THEN
      RAISE EXCEPTION 'BAD_REQUEST: crossing % needs amount_minor > 0 and paid_by tag, cash or omitted', x ->> 'id';
    END IF;
    v_paid_by := coalesce(x ->> 'paid_by',
      CASE WHEN v_vehicle IS NULL THEN 'cash'
           WHEN EXISTS (SELECT 1 FROM fleet.toll_tag_assignments ta
                        WHERE ta.organization_id = p_company::text AND ta.vehicle_id = v_vehicle
                          AND ta.assigned_at <= (x ->> 'crossed_at')::timestamptz
                          AND (ta.unassigned_at IS NULL OR ta.unassigned_at > (x ->> 'crossed_at')::timestamptz))
             THEN 'tag'
           ELSE 'cash' END);
    v_evidence := CASE WHEN x ->> 'paid_by' IS NULL AND v_vehicle IS NULL THEN 'unverified' ELSE 'verified' END;
    INSERT INTO toll.charges (organization_id, vehicle_id, driver_id, plaza_id, occurred_at, week_key, time_precision,
                              amount_minor, paid_by, source, source_ref, evidence_status, awaiting_cash, native_ride_id)
    VALUES (p_company, v_vehicle, v_driver, x ->> 'plaza_id', (x ->> 'crossed_at')::timestamptz,
            ledger.jamaica_week_start((x ->> 'crossed_at')::timestamptz), 'exact',
            (x ->> 'amount_minor')::bigint, v_paid_by, 'roam_ride', 'roam_crossing:' || (x ->> 'id'), v_evidence,
            v_cash, v_ride)
    RETURNING id INTO v_charge;
    IF v_evidence = 'verified' THEN
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, CASE WHEN v_paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END,
                               (x ->> 'amount_minor')::bigint, (x ->> 'crossed_at')::timestamptz, v_cmd, v_line,
                               jsonb_build_object('charge_id', v_charge, 'driver_id', v_driver));
    END IF;
    v_actual := v_actual + (x ->> 'amount_minor')::bigint;
    v_charges := v_charges + 1;
  END LOOP;

  -- Card ride: the rider has paid; record the payback now. Cash ride: wait for the cash (native_cash_settled).
  v_paid := v_est + greatest(v_actual - v_est, 0);
  IF NOT v_cash AND v_paid > 0 THEN
    SELECT CASE WHEN o.fleet_org_payout_enabled THEN 'fleet' ELSE 'driver' END INTO v_received
    FROM public.organizations o WHERE o.id = p_company;
    INSERT INTO toll.paybacks (organization_id, platform, kind, platform_trip_id, reference, driver_id, paid_on, week_key,
                               amount_minor, received_by)
    VALUES (p_company, 'roam', 'native', v_ride, 'roam:' || v_ride, v_driver, (v_ended AT TIME ZONE 'America/Jamaica')::date,
            ledger.jamaica_week_start(v_ended), v_paid, coalesce(v_received, 'driver'))
    RETURNING id INTO v_payback;
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, CASE WHEN coalesce(v_received, 'driver') = 'fleet' THEN 'P4_payback_fleet'
                                             ELSE 'P5_payback_driver' END,
                             v_paid, v_ended, v_cmd, v_line, jsonb_build_object('payback_id', v_payback, 'driver_id', v_driver));
    v_line := toll_system.native_link_payback(p_company, v_ride, v_payback, v_decision, v_cmd, v_line + 1);
  END IF;

  UPDATE toll.decisions SET response = jsonb_build_object('decision_id', v_decision, 'charges', v_charges,
                                                          'actual_minor', v_actual, 'payback_minor',
                                                          CASE WHEN v_cash THEN 0 ELSE v_paid END,
                                                          'awaiting_cash', v_cash AND v_charges > 0)
  WHERE id = v_decision;
  RETURN (SELECT d.response FROM toll.decisions d WHERE d.id = v_decision);
END;
$$;

-- Cash settled (C1: branch on the charge's week, never on the ride's state).
CREATE OR REPLACE FUNCTION toll_system.native_cash_settled(p_company uuid, p_ride jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ride      text := nullif(btrim(p_ride ->> 'ride_id'), '');
  v_outcome   text := p_ride ->> 'outcome';
  v_received  bigint := greatest(coalesce((p_ride ->> 'cash_received_minor')::bigint, 0), 0);
  v_settled   timestamptz := coalesce((p_ride ->> 'settled_at')::timestamptz, now());
  v_est       bigint := greatest(coalesce((p_ride ->> 'estimated_tolls_minor')::bigint, 0), 0);
  v_driver    text := nullif(p_ride ->> 'driver_id', '');
  v_cmd       text;
  v_decision  uuid;
  v_stored    jsonb;
  v_actual    bigint;
  v_paid      bigint;
  v_week      date;
  v_first     record;
  v_line      int := 0;
  v_payback   uuid;
  v_prov      bigint;
  v_recover   bigint;
  v_fact      uuid;
  v_branch    text;
  a           record;
  c           record;
BEGIN
  IF p_company IS NULL OR v_ride IS NULL THEN RAISE EXCEPTION 'BAD_REQUEST: company and ride_id required'; END IF;
  IF NOT toll_system.tolls_v2_on(p_company) THEN RETURN jsonb_build_object('skipped', 'tolls_v2_off'); END IF;
  IF v_outcome NOT IN ('exact', 'overpay', 'underpay', 'unpaid') THEN
    RAISE EXCEPTION 'BAD_REQUEST: outcome must be exact, overpay, underpay or unpaid';
  END IF;

  v_cmd := 'native_cash:' || v_ride;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_job, targets)
  VALUES (p_company, v_cmd, 'native_cash_settled', 'system', 'native_cash_settled', p_ride)
  ON CONFLICT (organization_id, command_id) DO NOTHING
  RETURNING id INTO v_decision;
  IF v_decision IS NULL THEN
    SELECT d.response INTO v_stored FROM toll.decisions d WHERE d.organization_id = p_company AND d.command_id = v_cmd;
    RETURN coalesce(v_stored, '{}'::jsonb) || jsonb_build_object('replay', true);
  END IF;

  SELECT coalesce(sum(ch.amount_minor), 0) INTO v_actual
  FROM toll.charges ch WHERE ch.organization_id = p_company AND ch.native_ride_id = v_ride AND NOT ch.is_legacy;
  v_paid := CASE v_outcome
              WHEN 'unpaid'   THEN 0
              WHEN 'underpay' THEN least(v_est + greatest(v_actual - v_est, 0), v_received)
              ELSE v_est + greatest(v_actual - v_est, 0) END;

  SELECT ch.id, ch.occurred_at, toll_system.charge_counted_week(p_company, ch.id, ch.week_key) AS wk INTO v_first
  FROM toll.charges ch WHERE ch.organization_id = p_company AND ch.native_ride_id = v_ride AND NOT ch.is_legacy
  ORDER BY ch.occurred_at, ch.id LIMIT 1;

  IF v_first.id IS NOT NULL AND toll_system.week_is_sealed(p_company, v_first.wk) THEN
    -- (The sealed week's own charges are not touched, not even their awaiting_cash flag: a sealed week stays frozen.)
    -- Sealed week: the provisional fleet decision stays; the cash that covered the toll is recovered in the open week.
    v_branch := 'sealed';
    SELECT coalesce(sum(al.amount_minor), 0) INTO v_prov
    FROM toll.allocations al JOIN toll.charges ch ON ch.organization_id = al.organization_id AND ch.id = al.charge_id
    WHERE al.organization_id = p_company AND ch.native_ride_id = v_ride AND al.provisional AND al.reversed_by IS NULL;
    v_recover := least(v_paid, v_prov);
    IF v_recover > 0 THEN
      v_week := ledger.jamaica_week_start(now());
      INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, bearer, decision_id)
      VALUES (p_company, 'cash_recovered', v_first.id, v_first.wk, v_week, v_recover, 'fleet', v_decision)
      RETURNING id INTO v_fact;
      PERFORM toll_system.post(p_company, 'P20_cash_recovered', v_recover, now(), v_cmd, 1,
                               jsonb_build_object('carried_fact_id', v_fact, 'driver_id', v_driver));
    END IF;
  ELSE
    v_branch := 'open';
    -- The cash is no longer awaited (open week only).
    UPDATE toll.charges SET awaiting_cash = false, version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND native_ride_id = v_ride AND awaiting_cash;
    -- Reopened after a provisional seal: reverse the provisional fleet decision first (C1), or P6 would overrun I4.
    FOR a IN
      SELECT al.id, al.charge_id, al.amount_minor, ch.occurred_at, ch.driver_id
      FROM toll.allocations al JOIN toll.charges ch ON ch.organization_id = al.organization_id AND ch.id = al.charge_id
      WHERE al.organization_id = p_company AND ch.native_ride_id = v_ride AND al.provisional AND al.reversed_by IS NULL
    LOOP
      v_line := v_line + 1;
      UPDATE toll.allocations SET reversed_by = v_decision WHERE organization_id = p_company AND id = a.id;
      PERFORM toll_system.post(p_company, 'P8_allocate_fleet', a.amount_minor, a.occurred_at, v_cmd, v_line,
                               jsonb_build_object('charge_id', a.charge_id, 'driver_id', a.driver_id), true);
      v_branch := 'reopened';
    END LOOP;

    IF v_paid > 0 THEN
      INSERT INTO toll.paybacks (organization_id, platform, kind, platform_trip_id, reference, driver_id, paid_on, week_key,
                                 amount_minor, received_by)
      VALUES (p_company, 'roam', 'native', v_ride, 'roam:' || v_ride, v_driver,
              (coalesce(v_first.occurred_at, v_settled) AT TIME ZONE 'America/Jamaica')::date,
              coalesce(v_first.wk, ledger.jamaica_week_start(v_settled)), v_paid, 'driver')
      RETURNING id INTO v_payback;
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, 'P5_payback_driver', v_paid, coalesce(v_first.occurred_at, v_settled), v_cmd, v_line,
                               jsonb_build_object('payback_id', v_payback, 'driver_id', v_driver));
      v_line := toll_system.native_link_payback(p_company, v_ride, v_payback, v_decision, v_cmd, v_line + 1) - 1;
    END IF;

    -- Underpay / unpaid: the rest is the fleet's at once (rider arrears live on the rider's wallet, not the ride).
    FOR c IN
      SELECT ch.id, ch.occurred_at, ch.driver_id, (ch.amount_minor - ch.allocated_minor)::bigint AS open_minor
      FROM toll.v_live_charges ch
      WHERE ch.organization_id = p_company AND ch.native_ride_id = v_ride AND ch.state = 'pending'
    LOOP
      CONTINUE WHEN c.open_minor <= 0;
      v_line := v_line + 1;
      INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, decision_id)
      VALUES (p_company, c.id, 'fleet', c.open_minor, 'rider_arrears', v_decision);
      PERFORM toll_system.post(p_company, 'P8_allocate_fleet', c.open_minor, c.occurred_at, v_cmd, v_line,
                               jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id));
    END LOOP;
  END IF;

  UPDATE toll.decisions SET response = jsonb_build_object('decision_id', v_decision, 'branch', v_branch,
                                                          'payback_minor', v_paid, 'recovered_minor', coalesce(v_recover, 0))
  WHERE id = v_decision;
  RETURN (SELECT d.response FROM toll.decisions d WHERE d.id = v_decision);
END;
$$;

-- Service-only entry points for the rides service (PostgREST exposes public, not toll_system).
CREATE OR REPLACE FUNCTION public.toll_sys_native_ride_charge(p_company uuid, p_ride jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT toll_system.native_ride_charge(p_company, p_ride);
$$;

CREATE OR REPLACE FUNCTION public.toll_sys_native_cash_settled(p_company uuid, p_ride jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT toll_system.native_cash_settled(p_company, p_ride);
$$;

REVOKE ALL ON FUNCTION public.toll_sys_native_ride_charge(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toll_sys_native_cash_settled(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_native_ride_charge(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.toll_sys_native_cash_settled(uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION toll_system.tolls_v2_on(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.native_link_payback(uuid, text, uuid, uuid, text, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.native_ride_charge(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll_system.native_cash_settled(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.native_ride_charge(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION toll_system.native_cash_settled(uuid, jsonb) TO service_role;

-- Seal refuses a week that has not ended yet (found while testing P1-R2).
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

  RETURN jsonb_build_object(
    'decision_id', p_decision_id,
    'weeks', jsonb_build_array(jsonb_build_object('week_key', v_week, 'week_version', v_new_ver,
                                                  'delta', jsonb_build_object('sealed', true, 'provisional', v_line))));
END;
$$;

NOTIFY pgrst, 'reload schema';

-- For the old toll paths (Toll Brain live materialize, POST /bridge-rides) and the rides hooks: is v2 on for a company?
-- Service key only. A v2 company must get the v2 path only (B11), or a Roam crossing would count twice.
CREATE OR REPLACE FUNCTION public.toll_sys_tolls_v2_on(p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT toll_system.tolls_v2_on(p_company);
$$;
REVOKE ALL ON FUNCTION public.toll_sys_tolls_v2_on(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_tolls_v2_on(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION toll_system.tolls_v2_on(uuid) TO service_role;

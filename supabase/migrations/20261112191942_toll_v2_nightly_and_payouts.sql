-- Toll rebuild Phase 0 R5: alerts, the week summary, nightly checks 1-7, the payout trigger, plaza rules.
-- Design: docs/toll-architecture.md B5 (nightly checks, payout trigger), B6 (seal snapshot), B2 (plaza rules), B12.
--
-- Clarification found while building (recorded in Part F): events that happen AFTER a seal by design
-- (platform payout P10/P11, driver settlement P12-P14) are dated when they happen, in the open week.
-- Dating them in the sealed week would be refused by I3.

-- 1. Alerts (same shape as recon.alerts: one OPEN alert per company + dedupe key) -----------------
CREATE TABLE toll.alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  kind            text NOT NULL CHECK (kind IN ('nightly_check', 'aging', 'payout_trigger')),
  severity        text NOT NULL CHECK (severity IN ('watch', 'page')),
  dedupe_key      text NOT NULL,
  title           text NOT NULL,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at     timestamptz
);
CREATE UNIQUE INDEX toll_alerts_open_uidx ON toll.alerts (organization_id, dedupe_key) WHERE resolved_at IS NULL;

CREATE TABLE toll.nightly_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  run_id          uuid NOT NULL,
  check_no        int NOT NULL CHECK (check_no BETWEEN 1 AND 7),
  name            text NOT NULL,
  ok              boolean NOT NULL,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX toll_nightly_results_org_run_idx ON toll.nightly_results (organization_id, created_at DESC);

-- What has been posted for each bank confirmation record (P10 + P11), so changes and deletes can be reversed.
CREATE TABLE toll.payout_postings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  source_ref      text NOT NULL,      -- the fleet_bank_confirm:org:<co>:<week>:<platform> key
  source_version  text NOT NULL,      -- md5 of the record's value
  week_key        date NOT NULL,
  platform        text NOT NULL,
  amount_minor    bigint NOT NULL CHECK (amount_minor >= 0),
  command_id      text NOT NULL,
  reversed_at     timestamptz,
  CONSTRAINT payout_postings_org_cmd_key UNIQUE (organization_id, command_id)
);
CREATE UNIQUE INDEX toll_payout_postings_active_uidx
  ON toll.payout_postings (organization_id, source_ref) WHERE reversed_at IS NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['alerts', 'nightly_results', 'payout_postings'] LOOP
    EXECUTE format('REVOKE ALL ON toll.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON toll.%I TO authenticated', t);
    EXECUTE format('ALTER TABLE toll.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON toll.%I FOR SELECT TO authenticated USING (organization_id = toll_read.current_company())',
                   t || '_company_read', t);
  END LOOP;
END $$;

-- nightly_results is strictly append-only:
CREATE OR REPLACE FUNCTION toll.tg_nightly_results_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'nightly_results is append-only: % not allowed', lower(TG_OP);
END $$;
CREATE TRIGGER nightly_results_append_only
  BEFORE UPDATE OR DELETE ON toll.nightly_results FOR EACH ROW EXECUTE FUNCTION toll.tg_nightly_results_append_only();

-- Raise or refresh an alert; resolve it when the condition is gone.
CREATE OR REPLACE FUNCTION toll_system.raise_alert(p_company uuid, p_kind text, p_severity text, p_key text,
                                                   p_title text, p_detail jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- clock_timestamp(), not now(): the nightly run resolves alerts "not seen since the run started",
  -- and now() is the transaction start, which is earlier than the run start.
  UPDATE toll.alerts SET last_seen_at = clock_timestamp(), detail = p_detail,
         severity = CASE WHEN p_severity = 'page' THEN 'page' ELSE severity END
  WHERE organization_id = p_company AND dedupe_key = p_key AND resolved_at IS NULL;
  IF NOT FOUND THEN
    INSERT INTO toll.alerts (organization_id, kind, severity, dedupe_key, title, detail, last_seen_at)
    VALUES (p_company, p_kind, p_severity, p_key, p_title, p_detail, clock_timestamp());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION toll_system.resolve_alerts_not_seen(p_company uuid, p_kind text, p_since timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE toll.alerts SET resolved_at = now()
  WHERE organization_id = p_company AND kind = p_kind AND resolved_at IS NULL AND last_seen_at < p_since;
$$;

-- 2. Small money helpers ------------------------------------------------------------------------
-- Natural balance: assets and expenses are debit-positive, liabilities credit-positive
-- (ledger.post_entry lowers the debit account's balance_minor and raises the credit account's).
CREATE OR REPLACE FUNCTION toll_system.natural_balance(p_company uuid, p_suffix text)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((
    SELECT CASE WHEN a.account_class IN ('asset', 'expense') THEN -a.balance_minor ELSE a.balance_minor END
    FROM ledger.accounts a
    WHERE a.account_key = 'org:' || p_company || ':' || p_suffix AND a.currency = 'JMD'), 0);
$$;

-- Net amount posted under rules matching a pattern (a reversal counts negative), optionally for one record.
CREATE OR REPLACE FUNCTION toll_system.rule_net(p_company uuid, p_rule_like text,
                                                p_ref_key text DEFAULT NULL, p_ref_id text DEFAULT NULL)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(sum(CASE WHEN (e.metadata ->> 'reverse')::boolean THEN -e.amount_minor ELSE e.amount_minor END), 0)::bigint
  FROM ledger.entries e
  WHERE e.organization_id = p_company
    AND e.reference_type = 'toll'
    AND e.metadata ->> 'toll_rule' LIKE p_rule_like
    AND (p_ref_key IS NULL OR e.metadata ->> p_ref_key = p_ref_id);
$$;

-- Active (non-legacy, not after-seal, posted) charges: not duplicate / rejected / unverified.
CREATE OR REPLACE VIEW toll.v_live_charges WITH (security_invoker = true) AS
  SELECT c.*,
         toll_system.charge_state(c.organization_id, c.id) AS state,
         coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                   WHERE a.organization_id = c.organization_id AND a.charge_id = c.id AND a.reversed_by IS NULL), 0)::bigint
           AS allocated_minor
  FROM toll.charges c
  WHERE NOT c.is_legacy AND NOT c.after_seal;
REVOKE ALL ON toll.v_live_charges FROM PUBLIC, anon, authenticated, service_role;

-- Active paybacks: not legacy, not after-seal, not a reversing row, not reversed.
CREATE OR REPLACE VIEW toll.v_active_paybacks WITH (security_invoker = true) AS
  SELECT p.*,
         coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                   WHERE a.organization_id = p.organization_id AND a.payback_id = p.id AND a.reversed_by IS NULL), 0)::bigint
           AS allocated_minor
  FROM toll.paybacks p
  WHERE NOT p.is_legacy AND NOT p.after_seal AND p.reversal_of IS NULL
    AND NOT EXISTS (SELECT 1 FROM toll.paybacks r WHERE r.organization_id = p.organization_id AND r.reversal_of = p.id);
REVOKE ALL ON toll.v_active_paybacks FROM PUBLIC, anon, authenticated, service_role;

-- 3. The week summary: what a seal freezes, and what check 4 recomputes ----------------------------
-- Phase 0 summary. Phase 1 replaces it with the full TollWeekResultV1 (B8) behind the same name.
CREATE OR REPLACE FUNCTION toll_system.week_summary(p_company uuid, p_week date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'charges', (SELECT count(*) FROM toll.v_live_charges c WHERE c.organization_id = p_company
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week),
    'charge_minor', (SELECT coalesce(sum(c.amount_minor), 0) FROM toll.v_live_charges c WHERE c.organization_id = p_company
                  AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week),
    'paybacks', (SELECT count(*) FROM toll.v_active_paybacks p WHERE p.organization_id = p_company AND p.week_key = p_week),
    'payback_minor', (SELECT coalesce(sum(p.amount_minor), 0) FROM toll.v_active_paybacks p
                  WHERE p.organization_id = p_company AND p.week_key = p_week),
    'provisional', (SELECT count(*) FROM toll.allocations a JOIN toll.charges c
                      ON c.organization_id = a.organization_id AND c.id = a.charge_id
                    WHERE a.organization_id = p_company AND a.provisional AND a.reversed_by IS NULL
                      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week));
$$;

CREATE OR REPLACE FUNCTION toll_system.week_hash(p_company uuid, p_week date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT md5(toll_system.week_summary(p_company, p_week)::text || ':' || p_week);
$$;

-- seal_week now freezes week_summary / week_hash (replaces the inline counts of R3).
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

-- 4. Nightly checks ----------------------------------------------------------------------------
-- One row per check line. ok = false is an alert, never a repair (B5).
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
  -- Phase 0 covers suspense (charge week), expense (charge week) and payback_unallocated (payback week);
  -- Phase 1 adds the rest against TollWeekResultV1.
  FOR r IN
    WITH legs AS (
      SELECT CASE WHEN (e.metadata ->> 'reverse')::boolean THEN -e.amount_minor ELSE e.amount_minor END AS amt,
             e.metadata ->> 'toll_rule' AS rule,
             (e.metadata ->> 'charge_id')::uuid AS charge_id,
             -- P17 rows carry the original payback_id AND reversing_payback_id; they count in the reversing payback's week
             coalesce((e.metadata ->> 'reversing_payback_id')::uuid, (e.metadata ->> 'payback_id')::uuid) AS payback_id
      FROM ledger.entries e
      WHERE e.organization_id = p_company AND e.reference_type = 'toll'
    ),
    weeks AS (
      SELECT DISTINCT toll_system.charge_counted_week(p_company, c.id, c.week_key) AS wk
      FROM toll.charges c WHERE c.organization_id = p_company AND NOT c.is_legacy AND NOT c.after_seal
      UNION
      SELECT p.week_key FROM toll.paybacks p WHERE p.organization_id = p_company AND NOT p.is_legacy AND NOT p.after_seal
    )
    SELECT w.wk,
      -- suspense flow of the week's charges: +P2 +P3 +P16up -P16down -P6 -P7 -P8
      coalesce((SELECT sum(CASE WHEN l.rule LIKE 'P2\_%' OR l.rule LIKE 'P3\_%' OR l.rule LIKE 'P16\_up\_%' THEN l.amt
                                WHEN l.rule LIKE 'P16\_down\_%' OR l.rule LIKE 'P6\_%' OR l.rule LIKE 'P7\_%'
                                  OR l.rule LIKE 'P8\_%' THEN -l.amt ELSE 0 END)
                FROM legs l JOIN toll.charges c ON c.organization_id = p_company AND c.id = l.charge_id
                WHERE toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0) AS suspense_flow,
      coalesce((SELECT sum(c.amount_minor - c.allocated_minor) FROM toll.v_live_charges c
                WHERE c.organization_id = p_company AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0) AS suspense_expected,
      -- payback_unallocated flow of the week's paybacks: +P4 +P5 -P6 (P17 legs are reversals of these, signed)
      coalesce((SELECT sum(CASE WHEN l.rule LIKE 'P4\_%' OR l.rule LIKE 'P5\_%' THEN l.amt
                                WHEN l.rule LIKE 'P6\_%' THEN -l.amt ELSE 0 END)
                FROM legs l JOIN toll.paybacks p ON p.organization_id = p_company AND p.id = l.payback_id
                WHERE p.week_key = w.wk), 0) AS unalloc_flow,
      coalesce((SELECT sum(p.amount_minor - p.allocated_minor) FROM toll.v_active_paybacks p
                WHERE p.organization_id = p_company AND p.week_key = w.wk), 0) AS unalloc_expected,
      toll_system.week_is_sealed(p_company, w.wk) AS sealed
    FROM weeks w
  LOOP
    CONTINUE WHEN r.sealed;
    check_no := 3; name := 'week_flow:' || r.wk;
    ok := r.suspense_flow = r.suspense_expected AND r.unalloc_flow = r.unalloc_expected;
    detail := jsonb_build_object('week', r.wk, 'suspense_flow', r.suspense_flow, 'suspense_expected', r.suspense_expected,
                                 'unallocated_flow', r.unalloc_flow, 'unallocated_expected', r.unalloc_expected);
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

-- Check 6 (aging) is computed by the nightly run, which raises 'aging' alerts.
CREATE OR REPLACE FUNCTION toll_system.aging_alerts(p_company uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.id, c.state, c.created_at FROM toll.v_live_charges c
    WHERE c.organization_id = p_company
      AND ((c.state = 'pending' AND c.created_at < now() - interval '14 days')
        OR (c.state = 'unverified' AND c.created_at < now() - interval '7 days'))
  LOOP
    PERFORM toll_system.raise_alert(p_company, 'aging', 'watch', 'aging:charge:' || r.id,
      CASE r.state WHEN 'pending' THEN 'Toll undecided for over 14 days' ELSE 'Cash receipt unchecked for over 7 days' END,
      jsonb_build_object('charge_id', r.id, 'state', r.state, 'since', r.created_at));
  END LOOP;

  FOR r IN
    SELECT p.id, p.created_at, (p.amount_minor - p.allocated_minor) AS open_minor FROM toll.v_active_paybacks p
    WHERE p.organization_id = p_company AND p.amount_minor > p.allocated_minor
      AND NOT EXISTS (SELECT 1 FROM toll.payback_unlinked_decisions u WHERE u.organization_id = p_company
                        AND u.payback_id = p.id AND u.reversed_by IS NULL)
      AND p.created_at < now() - interval '14 days'
  LOOP
    PERFORM toll_system.raise_alert(p_company, 'aging', 'watch', 'aging:payback:' || r.id,
      'Payback money not given to a toll for over 14 days', jsonb_build_object('payback_id', r.id, 'open_minor', r.open_minor));
  END LOOP;

  FOR r IN
    SELECT 'charge' AS kind, c.id, c.created_at, false AS is_reversal FROM toll.charges c
    WHERE c.organization_id = p_company AND c.after_seal AND NOT c.is_legacy AND c.created_at < now() - interval '14 days'
    UNION ALL
    SELECT 'payback', p.id, p.created_at, p.reversal_of IS NOT NULL FROM toll.paybacks p
    WHERE p.organization_id = p_company AND p.after_seal AND NOT p.is_legacy
      AND p.created_at < now() - CASE WHEN p.reversal_of IS NOT NULL THEN interval '7 days' ELSE interval '14 days' END
  LOOP
    PERFORM toll_system.raise_alert(p_company, 'aging', CASE WHEN r.is_reversal THEN 'page' ELSE 'watch' END,
      'aging:after_seal:' || r.id,
      CASE WHEN r.is_reversal THEN 'A platform took money back from a sealed week over 7 days ago'
           ELSE 'New data after seal waiting over 14 days' END,
      jsonb_build_object('kind', r.kind, 'id', r.id, 'since', r.created_at));
  END LOOP;

  -- O1: receivable_platform in credit. Raised as 'watch'; becomes 'page' once the alert is 30 days old.
  IF toll_system.natural_balance(p_company, 'toll:receivable_platform') < 0 THEN
    PERFORM toll_system.raise_alert(p_company, 'aging',
      CASE WHEN EXISTS (SELECT 1 FROM toll.alerts a WHERE a.organization_id = p_company
                          AND a.dedupe_key = 'aging:receivable_platform_credit' AND a.resolved_at IS NULL
                          AND a.created_at < now() - interval '30 days') THEN 'page' ELSE 'watch' END,
      'aging:receivable_platform_credit', 'A platform take-back has not been netted from a payout',
      jsonb_build_object('balance', toll_system.natural_balance(p_company, 'toll:receivable_platform')));
  END IF;
END;
$$;

-- 5. The payout trigger (B5, decoupled from its source) ------------------------------------------
-- toll_system.payout_received is the only way P10/P11 post. Today its callers are the trigger on the
-- key-value store and the nightly sweep. When Business Finance moves to the ledger, only the caller changes.
CREATE OR REPLACE FUNCTION toll_system.payout_received(p_key text, p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m          text[];
  v_key_co   uuid;
  v_company  uuid;
  v_week     date;
  v_platform text;
  v_version  text;
  v_amount   bigint;
  v_prev     toll.payout_postings%ROWTYPE;
  v_cmd      text;
  v_enabled  boolean;
  v_has_prev boolean;
BEGIN
  m := regexp_match(p_key, '^fleet_bank_confirm:org:([0-9a-fA-F-]{36}):(\d{4}-\d{2}-\d{2}):(uber|indrive|roam)$');
  IF m IS NULL THEN RETURN; END IF;                       -- not a company + week + platform record (legacy keys skipped)
  v_key_co := m[1]::uuid; v_week := m[2]::date; v_platform := m[3];

  -- The company is the record's stamped organizationId, never the key's (A13).
  IF p_value IS NOT NULL THEN
    v_company := nullif(p_value ->> 'organizationId', '')::uuid;
    IF v_company IS DISTINCT FROM v_key_co THEN
      PERFORM toll_system.raise_alert(v_key_co, 'payout_trigger', 'page', 'payout_key_mismatch:' || p_key,
        'A bank confirmation names a different company than its key', jsonb_build_object('key', p_key,
        'stamped', p_value ->> 'organizationId'));
      RETURN;
    END IF;
  ELSE
    v_company := v_key_co;                                  -- a delete: reverse what was posted for this key
  END IF;

  SELECT coalesce((SELECT s.tolls_v2 FROM toll.switch_state s WHERE s.organization_id = v_company), false) INTO v_enabled;
  IF NOT v_enabled THEN RETURN; END IF;

  SELECT * INTO v_prev FROM toll.payout_postings
  WHERE organization_id = v_company AND source_ref = p_key AND reversed_at IS NULL;
  v_has_prev := FOUND;

  v_version := CASE WHEN p_value IS NULL THEN NULL ELSE md5(p_value::text) END;
  IF v_has_prev AND v_prev.source_version IS NOT DISTINCT FROM v_version THEN
    RETURN;                                                 -- already posted at this version
  END IF;

  -- Reverse the old posting (changed or deleted record)
  IF v_has_prev THEN
    IF v_prev.amount_minor > 0 THEN
      v_cmd := 'payout-reverse:' || v_prev.id;
      PERFORM toll_system.post(v_company, 'P11_payout_deposited', v_prev.amount_minor, now(), v_cmd, 1,
                               jsonb_build_object('payout_ref', p_key), true);
      PERFORM toll_system.post(v_company, 'P10_payout_confirmed', v_prev.amount_minor, now(), v_cmd, 2,
                               jsonb_build_object('payout_ref', p_key), true);
    END IF;
    UPDATE toll.payout_postings SET reversed_at = now() WHERE id = v_prev.id;
  END IF;

  IF p_value IS NULL THEN RETURN; END IF;

  -- The toll part of this payout: active fleet-received paybacks of that platform and week
  SELECT coalesce(sum(p.amount_minor), 0) INTO v_amount
  FROM toll.v_active_paybacks p
  WHERE p.organization_id = v_company AND p.week_key = v_week AND p.platform = v_platform AND p.received_by = 'fleet';

  v_cmd := 'payout:' || md5(p_key || ':' || v_version);
  INSERT INTO toll.payout_postings (organization_id, source_ref, source_version, week_key, platform, amount_minor, command_id)
  VALUES (v_company, p_key, v_version, v_week, v_platform, v_amount, v_cmd);

  IF v_amount > 0 THEN
    PERFORM toll_system.post(v_company, 'P10_payout_confirmed', v_amount, now(), v_cmd, 1,
                             jsonb_build_object('payout_ref', p_key, 'payout_week', v_week, 'platform', v_platform));
    PERFORM toll_system.post(v_company, 'P11_payout_deposited', v_amount, now(), v_cmd, 2,
                             jsonb_build_object('payout_ref', p_key, 'payout_week', v_week, 'platform', v_platform));
  END IF;
END;
$$;

-- The trigger: Business Finance's save or delete must never fail because of tolls.
CREATE OR REPLACE FUNCTION toll.tg_kv_bank_confirm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_key text := CASE WHEN TG_OP = 'DELETE' THEN OLD.key ELSE NEW.key END;
  v_co  uuid;
BEGIN
  BEGIN
    PERFORM toll_system.payout_received(v_key, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.value END);
  EXCEPTION WHEN OTHERS THEN
    v_co := nullif(substring(v_key FROM '^fleet_bank_confirm:org:([0-9a-fA-F-]{36}):'), '')::uuid;
    IF v_co IS NOT NULL THEN
      PERFORM toll_system.raise_alert(v_co, 'payout_trigger', 'watch', 'payout_trigger_failed:' || v_key,
        'A bank confirmation could not be posted to tolls; the nightly sweep will retry',
        jsonb_build_object('key', v_key, 'error', SQLERRM));
    END IF;
  END;
  RETURN NULL;
END;
$$;

CREATE TRIGGER toll_kv_bank_confirm_upsert
  AFTER INSERT OR UPDATE ON public.kv_store_37f42386
  FOR EACH ROW
  WHEN (NEW.key LIKE 'fleet_bank_confirm:org:%')
  EXECUTE FUNCTION toll.tg_kv_bank_confirm();

CREATE TRIGGER toll_kv_bank_confirm_delete
  AFTER DELETE ON public.kv_store_37f42386
  FOR EACH ROW
  WHEN (OLD.key LIKE 'fleet_bank_confirm:org:%')
  EXECUTE FUNCTION toll.tg_kv_bank_confirm();

-- 6. Plaza rules: set only by a platform owner, with an audit row (B2) ----------------------------
CREATE OR REPLACE FUNCTION toll_system.set_plaza_rule(p_plaza_id text, p_auto_minutes int, p_review_window text,
                                                     p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old jsonb;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_actor
                                      AND u.raw_app_meta_data ->> 'role' = 'platform_owner') THEN
    RAISE EXCEPTION 'FORBIDDEN: only a platform owner sets plaza rules';
  END IF;
  IF p_auto_minutes IS NULL OR p_auto_minutes < 0 OR p_review_window NOT IN ('same_day') THEN
    RAISE EXCEPTION 'BAD_REQUEST: auto window must be >= 0 minutes; review window must be same_day';
  END IF;
  SELECT to_jsonb(r) INTO v_old FROM toll.plaza_rules r WHERE r.plaza_id = p_plaza_id;
  INSERT INTO toll.plaza_rules (plaza_id, auto_duplicate_window_minutes, review_duplicate_window, changed_by, changed_at)
  VALUES (p_plaza_id, p_auto_minutes, p_review_window, p_actor, now())
  ON CONFLICT (plaza_id) DO UPDATE SET auto_duplicate_window_minutes = excluded.auto_duplicate_window_minutes,
    review_duplicate_window = excluded.review_duplicate_window, changed_by = excluded.changed_by, changed_at = now();
  INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, old_row, new_row, actor_user_id)
  VALUES (NULL, 'toll.plaza_rules', p_plaza_id, CASE WHEN v_old IS NULL THEN 'insert' ELSE 'update' END, v_old,
          (SELECT to_jsonb(r) FROM toll.plaza_rules r WHERE r.plaza_id = p_plaza_id), p_actor);
END;
$$;

-- 7. The nightly run (pg_cron) ------------------------------------------------------------------
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
      -- Check 7 heal first: re-run the trigger for every bank record not posted at its current version
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

-- 8. Grants -------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION toll_system.raise_alert(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.resolve_alerts_not_seen(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.natural_balance(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.rule_net(uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.week_summary(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.week_hash(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.nightly_checks(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll_system.aging_alerts(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.payout_received(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.set_plaza_rule(text, int, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll_system.nightly_run() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll.tg_kv_bank_confirm() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.nightly_checks(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION toll_system.set_plaza_rule(text, int, text, uuid) TO service_role;

SELECT cron.schedule('toll-v2-nightly', '25 4 * * *', 'SELECT toll_system.nightly_run();');

NOTIFY pgrst, 'reload schema';

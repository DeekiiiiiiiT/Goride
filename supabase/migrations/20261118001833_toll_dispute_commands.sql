-- Toll disputes Round S1: commands and money (docs/toll-build/cursor-S1-dispute-commands.md).

-- 1. Account + posting rules ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.ensure_accounts(p_company uuid, p_currency text DEFAULT 'JMD')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
  v_class text;
BEGIN
  IF p_company IS NULL THEN RAISE EXCEPTION 'TOLL_COMPANY_REQUIRED'; END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('toll:tag_prepaid',              'asset'),
      ('toll:suspense',                 'asset'),
      ('toll:payback_unallocated',      'liability'),
      ('toll:receivable_platform',      'asset'),
      ('toll:receivable_platform_dispute', 'asset'),
      ('toll:recovered_in_driver_cash', 'asset'),
      ('toll:receivable_driver',        'asset'),
      ('toll:payable_driver',           'liability'),
      ('toll:expense',                  'expense'),
      ('toll:platform_payout_clearing', 'asset'),
      ('bank',                          'asset')
    ) AS t(suffix, account_class)
  LOOP
    INSERT INTO ledger.accounts (organization_id, account_key, account_class, currency, balance_minor)
    VALUES (p_company, 'org:' || p_company || ':' || r.suffix, r.account_class, p_currency, 0)
    ON CONFLICT (account_key, currency) DO NOTHING;

    SELECT a.account_class INTO v_class
    FROM ledger.accounts a
    WHERE a.account_key = 'org:' || p_company || ':' || r.suffix AND a.currency = p_currency;

    IF v_class IS DISTINCT FROM r.account_class THEN
      RAISE EXCEPTION 'TOLL_ACCOUNT_CLASS_MISMATCH: % is % (expected %)', r.suffix, v_class, r.account_class;
    END IF;
  END LOOP;
END;
$$;

INSERT INTO toll.posting_rules (code, design_ref, debit_suffix, credit_suffix, required_refs, description) VALUES
  ('P21_dispute_open',             'P21', 'toll:receivable_platform_dispute', 'toll:suspense',                    ARRAY['charge_id'],                           'Dispute opened: provisional platform allocation'),
  ('P22_dispute_refund',           'P22', 'toll:payback_unallocated',         'toll:receivable_platform_dispute', ARRAY['payback_id'],                          'Dispute refund settles the dispute receivable'),
  ('P23_dispute_to_driver',        'P23', 'toll:receivable_driver',           'toll:receivable_platform_dispute', ARRAY['charge_id'],                           'Dispute lost/expired rest: driver bears'),
  ('P23_dispute_to_fleet',         'P23', 'toll:expense',                     'toll:receivable_platform_dispute', ARRAY['charge_id'],                           'Dispute lost/expired rest: fleet bears'),
  ('P24_expired_refund_driver',    'P24', 'toll:payback_unallocated',         'toll:receivable_driver',           ARRAY['payback_id'],                          'Refund on expired dispute (driver had borne)'),
  ('P24_expired_refund_fleet',     'P24', 'toll:payback_unallocated',         'toll:expense',                     ARRAY['payback_id'],                          'Refund on expired dispute (fleet had borne)')
ON CONFLICT (code) DO NOTHING;

-- 2. Small helpers --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.require_disputes_on(p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false) THEN
    PERFORM toll_write.refuse('DISPUTES_OFF', jsonb_build_object('switch', 'toll_disputes'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.posting_week(p_company uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT max(cur.week_key) + 7
     FROM (
       SELECT DISTINCT ON (ws.week_key) ws.week_key, ws.status
       FROM ledger.week_statements ws
       WHERE ws.organization_id = p_company AND ws.kind = 'toll_week' AND ws.driver_id = '*'
       ORDER BY ws.week_key, ws.version DESC
     ) cur
     WHERE cur.status = 'closed'),
    ledger.jamaica_week_start(now()));
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_deadline(p_trip_date date, p_window_days int)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (((p_trip_date + p_window_days + 1)::timestamp) AT TIME ZONE 'America/Jamaica') - interval '1 second';
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_chain_root(p_company uuid, p_dispute uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id     uuid := p_dispute;
  v_parent uuid;
BEGIN
  IF p_dispute IS NULL THEN RETURN NULL; END IF;
  LOOP
    SELECT d.reopens_id INTO v_parent
    FROM toll.disputes d
    WHERE d.organization_id = p_company AND d.id = v_id;
    EXIT WHEN v_parent IS NULL;
    v_id := v_parent;
  END LOOP;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_post_at(p_company uuid, p_charge uuid, p_to_week date)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_cw date;
BEGIN
  IF p_to_week IS NOT NULL THEN
    RETURN ((p_to_week + time '12:00') AT TIME ZONE 'America/Jamaica');
  END IF;
  RETURN toll_system.charge_post_at(p_company, p_charge);
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.charge_has_provisional_dispute(p_company uuid, p_charge uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM toll.allocations a
    WHERE a.organization_id = p_company AND a.charge_id = p_charge AND a.reversed_by IS NULL
      AND a.provisional AND a.dispute_id IS NOT NULL AND a.bearer = 'platform');
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_active_provisional_amt(p_company uuid, p_dispute uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(a.amount_minor), 0)::bigint
  FROM toll.disputes d
  JOIN toll.allocations a ON a.organization_id = d.organization_id AND a.charge_id = d.charge_id
  WHERE d.organization_id = p_company AND d.id = p_dispute AND a.reversed_by IS NULL
    AND a.provisional AND a.bearer = 'platform'
    AND a.dispute_id IN (p_dispute, toll_system.dispute_chain_root(p_company, p_dispute));
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_bearer_allocation_amt(p_company uuid, p_dispute uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(a.amount_minor), 0)::bigint
  FROM toll.disputes d
  JOIN toll.allocations a ON a.organization_id = d.organization_id AND a.charge_id = d.charge_id
  WHERE d.organization_id = p_company AND d.id = p_dispute AND a.reversed_by IS NULL
    AND a.bearer IN ('driver', 'fleet') AND NOT a.provisional
    AND a.dispute_id IN (p_dispute, toll_system.dispute_chain_root(p_company, p_dispute));
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_post_rule_for_allocation(
  p_bearer text, p_provisional boolean, p_has_payback boolean, p_reverse boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_bearer = 'platform' AND p_provisional AND NOT p_has_payback THEN 'P21_dispute_open'
    WHEN p_bearer = 'platform' AND p_has_payback THEN 'P6_allocate_platform'
    WHEN p_bearer = 'driver' THEN 'P7_allocate_driver'
    WHEN p_bearer = 'fleet' THEN 'P8_allocate_fleet'
    ELSE 'P8_allocate_fleet'
  END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_reverse_allocation(
  p_company uuid, p_allocation uuid, p_decision uuid, p_cmd text, p_line int,
  p_to_week date DEFAULT NULL, p_carried_fact uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r         record;
  v_rule    text;
  v_eff     timestamptz;
  v_refs    jsonb;
BEGIN
  SELECT a.id, a.charge_id, a.bearer, a.amount_minor, a.payback_id, a.provisional, a.dispute_id,
         c.driver_id, c.occurred_at INTO r
  FROM toll.allocations a
  JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
  WHERE a.organization_id = p_company AND a.id = p_allocation AND a.reversed_by IS NULL
  FOR UPDATE OF a;
  IF NOT FOUND THEN RETURN 0; END IF;

  UPDATE toll.allocations SET reversed_by = p_decision WHERE organization_id = p_company AND id = r.id;

  v_rule := toll_system.dispute_post_rule_for_allocation(r.bearer, r.provisional, r.payback_id IS NOT NULL, true);
  v_eff := toll_system.dispute_post_at(p_company, r.charge_id, p_to_week);
  v_refs := jsonb_build_object('charge_id', r.charge_id, 'driver_id', r.driver_id)
            || CASE WHEN r.payback_id IS NOT NULL THEN jsonb_build_object('payback_id', r.payback_id) ELSE '{}'::jsonb END
            || CASE WHEN r.dispute_id IS NOT NULL THEN jsonb_build_object('dispute_id', r.dispute_id) ELSE '{}'::jsonb END
            || CASE WHEN p_carried_fact IS NOT NULL THEN jsonb_build_object('carried_fact_id', p_carried_fact) ELSE '{}'::jsonb END;

  PERFORM toll_system.post(p_company, v_rule, r.amount_minor, v_eff, p_cmd, p_line, v_refs, true);
  RETURN r.amount_minor;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_insert_allocation(
  p_company uuid, p_charge uuid, p_bearer text, p_amount bigint, p_payback uuid,
  p_provisional boolean, p_dispute uuid, p_reason text, p_decision uuid, p_cmd text, p_line int,
  p_to_week date DEFAULT NULL, p_carried_fact uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c      toll.charges%ROWTYPE;
  v_id   uuid;
  v_rule text;
  v_eff  timestamptz;
  v_refs jsonb;
BEGIN
  SELECT * INTO c FROM toll.charges x WHERE x.organization_id = p_company AND x.id = p_charge;
  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, payback_id, reason, provisional, dispute_id, decision_id)
  VALUES (p_company, p_charge, p_bearer, p_amount, p_payback, p_reason, p_provisional, p_dispute, p_decision)
  RETURNING id INTO v_id;

  v_rule := toll_system.dispute_post_rule_for_allocation(p_bearer, p_provisional, p_payback IS NOT NULL, false);
  v_eff := toll_system.dispute_post_at(p_company, p_charge, p_to_week);
  v_refs := jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id)
            || CASE WHEN p_payback IS NOT NULL THEN jsonb_build_object('payback_id', p_payback) ELSE '{}'::jsonb END
            || CASE WHEN p_dispute IS NOT NULL THEN jsonb_build_object('dispute_id', p_dispute) ELSE '{}'::jsonb END
            || CASE WHEN p_carried_fact IS NOT NULL THEN jsonb_build_object('carried_fact_id', p_carried_fact) ELSE '{}'::jsonb END;
  PERFORM toll_system.post(p_company, v_rule, p_amount, v_eff, p_cmd, p_line, v_refs);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_begin_carried_result(
  p_company uuid, p_dispute uuid, p_from_week date, p_decision uuid
)
RETURNS TABLE (to_week date, fact_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_to   date := toll_system.posting_week(p_company);
  v_d    toll.disputes%ROWTYPE;
  v_fact uuid;
BEGIN
  SELECT * INTO v_d FROM toll.disputes d WHERE d.organization_id = p_company AND d.id = p_dispute;
  INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, decision_id, dispute_id)
  VALUES (p_company, 'dispute_result', v_d.charge_id, p_from_week, v_to, v_d.owed_minor, p_decision, p_dispute)
  RETURNING id INTO v_fact;
  RETURN QUERY SELECT v_to, v_fact;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_post_clear(
  p_company uuid, p_rule text, p_amount bigint, p_dispute uuid, p_payback uuid,
  p_charge uuid, p_driver text, p_cmd text, p_line int, p_to_week date,
  p_carried_fact uuid, p_reverse boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_eff timestamptz := ((p_to_week + time '12:00') AT TIME ZONE 'America/Jamaica');
        v_refs jsonb;
BEGIN
  v_refs := jsonb_build_object('dispute_id', p_dispute)
            || CASE WHEN p_payback IS NOT NULL THEN jsonb_build_object('payback_id', p_payback) ELSE '{}'::jsonb END
            || CASE WHEN p_charge IS NOT NULL THEN jsonb_build_object('charge_id', p_charge, 'driver_id', p_driver) ELSE '{}'::jsonb END
            || CASE WHEN p_carried_fact IS NOT NULL THEN jsonb_build_object('carried_fact_id', p_carried_fact) ELSE '{}'::jsonb END;
  PERFORM toll_system.post(p_company, p_rule, p_amount, v_eff, p_cmd, p_line, v_refs, p_reverse);
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_charge_week_sealed(p_company uuid, p_charge uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT toll_system.week_is_sealed(
    p_company,
    toll_system.charge_counted_week(p_company, c.id, c.week_key))
  FROM toll.charges c WHERE c.organization_id = p_company AND c.id = p_charge;
$$;

-- 3. W1 money moves (dispute_apply building blocks) -------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.dispute_apply_open_provisional(
  p_company uuid, p_dispute uuid, p_charge uuid, p_amount bigint, p_decision uuid, p_cmd text, p_line int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM toll_system.dispute_insert_allocation(
    p_company, p_charge, 'platform', p_amount, NULL, true, p_dispute, 'dispute_open', p_decision, p_cmd, p_line);
  RETURN p_line;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_apply_fleet_open_late(
  p_company uuid, p_dispute uuid, p_charge uuid, p_amount bigint, p_decision uuid, p_cmd text, p_line int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM toll_system.dispute_insert_allocation(
    p_company, p_charge, 'fleet', p_amount, NULL, false, p_dispute, 'opened_late', p_decision, p_cmd, p_line);
  RETURN p_line;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_apply_rule2_refund(
  p_company uuid, p_dispute uuid, p_charge uuid, p_payback uuid, p_amount bigint,
  p_decision uuid, p_cmd text, p_line int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cw          date;
  v_sealed      boolean;
  v_prov        uuid;
  v_prov_amt    bigint;
  v_remain      bigint;
  v_carried     record;
  v_fact        uuid;
  v_driver      text;
  v_root        uuid;
BEGIN
  SELECT c.driver_id, toll_system.charge_counted_week(p_company, c.id, c.week_key) INTO v_driver, v_cw
  FROM toll.charges c WHERE c.organization_id = p_company AND c.id = p_charge;

  v_sealed := toll_system.week_is_sealed(p_company, v_cw);
  v_root := toll_system.dispute_chain_root(p_company, p_dispute);

  SELECT a.id, a.amount_minor INTO v_prov, v_prov_amt
  FROM toll.allocations a
  WHERE a.organization_id = p_company AND a.charge_id = p_charge
    AND a.dispute_id IN (p_dispute, v_root)
    AND a.reversed_by IS NULL AND a.provisional AND a.bearer = 'platform'
  ORDER BY a.created_at, a.id LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    v_prov_amt := 0;
  ELSE
    v_remain := v_prov_amt - p_amount;
    IF NOT v_sealed THEN
      p_line := p_line + 1;
      PERFORM toll_system.dispute_reverse_allocation(p_company, v_prov, p_decision, p_cmd, p_line);
      IF p_amount > 0 THEN
        p_line := p_line + 1;
        PERFORM toll_system.dispute_insert_allocation(
          p_company, p_charge, 'platform', p_amount, p_payback, false, p_dispute, 'dispute_refund', p_decision, p_cmd, p_line);
      END IF;
      IF v_remain > 0 THEN
        p_line := p_line + 1;
        PERFORM toll_system.dispute_insert_allocation(
          p_company, p_charge, 'platform', v_remain, NULL, true, p_dispute, 'dispute_remainder', p_decision, p_cmd, p_line);
      END IF;
    ELSE
      SELECT c.to_week, c.fact_id INTO v_carried FROM toll_system.dispute_begin_carried_result(p_company, p_dispute, v_cw, p_decision) c;
      v_fact := v_carried.fact_id;
      IF p_amount > 0 THEN
        p_line := p_line + 1;
        PERFORM toll_system.dispute_post_clear(
          p_company, 'P22_dispute_refund', p_amount, p_dispute, p_payback, p_charge, v_driver, p_cmd, p_line,
          v_carried.to_week, v_fact);
      END IF;
      UPDATE toll.carried_facts SET amount_minor = p_amount
      WHERE organization_id = p_company AND id = v_fact;
      UPDATE toll.disputes SET posted_in_week_key = v_carried.to_week
      WHERE organization_id = p_company AND id = p_dispute;
    END IF;
  END IF;
  RETURN p_line;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_apply_rule3_rest(
  p_company uuid, p_dispute uuid, p_charge uuid, p_amount bigint, p_bearer text,
  p_decision uuid, p_cmd text, p_line int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cw      date;
  v_sealed  boolean;
  v_prov    uuid;
  v_carried record;
  v_fact    uuid;
  v_driver  text;
  v_rule    text := CASE p_bearer WHEN 'driver' THEN 'P23_dispute_to_driver' ELSE 'P23_dispute_to_fleet' END;
  v_root    uuid;
BEGIN
  SELECT c.driver_id, toll_system.charge_counted_week(p_company, c.id, c.week_key) INTO v_driver, v_cw
  FROM toll.charges c WHERE c.organization_id = p_company AND c.id = p_charge;

  v_sealed := toll_system.week_is_sealed(p_company, v_cw);
  v_root := toll_system.dispute_chain_root(p_company, p_dispute);

  SELECT a.id INTO v_prov FROM toll.allocations a
  WHERE a.organization_id = p_company AND a.charge_id = p_charge
    AND a.dispute_id IN (p_dispute, v_root)
    AND a.reversed_by IS NULL AND a.provisional AND a.bearer = 'platform'
  ORDER BY a.created_at, a.id LIMIT 1 FOR UPDATE;

  IF v_prov IS NULL AND p_amount <= 0 THEN RETURN p_line; END IF;

  IF NOT v_sealed THEN
    IF v_prov IS NOT NULL THEN
      p_line := p_line + 1;
      PERFORM toll_system.dispute_reverse_allocation(p_company, v_prov, p_decision, p_cmd, p_line);
    END IF;
    IF p_amount > 0 THEN
      p_line := p_line + 1;
      PERFORM toll_system.dispute_insert_allocation(
        p_company, p_charge, p_bearer, p_amount, NULL, false, p_dispute, 'dispute_rest', p_decision, p_cmd, p_line);
    END IF;
  ELSE
    SELECT c.to_week, c.fact_id INTO v_carried FROM toll_system.dispute_begin_carried_result(p_company, p_dispute, v_cw, p_decision) c;
    v_fact := v_carried.fact_id;
    IF p_amount > 0 THEN
      p_line := p_line + 1;
      PERFORM toll_system.dispute_post_clear(
        p_company, v_rule, p_amount, p_dispute, NULL, p_charge, v_driver, p_cmd, p_line, v_carried.to_week, v_fact);
    END IF;
    UPDATE toll.carried_facts SET amount_minor = p_amount, bearer = p_bearer
    WHERE organization_id = p_company AND id = v_fact;
    UPDATE toll.disputes SET posted_in_week_key = v_carried.to_week, bearer = p_bearer
    WHERE organization_id = p_company AND id = p_dispute;
  END IF;
  RETURN p_line;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_apply_rule4_expired_refund(
  p_company uuid, p_dispute uuid, p_charge uuid, p_payback uuid, p_amount bigint, p_bearer text,
  p_decision uuid, p_cmd text, p_line int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cw      date;
  v_sealed  boolean;
  v_bear    uuid;
  v_bear_amt bigint;
  v_carried record;
  v_fact    uuid;
  v_driver  text;
  v_rule    text := CASE p_bearer WHEN 'driver' THEN 'P24_expired_refund_driver' ELSE 'P24_expired_refund_fleet' END;
  v_remain  bigint;
  v_root    uuid;
BEGIN
  SELECT c.driver_id, toll_system.charge_counted_week(p_company, c.id, c.week_key) INTO v_driver, v_cw
  FROM toll.charges c WHERE c.organization_id = p_company AND c.id = p_charge;
  v_sealed := toll_system.week_is_sealed(p_company, v_cw);
  v_root := toll_system.dispute_chain_root(p_company, p_dispute);

  SELECT a.id, a.amount_minor INTO v_bear, v_bear_amt
  FROM toll.allocations a
  WHERE a.organization_id = p_company AND a.charge_id = p_charge
    AND a.dispute_id IN (p_dispute, v_root)
    AND a.reversed_by IS NULL AND a.bearer = p_bearer AND NOT a.provisional
  ORDER BY a.created_at DESC, a.id LIMIT 1 FOR UPDATE;

  v_remain := coalesce(v_bear_amt, 0) - p_amount;

  IF NOT v_sealed THEN
    IF v_bear IS NOT NULL THEN
      p_line := p_line + 1;
      PERFORM toll_system.dispute_reverse_allocation(p_company, v_bear, p_decision, p_cmd, p_line);
    END IF;
    IF p_amount > 0 THEN
      p_line := p_line + 1;
      PERFORM toll_system.dispute_insert_allocation(
        p_company, p_charge, 'platform', p_amount, p_payback, false, p_dispute, 'expired_refund', p_decision, p_cmd, p_line);
    END IF;
    IF v_remain > 0 THEN
      p_line := p_line + 1;
      PERFORM toll_system.dispute_insert_allocation(
        p_company, p_charge, p_bearer, v_remain, NULL, false, p_dispute, 'expired_remainder', p_decision, p_cmd, p_line);
    END IF;
  ELSE
    SELECT c.to_week, c.fact_id INTO v_carried FROM toll_system.dispute_begin_carried_result(p_company, p_dispute, v_cw, p_decision) c;
    v_fact := v_carried.fact_id;
    IF p_amount > 0 THEN
      p_line := p_line + 1;
      PERFORM toll_system.dispute_post_clear(
        p_company, v_rule, p_amount, p_dispute, p_payback, p_charge, v_driver, p_cmd, p_line, v_carried.to_week, v_fact);
    END IF;
    UPDATE toll.carried_facts SET amount_minor = p_amount
    WHERE organization_id = p_company AND id = v_fact;
    UPDATE toll.disputes SET posted_in_week_key = v_carried.to_week
    WHERE organization_id = p_company AND id = p_dispute;
  END IF;
  RETURN p_line;
END;
$$;

-- 4. Commands -------------------------------------------------------------------------------------
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

  IF EXISTS (
    SELECT 1 FROM toll.disputes d
    WHERE d.organization_id = p_company AND d.charge_id = c.id
      AND d.state NOT IN ('won', 'part_won', 'lost')) THEN
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

  IF v_state = 'expired' THEN
    v_line := toll_system.dispute_apply_fleet_open_late(p_company, v_dispute, c.id, v_remain, p_decision, p_cmd, 1);
  ELSE
    v_line := toll_system.dispute_apply_open_provisional(p_company, v_dispute, c.id, v_remain, p_decision, p_cmd, 1);
  END IF;

  UPDATE toll.charges SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;

  RETURN jsonb_build_object(
    'decision_id', p_decision, 'dispute_id', v_dispute, 'charge_version', v_cv,
    'state', v_state, 'owed_minor', v_remain,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
              jsonb_build_object('dispute_opened_minor', v_remain))));
END;
$$;

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

  RETURN jsonb_build_object('decision_id', p_decision, 'dispute_id', d.id, 'state', 'sent',
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, d.charge_week_key,
              jsonb_build_object('dispute_sent', true))));
END;
$$;

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

  IF d.state IN ('to_send', 'sent') THEN
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

  INSERT INTO toll.dispute_links (organization_id, dispute_id, payback_id, amount_minor, decision_id)
  VALUES (p_company, d.id, p.id, v_take, p_decision);

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

CREATE OR REPLACE FUNCTION toll_write.intent_close_dispute_lost(
  p_company uuid, p_decision uuid, p_cmd text, p_body jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d        toll.disputes%ROWTYPE;
  v_id     uuid := nullif(p_body ->> 'dispute_id', '')::uuid;
  v_exp    bigint := (p_body ->> 'expected_dispute_version')::bigint;
  v_rest   bigint;
  v_bearer text;
  v_st     text;
BEGIN
  PERFORM toll_write.require_disputes_on(p_company);
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = v_id FOR UPDATE;
  IF d.state <> 'sent' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', v_id, 'state', d.state));
  END IF;
  IF d.version <> v_exp THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object('dispute_version', d.version));
  END IF;

  v_rest := d.owed_minor - d.recovered_minor;
  SELECT coalesce(dp.lost_bearer, 'fleet') INTO v_bearer FROM toll.dispute_policy dp WHERE dp.organization_id = p_company;

  IF v_rest > 0 THEN
    PERFORM toll_system.dispute_apply_rule3_rest(p_company, d.id, d.charge_id, v_rest, v_bearer, p_decision, p_cmd, 1);
  END IF;

  v_st := CASE WHEN d.recovered_minor > 0 THEN 'part_won' ELSE 'lost' END;

  UPDATE toll.disputes SET state = v_st, close_reason = 'platform_said_no', bearer = v_bearer,
         decision_ids = array_append(decision_ids, p_decision)
  WHERE organization_id = p_company AND id = d.id;

  RETURN jsonb_build_object('decision_id', p_decision, 'dispute_id', d.id, 'state', v_st,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, d.charge_week_key,
              jsonb_build_object('dispute_closed_minor', v_rest))));
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_expire(
  p_company uuid, p_dispute uuid, p_decision uuid, p_cmd text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d        toll.disputes%ROWTYPE;
  v_bearer text;
BEGIN
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = p_dispute FOR UPDATE;
  IF d.state <> 'to_send' OR now() <= d.deadline THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', p_dispute, 'state', d.state));
  END IF;
  v_bearer := CASE WHEN d.opened_late THEN 'fleet'
                   ELSE coalesce((SELECT dp.expired_bearer FROM toll.dispute_policy dp WHERE dp.organization_id = p_company), 'driver')
              END;
  PERFORM toll_system.dispute_apply_rule3_rest(p_company, d.id, d.charge_id, d.owed_minor, v_bearer, p_decision, p_cmd, 1);
  UPDATE toll.disputes SET state = 'expired', close_reason = 'window_closed', bearer = v_bearer,
         decision_ids = array_append(decision_ids, p_decision)
  WHERE organization_id = p_company AND id = d.id;
  RETURN jsonb_build_object('dispute_id', d.id, 'state', 'expired');
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_auto_close(
  p_company uuid, p_dispute uuid, p_decision uuid, p_cmd text, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d        toll.disputes%ROWTYPE;
  v_rest   bigint;
  v_bearer text;
BEGIN
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = p_dispute FOR UPDATE;
  IF d.state <> 'sent' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', p_dispute, 'state', d.state));
  END IF;
  v_rest := d.owed_minor - d.recovered_minor;
  v_bearer := CASE WHEN p_reason = 'no_report' THEN 'fleet'
                   ELSE coalesce((SELECT dp.lost_bearer FROM toll.dispute_policy dp WHERE dp.organization_id = p_company), 'fleet')
              END;
  IF v_rest > 0 THEN
    PERFORM toll_system.dispute_apply_rule3_rest(p_company, d.id, d.charge_id, v_rest, v_bearer, p_decision, p_cmd, 1);
  END IF;
  UPDATE toll.disputes SET state = CASE WHEN d.recovered_minor > 0 THEN 'part_won' ELSE 'lost' END,
         close_reason = p_reason, bearer = v_bearer, decision_ids = array_append(decision_ids, p_decision)
  WHERE organization_id = p_company AND id = d.id;
  RETURN jsonb_build_object('dispute_id', d.id);
END;
$$;

-- 5. driver_pays / fleet_absorbs + suggestion withdraw --------------------------------------------
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
  INSERT INTO toll.suggestions (organization_id, charge_id, payback_id, score_parts, rules_fired, engine_version, inputs, inputs_hash)
  VALUES (p_company, s.charge_id, s.payback_id, jsonb_build_object('total', 0, 'auto_apply', false),
          ARRAY['withdrawn'], v_ev, v_in, md5(v_in::text))
  RETURNING id INTO v_new;
  UPDATE toll.suggestions SET superseded_by = v_new WHERE organization_id = p_company AND id = s.id;
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.do_bear(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb, p_bearer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c       toll.charges%ROWTYPE;
  s       toll.suggestions%ROWTYPE;
  v_id    uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_sid   uuid := nullif(p_body ->> 'suggestion_id', '')::uuid;
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

  IF v_sid IS NOT NULL THEN
    SELECT * INTO s FROM toll.suggestions x WHERE x.organization_id = p_company AND x.id = v_sid;
    IF NOT FOUND OR s.charge_id IS DISTINCT FROM c.id OR s.superseded_by IS NOT NULL OR 'withdrawn' = ANY (s.rules_fired) THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('suggestion_id', v_sid, 'state', 'suggestion_stale'));
    END IF;
    PERFORM toll_write.withdraw_suggestion(p_company, s.id, p_decision);
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
    'suggestion_id', v_sid,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
               jsonb_build_object('decided_minor', v_take, 'bearer', p_bearer))));
END;
$$;

CREATE OR REPLACE FUNCTION toll.tg_disputes_mutate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING MESSAGE = 'DISPUTE_DELETE_FORBIDDEN', ERRCODE = 'P0001';
  END IF;

  IF OLD.state IN ('won', 'part_won', 'lost') THEN
    IF NEW.close_reason = 'undo' AND NEW.close_reason IS DISTINCT FROM OLD.close_reason
       AND to_jsonb(NEW) - 'close_reason' = to_jsonb(OLD) - 'close_reason' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING MESSAGE = 'DISPUTE_FINAL_LOCKED', ERRCODE = 'P0001';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.charge_id IS DISTINCT FROM OLD.charge_id
    OR NEW.charge_week_key IS DISTINCT FROM OLD.charge_week_key
    OR NEW.platform IS DISTINCT FROM OLD.platform
    OR NEW.platform_trip_id IS DISTINCT FROM OLD.platform_trip_id
    OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
    OR NEW.owed_minor IS DISTINCT FROM OLD.owed_minor
    OR NEW.opened_late IS DISTINCT FROM OLD.opened_late
    OR NEW.deadline IS DISTINCT FROM OLD.deadline
    OR NEW.reopens_id IS DISTINCT FROM OLD.reopens_id
  THEN
    RAISE EXCEPTION USING MESSAGE = 'DISPUTE_IDENTITY_IMMUTABLE', ERRCODE = 'P0001';
  END IF;

  IF NEW.recovered_minor < OLD.recovered_minor THEN
    RAISE EXCEPTION USING MESSAGE = 'DISPUTE_RECOVERED_DECREASE', ERRCODE = 'P0001';
  END IF;

  NEW.version := OLD.version + 1;
  RETURN NEW;
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

  IF d_dec.intent = 'close_dispute_lost' THEN
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

  UPDATE toll.disputes SET close_reason = 'undo' WHERE organization_id = p_company AND id = d_old.id;

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
-- 6. charge_state, seal blockers, seal_week, undo router, command ----------------------------
CREATE OR REPLACE FUNCTION toll_system.charge_state(p_company uuid, p_charge_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN c.duplicate_of IS NOT NULL                 THEN 'duplicate'
    WHEN c.evidence_status = 'rejected'             THEN 'rejected'
    WHEN c.evidence_status = 'unverified'           THEN 'unverified'
    WHEN c.awaiting_cash                            THEN 'awaiting_cash'
    WHEN coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                   WHERE a.organization_id = c.organization_id AND a.charge_id = c.id AND a.reversed_by IS NULL), 0)
         >= c.amount_minor                          THEN 'decided'
    WHEN EXISTS (
      SELECT 1 FROM toll.allocations a
      JOIN toll.paybacks pb ON pb.organization_id = a.organization_id AND pb.id = a.payback_id
      JOIN toll.platform_settings ps ON ps.organization_id = a.organization_id AND ps.platform = pb.platform
      WHERE a.organization_id = c.organization_id AND a.charge_id = c.id AND a.reversed_by IS NULL
        AND a.bearer = 'platform' AND a.payback_id IS NOT NULL AND NOT ps.takes_disputes)
     AND NOT EXISTS (
      SELECT 1 FROM toll.disputes d
      WHERE d.organization_id = c.organization_id AND d.charge_id = c.id
        AND d.state NOT IN ('won', 'part_won', 'lost'))
     THEN 'short_paid'
    ELSE 'pending'
  END
  FROM toll.charges c
  WHERE c.organization_id = p_company AND c.id = p_charge_id;
$$;

CREATE OR REPLACE FUNCTION toll_system.seal_pending_part(p_company uuid, p_charge uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH live AS (
    SELECT s.* FROM toll.suggestions s
    WHERE s.organization_id = p_company AND s.charge_id = p_charge
      AND s.superseded_by IS NULL AND NOT ('withdrawn' = ANY (s.rules_fired))
      AND toll_system.payback_open_minor(p_company, s.payback_id) > 0
  ),
  top AS (SELECT max((score_parts ->> 'total')::numeric) AS mx FROM live)
  SELECT CASE
    WHEN (SELECT count(*) FROM live l, top t WHERE (l.score_parts ->> 'total')::numeric = t.mx) >= 2 THEN 2
    WHEN EXISTS (SELECT 1 FROM live) THEN 1
    ELSE 4
  END;
$$;

DROP FUNCTION IF EXISTS toll_system.seal_blockers(uuid, date);

CREATE OR REPLACE FUNCTION toll_system.seal_blockers(p_company uuid, p_week date)
RETURNS TABLE (kind text, id uuid, amount_minor bigint, reason text, part int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH week_charges AS (
    SELECT c.id, c.amount_minor, toll_system.charge_state(p_company, c.id) AS state
    FROM toll.charges c
    WHERE c.organization_id = p_company
      AND NOT c.is_legacy AND NOT c.after_seal
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week
  ),
  week_paybacks AS (
    SELECT p.id, (p.amount_minor
         - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                     WHERE a.organization_id = p_company AND a.payback_id = p.id AND a.reversed_by IS NULL), 0)
         - coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                     WHERE u.organization_id = p_company AND u.payback_id = p.id AND u.reversed_by IS NULL), 0)
           )::bigint AS unallocated
    FROM toll.paybacks p
    WHERE p.organization_id = p_company
      AND p.week_key = p_week
      AND NOT p.is_legacy AND NOT p.after_seal
      AND p.reversal_of IS NULL
      AND NOT EXISTS (SELECT 1 FROM toll.paybacks r
                      WHERE r.organization_id = p_company AND r.reversal_of = p.id)
  )
  SELECT 'charge'::text, wc.id, wc.amount_minor, wc.state,
         CASE wc.state WHEN 'unverified' THEN 5 WHEN 'short_paid' THEN 5
                       WHEN 'pending' THEN toll_system.seal_pending_part(p_company, wc.id) END
  FROM week_charges wc WHERE wc.state IN ('pending', 'unverified', 'short_paid')
  UNION ALL
  SELECT 'review_pair'::text, d.id, NULL::bigint, 'review_pair'::text, 5
  FROM toll.duplicate_reviews d
  WHERE d.organization_id = p_company AND d.status = 'open'
    AND (d.charge_a IN (SELECT id FROM week_charges) OR d.charge_b IN (SELECT id FROM week_charges))
  UNION ALL
  SELECT 'payback'::text, wp.id, wp.unallocated, 'unallocated_payback'::text, 5
  FROM week_paybacks wp WHERE wp.unallocated > 0
  UNION ALL
  SELECT 'carried'::text, f.id, toll_system.carried_open_minor(p_company, f.id), 'unallocated_payback'::text, 5
  FROM toll.carried_facts f
  WHERE f.organization_id = p_company AND f.to_week = p_week AND f.kind = 'correction_down' AND f.bearer IS NULL
    AND toll_system.carried_open_minor(p_company, f.id) > 0;
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

  SELECT coalesce(jsonb_agg(jsonb_build_object(
              'kind', b.kind, 'id', b.id, 'amountMinor', b.amount_minor, 'reason', b.reason, 'part', b.part)
                            ORDER BY b.kind, b.id), '[]'::jsonb)
  INTO v_blockers
  FROM toll_system.seal_blockers(p_company, v_week) b;
  IF jsonb_array_length(v_blockers) > 0 THEN
    PERFORM toll_write.refuse('PENDING_NOT_RESOLVED', jsonb_build_object('week_key', v_week, 'blocking', v_blockers));
  END IF;

  PERFORM toll_system.seal_writer_on(p_command_id);
  BEGIN
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

    PERFORM toll_system.publish_driver_toll_statements(p_company, v_week, 'closed', auth.uid()::text);

    PERFORM toll_system.seal_writer_off();
    RETURN jsonb_build_object(
      'decision_id', p_decision_id,
      'weeks', jsonb_build_array(jsonb_build_object('week_key', v_week, 'week_version', v_new_ver,
                                                    'delta', jsonb_build_object('sealed', true, 'provisional', v_line))));
  EXCEPTION WHEN OTHERS THEN
    PERFORM toll_system.seal_writer_off();
    RAISE;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_undo_decision(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
  v_amt      bigint;
  v_deltas   jsonb := '{}'::jsonb;
  v_versions jsonb := '{}'::jsonb;
  v_ver      bigint;
  r          record;
  c          toll.charges%ROWTYPE;
  p          toll.paybacks%ROWTYPE;
  f          toll.carried_facts%ROWTYPE;
  v_dispute  jsonb;
BEGIN
  IF v_target IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('decision_id')));
  END IF;
  SELECT * INTO d FROM toll.decisions x WHERE x.organization_id = p_company AND x.id = v_target;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('decision_id', v_target));
  END IF;

  IF d.intent IN ('settle_dispute', 'close_dispute_lost') THEN
    v_dispute := toll_write.intent_undo_dispute_result(p_company, v_target, p_decision, p_cmd);
    RETURN v_dispute || jsonb_build_object('undone_decision_id', v_target);
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
    SELECT u.id, u.amount_minor, coalesce(pb.week_key, cf.to_week) AS week_key
    FROM toll.payback_unlinked_decisions u
    LEFT JOIN toll.paybacks pb ON pb.organization_id = u.organization_id AND pb.id = u.payback_id
    LEFT JOIN toll.carried_facts cf ON cf.organization_id = u.organization_id AND cf.id = u.carried_fact_id
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
  v_company := toll_read.current_company();
  IF v_company IS NULL OR v_user IS NULL THEN
    PERFORM toll_write.refuse('NO_COMPANY');
  END IF;
  IF p_body ? 'organization_id' OR p_body ? 'organizationId' OR p_body ? 'company_id' THEN
    PERFORM toll_write.refuse('COMPANY_NOT_ACCEPTED');
  END IF;

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
    WHEN 'open_dispute' THEN 'toll.manage'
    WHEN 'mark_dispute_sent' THEN 'toll.manage'
    WHEN 'settle_dispute' THEN 'toll.manage'
    WHEN 'close_dispute_lost' THEN 'toll.manage'
    ELSE NULL
  END;
  IF v_permission IS NULL THEN
    PERFORM toll_write.refuse('UNKNOWN_INTENT', jsonb_build_object('intent', p_intent));
  END IF;

  IF p_intent <> 'mark_dispute_sent' AND NOT toll_system.user_can_manage_tolls(v_user, v_company) THEN
    PERFORM toll_write.refuse('FORBIDDEN', jsonb_build_object('permission', v_permission));
  END IF;

  IF v_command_id IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('command_id')));
  END IF;

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
    WHEN 'reverse_payback' THEN toll_write.intent_reverse_payback(v_company, v_decision, v_command_id, p_body)
    WHEN 'correct_charge_amount' THEN toll_write.intent_correct_charge_amount(v_company, v_decision, v_command_id, p_body)
    WHEN 'correct_charge_week' THEN toll_write.intent_correct_charge_week(v_company, v_decision, v_command_id, p_body)
    WHEN 'open_dispute' THEN toll_write.intent_open_dispute(v_company, v_decision, v_command_id, p_body)
    WHEN 'mark_dispute_sent' THEN toll_write.intent_mark_dispute_sent(v_company, v_decision, v_command_id, p_body)
    WHEN 'settle_dispute' THEN toll_write.intent_settle_dispute(v_company, v_decision, v_command_id, p_body, false)
    WHEN 'close_dispute_lost' THEN toll_write.intent_close_dispute_lost(v_company, v_decision, v_command_id, p_body)
    ELSE NULL
  END;
  IF v_response IS NULL THEN
    PERFORM toll_write.refuse('INTENT_NOT_BUILT', jsonb_build_object('intent', p_intent));
  END IF;

  IF octet_length(v_response::text) > 65536 THEN
    v_response := jsonb_build_object('decision_id', v_decision, 'weeks', v_response -> 'weeks', 'truncated', true,
                                     'batch_hash', v_response -> 'batch_hash', 'counts', v_response -> 'counts');
    UPDATE toll.decisions SET response = v_response, response_truncated = true WHERE id = v_decision;
  ELSE
    UPDATE toll.decisions SET response = v_response WHERE id = v_decision;
  END IF;

  RETURN v_response;
END;
$$;
-- patched week_result_live
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
  cf AS (                                               -- R4c: money carried into this week from a paid week (P18, P19)
    SELECT f.kind, f.bearer, f.amount_minor, coalesce(c.driver_id, p.driver_id) AS driver_id, c.paid_by, p.received_by
    FROM toll.carried_facts f
    LEFT JOIN toll.charges c ON f.kind = 'correction_down' AND c.organization_id = f.organization_id AND c.id = f.original_id
    LEFT JOIN toll.paybacks p ON f.kind = 'take_back' AND p.organization_id = f.organization_id AND p.id = f.original_id
    WHERE f.organization_id = p_company AND f.to_week = p_week AND f.kind IN ('take_back', 'correction_down')
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
                     WHERE a.bearer = 'driver' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint
           + coalesce((SELECT sum(f.amount_minor) FROM cf f WHERE f.driver_id IS NOT DISTINCT FROM d.driver_id
                       AND ((f.kind = 'take_back' AND f.bearer = 'driver') OR (f.kind = 'correction_down' AND f.paid_by = 'cash'))), 0)::bigint AS owes,
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
                     WHERE a.bearer = 'fleet' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS fleet_borne
    FROM (SELECT driver_id FROM posted UNION SELECT driver_id FROM pb WHERE received_by = 'driver'
          UNION SELECT driver_id FROM cf) d
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

  -- R4c: carried money, only in a week that has some (so the facts hash of every other week is unchanged)
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
                               -- the week's own facts only: the tag opening / closing depend on earlier weeks,
                               -- which may still be open when this week is sealed
                               'factsHash', md5((v_body #- '{tagAccount,openingMinor}' #- '{tagAccount,closingMinor}')::text),
                               'engineVersion', 'toll_v2_phase1');
END;
$$;


CREATE OR REPLACE FUNCTION toll_system.nightly_checks(p_company uuid)
RETURNS TABLE (check_no int, name text, ok boolean, detail jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_expected bigint;
  v_actual   bigint;
  v_link     bigint;
  v_rule224  bigint;
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

  -- payback_unallocated: active unallocated paybacks + P19 − P18a − P22 − P24.
  -- Open-week dispute refunds use a firm allocation (counted in allocated_minor); sealed-week refunds
  -- post P22 / P24 only, which debit this account, so their net (reversals negative) is subtracted.
  SELECT coalesce(sum(p.amount_minor - p.allocated_minor), 0) INTO v_expected
  FROM toll.v_active_paybacks p WHERE p.organization_id = p_company;
  v_link := 0;
  v_rule224 := toll_system.rule_net(p_company, 'P22\_%') + toll_system.rule_net(p_company, 'P24\_%');
  v_expected := v_expected
              + toll_system.rule_net(p_company, 'P19\_%\_platform') - toll_system.rule_net(p_company, 'P18a\_%')
              - v_rule224;
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

  -- receivable_platform_dispute: open disputes (C4.5)
  SELECT coalesce(sum(d.owed_minor - d.recovered_minor), 0) INTO v_expected
  FROM toll.disputes d
  WHERE d.organization_id = p_company AND d.state IN ('to_send', 'sent');
  v_actual := toll_system.natural_balance(p_company, 'toll:receivable_platform_dispute');
  check_no := 1; name := 'account:toll:receivable_platform_dispute'; ok := v_actual = v_expected;
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
           + toll_system.rule_net(p_company, 'P21\_%', 'charge_id', r.id::text)
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
  -- P2-R4c: P18 / P19 legs count in their carried row's to_week, against toll_system.carried_sum.
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
      -- suspense: +P2 +P3 +P16up −P16down −P6 −P7 −P8 −P21 (charge week)
      coalesce((SELECT sum(CASE WHEN rule ~ '^(P2_|P3_|P16_up_)' THEN amt
                                WHEN rule ~ '^(P16_down_|P6_|P7_|P8_|P21_)' THEN -amt ELSE 0 END) FROM cl WHERE cl.wk = w.wk), 0) AS suspense_flow,
      coalesce((SELECT sum(c.amount_minor - c.allocated_minor) FROM toll.v_live_charges c
                WHERE c.organization_id = p_company AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0) AS suspense_expected,
      -- payback_unallocated: +P4 +P5 −P6 (payback week)
      coalesce((SELECT sum(CASE WHEN rule ~ '^(P4_|P5_)' THEN amt WHEN rule ~ '^P6_' THEN -amt ELSE 0 END)
                FROM pl WHERE pl.wk = w.wk), 0)
        + coalesce((SELECT sum(CASE WHEN rule ~ '^P19_.*_platform$' THEN amt WHEN rule ~ '^P18a_' THEN -amt ELSE 0 END)
                    FROM fl WHERE fl.wk = w.wk), 0) AS unalloc_flow,
      (coalesce((SELECT sum(p.amount_minor - coalesce((
                   SELECT sum(a.amount_minor) FROM toll.allocations a
                   WHERE a.organization_id = p.organization_id AND a.payback_id = p.id
                     AND (a.reversed_by IS NULL OR a.reversed_by IN (
                       SELECT t.id FROM toll.paybacks t WHERE t.organization_id = p.organization_id AND t.reversal_of = p.id))), 0))
                FROM toll.paybacks p
                WHERE p.organization_id = p_company AND p.week_key = w.wk AND NOT p.is_legacy AND NOT p.after_seal
                  AND p.reversal_of IS NULL), 0)
       - coalesce((SELECT sum(o.amount_minor - coalesce((
                   SELECT sum(a.amount_minor) FROM toll.allocations a
                   WHERE a.organization_id = o.organization_id AND a.payback_id = o.id AND a.reversed_by = t.id), 0))
                FROM toll.paybacks t JOIN toll.paybacks o ON o.organization_id = t.organization_id AND o.id = t.reversal_of
                WHERE t.organization_id = p_company AND t.week_key = w.wk AND NOT t.is_legacy AND NOT t.after_seal), 0)

        + toll_system.carried_sum(p_company, w.wk, 'cd_platform')
        - toll_system.carried_sum(p_company, w.wk, 'tb_leftover')
      ) AS unalloc_expected,
      -- expense: +P8 (charge week) −P20 (carried-to week)
      coalesce((SELECT sum(amt) FROM cl WHERE cl.wk = w.wk AND rule ~ '^P8_'), 0)
        - coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P20_'), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P18b_fleet_'), 0)
        - coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P19_.*_fleet$'), 0) AS expense_flow,
      coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a JOIN toll.v_live_charges c
                  ON c.organization_id = a.organization_id AND c.id = a.charge_id
                WHERE a.organization_id = p_company AND a.bearer = 'fleet' AND a.reversed_by IS NULL
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0)
        - coalesce((SELECT sum(f.amount_minor) FROM toll.carried_facts f
                    WHERE f.organization_id = p_company AND f.kind = 'cash_recovered' AND f.to_week = w.wk), 0)
        + toll_system.carried_sum(p_company, w.wk, 'tb_fleet')
        - toll_system.carried_sum(p_company, w.wk, 'cd_fleet') AS expense_expected,
      -- receivable_driver: +P7 (charge week)
      coalesce((SELECT sum(amt) FROM cl WHERE cl.wk = w.wk AND rule ~ '^P7_'), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^(P18b_driver_|P19_cash_)'), 0) AS rd_flow,
      coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a JOIN toll.v_live_charges c
                  ON c.organization_id = a.organization_id AND c.id = a.charge_id
                WHERE a.organization_id = p_company AND a.bearer = 'driver' AND a.reversed_by IS NULL
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0)
        + toll_system.carried_sum(p_company, w.wk, 'tb_driver')
        + toll_system.carried_sum(p_company, w.wk, 'cd_cash') AS rd_expected,
      -- payable_driver: +P3 +P16up_cash −P16down_cash (charge week)
      coalesce((SELECT sum(CASE WHEN rule ~ '^(P3_|P16_up_cash)' THEN amt WHEN rule ~ '^P16_down_cash' THEN -amt ELSE 0 END)
                FROM cl WHERE cl.wk = w.wk), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P19_.*_driver$'), 0) AS pd_flow,
      coalesce((SELECT sum(c.amount_minor) FROM toll.v_live_charges c
                WHERE c.organization_id = p_company AND c.paid_by = 'cash' AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0)
        + toll_system.carried_sum(p_company, w.wk, 'cd_driver') AS pd_expected,
      -- tag_prepaid: +P1 (top-up week) −P2 −P16up_tag +P16down_tag (charge week)
      coalesce((SELECT sum(amt) FROM tl WHERE tl.wk = w.wk AND rule ~ '^P1_'), 0)
        - coalesce((SELECT sum(CASE WHEN rule ~ '^(P2_|P16_up_tag)' THEN amt WHEN rule ~ '^P16_down_tag' THEN -amt ELSE 0 END)
                    FROM cl WHERE cl.wk = w.wk), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P19_tag_'), 0) AS tag_flow,
      coalesce((SELECT sum(t.amount_minor) FROM toll.tag_topups t WHERE t.organization_id = p_company AND t.week_key = w.wk), 0)
        - coalesce((SELECT sum(c.amount_minor) FROM toll.v_live_charges c
                    WHERE c.organization_id = p_company AND c.paid_by = 'tag' AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0)
        + toll_system.carried_sum(p_company, w.wk, 'cd_tag') AS tag_expected,
      -- receivable_platform: +P4 (payback week); recovered_in_driver_cash: +P5 (payback week) +P20 (carried-to week)
      coalesce((SELECT sum(amt) FROM pl WHERE pl.wk = w.wk AND rule ~ '^P4_'), 0)
        - coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^(P18a_leftover_fleet|P18b_.*_card)$'), 0) AS rp_flow,
      -- every recorded payback counts + in its week, every take-back − in the take-back's week (P17 reverses P4/P5)
      coalesce((SELECT sum(CASE WHEN p.reversal_of IS NULL THEN p.amount_minor ELSE -p.amount_minor END) FROM toll.paybacks p
                WHERE p.organization_id = p_company AND p.received_by = 'fleet' AND p.week_key = w.wk
                  AND NOT p.is_legacy AND NOT p.after_seal), 0)
        - toll_system.carried_sum(p_company, w.wk, 'tb_card') AS rp_expected,
      coalesce((SELECT sum(amt) FROM pl WHERE pl.wk = w.wk AND rule ~ '^P5_'), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P20_'), 0)
        - coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^(P18a_leftover_driver|P18b_.*_cash)$'), 0) AS rc_flow,
      coalesce((SELECT sum(CASE WHEN p.reversal_of IS NULL THEN p.amount_minor ELSE -p.amount_minor END) FROM toll.paybacks p
                WHERE p.organization_id = p_company AND p.received_by = 'driver' AND p.week_key = w.wk
                  AND NOT p.is_legacy AND NOT p.after_seal), 0)
        + coalesce((SELECT sum(f.amount_minor) FROM toll.carried_facts f
                    WHERE f.organization_id = p_company AND f.kind = 'cash_recovered' AND f.to_week = w.wk), 0)
        - toll_system.carried_sum(p_company, w.wk, 'tb_cash') AS rc_expected
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

REVOKE ALL ON FUNCTION toll_write.require_disputes_on(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.posting_week(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_chain_root(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_deadline(date, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_post_at(uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.charge_has_provisional_dispute(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_active_provisional_amt(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_bearer_allocation_amt(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_post_rule_for_allocation(text, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_reverse_allocation(uuid, uuid, uuid, text, integer, date, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_insert_allocation(uuid, uuid, text, bigint, uuid, boolean, uuid, text, uuid, text, integer, date, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_begin_carried_result(uuid, uuid, date, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_post_clear(uuid, text, bigint, uuid, uuid, uuid, text, text, integer, date, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_charge_week_sealed(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_apply_open_provisional(uuid, uuid, uuid, bigint, uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_apply_fleet_open_late(uuid, uuid, uuid, bigint, uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_apply_rule2_refund(uuid, uuid, uuid, uuid, bigint, uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_apply_rule3_rest(uuid, uuid, uuid, bigint, text, uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_apply_rule4_expired_refund(uuid, uuid, uuid, uuid, bigint, text, uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_expire(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_auto_close(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_open_dispute(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_mark_dispute_sent(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_settle_dispute(uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_close_dispute_lost(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_undo_dispute_result(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.withdraw_suggestion(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.seal_pending_part(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.seal_blockers(uuid, date) FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- D2 (B13): database refuses money writes into a sealed counted week unless seal/reopen set the session proof.

-- 1. Session helpers -------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.seal_writer_on(p_command_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('toll.seal_writer', 'on', true);
  PERFORM set_config('toll.seal_writer_cmd', coalesce(p_command_id, ''), true);
  PERFORM set_config('toll.seal_writer_proof', md5(coalesce(p_command_id, '') || ':' || txid_current()::text), true);
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.seal_writer_off()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('toll.seal_writer', 'off', true);
  PERFORM set_config('toll.seal_writer_cmd', '', true);
  PERFORM set_config('toll.seal_writer_proof', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.seal_week_guard_bypass()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(current_setting('toll.seal_writer', true), 'off') = 'on'
     AND coalesce(current_setting('toll.seal_writer_proof', true), '') =
         md5(coalesce(current_setting('toll.seal_writer_cmd', true), '') || ':' || txid_current()::text);
$$;

CREATE OR REPLACE FUNCTION toll_system.entry_toll_week(p_row ledger.entries)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(nullif(p_row.metadata ->> 'toll_week', '')::date, ledger.jamaica_week_start(p_row.effective_at));
$$;

CREATE OR REPLACE FUNCTION toll_system.payback_unlinked_counted_week(p_org uuid, p_row toll.payback_unlinked_decisions)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_wk date;
BEGIN
  IF p_row.payback_id IS NOT NULL THEN
    SELECT p.week_key INTO v_wk FROM toll.paybacks p
    WHERE p.organization_id = p_org AND p.id = p_row.payback_id;
  ELSE
    SELECT f.to_week INTO v_wk FROM toll.carried_facts f
    WHERE f.organization_id = p_org AND f.id = p_row.carried_fact_id;
  END IF;
  RETURN v_wk;
END;
$$;

CREATE OR REPLACE FUNCTION toll.sealed_week_raise(p_table text, p_week_key date, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING MESSAGE = 'SEALED_WEEK_LOCKED',
    DETAIL = json_build_object('table', p_table, 'week_key', p_week_key, 'id', p_id)::text,
    ERRCODE = 'P0001';
END;
$$;

-- 2. seal_week / reopen_week: toll.seal_writer + cmd/proof for this transaction only ----------------
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

  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'id', b.id, 'amountMinor', b.amount_minor, 'reason', b.reason)
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

  PERFORM pg_advisory_xact_lock(hashtextextended('toll_week:' || p_company || ':' || v_week, 0));

  v_current := toll_system.week_version(p_company, v_week);
  IF v_current <> v_expected THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object('week_key', v_week, 'week_version', v_current));
  END IF;
  IF NOT toll_system.week_is_sealed(p_company, v_week) THEN
    PERFORM toll_write.refuse('WEEK_NOT_SEALED', jsonb_build_object('week_key', v_week));
  END IF;

  IF EXISTS (SELECT 1 FROM ledger.settlement_movements m
             WHERE m.organization_id = p_company AND m.period_anchor = v_week
               AND m.kind IN ('pay', 'write_off') AND m.status = 'posted') THEN
    PERFORM toll_write.refuse('DRIVERS_ALREADY_PAID', jsonb_build_object('week_key', v_week, 'use', 'carry_forward'));
  END IF;

  PERFORM toll_system.seal_writer_on(p_command_id);
  BEGIN
    v_new_ver := v_current + 1;
    INSERT INTO ledger.week_statements (kind, organization_id, driver_id, week_key, version, status,
                                        amounts_minor, source_row_ids, engine_version, close_reason)
    VALUES ('toll_week', p_company, '*', v_week, v_new_ver, 'draft',
            '{}'::jsonb, '[]'::jsonb, 'toll_v2_phase0', 'reopen: ' || v_reason);

    PERFORM toll_system.publish_driver_toll_statements(p_company, v_week, 'draft', auth.uid()::text);

    INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, new_row, actor_user_id)
    VALUES (p_company, 'ledger.week_statements', 'toll_week:' || v_week, 'reopen',
            jsonb_build_object('week_version', v_new_ver, 'reason', v_reason, 'decision_id', p_decision_id), auth.uid());

    PERFORM toll_system.seal_writer_off();
    RETURN jsonb_build_object(
      'decision_id', p_decision_id,
      'weeks', jsonb_build_array(jsonb_build_object('week_key', v_week, 'week_version', v_new_ver,
                                                    'delta', jsonb_build_object('sealed', false))));
  EXCEPTION WHEN OTHERS THEN
    PERFORM toll_system.seal_writer_off();
    RAISE;
  END;
END;
$$;

-- 3. Table guards ----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll.tg_allocations_sealed_week_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org    uuid;
  v_charge uuid;
  v_week   date;
  v_id     uuid;
BEGIN
  IF toll_system.seal_week_guard_bypass() THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_org := OLD.organization_id;
    v_charge := OLD.charge_id;
    v_id := OLD.id;
  ELSE
    v_org := NEW.organization_id;
    v_charge := NEW.charge_id;
    v_id := COALESCE(NEW.id, OLD.id);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.reversed_by IS NOT DISTINCT FROM OLD.reversed_by THEN
    RETURN NEW;
  END IF;

  SELECT toll_system.charge_counted_week(v_org, c.id, c.week_key) INTO v_week
  FROM toll.charges c WHERE c.organization_id = v_org AND c.id = v_charge;

  IF v_week IS NOT NULL AND toll_system.week_is_sealed(v_org, v_week) THEN
    PERFORM toll.sealed_week_raise('toll.allocations', v_week, v_id);
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER allocations_sealed_week_guard
  BEFORE INSERT OR UPDATE OR DELETE ON toll.allocations
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_allocations_sealed_week_guard();

CREATE OR REPLACE FUNCTION toll.tg_payback_unlinked_sealed_week_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org  uuid;
  v_week date;
  v_id   uuid;
  v_row  toll.payback_unlinked_decisions%ROWTYPE;
BEGIN
  IF toll_system.seal_week_guard_bypass() THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_row := CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  v_org := v_row.organization_id;
  v_id := v_row.id;
  v_week := toll_system.payback_unlinked_counted_week(v_org, v_row);

  IF TG_OP = 'UPDATE' AND NEW.reversed_by IS NOT DISTINCT FROM OLD.reversed_by THEN
    RETURN NEW;
  END IF;

  IF v_week IS NOT NULL AND toll_system.week_is_sealed(v_org, v_week) THEN
    PERFORM toll.sealed_week_raise('toll.payback_unlinked_decisions', v_week, v_id);
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER payback_unlinked_sealed_week_guard
  BEFORE INSERT OR UPDATE OR DELETE ON toll.payback_unlinked_decisions
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_payback_unlinked_sealed_week_guard();

CREATE OR REPLACE FUNCTION toll.tg_charges_sealed_week_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_week date;
BEGIN
  IF toll_system.seal_week_guard_bypass() THEN
    RETURN NEW;
  END IF;

  IF NEW.amount_minor IS DISTINCT FROM OLD.amount_minor THEN
    v_week := toll_system.charge_counted_week(OLD.organization_id, OLD.id, OLD.week_key);
    IF toll_system.week_is_sealed(OLD.organization_id, v_week) THEN
      PERFORM toll.sealed_week_raise('toll.charges', v_week, OLD.id);
    END IF;
  END IF;

  IF NEW.week_key IS DISTINCT FROM OLD.week_key
     AND toll_system.week_is_sealed(OLD.organization_id, NEW.week_key) THEN
    PERFORM toll.sealed_week_raise('toll.charges', NEW.week_key, OLD.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER charges_sealed_week_guard
  BEFORE UPDATE ON toll.charges
  FOR EACH ROW
  WHEN (NEW.amount_minor IS DISTINCT FROM OLD.amount_minor OR NEW.week_key IS DISTINCT FROM OLD.week_key)
  EXECUTE FUNCTION toll.tg_charges_sealed_week_guard();

CREATE OR REPLACE FUNCTION toll.tg_paybacks_sealed_week_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF toll_system.seal_week_guard_bypass() THEN
    RETURN NEW;
  END IF;

  IF NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     AND toll_system.week_is_sealed(OLD.organization_id, OLD.week_key) THEN
    PERFORM toll.sealed_week_raise('toll.paybacks', OLD.week_key, OLD.id);
  END IF;

  IF NEW.week_key IS DISTINCT FROM OLD.week_key
     AND toll_system.week_is_sealed(OLD.organization_id, NEW.week_key) THEN
    PERFORM toll.sealed_week_raise('toll.paybacks', NEW.week_key, OLD.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER paybacks_sealed_week_guard
  BEFORE UPDATE ON toll.paybacks
  FOR EACH ROW
  WHEN (NEW.amount_minor IS DISTINCT FROM OLD.amount_minor OR NEW.week_key IS DISTINCT FROM OLD.week_key)
  EXECUTE FUNCTION toll.tg_paybacks_sealed_week_guard();

-- 4. Extend ledger.entries guard (one trigger) -------------------------------------------------------
CREATE OR REPLACE FUNCTION toll.tg_ledger_entries_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row         ledger.entries%ROWTYPE;
  v_touches_toll boolean;
  v_week        date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM ledger.accounts a
    WHERE a.id IN (v_row.debit_account_id, v_row.credit_account_id)
      AND a.account_key ~ '^org:[0-9a-fA-F-]{36}:toll:'
  ) INTO v_touches_toll;

  IF NOT v_touches_toll THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TOLL_ROWS_PERMANENT: toll ledger rows are never deleted; post a reversal';
  END IF;

  IF coalesce(current_setting('toll.writer', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'TOLL_WRITER_ONLY: toll ledger accounts are written only through toll_system.post';
  END IF;

  v_week := toll_system.entry_toll_week(v_row);
  IF toll_system.week_is_sealed(v_row.organization_id, v_week) AND NOT toll_system.seal_week_guard_bypass() THEN
    PERFORM toll.sealed_week_raise('ledger.entries', v_week, v_row.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS toll_ledger_entries_guard ON ledger.entries;
CREATE TRIGGER toll_ledger_entries_guard
  BEFORE INSERT OR UPDATE OR DELETE ON ledger.entries
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_ledger_entries_guard();

-- Only the SECURITY DEFINER seal/reopen intents (run as the owner) may raise the bypass; not even service_role.
REVOKE ALL ON FUNCTION toll_system.seal_writer_on(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.seal_writer_off() FROM PUBLIC, anon, authenticated, service_role;

-- D1 follow-up: toll_system functions are never callable by signed-in users (toll_v2_contract).
REVOKE ALL ON FUNCTION toll_system.plaza_rate(text, text, text, date) FROM authenticated;
REVOKE ALL ON FUNCTION toll_system.seal_week_guard_bypass() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll_system.entry_toll_week(ledger.entries) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll_system.payback_unlinked_counted_week(uuid, toll.payback_unlinked_decisions)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll.sealed_week_raise(text, date, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll.tg_allocations_sealed_week_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll.tg_payback_unlinked_sealed_week_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll.tg_charges_sealed_week_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll.tg_paybacks_sealed_week_guard() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
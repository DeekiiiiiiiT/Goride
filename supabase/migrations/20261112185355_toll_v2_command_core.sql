-- Toll rebuild Phase 0 R3: the command core, the seal rule (G1) and reopen.
-- Design: docs/toll-architecture.md B3 (contract, transaction order), B6 (seal requires / reopen), B2 (one charge state).
--
--   public.toll_v2_command(intent, body)  : the only entry point. Called with the USER'S token (B7.1).
--   toll_write.command(intent, body)      : runs the B3 transaction order, all or nothing.
--   toll_system.charge_state(...)           : the one closed charge state (B2, G1.1).
--   toll_system.seal_blockers(company, week): what stops a week from sealing (B6, G1).
--
-- Every refusal is an exception with MESSAGE = the code (WEEK_SEALED, VERSION_CHANGED, PENDING_NOT_RESOLVED, ...)
-- and DETAIL = a JSON object; the whole transaction rolls back, so a refusal writes nothing (I7).
-- Phase 0 intents: seal_week, reopen_week. carry_forward checks its refusals and then answers
-- INTENT_NOT_BUILT (built in Phase 2). Every other intent of the closed list answers INTENT_NOT_BUILT.

-- 1. decisions: append-only, except the stored answer may be filled in once ----------------------
CREATE OR REPLACE FUNCTION toll.tg_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'audit_log' THEN
    RAISE EXCEPTION '% is append-only: % not allowed', TG_TABLE_NAME, lower(TG_OP);
  END IF;

  IF TG_TABLE_NAME = 'decisions' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'decisions is append-only: delete not allowed';
    END IF;
    -- R3: the command row is written first (it is the replay lock) and its answer is stored at the end.
    IF OLD.response IS NOT NULL
       OR to_jsonb(NEW) - 'response' - 'response_truncated'
          IS DISTINCT FROM to_jsonb(OLD) - 'response' - 'response_truncated' THEN
      RAISE EXCEPTION 'decisions is append-only: only the stored answer may be set, once';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'suggestions' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'suggestions is append-only: delete not allowed';
    END IF;
    IF to_jsonb(NEW) - 'superseded_by' IS DISTINCT FROM to_jsonb(OLD) - 'superseded_by' THEN
      RAISE EXCEPTION 'suggestions: only superseded_by may be updated';
    END IF;
    IF OLD.superseded_by IS NOT NULL THEN
      RAISE EXCEPTION 'suggestions: superseded_by already set';
    END IF;
    IF NEW.superseded_by IS NULL THEN
      RAISE EXCEPTION 'suggestions: superseded_by must be set on update';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Small helpers ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.refuse(p_code text, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING MESSAGE = p_code, DETAIL = coalesce(p_detail, '{}'::jsonb)::text, ERRCODE = 'P0001';
END;
$$;

-- Latest toll_week statement version for a week (0 = never sealed or reopened).
CREATE OR REPLACE FUNCTION toll_system.week_version(p_company uuid, p_week date)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(max(ws.version), 0)
  FROM ledger.week_statements ws
  WHERE ws.organization_id = p_company AND ws.kind = 'toll_week' AND ws.driver_id = '*' AND ws.week_key = p_week;
$$;

-- The week a charge counts in: its carried_facts to_week when carried, else its own week_key (B2, G1.8).
CREATE OR REPLACE FUNCTION toll_system.charge_counted_week(p_company uuid, p_charge_id uuid, p_week_key date)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT f.to_week FROM toll.carried_facts f
    WHERE f.organization_id = p_company AND f.original_id = p_charge_id AND f.kind IN ('charge', 'correction_up')
    ORDER BY f.created_at DESC LIMIT 1
  ), p_week_key);
$$;

-- The one closed charge state, checked in the B2 order.
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
    ELSE 'pending'
  END
  FROM toll.charges c
  WHERE c.organization_id = p_company AND c.id = p_charge_id;
$$;

-- What stops a week from sealing (B6, G1). One row per blocking record; reason = the record's one state.
CREATE OR REPLACE FUNCTION toll_system.seal_blockers(p_company uuid, p_week date)
RETURNS TABLE (kind text, id uuid, amount_minor bigint, reason text)
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
      AND p.reversal_of IS NULL                                   -- a reversing payback has no state of its own
      AND NOT EXISTS (SELECT 1 FROM toll.paybacks r             -- a reversed payback is final
                      WHERE r.organization_id = p_company AND r.reversal_of = p.id)
  )
  SELECT 'charge'::text, wc.id, wc.amount_minor, wc.state
  FROM week_charges wc WHERE wc.state IN ('pending', 'unverified')
  UNION ALL
  SELECT 'review_pair'::text, d.id, NULL::bigint, 'review_pair'::text
  FROM toll.duplicate_reviews d
  WHERE d.organization_id = p_company AND d.status = 'open'
    AND (d.charge_a IN (SELECT id FROM week_charges) OR d.charge_b IN (SELECT id FROM week_charges))
  UNION ALL
  SELECT 'payback'::text, wp.id, wp.unallocated, 'unallocated_payback'::text
  FROM week_paybacks wp WHERE wp.unallocated > 0;
$$;

-- Who may manage tolls for a company (step 2 of B3). The Fleet permission catalog is in code
-- (packages/auth-client/src/permissions.ts: 'toll.manage' = platform_owner, fleet_owner, fleet_manager) and the
-- role comes from _fleet-server/access_resolution.ts. This mirrors the part that grants toll.manage inside one
-- company, from the same tables, and refuses when unsure:
--   * the user owns the company (organizations.owner_id, fleet product line), or
--   * the user has an ACTIVE, unexpired organization seat in that company as fleet_owner or fleet_manager.
-- Platform staff acting for a company come later, through toll.staff_company_access (B7.5); refused in Phase 0.
-- A drift test (R6) fails if the catalog's toll.manage roles change.
CREATE OR REPLACE FUNCTION toll_system.user_can_manage_tolls(p_user uuid, p_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user IS NOT NULL AND p_company IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = p_company AND o.owner_id = p_user AND coalesce(o.product_line, 'fleet') = 'fleet'
    )
    OR EXISTS (
      SELECT 1
      FROM platform.user_roles ur
      JOIN platform.roles r ON r.id = ur.role_id
      WHERE ur.user_id = p_user
        AND ur.scope_type = 'organization'
        AND ur.scope_id = p_company
        AND ur.status = 'active'
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
        AND r.name IN ('fleet_owner', 'fleet_manager')
    )
  );
$$;

REVOKE ALL ON FUNCTION toll_system.user_can_manage_tolls(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- 3. Intent: seal_week --------------------------------------------------------------------------
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
  v_hash      text;
  v_counts    jsonb;
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

  -- G1: everything decided
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'id', b.id, 'amountMinor', b.amount_minor, 'reason', b.reason)
                            ORDER BY b.kind, b.id), '[]'::jsonb)
  INTO v_blockers
  FROM toll_system.seal_blockers(p_company, v_week) b;
  IF jsonb_array_length(v_blockers) > 0 THEN
    PERFORM toll_write.refuse('PENDING_NOT_RESOLVED', jsonb_build_object('week_key', v_week, 'blocking', v_blockers));
  END IF;

  -- G1.2: Roam cash rides still awaiting cash are decided provisionally as the fleet's, inside the seal
  FOR v_awaiting IN
    SELECT c.id, c.amount_minor, c.occurred_at, c.driver_id,
           (c.amount_minor - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                                       WHERE a.organization_id = p_company AND a.charge_id = c.id AND a.reversed_by IS NULL), 0)
           )::bigint AS open_minor
    FROM toll.charges c
    WHERE c.organization_id = p_company AND NOT c.is_legacy AND NOT c.after_seal
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = v_week
      AND toll_system.charge_state(p_company, c.id) = 'awaiting_cash'
  LOOP
    CONTINUE WHEN v_awaiting.open_minor <= 0;
    v_line := v_line + 1;
    INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, provisional, decision_id)
    VALUES (p_company, v_awaiting.id, 'fleet', v_awaiting.open_minor, 'awaiting_cash_at_seal', true, p_decision_id);
    PERFORM toll_system.post(p_company, 'P8_allocate_fleet', v_awaiting.open_minor, v_awaiting.occurred_at,
                             p_command_id, v_line,
                             jsonb_build_object('charge_id', v_awaiting.id, 'driver_id', v_awaiting.driver_id));
  END LOOP;

  -- The sealed statement (Phase 0 summary; Phase 1 stores the full TollWeekResultV1 here)
  SELECT jsonb_build_object(
           'charges',  (SELECT count(*) FROM toll.charges c WHERE c.organization_id = p_company AND NOT c.is_legacy
                          AND NOT c.after_seal AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = v_week),
           'paybacks', (SELECT count(*) FROM toll.paybacks p WHERE p.organization_id = p_company AND NOT p.is_legacy
                          AND NOT p.after_seal AND p.week_key = v_week),
           'provisional', v_line)
  INTO v_counts;
  v_hash := md5(v_counts::text || ':' || v_week);
  v_new_ver := v_current + 1;

  INSERT INTO ledger.week_statements (kind, organization_id, driver_id, week_key, version, status,
                                      amounts_minor, source_row_ids, source_hash, engine_version,
                                      closed_at, closed_by, close_reason)
  VALUES ('toll_week', p_company, '*', v_week, v_new_ver, 'closed',
          v_counts, '[]'::jsonb, v_hash, 'toll_v2_phase0', now(), auth.uid()::text, 'seal_week');

  RETURN jsonb_build_object(
    'decision_id', p_decision_id,
    'weeks', jsonb_build_array(jsonb_build_object('week_key', v_week, 'week_version', v_new_ver,
                                                  'delta', jsonb_build_object('sealed', true, 'provisional', v_line))));
END;
$$;

-- 4. Intent: reopen_week ------------------------------------------------------------------------
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

  INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, new_row, actor_user_id)
  VALUES (p_company, 'ledger.week_statements', 'toll_week:' || v_week, 'reopen',
          jsonb_build_object('week_version', v_new_ver, 'reason', v_reason, 'decision_id', p_decision_id), auth.uid());

  RETURN jsonb_build_object(
    'decision_id', p_decision_id,
    'weeks', jsonb_build_array(jsonb_build_object('week_key', v_week, 'week_version', v_new_ver,
                                                  'delta', jsonb_build_object('sealed', false))));
END;
$$;

-- 5. Intent: carry_forward (Phase 0: refusals only) --------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_carry_forward(p_company uuid, p_decision_id uuid, p_command_id text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from_week date := (p_body ->> 'from_week')::date;
BEGIN
  IF v_from_week IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('from_week')));
  END IF;
  IF NOT toll_system.week_is_sealed(p_company, v_from_week) THEN
    PERFORM toll_write.refuse('WEEK_NOT_SEALED', jsonb_build_object('week_key', v_from_week));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ledger.settlement_movements m
                 WHERE m.organization_id = p_company AND m.period_anchor = v_from_week
                   AND m.kind IN ('pay', 'write_off') AND m.status = 'posted') THEN
    PERFORM toll_write.refuse('REOPEN_INSTEAD', jsonb_build_object('week_key', v_from_week));
  END IF;
  PERFORM toll_write.refuse('INTENT_NOT_BUILT', jsonb_build_object('intent', 'carry_forward', 'phase', 2));
  RETURN NULL;
END;
$$;

-- 6. The command (B3 transaction order) ---------------------------------------------------------
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
  -- 1. Company from the user's own token only (B7)
  v_company := toll_read.current_company();
  IF v_company IS NULL OR v_user IS NULL THEN
    PERFORM toll_write.refuse('NO_COMPANY');
  END IF;
  IF p_body ? 'organization_id' OR p_body ? 'organizationId' OR p_body ? 'company_id' THEN
    PERFORM toll_write.refuse('COMPANY_NOT_ACCEPTED');           -- no company parameter, ever
  END IF;

  -- 2. Permission (closed list of intents)
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
    ELSE NULL
  END;
  IF v_permission IS NULL THEN
    PERFORM toll_write.refuse('UNKNOWN_INTENT', jsonb_build_object('intent', p_intent));
  END IF;
  IF NOT toll_system.user_can_manage_tolls(v_user, v_company) THEN
    PERFORM toll_write.refuse('FORBIDDEN', jsonb_build_object('permission', v_permission));
  END IF;
  IF v_command_id IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('command_id')));
  END IF;

  -- 3. Replay: the command row is the lock. A second call with the same id waits here, then gets the first answer.
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

  -- 4-8. Locks, versions, week state, the decision, the ledger: inside each intent
  v_response := CASE p_intent
    WHEN 'seal_week'     THEN toll_write.intent_seal_week(v_company, v_decision, v_command_id, p_body)
    WHEN 'reopen_week'   THEN toll_write.intent_reopen_week(v_company, v_decision, v_command_id, p_body)
    WHEN 'carry_forward' THEN toll_write.intent_carry_forward(v_company, v_decision, v_command_id, p_body)
    ELSE NULL
  END;
  IF v_response IS NULL THEN
    PERFORM toll_write.refuse('INTENT_NOT_BUILT', jsonb_build_object('intent', p_intent));
  END IF;

  -- 9. Store the answer (at most 64 KB; a larger one keeps decision, versions and per-week deltas only)
  IF octet_length(v_response::text) > 65536 THEN
    v_response := jsonb_build_object('decision_id', v_decision, 'weeks', v_response -> 'weeks', 'truncated', true);
    UPDATE toll.decisions SET response = v_response, response_truncated = true WHERE id = v_decision;
  ELSE
    UPDATE toll.decisions SET response = v_response WHERE id = v_decision;
  END IF;

  RETURN v_response;
END;
$$;

-- 7. The public entry point (PostgREST exposes public; it runs as the calling user) --------------
CREATE OR REPLACE FUNCTION public.toll_v2_command(p_intent text, p_body jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT toll_write.command(p_intent, p_body); $$;

-- Is tolls v2 switched on for the caller's company? (B11: every toll request checks this first, on the server,
-- with the user's token; the service key has no access to toll tables.)
CREATE OR REPLACE FUNCTION public.toll_v2_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT s.tolls_v2 FROM toll.switch_state s
                   WHERE s.organization_id = toll_read.current_company()), false);
$$;

REVOKE ALL ON FUNCTION public.toll_v2_enabled() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.toll_v2_enabled() TO authenticated;

-- 8. Grants: users only, never anon, never the service key (B7.3) -------------------------------
REVOKE ALL ON FUNCTION public.toll_v2_command(text, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.toll_v2_command(text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION toll_write.command(text, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION toll_write.command(text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION toll_write.refuse(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_seal_week(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_reopen_week(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_carry_forward(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION toll_system.week_version(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.week_version(uuid, date) TO service_role;

-- Internal helpers take a company id, so they live in toll_system and nobody calls them directly (B7.2).
REVOKE ALL ON FUNCTION toll_system.charge_counted_week(uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.charge_state(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.seal_blockers(uuid, date) FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Toll rebuild Phase 2 P2-R1: the import core.

-- Toll rebuild Phase 2 P2-R1: the import core (design B2, B3 "import_batch", B4 duplicates, B9 adapters; Part F Phase 2).
-- Adapters (P2-R2) turn a file into normalized rows; import_batch turns rows into records, one row at a time,
-- and returns a row report. Rules:
--   * batch identity: company + kind + hash of the sorted rows; the same batch again replays the first report;
--   * row identity: source_ref; an existing row with the same amount is skipped; a changed amount is applied only
--     when nothing depends on it (open week, no allocations), otherwise it waits as a pending change for a person;
--   * a row for a sealed week is kept as after_seal (never posted, listed beside the frozen week);
--   * cross-source duplicates (same vehicle + plaza within the plaza window): roam_ride > tag_statement > driver_cash.
--     If the loser already has decisions or sits in a sealed week, the pair goes to the review list instead.
--     Same-source rows with different source_refs are genuine (two real crossings) and never flagged;
--   * Uber / InDrive: trips upsert as matching input; a trip's toll payback (per_trip) and positive support
--     adjustments become paybacks (cash trip → received_by driver, otherwise fleet); a NEGATIVE adjustment is a
--     take-back and is reported for a person (reverse_payback), never stored as a refund.

ALTER TABLE toll.charges ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb;  -- receipt url, OCR fields

CREATE OR REPLACE FUNCTION toll_system.source_rank(p_source text)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_source WHEN 'roam_ride' THEN 3 WHEN 'tag_statement' THEN 2 WHEN 'driver_cash' THEN 1 ELSE 0 END;
$$;

-- One charge row from a file (tag statement or driver cash). Returns {status, id, line}.
CREATE OR REPLACE FUNCTION toll_system.import_charge_row(p_company uuid, p_source text, p_paid_by text, p_row jsonb,
                                                        p_decision uuid, p_cmd text, p_line int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref      text := nullif(btrim(p_row ->> 'source_ref'), '');
  v_at       timestamptz := (p_row ->> 'occurred_at')::timestamptz;
  v_amount   bigint := (p_row ->> 'amount_minor')::bigint;
  v_vehicle  text := nullif(p_row ->> 'vehicle_id', '');
  v_plaza    text := nullif(p_row ->> 'plaza_id', '');
  v_evidence text := CASE WHEN p_paid_by = 'cash' THEN coalesce(nullif(p_row ->> 'evidence_status', ''), 'unverified') ELSE 'verified' END;
  v_week     date;
  v_ex       toll.charges%ROWTYPE;
  v_new      uuid;
  v_cand     record;
  v_window   int;
  v_line     int := p_line;
  v_has_alloc boolean;
BEGIN
  IF v_ref IS NULL OR v_at IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'source_ref, occurred_at and amount_minor > 0 are required', 'line', v_line);
  END IF;
  IF v_evidence NOT IN ('unverified', 'verified') THEN v_evidence := 'unverified'; END IF;
  v_week := ledger.jamaica_week_start(v_at);

  -- Already imported?
  SELECT * INTO v_ex FROM toll.charges c WHERE c.organization_id = p_company AND c.source = p_source AND c.source_ref = v_ref;
  IF FOUND THEN
    IF v_ex.amount_minor = v_amount THEN
      RETURN jsonb_build_object('status', 'unchanged', 'id', v_ex.id, 'line', v_line);
    END IF;
    SELECT EXISTS (SELECT 1 FROM toll.allocations a WHERE a.organization_id = p_company AND a.charge_id = v_ex.id
                     AND a.reversed_by IS NULL) INTO v_has_alloc;
    IF v_has_alloc OR v_ex.after_seal OR toll_system.week_is_sealed(p_company, v_ex.week_key) OR v_ex.duplicate_of IS NOT NULL THEN
      INSERT INTO toll.charge_changes (organization_id, charge_id, field, old_value, new_value, pending, decision_id)
      VALUES (p_company, v_ex.id, 'amount_minor', v_ex.amount_minor::text, v_amount::text, true, p_decision);
      RETURN jsonb_build_object('status', 'correction_pending', 'id', v_ex.id, 'line', v_line);
    END IF;
    -- Open week, nothing depends on it: apply now (P16 when it was posted).
    IF v_ex.evidence_status = 'verified' THEN
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company,
        'P16_' || CASE WHEN v_amount > v_ex.amount_minor THEN 'up_' ELSE 'down_' END || v_ex.paid_by,
        abs(v_amount - v_ex.amount_minor), v_ex.occurred_at, p_cmd, v_line,
        jsonb_build_object('charge_id', v_ex.id, 'driver_id', v_ex.driver_id));
    END IF;
    INSERT INTO toll.charge_changes (organization_id, charge_id, field, old_value, new_value, pending, decision_id)
    VALUES (p_company, v_ex.id, 'amount_minor', v_ex.amount_minor::text, v_amount::text, false, p_decision);
    UPDATE toll.charges SET amount_minor = v_amount, version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = v_ex.id;
    RETURN jsonb_build_object('status', 'corrected', 'id', v_ex.id, 'line', v_line);
  END IF;

  -- New row in a sealed week: kept, listed, never posted.
  IF toll_system.week_is_sealed(p_company, v_week) THEN
    INSERT INTO toll.charges (organization_id, vehicle_id, driver_id, plaza_id, occurred_at, week_key, time_precision,
                              amount_minor, paid_by, source, source_ref, evidence_status, after_seal, evidence)
    VALUES (p_company, v_vehicle, nullif(p_row ->> 'driver_id', ''), v_plaza, v_at, v_week,
            coalesce(nullif(p_row ->> 'time_precision', ''), 'minute'), v_amount, p_paid_by, p_source, v_ref, v_evidence, true,
            coalesce(p_row -> 'evidence', '{}'::jsonb))
    RETURNING id INTO v_new;
    RETURN jsonb_build_object('status', 'after_seal', 'id', v_new, 'line', v_line);
  END IF;

  INSERT INTO toll.charges (organization_id, vehicle_id, driver_id, plaza_id, occurred_at, week_key, time_precision,
                            amount_minor, paid_by, source, source_ref, evidence_status, evidence)
  VALUES (p_company, v_vehicle, nullif(p_row ->> 'driver_id', ''), v_plaza, v_at, v_week,
          coalesce(nullif(p_row ->> 'time_precision', ''), 'minute'), v_amount, p_paid_by, p_source, v_ref, v_evidence,
          coalesce(p_row -> 'evidence', '{}'::jsonb))
  RETURNING id INTO v_new;

  -- Cross-source duplicate within the plaza's window (auto rule, B2).
  IF v_vehicle IS NOT NULL AND v_plaza IS NOT NULL THEN
    SELECT coalesce((SELECT pr.auto_duplicate_window_minutes FROM toll.plaza_rules pr WHERE pr.plaza_id = v_plaza), 10)
      INTO v_window;
    SELECT c.* INTO v_cand FROM toll.charges c
    WHERE c.organization_id = p_company AND c.id <> v_new AND c.vehicle_id = v_vehicle AND c.plaza_id = v_plaza
      AND c.source <> p_source AND NOT c.is_legacy AND NOT c.after_seal AND c.duplicate_of IS NULL
      AND c.evidence_status <> 'rejected'
      AND abs(extract(epoch FROM (c.occurred_at - v_at))) <= v_window * 60
    ORDER BY abs(extract(epoch FROM (c.occurred_at - v_at))), c.id LIMIT 1;

    IF FOUND THEN
      IF toll_system.source_rank(v_cand.source) >= toll_system.source_rank(p_source) THEN
        -- The existing record wins: the new one is the duplicate (never posted).
        UPDATE toll.charges SET duplicate_of = v_cand.id WHERE organization_id = p_company AND id = v_new;
        RETURN jsonb_build_object('status', 'duplicate', 'id', v_new, 'duplicate_of', v_cand.id, 'line', v_line);
      END IF;
      -- The new one wins. Auto only when nothing depends on the loser and its week is open; else a review pair.
      SELECT EXISTS (SELECT 1 FROM toll.allocations a WHERE a.organization_id = p_company AND a.charge_id = v_cand.id
                       AND a.reversed_by IS NULL) INTO v_has_alloc;
      IF v_has_alloc OR toll_system.week_is_sealed(p_company, v_cand.week_key) THEN
        INSERT INTO toll.duplicate_reviews (organization_id, charge_a, charge_b, decision_id)
        VALUES (p_company, least(v_new, v_cand.id), greatest(v_new, v_cand.id), p_decision)
        ON CONFLICT (organization_id, charge_a, charge_b) DO NOTHING;
      ELSE
        IF v_cand.evidence_status = 'verified' THEN
          v_line := v_line + 1;
          PERFORM toll_system.post(p_company, CASE WHEN v_cand.paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END,
                                   v_cand.amount_minor, v_cand.occurred_at, p_cmd, v_line,
                                   jsonb_build_object('charge_id', v_cand.id, 'driver_id', v_cand.driver_id), true);
        END IF;
        UPDATE toll.charges SET duplicate_of = v_new, version = version + 1, updated_at = now()
        WHERE organization_id = p_company AND id = v_cand.id;
      END IF;
    ELSE
      -- Review list: a cross-source record for the same vehicle and plaza on the same day (outside the window).
      SELECT c.* INTO v_cand FROM toll.charges c
      WHERE c.organization_id = p_company AND c.id <> v_new AND c.vehicle_id = v_vehicle AND c.plaza_id = v_plaza
        AND c.source <> p_source AND NOT c.is_legacy AND c.duplicate_of IS NULL AND c.evidence_status <> 'rejected'
        AND (c.occurred_at AT TIME ZONE 'America/Jamaica')::date = (v_at AT TIME ZONE 'America/Jamaica')::date
      LIMIT 1;
      IF FOUND THEN
        INSERT INTO toll.duplicate_reviews (organization_id, charge_a, charge_b, decision_id)
        VALUES (p_company, least(v_new, v_cand.id), greatest(v_new, v_cand.id), p_decision)
        ON CONFLICT (organization_id, charge_a, charge_b) DO NOTHING;
      END IF;
    END IF;
  END IF;

  IF v_evidence = 'verified' THEN
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, CASE WHEN p_paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END,
                             v_amount, v_at, p_cmd, v_line,
                             jsonb_build_object('charge_id', v_new, 'driver_id', nullif(p_row ->> 'driver_id', '')));
  END IF;
  RETURN jsonb_build_object('status', CASE WHEN EXISTS (SELECT 1 FROM toll.duplicate_reviews d WHERE d.organization_id = p_company
                                                   AND (d.charge_a = v_new OR d.charge_b = v_new) AND d.status = 'open')
                                           THEN 'review_pair' ELSE 'new' END,
                            'id', v_new, 'line', v_line);
END;
$$;

-- One payback (platform trip toll line or support adjustment). Returns {status, id, line}.
CREATE OR REPLACE FUNCTION toll_system.import_payback_row(p_company uuid, p_platform text, p_kind text, p_reference text,
                                                         p_trip_id text, p_driver text, p_paid_on date, p_week date,
                                                         p_amount bigint, p_received_by text, p_effective timestamptz,
                                                         p_cmd text, p_line int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ex  toll.paybacks%ROWTYPE;
  v_new uuid;
  v_line int := p_line;
BEGIN
  SELECT * INTO v_ex FROM toll.paybacks p WHERE p.organization_id = p_company AND p.platform = p_platform AND p.reference = p_reference;
  IF FOUND THEN
    RETURN jsonb_build_object('status', CASE WHEN v_ex.amount_minor = p_amount THEN 'unchanged' ELSE 'payback_changed_needs_person' END,
                              'id', v_ex.id, 'line', v_line);
  END IF;
  IF toll_system.week_is_sealed(p_company, p_week) THEN
    INSERT INTO toll.paybacks (organization_id, platform, kind, platform_trip_id, reference, driver_id, paid_on, week_key,
                               amount_minor, received_by, after_seal)
    VALUES (p_company, p_platform, p_kind, p_trip_id, p_reference, p_driver, p_paid_on, p_week, p_amount, p_received_by, true)
    RETURNING id INTO v_new;
    RETURN jsonb_build_object('status', 'after_seal', 'id', v_new, 'line', v_line);
  END IF;
  INSERT INTO toll.paybacks (organization_id, platform, kind, platform_trip_id, reference, driver_id, paid_on, week_key,
                             amount_minor, received_by)
  VALUES (p_company, p_platform, p_kind, p_trip_id, p_reference, p_driver, p_paid_on, p_week, p_amount, p_received_by)
  RETURNING id INTO v_new;
  v_line := v_line + 1;
  PERFORM toll_system.post(p_company, CASE WHEN p_received_by = 'fleet' THEN 'P4_payback_fleet' ELSE 'P5_payback_driver' END,
                           p_amount, p_effective, p_cmd, v_line, jsonb_build_object('payback_id', v_new, 'driver_id', p_driver));
  RETURN jsonb_build_object('status', 'new', 'id', v_new, 'line', v_line);
END;
$$;

-- The batch. p_kind: tag_statement | topups | driver_cash | uber | indrive.
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
            SET driver_id = excluded.driver_id, vehicle_id = excluded.vehicle_id, request_at = excluded.request_at,
                pickup_at = excluded.pickup_at, dropoff_at = excluded.dropoff_at, time_precision = excluded.time_precision,
                payment_method = excluded.payment_method;
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
          v_res := jsonb_build_object('status', 'take_back_needs_person', 'amount_minor', v_amt, 'reference', r ->> 'reference');
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
    v_report := v_report || jsonb_build_array((v_res - 'line') || jsonb_build_object('row', v_i,
                  'ref', coalesce(r ->> 'source_ref', r ->> 'reference', r ->> 'platform_trip_id')));
  END LOOP;

  RETURN jsonb_build_object(
    'kind', p_kind, 'rows', v_i,
    'counts', (SELECT coalesce(jsonb_object_agg(s, n), '{}'::jsonb) FROM (
                 SELECT x ->> 'status' AS s, count(*) AS n FROM jsonb_array_elements(v_report) x GROUP BY 1) c),
    'report', v_report);
END;
$$;

-- For people: the import_batch intent (B3). The batch identity is company + kind + hash of the sorted rows;
-- the same batch again returns the first report (replay), so re-uploading a file never changes anything.
CREATE OR REPLACE FUNCTION toll_write.intent_import_batch(p_company uuid, p_decision_id uuid, p_command_id text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind  text := p_body ->> 'kind';
  v_rows  jsonb := p_body -> 'rows';
  v_hash  text;
  v_prev  jsonb;
  v_res   jsonb;
BEGIN
  IF v_kind IS NULL OR jsonb_typeof(v_rows) IS DISTINCT FROM 'array' THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('kind', 'rows')));
  END IF;
  v_hash := md5(p_company::text || ':' || v_kind || ':' ||
                coalesce((SELECT jsonb_agg(x ORDER BY x::text) FROM jsonb_array_elements(v_rows) x)::text, '[]'));
  SELECT d.response INTO v_prev FROM toll.decisions d
  WHERE d.organization_id = p_company AND d.intent = 'import_batch' AND d.response IS NOT NULL
    AND d.response ->> 'batch_hash' = v_hash
  ORDER BY d.created_at LIMIT 1;
  IF v_prev IS NOT NULL THEN
    RETURN v_prev || jsonb_build_object('decision_id', p_decision_id, 'same_batch_as', v_prev ->> 'decision_id');
  END IF;
  v_res := toll_system.import_batch(p_company, v_kind, v_rows, p_decision_id, p_command_id);
  RETURN v_res || jsonb_build_object('decision_id', p_decision_id, 'batch_hash', v_hash, 'file_name', p_body ->> 'file_name',
                                     'weeks', '[]'::jsonb);
END;
$$;

-- For the system (the driver app's cash receipts arrive through the server with the service key; B3 "import or system").
CREATE OR REPLACE FUNCTION toll_system.system_import(p_company uuid, p_kind text, p_rows jsonb, p_command_id text, p_actor_job text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_decision uuid; v_stored jsonb; v_res jsonb;
BEGIN
  IF p_company IS NULL OR nullif(btrim(p_command_id), '') IS NULL THEN RAISE EXCEPTION 'BAD_REQUEST: company and command_id required'; END IF;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_job, targets)
  VALUES (p_company, p_command_id, 'import_batch', 'system', coalesce(p_actor_job, 'import_batch:system'),
          jsonb_build_object('kind', p_kind, 'rows', jsonb_array_length(coalesce(p_rows, '[]'::jsonb))))
  ON CONFLICT (organization_id, command_id) DO NOTHING
  RETURNING id INTO v_decision;
  IF v_decision IS NULL THEN
    SELECT d.response INTO v_stored FROM toll.decisions d WHERE d.organization_id = p_company AND d.command_id = p_command_id;
    RETURN coalesce(v_stored, '{}'::jsonb) || jsonb_build_object('replay', true);
  END IF;
  v_res := toll_system.import_batch(p_company, p_kind, p_rows, v_decision, p_command_id) || jsonb_build_object('decision_id', v_decision);
  UPDATE toll.decisions SET response = CASE WHEN octet_length(v_res::text) > 65536
                                            THEN jsonb_build_object('decision_id', v_decision, 'counts', v_res -> 'counts', 'truncated', true)
                                            ELSE v_res END,
                            response_truncated = octet_length(v_res::text) > 65536
  WHERE id = v_decision;
  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.toll_sys_import(p_company uuid, p_kind text, p_rows jsonb, p_command_id text, p_actor_job text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT toll_system.system_import(p_company, p_kind, p_rows, p_command_id, p_actor_job);
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
    WHEN 'import_batch'  THEN toll_write.intent_import_batch(v_company, v_decision, v_command_id, p_body)
    ELSE NULL
  END;
  IF v_response IS NULL THEN
    PERFORM toll_write.refuse('INTENT_NOT_BUILT', jsonb_build_object('intent', p_intent));
  END IF;

  -- 9. Store the answer (at most 64 KB; a larger one keeps decision, versions and per-week deltas only)
  IF octet_length(v_response::text) > 65536 THEN
    -- keep what replays and the batch identity need (an imported file's report can be large)
    v_response := jsonb_build_object('decision_id', v_decision, 'weeks', v_response -> 'weeks', 'truncated', true,
                                     'batch_hash', v_response -> 'batch_hash', 'counts', v_response -> 'counts');
    UPDATE toll.decisions SET response = v_response, response_truncated = true WHERE id = v_decision;
  ELSE
    UPDATE toll.decisions SET response = v_response WHERE id = v_decision;
  END IF;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION toll_system.source_rank(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.import_charge_row(uuid, text, text, jsonb, uuid, text, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.import_payback_row(uuid, text, text, text, text, text, date, date, bigint, text, timestamptz, text, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.import_batch(uuid, text, jsonb, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_import_batch(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.system_import(uuid, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.system_import(uuid, text, jsonb, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.toll_sys_import(uuid, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_import(uuid, text, jsonb, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

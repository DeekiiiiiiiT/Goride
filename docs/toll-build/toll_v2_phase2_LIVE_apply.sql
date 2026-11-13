-- Toll rebuild Phase 2: the 6 migrations, all or nothing, with logbook lines. Run BEFORE deploying the Phase 2 code.
-- Paste the WHOLE file into the Supabase SQL editor and run it once. Nothing changes for any fleet (tolls_v2 stays off).
BEGIN;

-- ===== 20261113001948_toll_v2_import_core =====
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


-- ===== 20261113011349_toll_v2_matcher =====
-- Toll rebuild Phase 2 P2-R3: the matcher's database side (design B4, B2 "toll.suggestions"; Part F P2-R3).
--
-- The scoring engine is pure TypeScript (packages/toll-core/src/v2/matcher). This file gives it:
--   1. toll.match_queue: one row per record whose matching may have changed. Triggers fill it whenever data
--      arrives (a charge, payback or trip is written or changes; an allocation or "left unlinked" decision is
--      made or reversed; a toll week is sealed or reopened). Roam native records are never queued.
--   2. toll_system.match_claim(company): claims queued records and returns the engine's input bundle: the
--      records in scope (the changed records, their candidates and their previous partners) plus two hops of neighbours, so competitor counts are complete.
--   3. toll_system.match_store(company, claim_id, result): stores the engine's suggestions append-only.
--      Same pair + same engine version + same inputs hash → unchanged. Different → a new row; the old one is
--      superseded. A pair in scope that is no longer a candidate gets a 'withdrawn' row that supersedes it.
--      Nothing is applied: auto_apply stays a shadow flag in score_parts (apply comes with P2-R4).
--   4. toll_system.match_pending(): companies with queued work (for the sweep).
-- Only service_role may call the public wrappers; the Fleet server runs claim → engine → store.

-- 1. Queue ------------------------------------------------------------------------------------------------
CREATE TABLE toll.match_queue (
  organization_id uuid NOT NULL,
  record_kind text NOT NULL CHECK (record_kind IN ('charge', 'payback', 'trip')),
  record_id uuid NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  claim_id uuid,
  claimed_at timestamptz,
  PRIMARY KEY (organization_id, record_kind, record_id)
);
CREATE INDEX toll_match_queue_organization_id_claim_id_idx ON toll.match_queue (organization_id, claim_id);

REVOKE ALL ON toll.match_queue FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON toll.match_queue TO authenticated;
ALTER TABLE toll.match_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY match_queue_company_read ON toll.match_queue FOR SELECT TO authenticated
  USING (organization_id = toll_read.current_company());

-- Lookups the neighbour search needs.
CREATE INDEX IF NOT EXISTS toll_charges_organization_id_vehicle_id_occurred_at_idx ON toll.charges (organization_id, vehicle_id, occurred_at);
CREATE INDEX IF NOT EXISTS toll_charges_organization_id_driver_id_occurred_at_idx ON toll.charges (organization_id, driver_id, occurred_at);
CREATE INDEX IF NOT EXISTS toll_platform_trips_organization_id_vehicle_id_idx ON toll.platform_trips (organization_id, vehicle_id);
CREATE INDEX IF NOT EXISTS toll_paybacks_organization_id_platform_trip_idx ON toll.paybacks (organization_id, platform, platform_trip_id);
CREATE INDEX IF NOT EXISTS toll_paybacks_organization_id_driver_id_paid_on_idx ON toll.paybacks (organization_id, driver_id, paid_on);
CREATE INDEX IF NOT EXISTS toll_suggestions_organization_id_pair_idx ON toll.suggestions (organization_id, charge_id, payback_id)
  WHERE superseded_by IS NULL;

CREATE OR REPLACE FUNCTION toll_system.match_enqueue(p_company uuid, p_kind text, p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  -- A record queued again while claimed is released, so it is matched once more after the current run.
  INSERT INTO toll.match_queue (organization_id, record_kind, record_id)
  VALUES (p_company, p_kind, p_id)
  ON CONFLICT (organization_id, record_kind, record_id)
  DO UPDATE SET enqueued_at = now(), claim_id = NULL, claimed_at = NULL;
$$;

CREATE OR REPLACE FUNCTION toll.tg_match_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_src text;
BEGIN
  IF TG_TABLE_NAME = 'charges' THEN
    IF NEW.source <> 'roam_ride' THEN
      PERFORM toll_system.match_enqueue(NEW.organization_id, 'charge', NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'paybacks' THEN
    IF NEW.kind <> 'native' THEN
      PERFORM toll_system.match_enqueue(NEW.organization_id, 'payback', NEW.id);
    END IF;
    IF TG_OP = 'INSERT' AND NEW.reversal_of IS NOT NULL THEN
      PERFORM toll_system.match_enqueue(NEW.organization_id, 'payback', NEW.reversal_of);  -- the original is now reversed
    END IF;
  ELSIF TG_TABLE_NAME = 'platform_trips' THEN
    PERFORM toll_system.match_enqueue(NEW.organization_id, 'trip', NEW.id);
  ELSIF TG_TABLE_NAME = 'allocations' THEN
    SELECT c.source INTO v_src FROM toll.charges c WHERE c.organization_id = NEW.organization_id AND c.id = NEW.charge_id;
    IF v_src IS DISTINCT FROM 'roam_ride' THEN
      PERFORM toll_system.match_enqueue(NEW.organization_id, 'charge', NEW.charge_id);
      IF NEW.payback_id IS NOT NULL THEN
        PERFORM toll_system.match_enqueue(NEW.organization_id, 'payback', NEW.payback_id);
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'payback_unlinked_decisions' THEN
    IF NEW.payback_id IS NOT NULL THEN
      PERFORM toll_system.match_enqueue(NEW.organization_id, 'payback', NEW.payback_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER charges_match_enqueue_ins AFTER INSERT ON toll.charges
  FOR EACH ROW EXECUTE FUNCTION toll.tg_match_enqueue();
CREATE TRIGGER charges_match_enqueue_upd AFTER UPDATE ON toll.charges
  FOR EACH ROW WHEN (
    OLD.amount_minor IS DISTINCT FROM NEW.amount_minor OR OLD.occurred_at IS DISTINCT FROM NEW.occurred_at
    OR OLD.vehicle_id IS DISTINCT FROM NEW.vehicle_id OR OLD.driver_id IS DISTINCT FROM NEW.driver_id
    OR OLD.time_precision IS DISTINCT FROM NEW.time_precision OR OLD.week_key IS DISTINCT FROM NEW.week_key
    OR OLD.duplicate_of IS DISTINCT FROM NEW.duplicate_of OR OLD.evidence_status IS DISTINCT FROM NEW.evidence_status
    OR OLD.after_seal IS DISTINCT FROM NEW.after_seal OR OLD.is_legacy IS DISTINCT FROM NEW.is_legacy)
  EXECUTE FUNCTION toll.tg_match_enqueue();

CREATE TRIGGER paybacks_match_enqueue_ins AFTER INSERT ON toll.paybacks
  FOR EACH ROW EXECUTE FUNCTION toll.tg_match_enqueue();
CREATE TRIGGER paybacks_match_enqueue_upd AFTER UPDATE ON toll.paybacks
  FOR EACH ROW WHEN (
    OLD.amount_minor IS DISTINCT FROM NEW.amount_minor OR OLD.platform_trip_id IS DISTINCT FROM NEW.platform_trip_id
    OR OLD.driver_id IS DISTINCT FROM NEW.driver_id OR OLD.paid_on IS DISTINCT FROM NEW.paid_on
    OR OLD.week_key IS DISTINCT FROM NEW.week_key OR OLD.after_seal IS DISTINCT FROM NEW.after_seal
    OR OLD.is_legacy IS DISTINCT FROM NEW.is_legacy)
  EXECUTE FUNCTION toll.tg_match_enqueue();

CREATE TRIGGER platform_trips_match_enqueue_ins AFTER INSERT ON toll.platform_trips
  FOR EACH ROW EXECUTE FUNCTION toll.tg_match_enqueue();
CREATE TRIGGER platform_trips_match_enqueue_upd AFTER UPDATE ON toll.platform_trips
  FOR EACH ROW WHEN (
    OLD.vehicle_id IS DISTINCT FROM NEW.vehicle_id OR OLD.driver_id IS DISTINCT FROM NEW.driver_id
    OR OLD.request_at IS DISTINCT FROM NEW.request_at OR OLD.pickup_at IS DISTINCT FROM NEW.pickup_at
    OR OLD.dropoff_at IS DISTINCT FROM NEW.dropoff_at OR OLD.time_precision IS DISTINCT FROM NEW.time_precision
    OR OLD.is_legacy IS DISTINCT FROM NEW.is_legacy)
  EXECUTE FUNCTION toll.tg_match_enqueue();

CREATE TRIGGER allocations_match_enqueue_ins AFTER INSERT ON toll.allocations
  FOR EACH ROW EXECUTE FUNCTION toll.tg_match_enqueue();
CREATE TRIGGER allocations_match_enqueue_upd AFTER UPDATE ON toll.allocations
  FOR EACH ROW WHEN (OLD.reversed_by IS DISTINCT FROM NEW.reversed_by OR OLD.amount_minor IS DISTINCT FROM NEW.amount_minor)
  EXECUTE FUNCTION toll.tg_match_enqueue();

CREATE TRIGGER payback_unlinked_match_enqueue_ins AFTER INSERT ON toll.payback_unlinked_decisions
  FOR EACH ROW EXECUTE FUNCTION toll.tg_match_enqueue();
CREATE TRIGGER payback_unlinked_match_enqueue_upd AFTER UPDATE ON toll.payback_unlinked_decisions
  FOR EACH ROW WHEN (OLD.reversed_by IS DISTINCT FROM NEW.reversed_by OR OLD.amount_minor IS DISTINCT FROM NEW.amount_minor)
  EXECUTE FUNCTION toll.tg_match_enqueue();

-- A seal makes a week's records ineligible; a reopen makes them eligible again. Queue that week's records.
CREATE OR REPLACE FUNCTION toll.tg_match_week_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.kind = 'toll_week' AND NEW.driver_id = '*' THEN
    PERFORM toll_system.match_enqueue(NEW.organization_id, 'charge', c.id)
    FROM toll.charges c
    WHERE c.organization_id = NEW.organization_id AND c.week_key = NEW.week_key
      AND c.source <> 'roam_ride' AND NOT c.is_legacy;
    PERFORM toll_system.match_enqueue(NEW.organization_id, 'payback', p.id)
    FROM toll.paybacks p
    WHERE p.organization_id = NEW.organization_id AND p.week_key = NEW.week_key
      AND p.kind <> 'native' AND NOT p.is_legacy;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER week_statements_toll_match_enqueue AFTER INSERT OR UPDATE OF status ON ledger.week_statements
  FOR EACH ROW WHEN (NEW.kind = 'toll_week')
  EXECUTE FUNCTION toll.tg_match_week_change();

-- 2. Neighbours (generous supersets; the engine applies the exact windows) ----------------------------------
-- Anchor of a trip = pickup, else request, else drop-off. ±2 days covers every B4 window (−45 / +15 min,
-- date_only by day). Adjustments: same driver, paid 0–7 days after the crossing (±1 day for the day edge).
CREATE OR REPLACE FUNCTION toll_system.match_paybacks_near(p_company uuid, p_charges uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id
  FROM toll.charges c
  JOIN toll.platform_trips t
    ON t.organization_id = c.organization_id AND t.vehicle_id = c.vehicle_id AND NOT t.is_legacy
   AND coalesce(t.pickup_at, t.request_at, t.dropoff_at) BETWEEN c.occurred_at - interval '2 days' AND c.occurred_at + interval '2 days'
  JOIN toll.paybacks p
    ON p.organization_id = t.organization_id AND p.platform = t.platform AND p.platform_trip_id = t.platform_trip_id
   AND p.kind = 'trip_line' AND NOT p.is_legacy
  WHERE c.organization_id = p_company AND c.id = ANY (p_charges)
  UNION
  SELECT p.id
  FROM toll.charges c
  JOIN toll.paybacks p
    ON p.organization_id = c.organization_id AND p.kind = 'adjustment' AND p.driver_id = c.driver_id AND NOT p.is_legacy
   AND p.paid_on BETWEEN (c.occurred_at AT TIME ZONE 'America/Jamaica')::date - 1
                     AND (c.occurred_at AT TIME ZONE 'America/Jamaica')::date + 8
  WHERE c.organization_id = p_company AND c.id = ANY (p_charges);
$$;

CREATE OR REPLACE FUNCTION toll_system.match_charges_near(p_company uuid, p_paybacks uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id
  FROM toll.paybacks p
  JOIN toll.platform_trips t
    ON t.organization_id = p.organization_id AND t.platform = p.platform AND t.platform_trip_id = p.platform_trip_id
   AND NOT t.is_legacy
  JOIN toll.charges c
    ON c.organization_id = t.organization_id AND c.vehicle_id = t.vehicle_id
   AND c.source <> 'roam_ride' AND NOT c.is_legacy
   AND c.occurred_at BETWEEN coalesce(t.pickup_at, t.request_at, t.dropoff_at) - interval '2 days'
                         AND coalesce(t.pickup_at, t.request_at, t.dropoff_at) + interval '2 days'
  WHERE p.organization_id = p_company AND p.id = ANY (p_paybacks) AND p.kind = 'trip_line'
  UNION
  SELECT c.id
  FROM toll.paybacks p
  JOIN toll.charges c
    ON c.organization_id = p.organization_id AND c.driver_id = p.driver_id
   AND c.source <> 'roam_ride' AND NOT c.is_legacy
   AND (c.occurred_at AT TIME ZONE 'America/Jamaica')::date BETWEEN p.paid_on - 8 AND p.paid_on + 1
  WHERE p.organization_id = p_company AND p.id = ANY (p_paybacks) AND p.kind = 'adjustment';
$$;

-- The scope of a claim: every record whose pairs are re-scored in this run.
--   changed  = queued charges and paybacks, plus the paybacks of queued trips;
--   scope    = changed + their candidates now (near) + their partners before (open suggestions).
-- A new record changes the competitor count of every record it competes with, and a record that moved away
-- changes the count of its old partners, so both are re-scored. Records further out keep their counts.
CREATE OR REPLACE FUNCTION toll_system.match_scope(p_company uuid, p_claim uuid, OUT charge_ids uuid[], OUT payback_ids uuid[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c uuid[];
  v_p uuid[];
BEGIN
  v_c := array(SELECT q.record_id FROM toll.match_queue q
               WHERE q.organization_id = p_company AND q.claim_id = p_claim AND q.record_kind = 'charge');
  v_p := array(SELECT q.record_id FROM toll.match_queue q
               WHERE q.organization_id = p_company AND q.claim_id = p_claim AND q.record_kind = 'payback'
               UNION
               SELECT p.id FROM toll.match_queue q
               JOIN toll.platform_trips t ON t.organization_id = q.organization_id AND t.id = q.record_id
               JOIN toll.paybacks p ON p.organization_id = t.organization_id AND p.platform = t.platform
                                   AND p.platform_trip_id = t.platform_trip_id
               WHERE q.organization_id = p_company AND q.claim_id = p_claim AND q.record_kind = 'trip');
  charge_ids := array(
    SELECT unnest(v_c)
    UNION SELECT toll_system.match_charges_near(p_company, v_p)
    UNION SELECT s.charge_id FROM toll.suggestions s
          WHERE s.organization_id = p_company AND s.superseded_by IS NULL AND s.payback_id = ANY (v_p)
            AND NOT ('withdrawn' = ANY (s.rules_fired)));
  payback_ids := array(
    SELECT unnest(v_p)
    UNION SELECT toll_system.match_paybacks_near(p_company, v_c)
    UNION SELECT s.payback_id FROM toll.suggestions s
          WHERE s.organization_id = p_company AND s.superseded_by IS NULL AND s.charge_id = ANY (v_c)
            AND NOT ('withdrawn' = ANY (s.rules_fired)));
END;
$$;

-- 3. Claim -----------------------------------------------------------------------------------------------
-- A claim older than 10 minutes is treated as abandoned and can be claimed again.
CREATE OR REPLACE FUNCTION toll_system.match_claim(p_company uuid, p_limit int DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim uuid := gen_random_uuid();
  v_n     int;
  v_fc    uuid[];
  v_fp    uuid[];
  v_c0    uuid[];
  v_p0    uuid[];
  v_c     uuid[];
  v_p     uuid[];
BEGIN
  IF p_company IS NULL THEN RAISE EXCEPTION 'BAD_REQUEST: company required'; END IF;

  UPDATE toll.match_queue q SET claim_id = v_claim, claimed_at = now()
  WHERE (q.organization_id, q.record_kind, q.record_id) IN (
    SELECT x.organization_id, x.record_kind, x.record_id
    FROM toll.match_queue x
    WHERE x.organization_id = p_company
      AND (x.claim_id IS NULL OR x.claimed_at < now() - interval '10 minutes')
    ORDER BY x.enqueued_at, x.record_kind, x.record_id
    LIMIT greatest(1, least(coalesce(p_limit, 500), 2000))
    FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('claim_id', NULL);
  END IF;

  -- Scope (re-scored), then their partners, then the partners' competitors, so every scoped pair's
  -- competitor counts are complete.
  SELECT f.charge_ids, f.payback_ids INTO v_fc, v_fp FROM toll_system.match_scope(p_company, v_claim) f;
  v_c0 := array(SELECT unnest(v_fc) UNION SELECT toll_system.match_charges_near(p_company, v_fp));
  v_p0 := array(SELECT unnest(v_fp) UNION SELECT toll_system.match_paybacks_near(p_company, v_fc));
  v_c  := array(SELECT unnest(v_c0) UNION SELECT toll_system.match_charges_near(p_company, v_p0));
  v_p  := array(SELECT unnest(v_p0) UNION SELECT toll_system.match_paybacks_near(p_company, v_c0));

  RETURN jsonb_build_object(
    'claim_id', v_claim,
    'queued', v_n,
    'focal', jsonb_build_object('charge_ids', to_jsonb(v_fc), 'payback_ids', to_jsonb(v_fp)),
    'charges', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id, 'source', c.source, 'vehicle_id', c.vehicle_id, 'driver_id', c.driver_id,
               'plaza_id', c.plaza_id, 'occurred_at', c.occurred_at, 'time_precision', c.time_precision,
               'amount_minor', c.amount_minor,
               'remaining_minor', c.amount_minor - coalesce((
                  SELECT sum(a.amount_minor) FROM toll.allocations a
                  WHERE a.organization_id = c.organization_id AND a.charge_id = c.id AND a.reversed_by IS NULL), 0),
               'evidence_status', c.evidence_status, 'duplicate_of', c.duplicate_of, 'after_seal', c.after_seal,
               'is_legacy', c.is_legacy, 'week_sealed', toll_system.week_is_sealed(p_company, c.week_key))
             ORDER BY c.id), '[]'::jsonb)
      FROM toll.charges c WHERE c.organization_id = p_company AND c.id = ANY (v_c)),
    'paybacks', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', p.id, 'platform', p.platform, 'kind', p.kind, 'platform_trip_id', p.platform_trip_id,
               'driver_id', p.driver_id, 'paid_on', p.paid_on, 'amount_minor', p.amount_minor,
               'remaining_minor', p.amount_minor
                  - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                              WHERE a.organization_id = p.organization_id AND a.payback_id = p.id AND a.reversed_by IS NULL), 0)
                  - coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                              WHERE u.organization_id = p.organization_id AND u.payback_id = p.id AND u.reversed_by IS NULL), 0),
               'received_by', p.received_by, 'reversal_of', p.reversal_of,
               'reversed', EXISTS (SELECT 1 FROM toll.paybacks r WHERE r.organization_id = p.organization_id AND r.reversal_of = p.id),
               'after_seal', p.after_seal, 'is_legacy', p.is_legacy,
               'week_sealed', toll_system.week_is_sealed(p_company, p.week_key))
             ORDER BY p.id), '[]'::jsonb)
      FROM toll.paybacks p WHERE p.organization_id = p_company AND p.id = ANY (v_p)),
    'trips', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'platform', t.platform, 'platform_trip_id', t.platform_trip_id, 'vehicle_id', t.vehicle_id,
               'driver_id', t.driver_id, 'request_at', t.request_at, 'pickup_at', t.pickup_at, 'dropoff_at', t.dropoff_at,
               'time_precision', t.time_precision, 'payment_method', t.payment_method, 'is_legacy', t.is_legacy)
             ORDER BY t.platform, t.platform_trip_id), '[]'::jsonb)
      FROM toll.platform_trips t
      WHERE t.organization_id = p_company
        AND EXISTS (SELECT 1 FROM toll.paybacks p WHERE p.organization_id = t.organization_id AND p.id = ANY (v_p)
                      AND p.platform = t.platform AND p.platform_trip_id = t.platform_trip_id)),
    'settings', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('platform', s.platform, 'auto_apply', s.auto_apply,
                                                   'payback_mode', s.payback_mode) ORDER BY s.platform), '[]'::jsonb)
      FROM toll.platform_settings s WHERE s.organization_id = p_company));
END;
$$;

-- 4. Store (append-only) ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.match_store(p_company uuid, p_claim uuid, p_result jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ev       text := nullif(btrim(p_result ->> 'engine_version'), '');
  v_fc       uuid[];
  v_fp       uuid[];
  r          jsonb;
  v_c        uuid;
  v_p        uuid;
  v_inputs   jsonb;
  v_hash     text;
  v_open     toll.suggestions%ROWTYPE;
  v_has_open boolean;
  v_new      uuid;
  v_seen     text[] := '{}';
  n_new      int := 0;
  n_same     int := 0;
  n_replaced int := 0;
  n_withdrawn int := 0;
  n_skipped  int := 0;
BEGIN
  IF p_company IS NULL OR p_claim IS NULL OR v_ev IS NULL
     OR jsonb_typeof(p_result -> 'candidates') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'BAD_REQUEST: company, claim_id, engine_version and candidates[] are required';
  END IF;

  -- One store per company at a time, so two runs never fork a pair's chain.
  PERFORM pg_advisory_xact_lock(hashtextextended('toll_match:' || p_company::text, 0));

  IF NOT EXISTS (SELECT 1 FROM toll.match_queue q WHERE q.organization_id = p_company AND q.claim_id = p_claim) THEN
    RETURN jsonb_build_object('status', 'claim_gone', 'claim_id', p_claim);
  END IF;
  SELECT f.charge_ids, f.payback_ids INTO v_fc, v_fp FROM toll_system.match_scope(p_company, p_claim) f;

  FOR r IN SELECT value FROM jsonb_array_elements(p_result -> 'candidates') LOOP
    v_c := nullif(r ->> 'charge_id', '')::uuid;
    v_p := nullif(r ->> 'payback_id', '')::uuid;
    v_inputs := r -> 'inputs';
    IF v_c IS NULL OR v_p IS NULL
       OR jsonb_typeof(v_inputs) IS DISTINCT FROM 'object'
       OR jsonb_typeof(r -> 'score_parts') IS DISTINCT FROM 'object'
       OR jsonb_typeof(r -> 'rules_fired') IS DISTINCT FROM 'array'
       OR NOT (v_c = ANY (v_fc) OR v_p = ANY (v_fp))
       OR NOT EXISTS (SELECT 1 FROM toll.charges c WHERE c.organization_id = p_company AND c.id = v_c)
       OR NOT EXISTS (SELECT 1 FROM toll.paybacks p WHERE p.organization_id = p_company AND p.id = v_p) THEN
      n_skipped := n_skipped + 1;
      CONTINUE;
    END IF;
    v_seen := v_seen || (v_c::text || ':' || v_p::text);
    v_hash := md5(v_inputs::text);

    SELECT * INTO v_open FROM toll.suggestions s
    WHERE s.organization_id = p_company AND s.charge_id = v_c AND s.payback_id = v_p AND s.superseded_by IS NULL
    ORDER BY s.created_at DESC, s.id LIMIT 1;
    v_has_open := FOUND;

    IF v_has_open AND v_open.engine_version = v_ev AND v_open.inputs_hash = v_hash
       AND NOT ('withdrawn' = ANY (v_open.rules_fired)) THEN
      n_same := n_same + 1;
      CONTINUE;
    END IF;

    INSERT INTO toll.suggestions (organization_id, charge_id, payback_id, score_parts, rules_fired, engine_version,
                                  inputs, inputs_hash)
    VALUES (p_company, v_c, v_p,
            (r -> 'score_parts') || jsonb_build_object('auto_apply', coalesce((r ->> 'auto_apply')::boolean, false)),
            ARRAY(SELECT jsonb_array_elements_text(r -> 'rules_fired')), v_ev, v_inputs, v_hash)
    RETURNING id INTO v_new;

    IF v_has_open THEN
      UPDATE toll.suggestions SET superseded_by = v_new WHERE organization_id = p_company AND id = v_open.id;
      n_replaced := n_replaced + 1;
    ELSE
      n_new := n_new + 1;
    END IF;
  END LOOP;

  -- A pair in scope that the engine no longer returns is withdrawn (append-only: a new row supersedes it).
  FOR v_open IN
    SELECT * FROM toll.suggestions s
    WHERE s.organization_id = p_company AND s.superseded_by IS NULL
      AND NOT ('withdrawn' = ANY (s.rules_fired))
      AND (s.charge_id = ANY (v_fc) OR s.payback_id = ANY (v_fp))
      AND NOT ((s.charge_id::text || ':' || s.payback_id::text) = ANY (v_seen))
    ORDER BY s.id
  LOOP
    v_inputs := jsonb_build_object('withdrawn_from', v_open.id, 'reason', 'no_longer_a_candidate');
    INSERT INTO toll.suggestions (organization_id, charge_id, payback_id, score_parts, rules_fired, engine_version,
                                  inputs, inputs_hash)
    VALUES (p_company, v_open.charge_id, v_open.payback_id, jsonb_build_object('total', 0, 'auto_apply', false),
            ARRAY['withdrawn'], v_ev, v_inputs, md5(v_inputs::text))
    RETURNING id INTO v_new;
    UPDATE toll.suggestions SET superseded_by = v_new WHERE organization_id = p_company AND id = v_open.id;
    n_withdrawn := n_withdrawn + 1;
  END LOOP;

  DELETE FROM toll.match_queue q WHERE q.organization_id = p_company AND q.claim_id = p_claim;

  RETURN jsonb_build_object('status', 'stored', 'claim_id', p_claim, 'engine_version', v_ev,
                            'new', n_new, 'unchanged', n_same, 'replaced', n_replaced,
                            'withdrawn', n_withdrawn, 'skipped', n_skipped);
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.match_pending()
RETURNS TABLE (organization_id uuid, queued bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT q.organization_id, count(*)
  FROM toll.match_queue q
  WHERE q.claim_id IS NULL OR q.claimed_at < now() - interval '10 minutes'
  GROUP BY q.organization_id
  ORDER BY q.organization_id;
$$;

-- 5. Service wrappers ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toll_sys_match_claim(p_company uuid, p_limit int DEFAULT 500)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT toll_system.match_claim(p_company, p_limit);
$$;

CREATE OR REPLACE FUNCTION public.toll_sys_match_store(p_company uuid, p_claim_id uuid, p_result jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT toll_system.match_store(p_company, p_claim_id, p_result);
$$;

CREATE OR REPLACE FUNCTION public.toll_sys_match_pending()
RETURNS TABLE (organization_id uuid, queued bigint) LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM toll_system.match_pending();
$$;

REVOKE ALL ON FUNCTION toll_system.match_enqueue(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll.tg_match_enqueue() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll.tg_match_week_change() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.match_paybacks_near(uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.match_charges_near(uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.match_scope(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.match_claim(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.match_claim(uuid, int) TO service_role;
REVOKE ALL ON FUNCTION toll_system.match_store(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.match_store(uuid, uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION toll_system.match_pending() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.match_pending() TO service_role;
REVOKE ALL ON FUNCTION public.toll_sys_match_claim(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_match_claim(uuid, int) TO service_role;
REVOKE ALL ON FUNCTION public.toll_sys_match_store(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_match_store(uuid, uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.toll_sys_match_pending() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_match_pending() TO service_role;

NOTIFY pgrst, 'reload schema';


-- ===== 20261113023100_toll_v2_decisions =====
-- Toll rebuild Phase 2 P2-R4a: the everyday decisions (design B3 intents, B5 postings, I4, I7; Part F P2-R4).
--
--   link_payback            a payback covers a charge (or part)             P6
--   driver_pays             the driver bears a charge (or part)             P7
--   fleet_absorbs           the fleet bears a charge (or part)              P8
--   leave_payback_unlinked  a payback (or its leftover) has no toll         P9 = no posting
--   undo_decision           a person made the wrong call: reverse what that decision wrote (P15)
--   apply_suggestion        accept a current matcher suggestion = link_payback for its pair
--   verify_cash_receipt     a driver cash toll is checked                   P3 posts now
--   reject_cash_receipt     a driver cash toll is refused                   final, never posted
--   confirm_duplicate       one charge of an open review pair is a copy     its posting and allocations reversed (P15)
--   release_duplicate       the pair is two real crossings                  no money
--
-- P2-R4b brings the decisions that change facts: reverse_payback (P17), correct_charge_amount (P16), correct_charge_week
-- (PB2) and carry_forward (P18-P20), plus leave_payback_unlinked on a carried P19 leftover.
--
-- Every decision follows B3: the router has already done company, permission and replay. Here, in order:
--   lock the weeks touched (the same advisory lock seal / reopen take) → lock the records (payback before charge) and
--   check their versions (VERSION_CHANGED) → check states → refuse sealed weeks (WEEK_SEALED) → write and post →
--   bump versions → answer { decision_id, charge_version?, payback_version?, weeks: [{week_key, week_version, delta}] }.
-- A refusal raises, so the whole command (its decision row included) rolls back and writes nothing.
-- Allocation rows post at the charge's crossing time (the charge's week), as the Roam and seal paths already do.

-- 1. Amount helpers ----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.charge_open_minor(p_company uuid, p_charge uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (c.amount_minor - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                                     WHERE a.organization_id = c.organization_id AND a.charge_id = c.id
                                       AND a.reversed_by IS NULL), 0))::bigint
  FROM toll.charges c WHERE c.organization_id = p_company AND c.id = p_charge;
$$;

CREATE OR REPLACE FUNCTION toll_system.payback_open_minor(p_company uuid, p_payback uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (p.amount_minor
          - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                      WHERE a.organization_id = p.organization_id AND a.payback_id = p.id AND a.reversed_by IS NULL), 0)
          - coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                      WHERE u.organization_id = p.organization_id AND u.payback_id = p.id AND u.reversed_by IS NULL), 0))::bigint
  FROM toll.paybacks p WHERE p.organization_id = p_company AND p.id = p_payback;
$$;

-- 2. I4: a charge's slices never exceed its amount; a payback's never exceed its amount ------------------------
CREATE OR REPLACE FUNCTION toll.tg_allocation_caps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_charge  uuid;
  v_payback uuid;
BEGIN
  IF TG_TABLE_NAME = 'allocations' THEN
    v_charge := NEW.charge_id; v_payback := NEW.payback_id;
  ELSIF TG_TABLE_NAME = 'payback_unlinked_decisions' THEN
    v_payback := NEW.payback_id;
  ELSIF TG_TABLE_NAME = 'charges' THEN
    v_charge := NEW.id;
  ELSIF TG_TABLE_NAME = 'paybacks' THEN
    v_payback := NEW.id;
  END IF;
  IF v_charge IS NOT NULL AND toll_system.charge_open_minor(NEW.organization_id, v_charge) < 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'ALLOCATIONS_EXCEED_AMOUNT', ERRCODE = 'P0001',
      DETAIL = jsonb_build_object('charge_id', v_charge)::text;
  END IF;
  IF v_payback IS NOT NULL AND toll_system.payback_open_minor(NEW.organization_id, v_payback) < 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'ALLOCATIONS_EXCEED_AMOUNT', ERRCODE = 'P0001',
      DETAIL = jsonb_build_object('payback_id', v_payback)::text;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER allocations_caps AFTER INSERT OR UPDATE ON toll.allocations
  FOR EACH ROW EXECUTE FUNCTION toll.tg_allocation_caps();
CREATE TRIGGER payback_unlinked_caps AFTER INSERT OR UPDATE ON toll.payback_unlinked_decisions
  FOR EACH ROW EXECUTE FUNCTION toll.tg_allocation_caps();
CREATE TRIGGER charges_amount_caps AFTER UPDATE OF amount_minor ON toll.charges
  FOR EACH ROW EXECUTE FUNCTION toll.tg_allocation_caps();
CREATE TRIGGER paybacks_amount_caps AFTER UPDATE OF amount_minor ON toll.paybacks
  FOR EACH ROW EXECUTE FUNCTION toll.tg_allocation_caps();

-- 3. Locks and checks ---------------------------------------------------------------------------------------
-- The week lock is the one seal / reopen take, so a decision and a seal of the same week never interleave.
CREATE OR REPLACE FUNCTION toll_write.lock_weeks(p_company uuid, p_weeks date[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE w date;
BEGIN
  FOR w IN SELECT DISTINCT x FROM unnest(p_weeks) x WHERE x IS NOT NULL ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('toll_week:' || p_company || ':' || w, 0));
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.refuse_if_sealed(p_company uuid, p_weeks date[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sealed date[];
BEGIN
  v_sealed := array(SELECT DISTINCT x FROM unnest(p_weeks) x
                    WHERE x IS NOT NULL AND toll_system.week_is_sealed(p_company, x) ORDER BY 1);
  IF cardinality(v_sealed) > 0 THEN
    PERFORM toll_write.refuse('WEEK_SEALED', jsonb_build_object('sealed_weeks', to_jsonb(v_sealed)));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.lock_charge(p_company uuid, p_id uuid, p_expected bigint,
                                                  p_field text DEFAULT 'expected_charge_version')
RETURNS toll.charges LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c toll.charges%ROWTYPE;
BEGIN
  IF p_id IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('charge_id')));
  END IF;
  SELECT * INTO c FROM toll.charges x WHERE x.organization_id = p_company AND x.id = p_id FOR UPDATE;
  IF NOT FOUND OR c.is_legacy THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('charge_id', p_id));
  END IF;
  IF p_expected IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array(p_field), 'charge_id', p_id));
  END IF;
  IF c.version <> p_expected THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object(
      'charge_id', c.id, 'version', c.version, 'state', toll_system.charge_state(p_company, c.id)));
  END IF;
  RETURN c;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.lock_payback(p_company uuid, p_id uuid, p_expected bigint,
                                                   p_field text DEFAULT 'expected_payback_version')
RETURNS toll.paybacks LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p toll.paybacks%ROWTYPE;
BEGIN
  IF p_id IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('payback_id')));
  END IF;
  SELECT * INTO p FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = p_id FOR UPDATE;
  IF NOT FOUND OR p.is_legacy THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('payback_id', p_id));
  END IF;
  IF p_expected IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array(p_field), 'payback_id', p_id));
  END IF;
  IF p.version <> p_expected THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object(
      'payback_id', p.id, 'version', p.version, 'open_minor', toll_system.payback_open_minor(p_company, p.id)));
  END IF;
  RETURN p;
END;
$$;

-- A charge a person may decide: not after_seal, and in one of the given states.
CREATE OR REPLACE FUNCTION toll_write.require_charge_state(p_company uuid, p_charge toll.charges, p_states text[])
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_state text;
BEGIN
  IF p_charge.after_seal THEN
    PERFORM toll_write.refuse('AFTER_SEAL', jsonb_build_object('charge_id', p_charge.id, 'week_key', p_charge.week_key,
                                                               'use', 'reopen_week or carry_forward'));
  END IF;
  v_state := toll_system.charge_state(p_company, p_charge.id);
  IF NOT v_state = ANY (p_states) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', p_charge.id, 'state', v_state,
                                                                'allowed', to_jsonb(p_states)));
  END IF;
  RETURN v_state;
END;
$$;

-- A payback a person may allocate or leave unlinked: live, not native, not a reversal, not reversed.
CREATE OR REPLACE FUNCTION toll_write.require_payback_usable(p_company uuid, p_payback toll.paybacks)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_payback.after_seal THEN
    PERFORM toll_write.refuse('AFTER_SEAL', jsonb_build_object('payback_id', p_payback.id, 'week_key', p_payback.week_key,
                                                               'use', 'reopen_week or carry_forward'));
  END IF;
  IF p_payback.kind = 'native' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p_payback.id, 'state', 'roam_native'));
  END IF;
  IF p_payback.reversal_of IS NOT NULL THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p_payback.id, 'state', 'reversing_payback'));
  END IF;
  IF EXISTS (SELECT 1 FROM toll.paybacks r WHERE r.organization_id = p_company AND r.reversal_of = p_payback.id) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p_payback.id, 'state', 'reversed'));
  END IF;
END;
$$;

-- 4. Allocation writers (one ledger line each) --------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.bearer_rule(p_bearer text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_bearer WHEN 'platform' THEN 'P6_allocate_platform' WHEN 'driver' THEN 'P7_allocate_driver'
                       WHEN 'fleet' THEN 'P8_allocate_fleet' END;
$$;

CREATE OR REPLACE FUNCTION toll_system.allocate(p_company uuid, p_charge uuid, p_bearer text, p_amount bigint,
                                               p_payback uuid, p_reason text, p_decision uuid, p_cmd text, p_line int)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c    toll.charges%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO c FROM toll.charges x WHERE x.organization_id = p_company AND x.id = p_charge;
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id)
  VALUES (p_company, p_charge, p_bearer, p_amount, p_payback, p_reason, p_decision)
  RETURNING id INTO v_id;
  PERFORM toll_system.post(p_company, toll_system.bearer_rule(p_bearer), p_amount, c.occurred_at, p_cmd, p_line,
                           jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id)
                           || CASE WHEN p_payback IS NOT NULL THEN jsonb_build_object('payback_id', p_payback)
                                   ELSE '{}'::jsonb END);
  RETURN v_id;
END;
$$;

-- Reverse one active allocation (P15): mark it and post the exact reverse of its row. Returns its amount (0 if none).
CREATE OR REPLACE FUNCTION toll_system.reverse_allocation(p_company uuid, p_allocation uuid, p_decision uuid,
                                                         p_cmd text, p_line int)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  SELECT a.id, a.charge_id, a.bearer, a.amount_minor, a.payback_id, c.occurred_at, c.driver_id INTO r
  FROM toll.allocations a JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
  WHERE a.organization_id = p_company AND a.id = p_allocation AND a.reversed_by IS NULL
  FOR UPDATE OF a;
  IF NOT FOUND THEN RETURN 0; END IF;
  UPDATE toll.allocations SET reversed_by = p_decision WHERE organization_id = p_company AND id = r.id;
  PERFORM toll_system.post(p_company, toll_system.bearer_rule(r.bearer), r.amount_minor, r.occurred_at, p_cmd, p_line,
                           jsonb_build_object('charge_id', r.charge_id, 'driver_id', r.driver_id)
                           || CASE WHEN r.payback_id IS NOT NULL THEN jsonb_build_object('payback_id', r.payback_id)
                                   ELSE '{}'::jsonb END,
                           true);
  RETURN r.amount_minor;
END;
$$;

-- 5. Answer helpers -----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.add_delta(p_acc jsonb, p_week date, p_delta jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_week IS NULL THEN coalesce(p_acc, '{}'::jsonb)
              ELSE coalesce(p_acc, '{}'::jsonb)
                   || jsonb_build_object(p_week::text, coalesce(p_acc -> (p_week::text), '{}'::jsonb) || p_delta) END;
$$;

CREATE OR REPLACE FUNCTION toll_write.weeks_answer(p_company uuid, p_deltas jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('week_key', k, 'week_version', toll_system.week_version(p_company, k::date),
                                               'delta', v) ORDER BY k), '[]'::jsonb)
  FROM jsonb_each(coalesce(p_deltas, '{}'::jsonb)) AS e(k, v);
$$;

CREATE OR REPLACE FUNCTION toll_write.body_amount(p_body jsonb)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v bigint;
BEGIN
  IF p_body ? 'amount_minor' AND jsonb_typeof(p_body -> 'amount_minor') <> 'null' THEN
    v := (p_body ->> 'amount_minor')::bigint;
    IF v IS NULL OR v <= 0 THEN
      PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('amount_minor', 'must be > 0'));
    END IF;
  END IF;
  RETURN v;
END;
$$;

-- 6. link_payback (and apply_suggestion) ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.do_link(p_company uuid, p_decision uuid, p_cmd text, p_charge uuid, p_payback uuid,
                                              p_charge_ver bigint, p_payback_ver bigint, p_amount bigint, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c       toll.charges%ROWTYPE;
  p       toll.paybacks%ROWTYPE;
  v_cw    date;
  v_pw    date;
  v_copen bigint;
  v_popen bigint;
  v_take  bigint;
  v_cv    bigint;
  v_pv    bigint;
BEGIN
  IF p_charge IS NULL OR p_payback IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('charge_id', 'payback_id')));
  END IF;
  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_cw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = p_charge;
  SELECT x.week_key INTO v_pw FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = p_payback;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_cw, v_pw]);

  p := toll_write.lock_payback(p_company, p_payback, p_payback_ver);      -- payback before charge (B3 locks)
  c := toll_write.lock_charge(p_company, p_charge, p_charge_ver);
  PERFORM toll_write.require_payback_usable(p_company, p);
  PERFORM toll_write.require_charge_state(p_company, c, ARRAY['pending']);
  PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_cw, v_pw]);

  v_copen := toll_system.charge_open_minor(p_company, c.id);
  v_popen := toll_system.payback_open_minor(p_company, p.id);
  IF v_popen <= 0 THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id, 'state', 'nothing_left', 'open_minor', v_popen));
  END IF;
  v_take := coalesce(p_amount, least(v_copen, v_popen));
  IF v_take > v_copen OR v_take > v_popen THEN
    PERFORM toll_write.refuse('AMOUNT_TOO_LARGE', jsonb_build_object('amount_minor', v_take,
      'charge_open_minor', v_copen, 'payback_open_minor', v_popen));
  END IF;

  PERFORM toll_system.allocate(p_company, c.id, 'platform', v_take, p.id, p_reason, p_decision, p_cmd, 1);
  UPDATE toll.charges SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  UPDATE toll.paybacks SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = p.id RETURNING version INTO v_pv;

  RETURN jsonb_build_object('decision_id', p_decision, 'charge_version', v_cv, 'payback_version', v_pv,
    'amount_minor', v_take,
    'weeks', toll_write.weeks_answer(p_company,
               toll_write.add_delta(toll_write.add_delta('{}'::jsonb, v_cw, jsonb_build_object('decided_minor', v_take)),
                                    v_pw, jsonb_build_object('payback_allocated_minor', v_take))));
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_link_payback(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT toll_write.do_link(p_company, p_decision, p_cmd,
           nullif(p_body ->> 'charge_id', '')::uuid, nullif(p_body ->> 'payback_id', '')::uuid,
           (p_body ->> 'expected_charge_version')::bigint, (p_body ->> 'expected_payback_version')::bigint,
           toll_write.body_amount(p_body), coalesce(nullif(p_body ->> 'reason_code', ''), 'link_payback'));
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_apply_suggestion(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s     toll.suggestions%ROWTYPE;
  v_res jsonb;
BEGIN
  IF nullif(p_body ->> 'suggestion_id', '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('suggestion_id')));
  END IF;
  SELECT * INTO s FROM toll.suggestions x
  WHERE x.organization_id = p_company AND x.id = (p_body ->> 'suggestion_id')::uuid;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('suggestion_id', p_body ->> 'suggestion_id'));
  END IF;
  IF s.superseded_by IS NOT NULL OR 'withdrawn' = ANY (s.rules_fired) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('suggestion_id', s.id, 'state', 'suggestion_stale',
                                                                'charge_id', s.charge_id, 'payback_id', s.payback_id));
  END IF;
  v_res := toll_write.do_link(p_company, p_decision, p_cmd, s.charge_id, s.payback_id,
                              (p_body ->> 'expected_charge_version')::bigint, (p_body ->> 'expected_payback_version')::bigint,
                              NULL, 'apply_suggestion');
  RETURN v_res || jsonb_build_object('suggestion_id', s.id, 'engine_version', s.engine_version,
                                     'score', s.score_parts -> 'total');
END;
$$;

-- 7. driver_pays / fleet_absorbs --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.do_bear(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb, p_bearer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c       toll.charges%ROWTYPE;
  v_id    uuid := nullif(p_body ->> 'charge_id', '')::uuid;
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
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
               jsonb_build_object('decided_minor', v_take, 'bearer', p_bearer))));
END;
$$;

-- 8. leave_payback_unlinked (P9: no posting; the amount stays in toll:payback_unallocated) -------------------
CREATE OR REPLACE FUNCTION toll_write.intent_leave_payback_unlinked(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p      toll.paybacks%ROWTYPE;
  v_id   uuid := nullif(p_body ->> 'payback_id', '')::uuid;
  v_pw   date;
  v_open bigint;
  v_take bigint;
  v_pv   bigint;
BEGIN
  IF p_body ? 'carried_fact_id' THEN   -- a P19 leftover is decided on its carried row: P2-R4b
    PERFORM toll_write.refuse('INTENT_NOT_BUILT', jsonb_build_object('intent', 'leave_payback_unlinked',
                                                                     'part', 'carried P19 leftover', 'round', 'P2-R4b'));
  END IF;
  IF nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('reason_code')));
  END IF;
  SELECT x.week_key INTO v_pw FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = v_id;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_pw]);
  p := toll_write.lock_payback(p_company, v_id, (p_body ->> 'expected_payback_version')::bigint);
  PERFORM toll_write.require_payback_usable(p_company, p);
  PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_pw]);

  v_open := toll_system.payback_open_minor(p_company, p.id);
  IF v_open <= 0 THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id, 'state', 'nothing_left', 'open_minor', v_open));
  END IF;
  v_take := coalesce(toll_write.body_amount(p_body), v_open);
  IF v_take > v_open THEN
    PERFORM toll_write.refuse('AMOUNT_TOO_LARGE', jsonb_build_object('amount_minor', v_take, 'payback_open_minor', v_open));
  END IF;

  INSERT INTO toll.payback_unlinked_decisions (organization_id, payback_id, amount_minor, reason, decision_id)
  VALUES (p_company, p.id, v_take, p_body ->> 'reason_code', p_decision);
  UPDATE toll.paybacks SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = p.id RETURNING version INTO v_pv;

  RETURN jsonb_build_object('decision_id', p_decision, 'payback_version', v_pv, 'amount_minor', v_take,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_pw,
               jsonb_build_object('left_unlinked_minor', v_take))));
END;
$$;

-- 9. undo_decision --------------------------------------------------------------------------------------------
-- Reverses what one person decision wrote: its active allocations (P15 rows) and its "left unlinked" rows (no
-- posting). The facts stay. Body: decision_id + expected_versions {"<charge or payback id>": version} for EVERY
-- distinct charge and payback the decision touched; a missing or stale one → BAD_REQUEST / VERSION_CHANGED.
CREATE OR REPLACE FUNCTION toll_write.intent_undo_decision(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d          toll.decisions%ROWTYPE;
  v_target   uuid := nullif(p_body ->> 'decision_id', '')::uuid;
  v_exp      jsonb := coalesce(p_body -> 'expected_versions', '{}'::jsonb);
  v_charges  uuid[];
  v_paybacks uuid[];
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
BEGIN
  IF v_target IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('decision_id')));
  END IF;
  SELECT * INTO d FROM toll.decisions x WHERE x.organization_id = p_company AND x.id = v_target;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('decision_id', v_target));
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
  IF NOT EXISTS (SELECT 1 FROM toll.allocations a WHERE a.organization_id = p_company AND a.decision_id = v_target
                   AND a.reversed_by IS NULL)
     AND NOT EXISTS (SELECT 1 FROM toll.payback_unlinked_decisions u WHERE u.organization_id = p_company
                       AND u.decision_id = v_target AND u.reversed_by IS NULL) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('decision_id', v_target, 'state', 'already_undone'));
  END IF;

  v_weeks := array(SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) FROM toll.charges x
                   WHERE x.organization_id = p_company AND x.id = ANY (v_charges)
                   UNION SELECT x.week_key FROM toll.paybacks x
                   WHERE x.organization_id = p_company AND x.id = ANY (v_paybacks));
  PERFORM toll_write.lock_weeks(p_company, v_weeks);

  -- Every touched record's version (paybacks before charges).
  FOREACH v_id IN ARRAY v_paybacks LOOP
    p := toll_write.lock_payback(p_company, v_id, (v_exp ->> v_id::text)::bigint, 'expected_versions.' || v_id);
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
    SELECT u.id, u.amount_minor, pb.week_key
    FROM toll.payback_unlinked_decisions u JOIN toll.paybacks pb ON pb.organization_id = u.organization_id AND pb.id = u.payback_id
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
  FOREACH v_id IN ARRAY v_charges LOOP
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = v_id RETURNING version INTO v_ver;
    v_versions := v_versions || jsonb_build_object(v_id::text, v_ver);
  END LOOP;

  RETURN jsonb_build_object('decision_id', p_decision, 'undone_decision_id', v_target, 'versions', v_versions,
                            'weeks', toll_write.weeks_answer(p_company, v_deltas));
END;
$$;

-- 10. verify / reject a cash receipt ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.do_receipt(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb, p_verify boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c    toll.charges%ROWTYPE;
  v_id uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_cw date;
  v_cv bigint;
BEGIN
  IF NOT p_verify AND nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('reason_code')));
  END IF;
  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_cw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_id;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_cw]);
  c := toll_write.lock_charge(p_company, v_id, (p_body ->> 'expected_charge_version')::bigint);
  IF c.paid_by <> 'cash' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', 'not_cash'));
  END IF;
  PERFORM toll_write.require_charge_state(p_company, c, ARRAY['unverified']);
  PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_cw]);

  UPDATE toll.charges SET evidence_status = CASE WHEN p_verify THEN 'verified' ELSE 'rejected' END,
                          version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  IF p_verify THEN   -- P3 posts at verification (B5); the charge becomes pending
    PERFORM toll_system.post(p_company, 'P3_cash_verified', c.amount_minor, c.occurred_at, p_cmd, 1,
                             jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id));
  END IF;

  RETURN jsonb_build_object('decision_id', p_decision, 'charge_version', v_cv,
    'state', toll_system.charge_state(p_company, c.id),
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
               CASE WHEN p_verify THEN jsonb_build_object('verified_minor', c.amount_minor)
                    ELSE jsonb_build_object('rejected_minor', c.amount_minor) END)));
END;
$$;

-- 11. confirm / release a duplicate review pair -------------------------------------------------------------
-- Body: charge_id = the copy, other_charge_id = the one kept (release: either order), expected_charge_version,
-- expected_other_version. Confirm reverses the copy's arrival posting and its allocations (P15), then marks it.
CREATE OR REPLACE FUNCTION toll_write.do_duplicate(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb, p_confirm boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_copy   uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_keep   uuid := nullif(p_body ->> 'other_charge_id', '')::uuid;
  v_rev    toll.duplicate_reviews%ROWTYPE;
  c        toll.charges%ROWTYPE;
  k        toll.charges%ROWTYPE;
  v_cw     date;
  v_kw     date;
  v_line   int := 0;
  v_net    bigint;
  v_undone bigint := 0;
  v_cv     bigint;
  v_kv     bigint;
  a        record;
BEGIN
  IF v_copy IS NULL OR v_keep IS NULL OR v_copy = v_keep THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('charge_id', 'other_charge_id')));
  END IF;
  SELECT * INTO v_rev FROM toll.duplicate_reviews r
  WHERE r.organization_id = p_company AND r.charge_a = least(v_copy, v_keep) AND r.charge_b = greatest(v_copy, v_keep)
  FOR UPDATE;
  IF NOT FOUND OR v_rev.status <> 'open' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', v_copy, 'other_charge_id', v_keep,
                                                                'state', coalesce(v_rev.status, 'no_review_pair')));
  END IF;

  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_cw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_copy;
  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_kw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_keep;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_cw, v_kw]);
  IF v_copy < v_keep THEN   -- two charges: lock in id order
    c := toll_write.lock_charge(p_company, v_copy, (p_body ->> 'expected_charge_version')::bigint);
    k := toll_write.lock_charge(p_company, v_keep, (p_body ->> 'expected_other_version')::bigint, 'expected_other_version');
  ELSE
    k := toll_write.lock_charge(p_company, v_keep, (p_body ->> 'expected_other_version')::bigint, 'expected_other_version');
    c := toll_write.lock_charge(p_company, v_copy, (p_body ->> 'expected_charge_version')::bigint);
  END IF;

  IF p_confirm THEN
    PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_cw]);
    IF k.duplicate_of IS NOT NULL OR c.duplicate_of IS NOT NULL THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', CASE WHEN k.duplicate_of IS NOT NULL
                                                                   THEN k.id ELSE c.id END, 'state', 'duplicate'));
    END IF;
    -- The copy's decisions are reversed first, then its arrival (P2 / P3, with any P16 corrections) is reversed.
    FOR a IN SELECT al.id FROM toll.allocations al
             WHERE al.organization_id = p_company AND al.charge_id = c.id AND al.reversed_by IS NULL
             ORDER BY al.created_at, al.id LOOP
      v_line := v_line + 1;
      v_undone := v_undone + toll_system.reverse_allocation(p_company, a.id, p_decision, p_cmd, v_line);
    END LOOP;
    v_net := toll_system.rule_net(p_company, CASE WHEN c.paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END,
                                  'charge_id', c.id::text)
           + toll_system.rule_net(p_company, 'P16_up_%', 'charge_id', c.id::text)
           - toll_system.rule_net(p_company, 'P16_down_%', 'charge_id', c.id::text);
    IF v_net < 0 THEN
      RAISE EXCEPTION 'TOLL_DUPLICATE_NET_NEGATIVE: charge % nets %', c.id, v_net;
    END IF;
    IF v_net > 0 THEN
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, CASE WHEN c.paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END,
                               v_net, c.occurred_at, p_cmd, v_line,
                               jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id), true);
    END IF;
    UPDATE toll.charges SET duplicate_of = k.id, version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  ELSE
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  END IF;
  UPDATE toll.charges SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = k.id RETURNING version INTO v_kv;
  UPDATE toll.duplicate_reviews SET status = CASE WHEN p_confirm THEN 'confirmed' ELSE 'released' END,
                                   decision_id = p_decision, updated_at = now()
  WHERE organization_id = p_company AND id = v_rev.id;

  RETURN jsonb_build_object('decision_id', p_decision, 'review_id', v_rev.id,
    'charge_version', v_cv, 'other_version', v_kv,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
               CASE WHEN p_confirm THEN jsonb_build_object('duplicate_removed_minor', coalesce(v_net, 0),
                                                            'undone_minor', v_undone)
                    ELSE jsonb_build_object('review_released', true) END)));
END;
$$;

-- 12. The router: the same B3 order as before, with this round's intents wired in --------------------------------
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

-- 13. Grants: everything here runs only inside the router (definer); nobody calls it directly -------------------
REVOKE ALL ON FUNCTION toll_system.charge_open_minor(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.payback_open_minor(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll.tg_allocation_caps() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.lock_weeks(uuid, date[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.refuse_if_sealed(uuid, date[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.lock_charge(uuid, uuid, bigint, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.lock_payback(uuid, uuid, bigint, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.require_charge_state(uuid, toll.charges, text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.require_payback_usable(uuid, toll.paybacks) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.bearer_rule(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.allocate(uuid, uuid, text, bigint, uuid, text, uuid, text, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.reverse_allocation(uuid, uuid, uuid, text, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.add_delta(jsonb, date, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.weeks_answer(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.body_amount(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.do_link(uuid, uuid, text, uuid, uuid, bigint, bigint, bigint, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_link_payback(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_apply_suggestion(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.do_bear(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_leave_payback_unlinked(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_undo_decision(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.do_receipt(uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.do_duplicate(uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.command(text, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION toll_write.command(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ===== 20261113030328_toll_v2_fact_corrections =====
-- Toll rebuild Phase 2 P2-R4b: decisions that change the facts (design B3, B5 P15-P17, PB2, PB4, C3; Part F P2-R4).
--
--   reverse_payback        the platform took a payback back (P17)        a reversing payback; the original's slices
--                                                                        and unlinked rows reversed; P6 and P4/P5 reversed
--   correct_charge_amount  a charge's amount was wrong (P16)             up: the charge is pending for the difference;
--                                                                        down below its slices: the slices shrink in
--                                                                        proportion first (C3), then P16
--   correct_charge_week    a charge's time / week was wrong (PB2)        its rows reversed in the old week and posted
--                                                                        again in the new week; its slices move with it
-- carry_forward (P18-P20, late facts against a paid week) is P2-R4c: it needs a counted week for paybacks too.
--
-- Decisions made here (one each):
--   * A take-back reverses the WHOLE payback. A partial take-back is refused (PARTIAL_TAKE_BACK): B2 makes a
--     reversed payback final, and no partial take-back exists in the data (Phase 2 live look: 0 negative adjustments).
--   * Slices reversed by a take-back carry reversed_by = the reversing payback's id (the Phase 1 test convention),
--     so the nightly check can tell "taken back by the platform" from "undone by a person" (reversed_by = decision).
--   * A person's command on a sealed week gets WEEK_SEALED (B3); the paid-week path is carry_forward (R4c).
--   * Check 3 is corrected for a take-back in a LATER open week of a payback with a leftover (PB4: the original week
--     keeps its figures; the take-back week shows it). The old line expected the leftover to vanish from the
--     original week, which would raise a false alarm on correct postings. Nothing else in the checks changes.

-- 1. Proportional reduction of a charge's slices (C3) ---------------------------------------------------------
-- Shrinks the active slices by p_short in proportion to each bearer's total: each share is rounded down, and the
-- cents left over go to the driver, then the fleet, then the platform. Within a bearer the newest slice shrinks
-- first: it is reversed and written again for what remains. Returns the last ledger line used.
CREATE OR REPLACE FUNCTION toll_system.reduce_allocations(p_company uuid, p_charge uuid, p_short bigint,
                                                         p_decision uuid, p_cmd text, p_line int)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_total bigint;
  v_share jsonb := '{}'::jsonb;
  v_sum   bigint := 0;
  v_left  bigint;
  v_t     bigint;
  v_s     bigint;
  v_cut   bigint;
  v_line  int := p_line;
  b       text;
  a       record;
BEGIN
  IF p_short <= 0 THEN RETURN v_line; END IF;
  SELECT coalesce(sum(x.amount_minor), 0) INTO v_total FROM toll.allocations x
  WHERE x.organization_id = p_company AND x.charge_id = p_charge AND x.reversed_by IS NULL;
  IF p_short > v_total THEN
    RAISE EXCEPTION 'TOLL_REDUCE_BEYOND_ALLOCATIONS: charge % short % allocated %', p_charge, p_short, v_total;
  END IF;

  FOREACH b IN ARRAY ARRAY['driver', 'fleet', 'platform'] LOOP
    SELECT coalesce(sum(x.amount_minor), 0) INTO v_t FROM toll.allocations x
    WHERE x.organization_id = p_company AND x.charge_id = p_charge AND x.reversed_by IS NULL AND x.bearer = b;
    v_s := (p_short * v_t) / v_total;                 -- non-negative integers: rounds down
    v_share := v_share || jsonb_build_object(b, v_s);
    v_sum := v_sum + v_s;
  END LOOP;
  v_left := p_short - v_sum;
  FOREACH b IN ARRAY ARRAY['driver', 'fleet', 'platform'] LOOP
    EXIT WHEN v_left = 0;
    SELECT coalesce(sum(x.amount_minor), 0) INTO v_t FROM toll.allocations x
    WHERE x.organization_id = p_company AND x.charge_id = p_charge AND x.reversed_by IS NULL AND x.bearer = b;
    v_s := (v_share ->> b)::bigint;
    v_cut := least(v_left, v_t - v_s);
    v_share := v_share || jsonb_build_object(b, v_s + v_cut);
    v_left := v_left - v_cut;
  END LOOP;

  FOREACH b IN ARRAY ARRAY['driver', 'fleet', 'platform'] LOOP
    v_s := (v_share ->> b)::bigint;
    FOR a IN
      SELECT x.id, x.amount_minor, x.payback_id, x.reason FROM toll.allocations x
      WHERE x.organization_id = p_company AND x.charge_id = p_charge AND x.reversed_by IS NULL AND x.bearer = b
      ORDER BY x.created_at DESC, x.id DESC
    LOOP
      EXIT WHEN v_s <= 0;
      v_cut := least(v_s, a.amount_minor);
      v_line := v_line + 1;
      PERFORM toll_system.reverse_allocation(p_company, a.id, p_decision, p_cmd, v_line);
      IF a.amount_minor - v_cut > 0 THEN
        v_line := v_line + 1;
        PERFORM toll_system.allocate(p_company, p_charge, b, a.amount_minor - v_cut, a.payback_id,
                                     coalesce(a.reason, b) || ':reduced', p_decision, p_cmd, v_line);
      END IF;
      v_s := v_s - v_cut;
    END LOOP;
  END LOOP;
  RETURN v_line;
END;
$$;

-- 2. reverse_payback (P17) ------------------------------------------------------------------------------------
-- Body: payback_id, expected_payback_version, reference (the platform's take-back reference), paid_on (the day it
-- arrived), amount_minor? (must equal the payback's amount), reason_code?. The take-back counts in the week it arrived.
CREATE OR REPLACE FUNCTION toll_write.intent_reverse_payback(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id       uuid := nullif(p_body ->> 'payback_id', '')::uuid;
  v_ref      text := nullif(btrim(p_body ->> 'reference'), '');
  v_paid_on  date := nullif(p_body ->> 'paid_on', '')::date;
  v_eff      timestamptz;
  v_rw       date;
  v_pw       date;
  v_weeks    date[];
  v_charges  uuid[];
  v_rev      uuid;
  v_line     int := 0;
  v_taken    bigint := 0;
  v_deltas   jsonb := '{}'::jsonb;
  v_versions jsonb := '{}'::jsonb;
  v_ver      bigint;
  v_amount   bigint;
  p          toll.paybacks%ROWTYPE;
  r          record;
BEGIN
  IF v_id IS NULL OR v_ref IS NULL OR v_paid_on IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('payback_id', 'reference', 'paid_on')));
  END IF;
  v_amount := toll_write.body_amount(p_body);
  v_eff := (v_paid_on + time '12:00') AT TIME ZONE 'America/Jamaica';
  v_rw := ledger.jamaica_week_start(v_eff);

  SELECT x.week_key INTO v_pw FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = v_id;
  v_charges := array(SELECT DISTINCT a.charge_id FROM toll.allocations a
                     WHERE a.organization_id = p_company AND a.payback_id = v_id AND a.reversed_by IS NULL ORDER BY 1);
  v_weeks := array(SELECT toll_system.charge_counted_week(p_company, c.id, c.week_key) FROM toll.charges c
                   WHERE c.organization_id = p_company AND c.id = ANY (v_charges)) || ARRAY[v_pw, v_rw];
  PERFORM toll_write.lock_weeks(p_company, v_weeks);

  p := toll_write.lock_payback(p_company, v_id, (p_body ->> 'expected_payback_version')::bigint);
  PERFORM toll_write.require_payback_usable(p_company, p);
  IF v_amount IS NOT NULL AND v_amount <> p.amount_minor THEN
    PERFORM toll_write.refuse('PARTIAL_TAKE_BACK', jsonb_build_object('payback_id', p.id, 'amount_minor', p.amount_minor,
                                                                      'taken_back_minor', v_amount));
  END IF;
  IF EXISTS (SELECT 1 FROM toll.paybacks x WHERE x.organization_id = p_company AND x.platform = p.platform
               AND x.reference = v_ref) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('reference', v_ref, 'state', 'reference_used'));
  END IF;
  -- The slices' charges (locked; their versions move, the take-back did not need them)
  PERFORM 1 FROM toll.charges c WHERE c.organization_id = p_company AND c.id = ANY (v_charges) ORDER BY c.id FOR UPDATE;
  PERFORM toll_write.refuse_if_sealed(p_company, v_weeks);

  INSERT INTO toll.paybacks (organization_id, platform, kind, platform_trip_id, reference, driver_id, paid_on, week_key,
                             amount_minor, reversal_of, received_by)
  VALUES (p_company, p.platform, p.kind, p.platform_trip_id, v_ref, p.driver_id, v_paid_on, v_rw,
          p.amount_minor, p.id, p.received_by)
  RETURNING id INTO v_rev;

  -- (a) every active slice of the original: reversed, its P6 reversed (counted in the take-back's week on the payback side)
  FOR r IN
    SELECT a.id, a.charge_id, a.amount_minor, c.occurred_at, c.driver_id,
           toll_system.charge_counted_week(p_company, c.id, c.week_key) AS cw
    FROM toll.allocations a JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
    WHERE a.organization_id = p_company AND a.payback_id = p.id AND a.reversed_by IS NULL
    ORDER BY a.created_at DESC, a.id DESC
  LOOP
    UPDATE toll.allocations SET reversed_by = v_rev WHERE organization_id = p_company AND id = r.id;
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, 'P6_allocate_platform', r.amount_minor, r.occurred_at, p_cmd, v_line,
                             jsonb_build_object('charge_id', r.charge_id, 'payback_id', p.id, 'reversing_payback_id', v_rev,
                                                'driver_id', r.driver_id), true);
    v_taken := v_taken + r.amount_minor;
    v_deltas := toll_write.add_delta(v_deltas, r.cw, jsonb_build_object('uncovered_minor',
                  coalesce((v_deltas -> (r.cw::text) ->> 'uncovered_minor')::bigint, 0) + r.amount_minor));
  END LOOP;
  -- the unlinked rows go with it (no posting of their own: P9)
  UPDATE toll.payback_unlinked_decisions SET reversed_by = v_rev
  WHERE organization_id = p_company AND payback_id = p.id AND reversed_by IS NULL;

  -- (b) the original's arrival, for its full amount
  v_line := v_line + 1;
  PERFORM toll_system.post(p_company, CASE WHEN p.received_by = 'fleet' THEN 'P4_payback_fleet' ELSE 'P5_payback_driver' END,
                           p.amount_minor, v_eff, p_cmd, v_line,
                           jsonb_build_object('payback_id', p.id, 'reversing_payback_id', v_rev, 'driver_id', p.driver_id), true);

  UPDATE toll.paybacks SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = p.id RETURNING version INTO v_ver;
  FOR r IN SELECT c.id FROM toll.charges c WHERE c.organization_id = p_company AND c.id = ANY (v_charges) LOOP
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = r.id RETURNING version INTO v_amount;
    v_versions := v_versions || jsonb_build_object(r.id::text, v_amount);
  END LOOP;
  v_deltas := toll_write.add_delta(v_deltas, v_rw, jsonb_build_object('taken_back_minor', p.amount_minor));

  RETURN jsonb_build_object('decision_id', p_decision, 'reversal_payback_id', v_rev, 'payback_version', v_ver,
                            'charge_versions', v_versions, 'uncovered_minor', v_taken,
                            'weeks', toll_write.weeks_answer(p_company, v_deltas));
END;
$$;

-- 3. correct_charge_amount (P16 + C3) ---------------------------------------------------------------------------
-- Body: charge_id, expected_charge_version, amount_minor (the right amount), reason_code (required).
CREATE OR REPLACE FUNCTION toll_write.intent_correct_charge_amount(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id      uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_new     bigint;
  v_cw      date;
  v_weeks   date[];
  v_pbs     uuid[];
  v_alloc   bigint;
  v_short   bigint := 0;
  v_line    int := 0;
  v_cv      bigint;
  v_ver     bigint;
  v_pvers   jsonb := '{}'::jsonb;
  v_posted  boolean;
  c         toll.charges%ROWTYPE;
  r         record;
BEGIN
  v_new := toll_write.body_amount(p_body);
  IF v_new IS NULL OR nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('amount_minor', 'reason_code')));
  END IF;
  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_cw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_id;
  -- A platform slice that shrinks leaves a leftover on its payback, so the payback's week must be open too.
  v_pbs := array(SELECT DISTINCT a.payback_id FROM toll.allocations a WHERE a.organization_id = p_company
                   AND a.charge_id = v_id AND a.reversed_by IS NULL AND a.payback_id IS NOT NULL ORDER BY 1);
  v_weeks := array(SELECT x.week_key FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = ANY (v_pbs))
             || ARRAY[v_cw];
  PERFORM toll_write.lock_weeks(p_company, v_weeks);

  PERFORM 1 FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = ANY (v_pbs) ORDER BY x.id FOR UPDATE;
  c := toll_write.lock_charge(p_company, v_id, (p_body ->> 'expected_charge_version')::bigint);
  PERFORM toll_write.require_charge_state(p_company, c, ARRAY['pending', 'decided', 'unverified', 'awaiting_cash']);
  IF v_new = c.amount_minor THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('amount_minor', 'same as now', 'charge_id', c.id));
  END IF;

  v_alloc := c.amount_minor - toll_system.charge_open_minor(p_company, c.id);
  v_short := greatest(v_alloc - v_new, 0);
  IF v_short = 0 THEN   -- only a shrink below the slices touches a payback
    v_weeks := ARRAY[v_cw];
  END IF;
  PERFORM toll_write.refuse_if_sealed(p_company, v_weeks);

  v_posted := c.evidence_status = 'verified';
  v_line := toll_system.reduce_allocations(p_company, c.id, v_short, p_decision, p_cmd, v_line);
  INSERT INTO toll.charge_changes (organization_id, charge_id, field, old_value, new_value, pending, decision_id)
  VALUES (p_company, c.id, 'amount_minor', c.amount_minor::text, v_new::text, false, p_decision);
  UPDATE toll.charges SET amount_minor = v_new, version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  IF v_posted THEN
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company,
      'P16_' || CASE WHEN v_new > c.amount_minor THEN 'up_' ELSE 'down_' END || c.paid_by,
      abs(v_new - c.amount_minor), c.occurred_at, p_cmd, v_line,
      jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id));
  END IF;
  IF v_short > 0 THEN
    FOR r IN SELECT x.id FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = ANY (v_pbs) LOOP
      UPDATE toll.paybacks SET version = version + 1, updated_at = now()
      WHERE organization_id = p_company AND id = r.id RETURNING version INTO v_ver;
      v_pvers := v_pvers || jsonb_build_object(r.id::text, v_ver);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('decision_id', p_decision, 'charge_version', v_cv, 'payback_versions', v_pvers,
    'old_amount_minor', c.amount_minor, 'amount_minor', v_new, 'slices_reduced_minor', v_short,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
               jsonb_build_object('amount_change_minor', v_new - c.amount_minor, 'slices_reduced_minor', v_short))));
END;
$$;

-- 4. correct_charge_week (PB2) --------------------------------------------------------------------------------
-- Body: charge_id, expected_charge_version, occurred_at (the right time), reason_code (required). Both weeks open.
-- The charge's rows are reversed at the old time (old week) and posted again at the new time (new week); its slices
-- stay the same slices, only their rows move.
CREATE OR REPLACE FUNCTION toll_write.intent_correct_charge_week(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id      uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_at      timestamptz := nullif(p_body ->> 'occurred_at', '')::timestamptz;
  v_ow      date;
  v_nw      date;
  v_line    int := 0;
  v_cv      bigint;
  v_rule    text;
  v_net     bigint;
  c         toll.charges%ROWTYPE;
  a         record;
BEGIN
  IF v_id IS NULL OR v_at IS NULL OR nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('charge_id', 'occurred_at', 'reason_code')));
  END IF;
  v_nw := ledger.jamaica_week_start(v_at);
  SELECT x.week_key INTO v_ow FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_id;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_ow, v_nw]);
  c := toll_write.lock_charge(p_company, v_id, (p_body ->> 'expected_charge_version')::bigint);
  PERFORM toll_write.require_charge_state(p_company, c, ARRAY['pending', 'decided', 'unverified', 'awaiting_cash']);
  IF toll_system.charge_counted_week(p_company, c.id, c.week_key) <> c.week_key THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', 'carried'));
  END IF;
  IF v_at = c.occurred_at THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('occurred_at', 'same as now', 'charge_id', c.id));
  END IF;
  PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_ow, v_nw]);

  -- 1. reverse every row of the charge at the old time
  v_rule := CASE WHEN c.paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END;
  v_net := toll_system.rule_net(p_company, v_rule, 'charge_id', c.id::text)
         + toll_system.rule_net(p_company, 'P16_up_%', 'charge_id', c.id::text)
         - toll_system.rule_net(p_company, 'P16_down_%', 'charge_id', c.id::text);
  FOR a IN SELECT x.id, x.bearer, x.amount_minor, x.payback_id FROM toll.allocations x
           WHERE x.organization_id = p_company AND x.charge_id = c.id AND x.reversed_by IS NULL ORDER BY x.created_at, x.id LOOP
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, toll_system.bearer_rule(a.bearer), a.amount_minor, c.occurred_at, p_cmd, v_line,
      jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id)
      || CASE WHEN a.payback_id IS NOT NULL THEN jsonb_build_object('payback_id', a.payback_id) ELSE '{}'::jsonb END, true);
  END LOOP;
  IF v_net > 0 THEN
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, v_rule, v_net, c.occurred_at, p_cmd, v_line,
                             jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id), true);
  END IF;

  -- 2. the charge moves
  INSERT INTO toll.charge_changes (organization_id, charge_id, field, old_value, new_value, pending, decision_id)
  VALUES (p_company, c.id, 'week_key', c.week_key::text || ' ' || c.occurred_at::text, v_nw::text || ' ' || v_at::text,
          false, p_decision);
  UPDATE toll.charges SET occurred_at = v_at, week_key = v_nw, version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;

  -- 3. the same rows again at the new time
  IF v_net > 0 THEN
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, v_rule, v_net, v_at, p_cmd, v_line,
                             jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id));
  END IF;
  FOR a IN SELECT x.id, x.bearer, x.amount_minor, x.payback_id FROM toll.allocations x
           WHERE x.organization_id = p_company AND x.charge_id = c.id AND x.reversed_by IS NULL ORDER BY x.created_at, x.id LOOP
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, toll_system.bearer_rule(a.bearer), a.amount_minor, v_at, p_cmd, v_line,
      jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id)
      || CASE WHEN a.payback_id IS NOT NULL THEN jsonb_build_object('payback_id', a.payback_id) ELSE '{}'::jsonb END);
  END LOOP;

  RETURN jsonb_build_object('decision_id', p_decision, 'charge_version', v_cv, 'from_week', v_ow, 'to_week', v_nw,
    'weeks', toll_write.weeks_answer(p_company,
               toll_write.add_delta(toll_write.add_delta('{}'::jsonb, v_ow, jsonb_build_object('moved_out_minor', c.amount_minor)),
                                    v_nw, jsonb_build_object('moved_in_minor', c.amount_minor))));
END;
$$;

-- 5. Nightly checks: the same function, with check 3's payback_unallocated line corrected for cross-week take-backs.
-- Expected per week w = for each payback recorded in w: amount − slices still active − slices its own take-back
-- reversed (the original week keeps its figures, PB4); minus, for each take-back that arrived in w: the original's
-- amount − the slices that take-back reversed. A same-week take-back nets to 0, exactly as before.
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
      ) AS unalloc_expected,
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

-- 6. The router, with this round's intents wired in -----------------------------------------------------------
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

-- 7. Grants ----------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION toll_system.reduce_allocations(uuid, uuid, bigint, uuid, text, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_reverse_payback(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_correct_charge_amount(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_correct_charge_week(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.nightly_checks(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.nightly_checks(uuid) TO service_role;
REVOKE ALL ON FUNCTION toll_write.command(text, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION toll_write.command(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ===== 20261113031959_toll_v2_carry_forward =====
-- Toll rebuild Phase 2 P2-R4c: carry_forward (design G2, B3 "carry_forward", B5 P18 / P19, B6; Part F P2-R4).
--
-- A late fact against a week that is sealed AND whose drivers are paid can't reopen that week. carry_forward brings
-- it into an open week instead (to_week: the current week unless the body names a later open one). The paid week
-- never changes. Every carried fact gets a toll.carried_facts row, the record its ledger legs point at (I2), and the
-- only source of week_result.carriedIn.
--
--   kind            body                                          what happens in to_week
--   charge          charge_id (an after_seal charge)              counted in to_week; P2 / P3 now; decided like any charge
--   payback         payback_id (an after_seal payback)            its week becomes to_week; P4 / P5 now; decided as usual
--   take_back       payback_id (an active payback of the paid     P18: the leftover part clears (P18a); the covered part
--                   week), reference, paid_on, bearer             goes to the bearer (P18b). The paid week, the payback and
--                                                                 its slices stay exactly as sealed
--   correction_down charge_id, amount_minor (the right amount)    P19: the difference split by who bore the charge (C3
--                                                                 rounding). The platform share waits for a person
--                                                                 (leave_payback_unlinked with carried_fact_id) and blocks
--                                                                 to_week's seal until decided
--   correction_up   charge_id, amount_minor (the right amount)    a new charge of the difference (adjusts_charge_id),
--                                                                 counted in to_week, posted and decided like any charge
-- Refusals: WEEK_NOT_SEALED / REOPEN_INSTEAD (Phase 0 checks), WEEK_SEALED (to_week), WRONG_STATE, VERSION_CHANGED.
--
-- Decisions made here (one each):
--   * A carried CHARGE keeps its week_key (the fact's week) and counts in to_week through charge_counted_week, as
--     designed in Phase 0. Its postings must land in to_week, so every posting of a charge now uses
--     toll_system.charge_post_at (its crossing time, or noon on the Monday of the week it is counted in).
--   * A carried PAYBACK's week_key BECOMES to_week (the from_week stays on its carried row). A sealed week's facts hash
--     never included after_seal paybacks, so the paid week is unchanged, and every reader of a payback's week counts
--     it in to_week with no change.
--   * One carried row per posted leg (a P18 leftover and covered part, each P19 share; bearer NULL = the platform /
--     leftover part), so each check counts rows, never re-splits money.
--   * A take-back reverses the whole payback, as in R4b; a second take-back of the same payback is refused.

-- 1. Helpers -------------------------------------------------------------------------------------------------
-- When a charge's postings happen: its crossing time, or, once it is carried, noon on Monday of the week it counts in.
CREATE OR REPLACE FUNCTION toll_system.charge_post_at(p_company uuid, p_charge uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN w.cw = c.week_key THEN c.occurred_at
              ELSE (w.cw + time '12:00') AT TIME ZONE 'America/Jamaica' END
  FROM toll.charges c
  CROSS JOIN LATERAL (SELECT toll_system.charge_counted_week(p_company, c.id, c.week_key) AS cw) w
  WHERE c.organization_id = p_company AND c.id = p_charge;
$$;

-- Carried money landing in a week, by what it is (check 3 and the week result read the same rows).
CREATE OR REPLACE FUNCTION toll_system.carried_sum(p_company uuid, p_week date, p_what text)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(sum(f.amount_minor), 0)::bigint
  FROM toll.carried_facts f
  LEFT JOIN toll.charges c ON f.kind = 'correction_down' AND c.organization_id = f.organization_id AND c.id = f.original_id
  LEFT JOIN toll.paybacks p ON f.kind = 'take_back' AND p.organization_id = f.organization_id AND p.id = f.original_id
  WHERE f.organization_id = p_company AND f.to_week = p_week
    AND CASE p_what
      WHEN 'tb_leftover' THEN f.kind = 'take_back' AND f.bearer IS NULL
      WHEN 'tb_fleet'    THEN f.kind = 'take_back' AND f.bearer = 'fleet'
      WHEN 'tb_driver'   THEN f.kind = 'take_back' AND f.bearer = 'driver'
      WHEN 'tb_card'     THEN f.kind = 'take_back' AND p.received_by = 'fleet'
      WHEN 'tb_cash'     THEN f.kind = 'take_back' AND p.received_by = 'driver'
      WHEN 'cd_platform' THEN f.kind = 'correction_down' AND f.bearer IS NULL
      WHEN 'cd_fleet'    THEN f.kind = 'correction_down' AND f.bearer = 'fleet'
      WHEN 'cd_driver'   THEN f.kind = 'correction_down' AND f.bearer = 'driver'
      WHEN 'cd_tag'      THEN f.kind = 'correction_down' AND c.paid_by = 'tag'
      WHEN 'cd_cash'     THEN f.kind = 'correction_down' AND c.paid_by = 'cash'
      ELSE false END;
$$;

-- What of a carried platform share (P19) is still undecided.
CREATE OR REPLACE FUNCTION toll_system.carried_open_minor(p_company uuid, p_fact uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (f.amount_minor - coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                                     WHERE u.organization_id = f.organization_id AND u.carried_fact_id = f.id
                                       AND u.reversed_by IS NULL), 0))::bigint
  FROM toll.carried_facts f WHERE f.organization_id = p_company AND f.id = p_fact;
$$;

CREATE OR REPLACE FUNCTION toll_write.lock_carried(p_company uuid, p_id uuid, p_expected bigint,
                                                   p_field text DEFAULT 'expected_carried_version')
RETURNS toll.carried_facts LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE f toll.carried_facts%ROWTYPE;
BEGIN
  SELECT * INTO f FROM toll.carried_facts x WHERE x.organization_id = p_company AND x.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('carried_fact_id', p_id));
  END IF;
  IF p_expected IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array(p_field), 'carried_fact_id', p_id));
  END IF;
  IF f.version <> p_expected THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object('carried_fact_id', f.id, 'version', f.version,
                                                                    'open_minor', toll_system.carried_open_minor(p_company, f.id)));
  END IF;
  RETURN f;
END;
$$;

-- 2. carry_forward ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_carry_forward(p_company uuid, p_decision_id uuid, p_command_id text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from_week date := (p_body ->> 'from_week')::date;
  v_to_week   date := coalesce(nullif(p_body ->> 'to_week', '')::date, ledger.jamaica_week_start(now()));
  v_kind      text := p_body ->> 'kind';
  v_eff       timestamptz;
  v_fact      uuid;
  v_facts     jsonb := '[]'::jsonb;
  v_new       uuid;
  v_line      int := 0;
  v_amount    bigint;
  v_open      bigint;
  v_cut       bigint;
  v_total     bigint;
  v_share     jsonb := '{}'::jsonb;
  v_sum       bigint := 0;
  v_left      bigint;
  v_t         bigint;
  v_s         bigint;
  v_bearer    text;
  v_ver       bigint;
  v_extra     jsonb := '{}'::jsonb;
  b           text;
  c           toll.charges%ROWTYPE;
  p           toll.paybacks%ROWTYPE;
BEGIN
  IF v_from_week IS NULL OR v_kind IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('from_week', 'kind')));
  END IF;
  IF v_kind NOT IN ('charge', 'payback', 'take_back', 'correction_down', 'correction_up') THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('kind', v_kind,
      'allowed', jsonb_build_array('charge', 'payback', 'take_back', 'correction_down', 'correction_up')));
  END IF;
  v_to_week := ledger.jamaica_week_start((v_to_week + time '12:00') AT TIME ZONE 'America/Jamaica');   -- a Monday
  IF v_to_week <= v_from_week THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('to_week', v_to_week, 'must_be_after', v_from_week));
  END IF;

  -- Phase 0 checks: the from week is sealed and its drivers are paid (otherwise reopen it instead).
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_from_week, v_to_week]);
  IF NOT toll_system.week_is_sealed(p_company, v_from_week) THEN
    PERFORM toll_write.refuse('WEEK_NOT_SEALED', jsonb_build_object('week_key', v_from_week));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ledger.settlement_movements m
                 WHERE m.organization_id = p_company AND m.period_anchor = v_from_week
                   AND m.kind IN ('pay', 'write_off') AND m.status = 'posted') THEN
    PERFORM toll_write.refuse('REOPEN_INSTEAD', jsonb_build_object('week_key', v_from_week));
  END IF;
  PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_to_week]);
  v_eff := (v_to_week + time '12:00') AT TIME ZONE 'America/Jamaica';

  IF v_kind IN ('charge', 'correction_down', 'correction_up') THEN
    c := toll_write.lock_charge(p_company, nullif(p_body ->> 'charge_id', '')::uuid,
                                (p_body ->> 'expected_charge_version')::bigint);
    IF toll_system.charge_counted_week(p_company, c.id, c.week_key) <> v_from_week THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', 'not_in_from_week',
        'week_key', toll_system.charge_counted_week(p_company, c.id, c.week_key)));
    END IF;
  ELSE
    p := toll_write.lock_payback(p_company, nullif(p_body ->> 'payback_id', '')::uuid,
                                 (p_body ->> 'expected_payback_version')::bigint);
    IF p.week_key <> v_from_week THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id, 'state', 'not_in_from_week',
                                                                  'week_key', p.week_key));
    END IF;
  END IF;

  -- A late charge ---------------------------------------------------------------------------------------------
  IF v_kind = 'charge' THEN
    IF NOT c.after_seal THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', 'not_after_seal'));
    END IF;
    IF c.duplicate_of IS NOT NULL OR c.evidence_status = 'rejected' THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id,
        'state', CASE WHEN c.duplicate_of IS NOT NULL THEN 'duplicate' ELSE 'rejected' END));
    END IF;
    INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, decision_id)
    VALUES (p_company, 'charge', c.id, v_from_week, v_to_week, c.amount_minor, p_decision_id) RETURNING id INTO v_fact;
    UPDATE toll.charges SET after_seal = false, version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_ver;
    IF c.evidence_status = 'verified' THEN       -- an unverified cash receipt posts P3 when it is verified
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, CASE WHEN c.paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END,
                               c.amount_minor, toll_system.charge_post_at(p_company, c.id), p_command_id, v_line,
                               jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id));
    END IF;
    v_facts := jsonb_build_array(v_fact);
    v_amount := c.amount_minor;
    v_extra := jsonb_build_object('charge_version', v_ver);

  -- A late payback ---------------------------------------------------------------------------------------------
  ELSIF v_kind = 'payback' THEN
    IF NOT p.after_seal OR p.reversal_of IS NOT NULL OR p.kind = 'native' THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id,
        'state', CASE WHEN NOT p.after_seal THEN 'not_after_seal' WHEN p.kind = 'native' THEN 'roam_native'
                      ELSE 'reversing_payback' END));
    END IF;
    INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, decision_id)
    VALUES (p_company, 'payback', p.id, v_from_week, v_to_week, p.amount_minor, p_decision_id) RETURNING id INTO v_fact;
    UPDATE toll.paybacks SET after_seal = false, week_key = v_to_week, version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = p.id RETURNING version INTO v_ver;
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, CASE WHEN p.received_by = 'fleet' THEN 'P4_payback_fleet' ELSE 'P5_payback_driver' END,
                             p.amount_minor, v_eff, p_command_id, v_line,
                             jsonb_build_object('payback_id', p.id, 'driver_id', p.driver_id));
    v_facts := jsonb_build_array(v_fact);
    v_amount := p.amount_minor;
    v_extra := jsonb_build_object('payback_version', v_ver);

  -- A take-back of a payback in the paid week (P18) -------------------------------------------------------------
  ELSIF v_kind = 'take_back' THEN
    v_bearer := p_body ->> 'bearer';
    IF v_bearer IS NULL OR v_bearer NOT IN ('fleet', 'driver') OR nullif(btrim(p_body ->> 'reference'), '') IS NULL
       OR nullif(p_body ->> 'paid_on', '') IS NULL THEN
      PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('bearer (fleet | driver)', 'reference', 'paid_on')));
    END IF;
    IF v_bearer = 'driver' AND p.driver_id IS NULL THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id, 'state', 'no_driver'));
    END IF;
    IF p.after_seal OR p.reversal_of IS NOT NULL OR p.kind = 'native'
       OR EXISTS (SELECT 1 FROM toll.paybacks r WHERE r.organization_id = p_company AND r.reversal_of = p.id) THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id, 'state', 'not_an_active_payback'));
    END IF;
    IF EXISTS (SELECT 1 FROM toll.carried_facts f WHERE f.organization_id = p_company AND f.kind = 'take_back'
                 AND f.original_id = p.id) THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id, 'state', 'already_taken_back'));
    END IF;
    IF (p_body ? 'amount_minor') AND toll_write.body_amount(p_body) <> p.amount_minor THEN
      PERFORM toll_write.refuse('PARTIAL_TAKE_BACK', jsonb_build_object('payback_id', p.id, 'amount_minor', p.amount_minor,
                                                                        'taken_back_minor', toll_write.body_amount(p_body)));
    END IF;
    v_open := p.amount_minor - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                                         WHERE a.organization_id = p_company AND a.payback_id = p.id AND a.reversed_by IS NULL), 0);
    v_cut := p.amount_minor - v_open;               -- the part that covered tolls
    IF v_open > 0 THEN                              -- step a: the leftover never covered a toll; it just clears
      INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, decision_id)
      VALUES (p_company, 'take_back', p.id, v_from_week, v_to_week, v_open, p_decision_id) RETURNING id INTO v_fact;
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, CASE WHEN p.received_by = 'fleet' THEN 'P18a_leftover_fleet' ELSE 'P18a_leftover_driver' END,
                               v_open, v_eff, p_command_id, v_line,
                               jsonb_build_object('carried_fact_id', v_fact, 'driver_id', p.driver_id));
      v_facts := v_facts || to_jsonb(v_fact);
    END IF;
    IF v_cut > 0 THEN                               -- step b: the covered part, borne by the chosen bearer
      INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, bearer, decision_id)
      VALUES (p_company, 'take_back', p.id, v_from_week, v_to_week, v_cut, v_bearer, p_decision_id) RETURNING id INTO v_fact;
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, 'P18b_' || v_bearer || '_' || CASE WHEN p.received_by = 'fleet' THEN 'card' ELSE 'cash' END,
                               v_cut, v_eff, p_command_id, v_line,
                               jsonb_build_object('carried_fact_id', v_fact, 'driver_id', p.driver_id));
      v_facts := v_facts || to_jsonb(v_fact);
    END IF;
    UPDATE toll.paybacks SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = p.id RETURNING version INTO v_ver;
    v_amount := p.amount_minor;
    v_extra := jsonb_build_object('payback_version', v_ver, 'leftover_minor', v_open, 'covered_minor', v_cut, 'bearer', v_bearer,
                                  'reference', p_body ->> 'reference', 'paid_on', p_body ->> 'paid_on');

  -- An amount correction against the paid week ----------------------------------------------------------------
  ELSE
    v_amount := toll_write.body_amount(p_body);
    IF v_amount IS NULL OR nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
      PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('amount_minor', 'reason_code')));
    END IF;
    IF c.after_seal OR c.duplicate_of IS NOT NULL OR c.evidence_status <> 'verified' THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', toll_system.charge_state(p_company, c.id)));
    END IF;
    IF (v_kind = 'correction_down' AND v_amount >= c.amount_minor) OR (v_kind = 'correction_up' AND v_amount <= c.amount_minor) THEN
      PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('kind', v_kind, 'amount_minor', v_amount,
                                                                  'charge_amount_minor', c.amount_minor));
    END IF;
    -- the import may have left this correction waiting for a person: it is now decided
    UPDATE toll.charge_changes SET pending = false, decision_id = coalesce(decision_id, p_decision_id)
    WHERE organization_id = p_company AND charge_id = c.id AND field = 'amount_minor' AND pending;
    INSERT INTO toll.charge_changes (organization_id, charge_id, field, old_value, new_value, pending, decision_id)
    VALUES (p_company, c.id, 'amount_minor', c.amount_minor::text, v_amount::text, false, p_decision_id);

    IF v_kind = 'correction_up' THEN          -- a new charge of the difference, counted and decided in to_week
      INSERT INTO toll.charges (organization_id, vehicle_id, driver_id, plaza_id, occurred_at, week_key, time_precision,
                                amount_minor, paid_by, source, source_ref, evidence_status, adjusts_charge_id, evidence)
      VALUES (p_company, c.vehicle_id, c.driver_id, c.plaza_id, c.occurred_at, c.week_key, c.time_precision,
              v_amount - c.amount_minor, c.paid_by, c.source, c.source_ref || ':up:' || p_decision_id, 'verified', c.id,
              c.evidence)
      RETURNING id INTO v_new;
      INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, decision_id)
      VALUES (p_company, 'correction_up', v_new, v_from_week, v_to_week, v_amount - c.amount_minor, p_decision_id)
      RETURNING id INTO v_fact;
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, CASE WHEN c.paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END,
                               v_amount - c.amount_minor, toll_system.charge_post_at(p_company, v_new), p_command_id, v_line,
                               jsonb_build_object('charge_id', v_new, 'driver_id', c.driver_id));
      v_facts := jsonb_build_array(v_fact);
      v_extra := jsonb_build_object('adjusting_charge_id', v_new);
      v_amount := v_amount - c.amount_minor;
    ELSE                                      -- P19: split D by who bore the charge (C3 rounding)
      v_amount := c.amount_minor - v_amount;   -- D
      SELECT coalesce(sum(a.amount_minor), 0) INTO v_total FROM toll.allocations a
      WHERE a.organization_id = p_company AND a.charge_id = c.id AND a.reversed_by IS NULL;
      IF v_total <= 0 THEN
        PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', 'no_decision_to_split'));
      END IF;
      FOREACH b IN ARRAY ARRAY['driver', 'fleet', 'platform'] LOOP
        SELECT coalesce(sum(a.amount_minor), 0) INTO v_t FROM toll.allocations a
        WHERE a.organization_id = p_company AND a.charge_id = c.id AND a.reversed_by IS NULL AND a.bearer = b;
        v_s := (v_amount * v_t) / v_total;
        v_share := v_share || jsonb_build_object(b, v_s);
        v_sum := v_sum + v_s;
      END LOOP;
      v_left := v_amount - v_sum;
      FOREACH b IN ARRAY ARRAY['driver', 'fleet', 'platform'] LOOP
        EXIT WHEN v_left = 0;
        SELECT coalesce(sum(a.amount_minor), 0) INTO v_t FROM toll.allocations a
        WHERE a.organization_id = p_company AND a.charge_id = c.id AND a.reversed_by IS NULL AND a.bearer = b;
        v_s := (v_share ->> b)::bigint;
        v_cut := least(v_left, v_t - v_s);
        v_share := v_share || jsonb_build_object(b, v_s + v_cut);
        v_left := v_left - v_cut;
      END LOOP;
      FOREACH b IN ARRAY ARRAY['driver', 'fleet', 'platform'] LOOP
        v_s := (v_share ->> b)::bigint;
        CONTINUE WHEN v_s <= 0;
        INSERT INTO toll.carried_facts (organization_id, kind, original_id, from_week, to_week, amount_minor, bearer, decision_id)
        VALUES (p_company, 'correction_down', c.id, v_from_week, v_to_week, v_s, CASE WHEN b = 'platform' THEN NULL ELSE b END,
                p_decision_id)
        RETURNING id INTO v_fact;
        v_line := v_line + 1;
        PERFORM toll_system.post(p_company, 'P19_' || c.paid_by || '_' || b, v_s, v_eff, p_command_id, v_line,
                                 jsonb_build_object('carried_fact_id', v_fact, 'driver_id', c.driver_id));
        v_facts := v_facts || to_jsonb(v_fact);
      END LOOP;
      v_extra := jsonb_build_object('shares', v_share);
    END IF;
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_ver;
    v_extra := v_extra || jsonb_build_object('charge_version', v_ver);
  END IF;

  RETURN jsonb_build_object('decision_id', p_decision_id, 'kind', v_kind, 'from_week', v_from_week, 'to_week', v_to_week,
                            'carried_fact_ids', v_facts, 'amount_minor', v_amount)
         || v_extra
         || jsonb_build_object('weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_to_week,
                                 jsonb_build_object('carried_' || v_kind || '_minor', v_amount, 'from_week', v_from_week))));
END;
$$;

-- 3. leave_payback_unlinked, now also for a carried P19 platform share ------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_leave_payback_unlinked(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p      toll.paybacks%ROWTYPE;
  f      toll.carried_facts%ROWTYPE;
  v_id   uuid := nullif(p_body ->> 'payback_id', '')::uuid;
  v_fid  uuid := nullif(p_body ->> 'carried_fact_id', '')::uuid;
  v_pw   date;
  v_open bigint;
  v_take bigint;
  v_pv   bigint;
BEGIN
  IF nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('reason_code')));
  END IF;

  IF v_fid IS NOT NULL THEN     -- a P19 platform share, decided on its carried row in the open week (B3)
    SELECT x.to_week INTO v_pw FROM toll.carried_facts x WHERE x.organization_id = p_company AND x.id = v_fid;
    PERFORM toll_write.lock_weeks(p_company, ARRAY[v_pw]);
    f := toll_write.lock_carried(p_company, v_fid, (p_body ->> 'expected_carried_version')::bigint);
    IF f.kind <> 'correction_down' OR f.bearer IS NOT NULL THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('carried_fact_id', f.id, 'state', 'not_a_platform_share'));
    END IF;
    PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_pw]);
    v_open := toll_system.carried_open_minor(p_company, f.id);
    IF v_open <= 0 THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('carried_fact_id', f.id, 'state', 'nothing_left'));
    END IF;
    v_take := coalesce(toll_write.body_amount(p_body), v_open);
    IF v_take > v_open THEN
      PERFORM toll_write.refuse('AMOUNT_TOO_LARGE', jsonb_build_object('amount_minor', v_take, 'carried_open_minor', v_open));
    END IF;
    INSERT INTO toll.payback_unlinked_decisions (organization_id, carried_fact_id, amount_minor, reason, decision_id)
    VALUES (p_company, f.id, v_take, p_body ->> 'reason_code', p_decision);
    UPDATE toll.carried_facts SET version = version + 1 WHERE organization_id = p_company AND id = f.id RETURNING version INTO v_pv;
    RETURN jsonb_build_object('decision_id', p_decision, 'carried_version', v_pv, 'amount_minor', v_take,
      'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_pw,
                 jsonb_build_object('left_unlinked_minor', v_take))));
  END IF;

  SELECT x.week_key INTO v_pw FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = v_id;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_pw]);
  p := toll_write.lock_payback(p_company, v_id, (p_body ->> 'expected_payback_version')::bigint);
  PERFORM toll_write.require_payback_usable(p_company, p);
  PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_pw]);

  v_open := toll_system.payback_open_minor(p_company, p.id);
  IF v_open <= 0 THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id, 'state', 'nothing_left', 'open_minor', v_open));
  END IF;
  v_take := coalesce(toll_write.body_amount(p_body), v_open);
  IF v_take > v_open THEN
    PERFORM toll_write.refuse('AMOUNT_TOO_LARGE', jsonb_build_object('amount_minor', v_take, 'payback_open_minor', v_open));
  END IF;

  INSERT INTO toll.payback_unlinked_decisions (organization_id, payback_id, amount_minor, reason, decision_id)
  VALUES (p_company, p.id, v_take, p_body ->> 'reason_code', p_decision);
  UPDATE toll.paybacks SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = p.id RETURNING version INTO v_pv;

  RETURN jsonb_build_object('decision_id', p_decision, 'payback_version', v_pv, 'amount_minor', v_take,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_pw,
               jsonb_build_object('left_unlinked_minor', v_take))));
END;
$$;

-- 4. undo_decision, now also for unlinked rows on a carried share ---------------------------------------------
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
BEGIN
  IF v_target IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('decision_id')));
  END IF;
  SELECT * INTO d FROM toll.decisions x WHERE x.organization_id = p_company AND x.id = v_target;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('decision_id', v_target));
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

  -- Every touched record's version (paybacks and carried rows before charges).
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

-- 5. The postings of a charge now land in the week it counts in (charge_post_at) --------------------------------
CREATE OR REPLACE FUNCTION toll_system.allocate(p_company uuid, p_charge uuid, p_bearer text, p_amount bigint,
                                               p_payback uuid, p_reason text, p_decision uuid, p_cmd text, p_line int)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c    toll.charges%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO c FROM toll.charges x WHERE x.organization_id = p_company AND x.id = p_charge;
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id)
  VALUES (p_company, p_charge, p_bearer, p_amount, p_payback, p_reason, p_decision)
  RETURNING id INTO v_id;
  PERFORM toll_system.post(p_company, toll_system.bearer_rule(p_bearer), p_amount, toll_system.charge_post_at(p_company, c.id), p_cmd, p_line,
                           jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id)
                           || CASE WHEN p_payback IS NOT NULL THEN jsonb_build_object('payback_id', p_payback)
                                   ELSE '{}'::jsonb END);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.reverse_allocation(p_company uuid, p_allocation uuid, p_decision uuid,
                                                         p_cmd text, p_line int)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  SELECT a.id, a.charge_id, a.bearer, a.amount_minor, a.payback_id, c.occurred_at, c.driver_id INTO r
  FROM toll.allocations a JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
  WHERE a.organization_id = p_company AND a.id = p_allocation AND a.reversed_by IS NULL
  FOR UPDATE OF a;
  IF NOT FOUND THEN RETURN 0; END IF;
  UPDATE toll.allocations SET reversed_by = p_decision WHERE organization_id = p_company AND id = r.id;
  PERFORM toll_system.post(p_company, toll_system.bearer_rule(r.bearer), r.amount_minor, toll_system.charge_post_at(p_company, r.charge_id), p_cmd, p_line,
                           jsonb_build_object('charge_id', r.charge_id, 'driver_id', r.driver_id)
                           || CASE WHEN r.payback_id IS NOT NULL THEN jsonb_build_object('payback_id', r.payback_id)
                                   ELSE '{}'::jsonb END,
                           true);
  RETURN r.amount_minor;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.do_receipt(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb, p_verify boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c    toll.charges%ROWTYPE;
  v_id uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_cw date;
  v_cv bigint;
BEGIN
  IF NOT p_verify AND nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('reason_code')));
  END IF;
  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_cw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_id;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_cw]);
  c := toll_write.lock_charge(p_company, v_id, (p_body ->> 'expected_charge_version')::bigint);
  IF c.paid_by <> 'cash' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', c.id, 'state', 'not_cash'));
  END IF;
  PERFORM toll_write.require_charge_state(p_company, c, ARRAY['unverified']);
  PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_cw]);

  UPDATE toll.charges SET evidence_status = CASE WHEN p_verify THEN 'verified' ELSE 'rejected' END,
                          version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  IF p_verify THEN   -- P3 posts at verification (B5); the charge becomes pending
    PERFORM toll_system.post(p_company, 'P3_cash_verified', c.amount_minor, toll_system.charge_post_at(p_company, c.id), p_cmd, 1,
                             jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id));
  END IF;

  RETURN jsonb_build_object('decision_id', p_decision, 'charge_version', v_cv,
    'state', toll_system.charge_state(p_company, c.id),
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
               CASE WHEN p_verify THEN jsonb_build_object('verified_minor', c.amount_minor)
                    ELSE jsonb_build_object('rejected_minor', c.amount_minor) END)));
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.do_duplicate(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb, p_confirm boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_copy   uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_keep   uuid := nullif(p_body ->> 'other_charge_id', '')::uuid;
  v_rev    toll.duplicate_reviews%ROWTYPE;
  c        toll.charges%ROWTYPE;
  k        toll.charges%ROWTYPE;
  v_cw     date;
  v_kw     date;
  v_line   int := 0;
  v_net    bigint;
  v_undone bigint := 0;
  v_cv     bigint;
  v_kv     bigint;
  a        record;
BEGIN
  IF v_copy IS NULL OR v_keep IS NULL OR v_copy = v_keep THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('charge_id', 'other_charge_id')));
  END IF;
  SELECT * INTO v_rev FROM toll.duplicate_reviews r
  WHERE r.organization_id = p_company AND r.charge_a = least(v_copy, v_keep) AND r.charge_b = greatest(v_copy, v_keep)
  FOR UPDATE;
  IF NOT FOUND OR v_rev.status <> 'open' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', v_copy, 'other_charge_id', v_keep,
                                                                'state', coalesce(v_rev.status, 'no_review_pair')));
  END IF;

  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_cw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_copy;
  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_kw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_keep;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_cw, v_kw]);
  IF v_copy < v_keep THEN   -- two charges: lock in id order
    c := toll_write.lock_charge(p_company, v_copy, (p_body ->> 'expected_charge_version')::bigint);
    k := toll_write.lock_charge(p_company, v_keep, (p_body ->> 'expected_other_version')::bigint, 'expected_other_version');
  ELSE
    k := toll_write.lock_charge(p_company, v_keep, (p_body ->> 'expected_other_version')::bigint, 'expected_other_version');
    c := toll_write.lock_charge(p_company, v_copy, (p_body ->> 'expected_charge_version')::bigint);
  END IF;

  IF p_confirm THEN
    PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_cw]);
    IF k.duplicate_of IS NOT NULL OR c.duplicate_of IS NOT NULL THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('charge_id', CASE WHEN k.duplicate_of IS NOT NULL
                                                                   THEN k.id ELSE c.id END, 'state', 'duplicate'));
    END IF;
    -- The copy's decisions are reversed first, then its arrival (P2 / P3, with any P16 corrections) is reversed.
    FOR a IN SELECT al.id FROM toll.allocations al
             WHERE al.organization_id = p_company AND al.charge_id = c.id AND al.reversed_by IS NULL
             ORDER BY al.created_at, al.id LOOP
      v_line := v_line + 1;
      v_undone := v_undone + toll_system.reverse_allocation(p_company, a.id, p_decision, p_cmd, v_line);
    END LOOP;
    v_net := toll_system.rule_net(p_company, CASE WHEN c.paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END,
                                  'charge_id', c.id::text)
           + toll_system.rule_net(p_company, 'P16_up_%', 'charge_id', c.id::text)
           - toll_system.rule_net(p_company, 'P16_down_%', 'charge_id', c.id::text);
    IF v_net < 0 THEN
      RAISE EXCEPTION 'TOLL_DUPLICATE_NET_NEGATIVE: charge % nets %', c.id, v_net;
    END IF;
    IF v_net > 0 THEN
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, CASE WHEN c.paid_by = 'tag' THEN 'P2_tag_crossing' ELSE 'P3_cash_verified' END,
                               v_net, toll_system.charge_post_at(p_company, c.id), p_cmd, v_line,
                               jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id), true);
    END IF;
    UPDATE toll.charges SET duplicate_of = k.id, version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  ELSE
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  END IF;
  UPDATE toll.charges SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = k.id RETURNING version INTO v_kv;
  UPDATE toll.duplicate_reviews SET status = CASE WHEN p_confirm THEN 'confirmed' ELSE 'released' END,
                                   decision_id = p_decision, updated_at = now()
  WHERE organization_id = p_company AND id = v_rev.id;

  RETURN jsonb_build_object('decision_id', p_decision, 'review_id', v_rev.id,
    'charge_version', v_cv, 'other_version', v_kv,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
               CASE WHEN p_confirm THEN jsonb_build_object('duplicate_removed_minor', coalesce(v_net, 0),
                                                            'undone_minor', v_undone)
                    ELSE jsonb_build_object('review_released', true) END)));
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_correct_charge_amount(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id      uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_new     bigint;
  v_cw      date;
  v_weeks   date[];
  v_pbs     uuid[];
  v_alloc   bigint;
  v_short   bigint := 0;
  v_line    int := 0;
  v_cv      bigint;
  v_ver     bigint;
  v_pvers   jsonb := '{}'::jsonb;
  v_posted  boolean;
  c         toll.charges%ROWTYPE;
  r         record;
BEGIN
  v_new := toll_write.body_amount(p_body);
  IF v_new IS NULL OR nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('amount_minor', 'reason_code')));
  END IF;
  SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) INTO v_cw
  FROM toll.charges x WHERE x.organization_id = p_company AND x.id = v_id;
  -- A platform slice that shrinks leaves a leftover on its payback, so the payback's week must be open too.
  v_pbs := array(SELECT DISTINCT a.payback_id FROM toll.allocations a WHERE a.organization_id = p_company
                   AND a.charge_id = v_id AND a.reversed_by IS NULL AND a.payback_id IS NOT NULL ORDER BY 1);
  v_weeks := array(SELECT x.week_key FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = ANY (v_pbs))
             || ARRAY[v_cw];
  PERFORM toll_write.lock_weeks(p_company, v_weeks);

  PERFORM 1 FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = ANY (v_pbs) ORDER BY x.id FOR UPDATE;
  c := toll_write.lock_charge(p_company, v_id, (p_body ->> 'expected_charge_version')::bigint);
  PERFORM toll_write.require_charge_state(p_company, c, ARRAY['pending', 'decided', 'unverified', 'awaiting_cash']);
  IF v_new = c.amount_minor THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('amount_minor', 'same as now', 'charge_id', c.id));
  END IF;

  v_alloc := c.amount_minor - toll_system.charge_open_minor(p_company, c.id);
  v_short := greatest(v_alloc - v_new, 0);
  IF v_short = 0 THEN   -- only a shrink below the slices touches a payback
    v_weeks := ARRAY[v_cw];
  END IF;
  PERFORM toll_write.refuse_if_sealed(p_company, v_weeks);

  v_posted := c.evidence_status = 'verified';
  v_line := toll_system.reduce_allocations(p_company, c.id, v_short, p_decision, p_cmd, v_line);
  INSERT INTO toll.charge_changes (organization_id, charge_id, field, old_value, new_value, pending, decision_id)
  VALUES (p_company, c.id, 'amount_minor', c.amount_minor::text, v_new::text, false, p_decision);
  UPDATE toll.charges SET amount_minor = v_new, version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = c.id RETURNING version INTO v_cv;
  IF v_posted THEN
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company,
      'P16_' || CASE WHEN v_new > c.amount_minor THEN 'up_' ELSE 'down_' END || c.paid_by,
      abs(v_new - c.amount_minor), toll_system.charge_post_at(p_company, c.id), p_cmd, v_line,
      jsonb_build_object('charge_id', c.id, 'driver_id', c.driver_id));
  END IF;
  IF v_short > 0 THEN
    FOR r IN SELECT x.id FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = ANY (v_pbs) LOOP
      UPDATE toll.paybacks SET version = version + 1, updated_at = now()
      WHERE organization_id = p_company AND id = r.id RETURNING version INTO v_ver;
      v_pvers := v_pvers || jsonb_build_object(r.id::text, v_ver);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('decision_id', p_decision, 'charge_version', v_cv, 'payback_versions', v_pvers,
    'old_amount_minor', c.amount_minor, 'amount_minor', v_new, 'slices_reduced_minor', v_short,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_cw,
               jsonb_build_object('amount_change_minor', v_new - c.amount_minor, 'slices_reduced_minor', v_short))));
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_reverse_payback(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id       uuid := nullif(p_body ->> 'payback_id', '')::uuid;
  v_ref      text := nullif(btrim(p_body ->> 'reference'), '');
  v_paid_on  date := nullif(p_body ->> 'paid_on', '')::date;
  v_eff      timestamptz;
  v_rw       date;
  v_pw       date;
  v_weeks    date[];
  v_charges  uuid[];
  v_rev      uuid;
  v_line     int := 0;
  v_taken    bigint := 0;
  v_deltas   jsonb := '{}'::jsonb;
  v_versions jsonb := '{}'::jsonb;
  v_ver      bigint;
  v_amount   bigint;
  p          toll.paybacks%ROWTYPE;
  r          record;
BEGIN
  IF v_id IS NULL OR v_ref IS NULL OR v_paid_on IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('payback_id', 'reference', 'paid_on')));
  END IF;
  v_amount := toll_write.body_amount(p_body);
  v_eff := (v_paid_on + time '12:00') AT TIME ZONE 'America/Jamaica';
  v_rw := ledger.jamaica_week_start(v_eff);

  SELECT x.week_key INTO v_pw FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = v_id;
  v_charges := array(SELECT DISTINCT a.charge_id FROM toll.allocations a
                     WHERE a.organization_id = p_company AND a.payback_id = v_id AND a.reversed_by IS NULL ORDER BY 1);
  v_weeks := array(SELECT toll_system.charge_counted_week(p_company, c.id, c.week_key) FROM toll.charges c
                   WHERE c.organization_id = p_company AND c.id = ANY (v_charges)) || ARRAY[v_pw, v_rw];
  PERFORM toll_write.lock_weeks(p_company, v_weeks);

  p := toll_write.lock_payback(p_company, v_id, (p_body ->> 'expected_payback_version')::bigint);
  PERFORM toll_write.require_payback_usable(p_company, p);
  IF v_amount IS NOT NULL AND v_amount <> p.amount_minor THEN
    PERFORM toll_write.refuse('PARTIAL_TAKE_BACK', jsonb_build_object('payback_id', p.id, 'amount_minor', p.amount_minor,
                                                                      'taken_back_minor', v_amount));
  END IF;
  IF EXISTS (SELECT 1 FROM toll.paybacks x WHERE x.organization_id = p_company AND x.platform = p.platform
               AND x.reference = v_ref) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('reference', v_ref, 'state', 'reference_used'));
  END IF;
  -- The slices' charges (locked; their versions move, the take-back did not need them)
  PERFORM 1 FROM toll.charges c WHERE c.organization_id = p_company AND c.id = ANY (v_charges) ORDER BY c.id FOR UPDATE;
  PERFORM toll_write.refuse_if_sealed(p_company, v_weeks);

  INSERT INTO toll.paybacks (organization_id, platform, kind, platform_trip_id, reference, driver_id, paid_on, week_key,
                             amount_minor, reversal_of, received_by)
  VALUES (p_company, p.platform, p.kind, p.platform_trip_id, v_ref, p.driver_id, v_paid_on, v_rw,
          p.amount_minor, p.id, p.received_by)
  RETURNING id INTO v_rev;

  -- (a) every active slice of the original: reversed, its P6 reversed (counted in the take-back's week on the payback side)
  FOR r IN
    SELECT a.id, a.charge_id, a.amount_minor, c.occurred_at, c.driver_id,
           toll_system.charge_counted_week(p_company, c.id, c.week_key) AS cw
    FROM toll.allocations a JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
    WHERE a.organization_id = p_company AND a.payback_id = p.id AND a.reversed_by IS NULL
    ORDER BY a.created_at DESC, a.id DESC
  LOOP
    UPDATE toll.allocations SET reversed_by = v_rev WHERE organization_id = p_company AND id = r.id;
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, 'P6_allocate_platform', r.amount_minor, toll_system.charge_post_at(p_company, r.charge_id), p_cmd, v_line,
                             jsonb_build_object('charge_id', r.charge_id, 'payback_id', p.id, 'reversing_payback_id', v_rev,
                                                'driver_id', r.driver_id), true);
    v_taken := v_taken + r.amount_minor;
    v_deltas := toll_write.add_delta(v_deltas, r.cw, jsonb_build_object('uncovered_minor',
                  coalesce((v_deltas -> (r.cw::text) ->> 'uncovered_minor')::bigint, 0) + r.amount_minor));
  END LOOP;
  -- the unlinked rows go with it (no posting of their own: P9)
  UPDATE toll.payback_unlinked_decisions SET reversed_by = v_rev
  WHERE organization_id = p_company AND payback_id = p.id AND reversed_by IS NULL;

  -- (b) the original's arrival, for its full amount
  v_line := v_line + 1;
  PERFORM toll_system.post(p_company, CASE WHEN p.received_by = 'fleet' THEN 'P4_payback_fleet' ELSE 'P5_payback_driver' END,
                           p.amount_minor, v_eff, p_cmd, v_line,
                           jsonb_build_object('payback_id', p.id, 'reversing_payback_id', v_rev, 'driver_id', p.driver_id), true);

  UPDATE toll.paybacks SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = p.id RETURNING version INTO v_ver;
  FOR r IN SELECT c.id FROM toll.charges c WHERE c.organization_id = p_company AND c.id = ANY (v_charges) LOOP
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = r.id RETURNING version INTO v_amount;
    v_versions := v_versions || jsonb_build_object(r.id::text, v_amount);
  END LOOP;
  v_deltas := toll_write.add_delta(v_deltas, v_rw, jsonb_build_object('taken_back_minor', p.amount_minor));

  RETURN jsonb_build_object('decision_id', p_decision, 'reversal_payback_id', v_rev, 'payback_version', v_ver,
                            'charge_versions', v_versions, 'uncovered_minor', v_taken,
                            'weeks', toll_write.weeks_answer(p_company, v_deltas));
END;
$$;

-- 6. The seal rule: an undecided carried platform share blocks its week (B6, C2) -----------------------------
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
  FROM week_paybacks wp WHERE wp.unallocated > 0
  UNION ALL                                                     -- R4c: a carried P19 platform share not yet decided
  SELECT 'carried'::text, f.id, toll_system.carried_open_minor(p_company, f.id), 'unallocated_payback'::text
  FROM toll.carried_facts f
  WHERE f.organization_id = p_company AND f.to_week = p_week AND f.kind = 'correction_down' AND f.bearer IS NULL
    AND toll_system.carried_open_minor(p_company, f.id) > 0;
$$;

-- 7. The week result: carried money in drivers' lines and carriedMoney (only in weeks that have some) --------
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
                     WHERE a.bearer = 'platform' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS platform_borne,
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

-- 8. Nightly checks: check 3 counts the P18 / P19 legs in their carried row's to_week --------------------------
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
      -- suspense: +P2 +P3 +P16up −P16down −P6 −P7 −P8 (charge week)
      coalesce((SELECT sum(CASE WHEN rule ~ '^(P2_|P3_|P16_up_)' THEN amt
                                WHEN rule ~ '^(P16_down_|P6_|P7_|P8_)' THEN -amt ELSE 0 END) FROM cl WHERE cl.wk = w.wk), 0) AS suspense_flow,
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

-- 9. Grants ----------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION toll_system.charge_post_at(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.carried_sum(uuid, date, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.carried_open_minor(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.lock_carried(uuid, uuid, bigint, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_carry_forward(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';


-- ===== 20261113142520_toll_v2_matcher_sweep_cron =====
-- Toll rebuild Phase 2 P2-R6: run the matcher sweep on a schedule (Part F, P2-R5 starting brief item 3).
-- Same door pattern as the fuel / recon timers: pg_cron → fleet-toll-cron (cron secret) → fleet-toll
-- /internal/toll-matcher-sweep (service key). The database only wakes the door when the matcher queue has work,
-- so an empty queue costs one indexed read and no HTTP call.

CREATE OR REPLACE FUNCTION private.invoke_toll_matcher_sweep()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM toll.match_queue) THEN
    RETURN NULL;
  END IF;
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  SELECT net.http_post(
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/fleet-toll-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO req_id;
  RETURN req_id;
END;
$$;

ALTER FUNCTION private.invoke_toll_matcher_sweep() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.invoke_toll_matcher_sweep() FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'toll-v2-matcher-sweep';
    PERFORM cron.schedule('toll-v2-matcher-sweep', '*/10 * * * *', $cron$SELECT private.invoke_toll_matcher_sweep()$cron$);
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped toll-v2-matcher-sweep';
  END IF;
END $$;


INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261113001948', 'toll_v2_import_core') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261113011349', 'toll_v2_matcher') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261113023100', 'toll_v2_decisions') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261113030328', 'toll_v2_fact_corrections') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261113031959', 'toll_v2_carry_forward') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261113142520', 'toll_v2_matcher_sweep_cron') ON CONFLICT (version) DO NOTHING;
COMMIT;
SELECT (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20261113001948','20261113011349','20261113023100','20261113030328','20261113031959','20261113142520')) AS logbook_rows, to_regprocedure('public.toll_sys_import(uuid,text,jsonb,text,text)') IS NOT NULL AS import_ready, to_regprocedure('public.toll_sys_match_claim(uuid,integer)') IS NOT NULL AS matcher_ready, (SELECT count(*) FROM cron.job WHERE jobname = 'toll-v2-matcher-sweep') AS sweep_timer;

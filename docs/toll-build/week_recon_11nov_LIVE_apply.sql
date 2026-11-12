-- Week Reconciliation 11 Nov: the 11 migrations not yet on the live database, all or nothing, with logbook lines.
-- Paste the WHOLE file into the Supabase SQL editor and run it once.
BEGIN;

-- ===== 20261111043430_recon_week_runs_main_line_holds.sql =====
-- Week Reconciliation Round 1: main_line on week_runs + publish holds (WRA-11, WRA-27).

-- orgMainLine(profile): rideshare when Rideshare is in service_lines, else rush_delivery.
CREATE OR REPLACE FUNCTION recon.org_main_line(p_org text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(
      array_length(o.service_lines, 1),
      0
    ) = 0 THEN 'rideshare'
    WHEN 'rideshare' = ANY (o.service_lines) THEN 'rideshare'
    ELSE 'rush_delivery'
  END
  FROM public.organizations o
  WHERE o.id::text = p_org
  LIMIT 1;
$$;

COMMENT ON FUNCTION recon.org_main_line(text) IS
  'Frozen tag-account desk line at run creation; matches orgMainLine in reconSources.';

ALTER TABLE recon.week_runs
  ADD COLUMN IF NOT EXISTS main_line text;

UPDATE recon.week_runs wr
SET main_line = COALESCE(recon.org_main_line(wr.organization_id), 'rideshare')
WHERE wr.main_line IS NULL;

ALTER TABLE recon.week_runs
  ALTER COLUMN main_line SET NOT NULL;

ALTER TABLE recon.week_runs
  DROP CONSTRAINT IF EXISTS week_runs_main_line_check;

ALTER TABLE recon.week_runs
  ADD CONSTRAINT week_runs_main_line_check
  CHECK (main_line IN ('rideshare', 'rush_delivery'));

CREATE OR REPLACE FUNCTION recon.tg_week_runs_main_line_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.main_line IS NOT NULL
    AND NEW.main_line IS DISTINCT FROM OLD.main_line THEN
    RAISE EXCEPTION 'week_runs.main_line cannot change after it is set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS week_runs_main_line_immutable ON recon.week_runs;

CREATE TRIGGER week_runs_main_line_immutable
  BEFORE UPDATE ON recon.week_runs
  FOR EACH ROW
  EXECUTE FUNCTION recon.tg_week_runs_main_line_immutable();

ALTER TABLE recon.week_runs
  ALTER COLUMN version SET DEFAULT 1;

ALTER TABLE recon.week_runs
  ALTER COLUMN version SET NOT NULL;

CREATE TABLE IF NOT EXISTS recon.week_publish_holds (
  run_id uuid PRIMARY KEY
    REFERENCES recon.week_runs (id) ON DELETE CASCADE,
  hold_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE recon.week_publish_holds IS
  'Per-run calculator publish hold (2 min user activity). WRA-27.';

INSERT INTO recon.week_publish_holds (run_id, hold_until, updated_at)
SELECT id, NULL, now()
FROM recon.week_runs
ON CONFLICT (run_id) DO NOTHING;

ALTER TABLE recon.week_publish_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS week_publish_holds_org_select ON recon.week_publish_holds;

CREATE POLICY week_publish_holds_org_select ON recon.week_publish_holds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM recon.week_runs w
      WHERE w.id = run_id
        AND w.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')
    )
  );

REVOKE ALL ON recon.week_publish_holds FROM PUBLIC;
GRANT SELECT ON recon.week_publish_holds TO authenticated;
GRANT ALL ON recon.week_publish_holds TO service_role;

NOTIFY pgrst, 'reload schema';


-- ===== 20261111043439_recon_decision_log.sql =====
-- Week Reconciliation Round 1: decision log columns + append-only (WRA-28, WRA-30, WRA-38).
-- kind stays the event type column (live edge uses kind); calculator_publish via kind.

ALTER TABLE recon.run_events
  ADD COLUMN IF NOT EXISTS line text,
  ADD COLUMN IF NOT EXISTS week_key date,
  ADD COLUMN IF NOT EXISTS step text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS before jsonb,
  ADD COLUMN IF NOT EXISTS after jsonb,
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS supersedes uuid,
  ADD COLUMN IF NOT EXISTS restatement_id uuid,
  ADD COLUMN IF NOT EXISTS prepared_by text,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS self_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'applied',
  ADD COLUMN IF NOT EXISTS version_at_send int;

ALTER TABLE recon.run_events
  DROP CONSTRAINT IF EXISTS run_events_status_check;

ALTER TABLE recon.run_events
  ADD CONSTRAINT run_events_status_check
  CHECK (
    status IN (
      'applied',
      'pending_approval',
      'approved',
      'rejected',
      'withdrawn',
      'stale'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS run_events_run_idempotency_uidx
  ON recon.run_events (run_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE VIEW recon.self_approvals
WITH (security_invoker = true)
AS
  SELECT *
  FROM recon.run_events
  WHERE self_approved = true
    AND status = 'approved';

COMMENT ON VIEW recon.self_approvals IS
  'Self-approved decision-log rows for monthly review (WRA-32).';

GRANT SELECT ON recon.self_approvals TO authenticated;

CREATE OR REPLACE FUNCTION recon.tg_run_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed_transition boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'recon.run_events is append-only: delete not allowed';
  END IF;

  IF TG_OP = 'UPDATE' THEN
  IF to_jsonb(NEW) - 'status' - 'approved_by'
    IS DISTINCT FROM to_jsonb(OLD) - 'status' - 'approved_by' THEN
      RAISE EXCEPTION 'recon.run_events: only status and approved_by may be updated';
    END IF;

    IF OLD.status = 'pending_approval'
      AND NEW.status IN ('approved', 'rejected', 'withdrawn', 'stale') THEN
      allowed_transition := true;
    ELSIF OLD.status = 'stale' AND NEW.status = 'withdrawn' THEN
      allowed_transition := true;
    END IF;

    IF NOT allowed_transition THEN
      RAISE EXCEPTION
        'recon.run_events: disallowed status transition % -> %',
        OLD.status,
        NEW.status;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS run_events_append_only ON recon.run_events;

CREATE TRIGGER run_events_append_only
  BEFORE UPDATE OR DELETE ON recon.run_events
  FOR EACH ROW
  EXECUTE FUNCTION recon.tg_run_events_append_only();

REVOKE UPDATE, DELETE ON recon.run_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON recon.run_events FROM authenticated;
REVOKE DELETE ON recon.run_events FROM service_role;

GRANT SELECT, INSERT, UPDATE ON recon.run_events TO service_role;
GRANT SELECT ON recon.run_events TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE recon.run_events_id_seq TO service_role;

NOTIFY pgrst, 'reload schema';


-- ===== 20261111043452_recon_publish_week_desk.sql =====
-- Week Reconciliation Round 1: atomic calculator desk publish (WRA-29).

CREATE OR REPLACE FUNCTION recon.publish_week_desk(
  p_run_id uuid,
  p_inputs_hash text,
  p_payload jsonb,
  p_sources jsonb,
  p_steps jsonb,
  p_blockers jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, public
AS $$
DECLARE
  v_run recon.week_runs%ROWTYPE;
  v_org text;
  v_week date;
  v_line text;
  v_new_version bigint;
  v_elem jsonb;
  v_keep text[] := ARRAY[]::text[];
  v_key text;
  v_snapshot jsonb;
  v_step_id text;
BEGIN
  SELECT *
  INTO v_run
  FROM recon.week_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'week run not found: %', p_run_id;
  END IF;

  v_org := v_run.organization_id;
  v_week := v_run.week_key;
  v_line := v_run.service_line;

  FOR v_elem IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_sources, '[]'::jsonb))
  LOOP
    INSERT INTO recon.run_sources (
      run_id,
      source_id,
      requirement,
      status,
      coverage,
      input_hash,
      row_count,
      amount_minor,
      attested_by,
      attested_at,
      attest_reason
    ) VALUES (
      p_run_id,
      v_elem ->> 'source_id',
      v_elem ->> 'requirement',
      v_elem ->> 'status',
      COALESCE(v_elem -> 'coverage', '{}'::jsonb),
      v_elem ->> 'input_hash',
      NULLIF(v_elem ->> 'row_count', '')::int,
      NULLIF(v_elem ->> 'amount_minor', '')::bigint,
      v_elem ->> 'attested_by',
      NULLIF(v_elem ->> 'attested_at', '')::timestamptz,
      v_elem ->> 'attest_reason'
    )
    ON CONFLICT (run_id, source_id) DO UPDATE SET
      requirement = EXCLUDED.requirement,
      status = EXCLUDED.status,
      coverage = EXCLUDED.coverage,
      input_hash = EXCLUDED.input_hash,
      row_count = EXCLUDED.row_count,
      amount_minor = EXCLUDED.amount_minor,
      attested_by = EXCLUDED.attested_by,
      attested_at = EXCLUDED.attested_at,
      attest_reason = EXCLUDED.attest_reason;
  END LOOP;

  FOR v_elem IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_steps, '[]'::jsonb))
  LOOP
    v_step_id := COALESCE(v_elem ->> 'step_id', v_elem ->> 'id');
    IF v_step_id IS NULL OR v_step_id = '' THEN
      RAISE EXCEPTION 'run_steps row missing step_id';
    END IF;

    INSERT INTO recon.run_steps (
      run_id,
      step_id,
      actionable,
      informational,
      completed_at,
      completed_by,
      inputs_hash_at_complete
    ) VALUES (
      p_run_id,
      v_step_id,
      COALESCE((v_elem ->> 'actionable')::int, 0),
      COALESCE((v_elem ->> 'informational')::int, 0),
      CASE
        WHEN v_elem ? 'completed_at' THEN NULLIF(v_elem ->> 'completed_at', '')::timestamptz
        ELSE NULL
      END,
      CASE WHEN v_elem ? 'completed_by' THEN NULLIF(v_elem ->> 'completed_by', '') ELSE NULL END,
      CASE
        WHEN v_elem ? 'inputs_hash_at_complete'
        THEN NULLIF(v_elem ->> 'inputs_hash_at_complete', '')
        ELSE NULL
      END
    )
    ON CONFLICT (run_id, step_id) DO UPDATE SET
      actionable = EXCLUDED.actionable,
      informational = EXCLUDED.informational,
      completed_at = CASE
        WHEN v_elem ? 'completed_at' THEN EXCLUDED.completed_at
        ELSE recon.run_steps.completed_at
      END,
      completed_by = CASE
        WHEN v_elem ? 'completed_by' THEN EXCLUDED.completed_by
        ELSE recon.run_steps.completed_by
      END,
      inputs_hash_at_complete = CASE
        WHEN v_elem ? 'inputs_hash_at_complete' THEN EXCLUDED.inputs_hash_at_complete
        ELSE recon.run_steps.inputs_hash_at_complete
      END;
  END LOOP;

  FOR v_elem IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_blockers, '[]'::jsonb))
  LOOP
    v_key := COALESCE(v_elem ->> 'driver_id', '') || '|'
      || (v_elem ->> 'code') || '|'
      || COALESCE(v_elem ->> 'source_id', '');
    v_keep := array_append(v_keep, v_key);

    INSERT INTO recon.week_blockers (
      organization_id,
      week_key,
      service_line,
      driver_id,
      code,
      source_id,
      severity,
      fingerprint,
      message,
      persisted,
      expected,
      delta,
      computed_at
    ) VALUES (
      v_org,
      v_week,
      v_line,
      NULLIF(v_elem ->> 'driver_id', ''),
      v_elem ->> 'code',
      NULLIF(v_elem ->> 'source_id', ''),
      COALESCE(v_elem ->> 'severity', 'block'),
      COALESCE(v_elem ->> 'fingerprint', v_elem ->> 'code'),
      COALESCE(v_elem ->> 'message', v_elem ->> 'code'),
      NULLIF(v_elem ->> 'persisted', '')::numeric,
      NULLIF(v_elem ->> 'expected', '')::numeric,
      NULLIF(v_elem ->> 'delta', '')::numeric,
      COALESCE(NULLIF(v_elem ->> 'computed_at', '')::timestamptz, now())
    )
    ON CONFLICT (
      organization_id,
      week_key,
      service_line,
      driver_id,
      code,
      source_id
    ) DO UPDATE SET
      severity = EXCLUDED.severity,
      fingerprint = EXCLUDED.fingerprint,
      message = EXCLUDED.message,
      persisted = EXCLUDED.persisted,
      expected = EXCLUDED.expected,
      delta = EXCLUDED.delta,
      computed_at = EXCLUDED.computed_at;
  END LOOP;

  DELETE FROM recon.week_blockers wb
  WHERE wb.organization_id = v_org
    AND wb.week_key = v_week
    AND wb.service_line = v_line
    AND NOT (
      (COALESCE(wb.driver_id, '') || '|' || wb.code || '|' || COALESCE(wb.source_id, ''))
      = ANY (v_keep)
    );

  v_new_version := v_run.version + 1;
  v_snapshot := COALESCE(p_payload, '{}'::jsonb);
  IF p_inputs_hash IS NOT NULL
    AND NOT (v_snapshot ? 'inputsHash')
    AND NOT (v_snapshot ? 'inputs_hash') THEN
    v_snapshot := v_snapshot || jsonb_build_object('inputsHash', p_inputs_hash);
  END IF;

  UPDATE recon.week_runs
  SET
    desk_snapshot = v_snapshot,
    desk_computed_at = now(),
    version = v_new_version
  WHERE id = p_run_id;

  INSERT INTO recon.run_events (
    run_id,
    actor,
    kind,
    payload,
    line,
    week_key,
    status,
    version_at_send,
    after
  ) VALUES (
    p_run_id,
    'system',
    'calculator_publish',
    jsonb_build_object('inputs_hash', p_inputs_hash),
    v_line,
    v_week,
    'applied',
    v_new_version::int,
    jsonb_build_object(
      'version', v_new_version,
      'inputs_hash', p_inputs_hash
    )
  );
END;
$$;

COMMENT ON FUNCTION recon.publish_week_desk(uuid, text, jsonb, jsonb, jsonb, jsonb) IS
  'Calculator: sources, steps, blockers, desk snapshot and version in one transaction (WRA-29).';

REVOKE ALL ON FUNCTION recon.publish_week_desk(uuid, text, jsonb, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION recon.publish_week_desk(uuid, text, jsonb, jsonb, jsonb, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';


-- ===== 20261111043516_recon_week_runs_adopt_and_create.sql =====
-- Week Reconciliation Round 1: back-fill ended week runs + adopt money close (WRA-13, WRA-39).

CREATE OR REPLACE FUNCTION recon.fleet_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'America/Jamaica')::date;
$$;

CREATE OR REPLACE FUNCTION recon.last_ended_week_monday(p_day date DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_day date := COALESCE(p_day, recon.fleet_today());
  v_monday date := recon.week_monday(v_day);
BEGIN
  WHILE v_day <= v_monday + 6 LOOP
    v_monday := v_monday - 7;
  END LOOP;
  RETURN v_monday;
END;
$$;

COMMENT ON FUNCTION recon.last_ended_week_monday(date) IS
  'Latest Monday whose Sun–Sat week has ended in America/Jamaica (isSettlementPeriodEnded).';

CREATE OR REPLACE FUNCTION recon.first_data_week(p_org text)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT recon.week_monday(MIN(p.period_anchor))
  FROM public.driver_financial_periods p
  WHERE p.organization_id::text = btrim(p_org)
    AND p.period_anchor IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION recon.dfp_period_is_frozen(
  p_metadata jsonb,
  p_settlement_status text,
  p_status text,
  p_closed_at timestamptz
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_closed_at IS NOT NULL
    OR lower(COALESCE(p_status, '')) = 'closed'
    OR COALESCE((p_metadata ->> 'periodFrozen')::boolean, false)
    OR COALESCE((p_metadata ->> 'signedWeek')::boolean, false)
    OR COALESCE(btrim(p_metadata -> 'financeCore' ->> 'signedAt'), '') <> ''
    OR COALESCE((p_metadata -> 'financeCore' ->> 'periodFrozen')::boolean, false);
$$;

CREATE OR REPLACE FUNCTION recon.line_periods_all_frozen(
  p_org text,
  p_week date,
  p_line text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.driver_financial_periods p
      WHERE p.organization_id::text = btrim(p_org)
        AND p.period_anchor = p_week
        AND public.dfp_service_line_matches(p.metadata, p_line)
    ) THEN false
    ELSE NOT EXISTS (
      SELECT 1
      FROM public.driver_financial_periods p
      WHERE p.organization_id::text = btrim(p_org)
        AND p.period_anchor = p_week
        AND public.dfp_service_line_matches(p.metadata, p_line)
        AND NOT recon.dfp_period_is_frozen(
          p.metadata,
          p.settlement_status::text,
          p.status::text,
          p.closed_at
        )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION recon.active_recon_lines(p_org text)
RETURNS SETOF text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines text[];
  v_mod jsonb;
BEGIN
  SELECT o.service_lines, o.enabled_modules
  INTO v_lines, v_mod
  FROM public.organizations o
  WHERE o.id::text = btrim(p_org)
  LIMIT 1;

  IF NOT FOUND OR v_lines IS NULL OR COALESCE(array_length(v_lines, 1), 0) = 0 THEN
    RETURN NEXT 'rideshare';
    RETURN;
  END IF;

  IF 'rideshare' = ANY (v_lines) THEN
    RETURN NEXT 'rideshare';
  END IF;

  IF 'rush_delivery' = ANY (v_lines)
    AND COALESCE(
      (v_mod -> 'rush_delivery')::boolean,
      (v_mod -> 'rush')::boolean,
      false
    ) THEN
    RETURN NEXT 'rush_delivery';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION recon.ensure_ended_week_runs(p_org text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, public
AS $$
DECLARE
  v_first date;
  v_last date;
  v_week date;
  v_line text;
  v_main text;
  v_run_id uuid;
  v_closed_at timestamptz;
  v_step_ids text[] := ARRAY[
    'sources',
    'attribution',
    'tolls',
    'tag_account',
    'fuel',
    'trips_earnings',
    'settlement_preview',
    'close'
  ];
  v_step_id text;
  v_run record;
BEGIN
  v_first := recon.first_data_week(p_org);
  v_last := recon.last_ended_week_monday();

  IF v_first IS NULL OR v_last IS NULL OR v_first > v_last THEN
    RETURN;
  END IF;

  v_main := recon.org_main_line(p_org);

  v_week := v_first;
  WHILE v_week <= v_last LOOP
    FOR v_line IN SELECT recon.active_recon_lines(p_org)
    LOOP
      INSERT INTO recon.week_runs (
        organization_id,
        service_line,
        week_key,
        state,
        version,
        main_line
      ) VALUES (
        btrim(p_org),
        v_line,
        v_week,
        'collecting',
        1,
        v_main
      )
      ON CONFLICT (organization_id, service_line, week_key) DO NOTHING
      RETURNING id INTO v_run_id;

      IF v_run_id IS NOT NULL THEN
        FOREACH v_step_id IN ARRAY v_step_ids
        LOOP
          INSERT INTO recon.run_steps (
            run_id,
            step_id,
            actionable,
            informational
          ) VALUES (
            v_run_id,
            v_step_id,
            0,
            0
          )
          ON CONFLICT (run_id, step_id) DO NOTHING;
        END LOOP;

        INSERT INTO recon.week_publish_holds (run_id, hold_until, updated_at)
        VALUES (v_run_id, NULL, now())
        ON CONFLICT (run_id) DO NOTHING;
      END IF;
    END LOOP;

    v_week := v_week + 7;
  END LOOP;

  FOR v_run IN
    SELECT wr.id, wr.service_line, wr.week_key
    FROM recon.week_runs wr
    WHERE wr.organization_id = btrim(p_org)
      AND wr.state IS DISTINCT FROM 'closed'
  LOOP
    IF NOT recon.line_periods_all_frozen(
      p_org,
      v_run.week_key,
      v_run.service_line
    ) THEN
      CONTINUE;
    END IF;

    SELECT max(p.closed_at)
    INTO v_closed_at
    FROM public.driver_financial_periods p
    WHERE p.organization_id::text = btrim(p_org)
      AND p.period_anchor = v_run.week_key
      AND public.dfp_service_line_matches(p.metadata, v_run.service_line);

    UPDATE recon.week_runs
    SET
      state = 'closed',
      closed_at = v_closed_at
    WHERE id = v_run.id
      AND state IS DISTINCT FROM 'closed';

    INSERT INTO recon.run_events (
      run_id,
      actor,
      kind,
      line,
      week_key,
      status,
      after
    ) VALUES (
      v_run.id,
      'system',
      'adopt_period_close',
      v_run.service_line,
      v_run.week_key,
      'applied',
      jsonb_build_object('closed_at', v_closed_at)
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION recon.ensure_ended_week_runs(text) IS
  'Create missing runs for ended weeks per active line; adopt Driver Settlements close (WRA-13, WRA-39).';

REVOKE ALL ON FUNCTION recon.ensure_ended_week_runs(text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION recon.ensure_ended_week_runs(text) TO service_role;

NOTIFY pgrst, 'reload schema';


-- ===== 20261111044221_recon_coverage_per_week.sql =====
-- WRA-09: statement sources judged per week from import_batches.week_keys; no live fallback.

CREATE OR REPLACE FUNCTION recon._week_statement_received(
  p_org text,
  p_source_id text,
  p_week_key date
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM fleet.import_batches b
    WHERE b.organization_id = p_org
      AND b.source_id = p_source_id
      AND b.status IN ('completed', 'committed')
      AND b.week_keys[1] = p_week_key
  );
$$;

CREATE OR REPLACE FUNCTION recon._week_all_days_attest_none(
  p_org text,
  p_line text,
  p_source_id text,
  p_week_key date
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = recon, public
AS $$
  SELECT count(*)::int = 7
  FROM recon.source_attestations a
  WHERE a.organization_id = p_org
    AND a.service_line = p_line
    AND a.week_key = p_week_key
    AND a.source_id = p_source_id
    AND a.kind = 'attest_none'
    AND a.day = ANY (recon._week_day_keys(p_week_key));
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
    'rush_deliveries'
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

REVOKE ALL ON FUNCTION recon._week_statement_received(text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION recon._week_all_days_attest_none(text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION recon.compute_source_coverage(text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_source_coverage(text, text, text, date)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION recon._week_statement_received(text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION recon._week_all_days_attest_none(text, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION recon.compute_source_coverage(text, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_source_coverage(text, text, text, date) TO service_role;

COMMENT ON FUNCTION recon.compute_source_coverage IS
  'WRA-09: statement sources return {week: status} from week_keys; daily sources keep day map.';

NOTIFY pgrst, 'reload schema';


-- ===== 20261111044222_recon_health_view.sql =====
-- WRA-31: calculator and week health for alerts (Round 2 route reads with service_role).

DROP VIEW IF EXISTS public.recon_health;

CREATE OR REPLACE VIEW recon.health
WITH (security_invoker = true)
AS
SELECT
  orgs.organization_id,
  wc.emergency_off AS calculator_paused,
  wc.updated_at AS calculator_paused_since,
  coalesce(pend.pending_units, 0)::bigint AS pending_units,
  pend.oldest_pending_age_seconds,
  pub.last_open_desk_computed_at,
  coalesce(appr.pending_approvals_over_24h, 0)::bigint AS pending_approvals_over_24h,
  coalesce(stale.open_runs_over_14_days, 0)::bigint AS open_runs_over_14_days,
  NULL::numeric AS reject_rate_24h,
  NULL::numeric AS failure_rate_24h
FROM (
  SELECT organization_id
  FROM recon.week_runs
  UNION
  SELECT organization_id
  FROM recon.projection_state
) orgs
CROSS JOIN recon.worker_control wc
LEFT JOIN LATERAL (
  SELECT
    count(*)::bigint AS pending_units,
    extract(epoch FROM (now() - min(ps.updated_at)))::bigint AS oldest_pending_age_seconds
  FROM recon.projection_state ps
  WHERE ps.organization_id = orgs.organization_id
    AND ps.status = 'pending'
) pend ON true
LEFT JOIN LATERAL (
  SELECT max(wr.desk_computed_at) AS last_open_desk_computed_at
  FROM recon.week_runs wr
  WHERE wr.organization_id = orgs.organization_id
    AND wr.state IS DISTINCT FROM 'closed'
) pub ON true
LEFT JOIN LATERAL (
  SELECT count(*)::bigint AS pending_approvals_over_24h
  FROM recon.run_events re
  JOIN recon.week_runs wr ON wr.id = re.run_id
  WHERE wr.organization_id = orgs.organization_id
    AND re.status = 'pending_approval'
    AND re.at < now() - interval '24 hours'
) appr ON true
LEFT JOIN LATERAL (
  SELECT count(*)::bigint AS open_runs_over_14_days
  FROM recon.week_runs wr
  WHERE wr.organization_id = orgs.organization_id
    AND wr.state IS DISTINCT FROM 'closed'
    AND wr.service_line IN (
      SELECT recon.active_recon_lines(wr.organization_id)
    )
    AND (wr.week_key + 6) < recon.fleet_today() - 14
) stale ON true
WHERE wc.id = 1;

COMMENT ON VIEW recon.health IS
  'Per-org recon calculator health. reject_rate_24h and failure_rate_24h need Round 2 HTTP telemetry.';

GRANT SELECT ON recon.health TO service_role;

NOTIFY pgrst, 'reload schema';


-- ===== 20261111051252_recon_round2_desk_publish.sql =====
-- Week Reconciliation Round 2a (server, one truth).
-- 1. run_steps.hidden (WRA-19).
-- 2. week_publish_holds.held_since for the 15-minute hold cap (WRA-27).
-- 3. publish_week_desk owns the WHOLE-WEEK blockers only (driver_id IS NULL).
--    Each driver's blockers are written by that driver's own calculator unit,
--    so a desk publish never deletes a driver row written a moment earlier.
-- 4. recon_enqueue_week_desk with a delay, so a deferred publish comes back on time.
-- 5. Drop list_week_source_summaries (the week list now reads stored rows only).

ALTER TABLE recon.run_steps
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

ALTER TABLE recon.week_publish_holds
  ADD COLUMN IF NOT EXISTS held_since timestamptz;

-- The return type changes (void -> bigint), which CREATE OR REPLACE cannot do.
DROP FUNCTION IF EXISTS recon.publish_week_desk(uuid, text, jsonb, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION recon.publish_week_desk(
  p_run_id uuid,
  p_inputs_hash text,
  p_payload jsonb,
  p_sources jsonb,
  p_steps jsonb,
  p_blockers jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, public
AS $$
DECLARE
  v_run recon.week_runs%ROWTYPE;
  v_new_version bigint;
  v_elem jsonb;
  v_keep text[] := ARRAY[]::text[];
  v_snapshot jsonb;
  v_step_id text;
BEGIN
  SELECT *
  INTO v_run
  FROM recon.week_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'week run not found: %', p_run_id;
  END IF;

  FOR v_elem IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_sources, '[]'::jsonb))
  LOOP
    INSERT INTO recon.run_sources (
      run_id, source_id, requirement, status, coverage, input_hash, row_count, amount_minor
    ) VALUES (
      p_run_id,
      v_elem ->> 'source_id',
      v_elem ->> 'requirement',
      v_elem ->> 'status',
      COALESCE(v_elem -> 'coverage', '{}'::jsonb),
      v_elem ->> 'input_hash',
      NULLIF(v_elem ->> 'row_count', '')::int,
      NULLIF(v_elem ->> 'amount_minor', '')::bigint
    )
    ON CONFLICT (run_id, source_id) DO UPDATE SET
      requirement = EXCLUDED.requirement,
      status = EXCLUDED.status,
      coverage = EXCLUDED.coverage,
      input_hash = EXCLUDED.input_hash,
      row_count = EXCLUDED.row_count,
      amount_minor = EXCLUDED.amount_minor;
  END LOOP;

  FOR v_elem IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_steps, '[]'::jsonb))
  LOOP
    v_step_id := COALESCE(v_elem ->> 'step_id', v_elem ->> 'id');
    IF v_step_id IS NULL OR v_step_id = '' THEN
      RAISE EXCEPTION 'run_steps row missing step_id';
    END IF;

    INSERT INTO recon.run_steps (run_id, step_id, actionable, informational, hidden)
    VALUES (
      p_run_id,
      v_step_id,
      COALESCE((v_elem ->> 'actionable')::int, 0),
      COALESCE((v_elem ->> 'informational')::int, 0),
      COALESCE((v_elem ->> 'hidden')::boolean, false)
    )
    ON CONFLICT (run_id, step_id) DO UPDATE SET
      actionable = EXCLUDED.actionable,
      informational = EXCLUDED.informational,
      hidden = EXCLUDED.hidden;
    -- completed_at / completed_by / inputs_hash_at_complete are only written
    -- by the step-complete action, never by a publish.
  END LOOP;

  FOR v_elem IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_blockers, '[]'::jsonb))
  LOOP
    IF NULLIF(v_elem ->> 'driver_id', '') IS NOT NULL THEN
      RAISE EXCEPTION 'publish_week_desk only takes whole-week blockers (driver_id must be null)';
    END IF;
    v_keep := array_append(v_keep, (v_elem ->> 'code') || '|' || COALESCE(v_elem ->> 'source_id', ''));

    INSERT INTO recon.week_blockers (
      organization_id, week_key, service_line, driver_id, code, source_id,
      severity, fingerprint, message, persisted, expected, delta, computed_at
    ) VALUES (
      v_run.organization_id,
      v_run.week_key,
      v_run.service_line,
      NULL,
      v_elem ->> 'code',
      NULLIF(v_elem ->> 'source_id', ''),
      COALESCE(v_elem ->> 'severity', 'block'),
      COALESCE(v_elem ->> 'fingerprint', v_elem ->> 'code'),
      COALESCE(v_elem ->> 'message', v_elem ->> 'code'),
      NULLIF(v_elem ->> 'persisted', '')::numeric,
      NULLIF(v_elem ->> 'expected', '')::numeric,
      NULLIF(v_elem ->> 'delta', '')::numeric,
      COALESCE(NULLIF(v_elem ->> 'computed_at', '')::timestamptz, now())
    )
    ON CONFLICT (organization_id, week_key, service_line, driver_id, code, source_id) DO UPDATE SET
      severity = EXCLUDED.severity,
      fingerprint = EXCLUDED.fingerprint,
      message = EXCLUDED.message,
      persisted = EXCLUDED.persisted,
      expected = EXCLUDED.expected,
      delta = EXCLUDED.delta,
      computed_at = EXCLUDED.computed_at;
  END LOOP;

  DELETE FROM recon.week_blockers wb
  WHERE wb.organization_id = v_run.organization_id
    AND wb.week_key = v_run.week_key
    AND wb.service_line = v_run.service_line
    AND wb.driver_id IS NULL
    AND NOT ((wb.code || '|' || COALESCE(wb.source_id, '')) = ANY (v_keep));

  v_new_version := v_run.version + 1;
  v_snapshot := COALESCE(p_payload, '{}'::jsonb)
    || jsonb_build_object('inputsHash', p_inputs_hash);

  UPDATE recon.week_runs
  SET desk_snapshot = v_snapshot,
      desk_computed_at = now(),
      version = v_new_version
  WHERE id = p_run_id;

  INSERT INTO recon.run_events (
    run_id, actor, kind, payload, line, week_key, status, version_at_send, after
  ) VALUES (
    p_run_id,
    'system',
    'calculator_publish',
    jsonb_build_object('inputs_hash', p_inputs_hash),
    v_run.service_line,
    v_run.week_key,
    'applied',
    v_new_version::int,
    jsonb_build_object('version', v_new_version, 'inputs_hash', p_inputs_hash)
  );

  DELETE FROM recon.week_publish_holds
  WHERE run_id = p_run_id
    AND hold_until IS NOT NULL
    AND hold_until <= now();

  RETURN v_new_version;
END;
$$;

COMMENT ON FUNCTION recon.publish_week_desk(uuid, text, jsonb, jsonb, jsonb, jsonb) IS
  'Calculator: sources, steps, whole-week blockers, desk snapshot and version in one transaction (WRA-29). Returns the new version.';

REVOKE ALL ON FUNCTION recon.publish_week_desk(uuid, text, jsonb, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recon.publish_week_desk(uuid, text, jsonb, jsonb, jsonb, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recon_enqueue_week_desk(
  p_org text,
  p_line text,
  p_week date,
  p_delay_seconds integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pgmq', 'public'
AS $$
BEGIN
  IF p_org IS NULL OR p_line IS NULL OR p_week IS NULL THEN
    RETURN;
  END IF;
  IF p_line NOT IN ('rideshare', 'rush_delivery') THEN
    RETURN;
  END IF;
  PERFORM pgmq.send(
    'recon_recompute',
    jsonb_build_object(
      'organizationId', p_org,
      'unitKind', 'week_desk',
      'weekKey', to_char(p_week, 'YYYY-MM-DD'),
      'serviceLine', p_line
    ),
    GREATEST(COALESCE(p_delay_seconds, 0), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recon_enqueue_week_desk(text, text, date, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recon_enqueue_week_desk(text, text, date, integer)
  TO service_role;

DROP FUNCTION IF EXISTS public.list_week_source_summaries(text, text, integer);
DROP FUNCTION IF EXISTS recon.list_week_source_summaries(text, text, integer);

NOTIFY pgrst, 'reload schema';


-- ===== 20261111055734_recon_round2b_week_change.sql =====
-- Week Reconciliation Round 2b (server, safety): one claim for every change (WRA-27, 28, 30).
-- recon.claim_week_change does, in ONE transaction:
--   1. repeat-safety: a known (run, idempotency_key) returns 'replay' and changes nothing;
--   2. version check: the caller's expected version must match (else 'conflict');
--   3. closed weeks refuse ordinary changes ('closed');
--   4. bumps the version and writes the decision-log row (run_events);
--   5. sets the 2-minute publish hold (held_since kept while the hold is still active).
-- The change itself runs right after the claim. If it fails, the server appends a
-- 'change_failed' row that points at the claim (the log is append-only, so the
-- history shows both the attempt and the failure).

CREATE OR REPLACE FUNCTION recon.claim_week_change(
  p_run_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_actor text,
  p_kind text,
  p_step text,
  p_reason text,
  p_payload jsonb,
  p_correlation_id text,
  p_self_approved boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, public
AS $$
DECLARE
  v_run recon.week_runs%ROWTYPE;
  v_prior_id bigint;
  v_prior_kind text;
  v_new bigint;
  v_event bigint;
BEGIN
  SELECT * INTO v_run FROM recon.week_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF NULLIF(btrim(COALESCE(p_idempotency_key, '')), '') IS NOT NULL THEN
    SELECT id, kind INTO v_prior_id, v_prior_kind
    FROM recon.run_events
    WHERE run_id = p_run_id AND idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_prior_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status', 'replay',
        'event_id', v_prior_id,
        'kind', v_prior_kind,
        'version', v_run.version
      );
    END IF;
  END IF;

  IF p_expected_version IS NULL THEN
    RETURN jsonb_build_object('status', 'version_required', 'current_version', v_run.version);
  END IF;
  IF p_expected_version <> v_run.version THEN
    RETURN jsonb_build_object('status', 'conflict', 'current_version', v_run.version);
  END IF;
  IF v_run.state = 'closed' THEN
    RETURN jsonb_build_object('status', 'closed', 'current_version', v_run.version);
  END IF;

  v_new := v_run.version + 1;
  UPDATE recon.week_runs SET version = v_new WHERE id = p_run_id;

  INSERT INTO recon.run_events (
    run_id, actor, kind, payload, line, week_key, step, reason,
    correlation_id, idempotency_key, prepared_by, status, version_at_send, before, after,
    approved_by, self_approved
  ) VALUES (
    p_run_id,
    COALESCE(NULLIF(p_actor, ''), 'unknown'),
    p_kind,
    COALESCE(p_payload, '{}'::jsonb),
    v_run.service_line,
    v_run.week_key,
    NULLIF(p_step, ''),
    NULLIF(p_reason, ''),
    NULLIF(p_correlation_id, ''),
    NULLIF(btrim(COALESCE(p_idempotency_key, '')), ''),
    COALESCE(NULLIF(p_actor, ''), 'unknown'),
    'applied',
    v_new::int,
    jsonb_build_object('version', v_run.version),
    jsonb_build_object('version', v_new),
    CASE WHEN p_self_approved THEN COALESCE(NULLIF(p_actor, ''), 'unknown') END,
    COALESCE(p_self_approved, false)
  )
  RETURNING id INTO v_event;

  INSERT INTO recon.week_publish_holds (run_id, hold_until, held_since, updated_at)
  VALUES (p_run_id, now() + interval '2 minutes', now(), now())
  ON CONFLICT (run_id) DO UPDATE SET
    held_since = CASE
      WHEN recon.week_publish_holds.hold_until IS NOT NULL
        AND recon.week_publish_holds.hold_until > now()
      THEN COALESCE(recon.week_publish_holds.held_since, now())
      ELSE now()
    END,
    hold_until = now() + interval '2 minutes',
    updated_at = now();

  RETURN jsonb_build_object('status', 'ok', 'version', v_new, 'event_id', v_event);
END;
$$;

COMMENT ON FUNCTION recon.claim_week_change(uuid, bigint, text, text, text, text, text, jsonb, text, boolean) IS
  'Round 2b: repeat-safety + version check + version bump + decision-log row + publish hold, in one transaction.';

REVOKE ALL ON FUNCTION recon.claim_week_change(uuid, bigint, text, text, text, text, text, jsonb, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recon.claim_week_change(uuid, bigint, text, text, text, text, text, jsonb, text, boolean)
  TO service_role;

NOTIFY pgrst, 'reload schema';


-- ===== 20261111061557_recon_round2b_alerts.sql =====
-- Week Reconciliation Round 2b-3 (WRA-31): alerts.
-- One OPEN alert per (org, dedupe_key). The calculator raises and resolves them;
-- an approver acknowledges them; unacknowledged alerts escalate by SMS
-- (fleet managers at 24 h, the owner as well at 48 h).

CREATE TABLE IF NOT EXISTS recon.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'calculator_paused',
    'unit_pending',
    'unit_failed',
    'enqueue_failed',
    'week_overdue',
    'close_failed',
    'approval_waiting',
    'correction_unsigned',
    'shadow_mismatch'
  )),
  dedupe_key text NOT NULL,
  title text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  raised_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by text,
  sms_manager_at timestamptz,
  sms_owner_at timestamptz,
  sms_status text,
  resolved_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS recon_alerts_open_uidx
  ON recon.alerts (organization_id, dedupe_key)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS recon_alerts_org_open_idx
  ON recon.alerts (organization_id, raised_at DESC)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE recon.alerts IS
  'WRA-31: Week Reconciliation alerts (bell + SMS escalation). Read and written by the server only.';

ALTER TABLE recon.alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON recon.alerts FROM PUBLIC, anon, authenticated;
GRANT ALL ON recon.alerts TO service_role;

-- Health: unsigned correction drafts older than 24 h, per org (WRA-30 / WRA-31).
CREATE OR REPLACE VIEW recon.unsigned_corrections
WITH (security_invoker = true)
AS
SELECT
  ws.organization_id::text AS organization_id,
  count(*)::bigint AS drafts_over_24h,
  min(ws.created_at) AS oldest_draft_at
FROM ledger.week_statements ws
WHERE ws.status = 'draft'
  AND ws.close_reason ILIKE '%restatement%'
  AND ws.created_at < now() - interval '24 hours'
GROUP BY ws.organization_id;

REVOKE ALL ON recon.unsigned_corrections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON recon.unsigned_corrections TO service_role;

NOTIFY pgrst, 'reload schema';


-- ===== 20261111163200_recon_queues_in_migrations.sql =====
-- Week Reconciliation (audit Rev 23): the calculator's two queues exist live but were never
-- created by a migration, so any copy rebuilt from migrations (test copy, CI, disaster
-- recovery) failed every week change with: relation "pgmq.q_recon_recompute" does not exist.
-- Creates each queue only when it is missing; live already has both, so nothing changes there.

CREATE EXTENSION IF NOT EXISTS pgmq;

DO $$
DECLARE
  q text;
BEGIN
  FOREACH q IN ARRAY ARRAY['recon_recompute', 'recon_close'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pgmq.meta m WHERE m.queue_name = q) THEN
      PERFORM pgmq.create(q);
    END IF;
  END LOOP;
END $$;


-- ===== 20261111182344_recon_alerts_while_paused.sql =====
-- Week Reconciliation (audit Rev 24, WRA-31): the "calculator paused" alert could never fire.
-- The database wakes the week calculator only when it is NOT paused, and the alert pass runs
-- inside a wake, so while paused nothing ever raised or escalated the alert.
-- Now, while paused, the calculator is woken every 10 minutes in alerts-only mode: it raises,
-- refreshes and escalates alerts (in-app + SMS) and calculates nothing.
-- Same function as live (md5 29c96643545936d7fe8310a26c0cc3bc checked 2026-11-11) plus the paused branch.

CREATE OR REPLACE FUNCTION private.invoke_recon_worker_wake() RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'net', 'private'
    AS $$
DECLARE
  status jsonb;
  secret text;
  req_id bigint;
  should_wake boolean;
  nightly boolean;
  alerts_only boolean := false;
BEGIN
  status := public.recon_worker_status();
  IF COALESCE((status->>'emergencyOff')::boolean, false) THEN
    -- Paused: only the alert pass, every 10 minutes.
    IF (extract(minute FROM now())::int % 10) <> 0 THEN
      RETURN NULL;
    END IF;
    alerts_only := true;
  ELSE
    should_wake := COALESCE((status->>'queueWaiting')::int, 0) > 0
      OR COALESCE((status->>'closeRunning')::boolean, false)
      OR COALESCE((status->>'nightlyInProgress')::boolean, false)
      OR COALESCE((status->>'nightlyDue')::boolean, false);
    IF NOT should_wake THEN
      RETURN NULL;
    END IF;
  END IF;
  nightly := NOT alerts_only
    AND COALESCE((status->>'nightlyDue')::boolean, false)
    AND NOT COALESCE((status->>'nightlyInProgress')::boolean, false);
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  SELECT net.http_post(
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/fleet-recon-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := jsonb_build_object('nightly', nightly, 'alertsOnly', alerts_only),
    timeout_milliseconds := 120000
  ) INTO req_id;
  RETURN req_id;
END;
$$;

ALTER FUNCTION private.invoke_recon_worker_wake() OWNER TO postgres;


INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111043430', 'recon_week_runs_main_line_holds') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111043439', 'recon_decision_log') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111043452', 'recon_publish_week_desk') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111043516', 'recon_week_runs_adopt_and_create') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111044221', 'recon_coverage_per_week') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111044222', 'recon_health_view') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111051252', 'recon_round2_desk_publish') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111055734', 'recon_round2b_week_change') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111061557', 'recon_round2b_alerts') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111163200', 'recon_queues_in_migrations') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111182344', 'recon_alerts_while_paused') ON CONFLICT (version) DO NOTHING;
COMMIT;
SELECT to_regclass('recon.alerts') IS NOT NULL AS alerts_table, (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version LIKE '20261111%') AS logbook_11nov_rows;

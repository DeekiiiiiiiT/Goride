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

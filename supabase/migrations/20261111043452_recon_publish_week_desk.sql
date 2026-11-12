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

-- Week Reconciliation: the week calculator's own publish no longer counts as "this week changed".
-- The calculator bumps week_runs.version on every publish (~2 minutes after any change), so the
-- next click on any open week page was refused with WEEK_CHANGED although no person changed
-- anything. A caller's version is now still good when every version after it is a calculator
-- publish. A change by a person (another tab, another user) still refuses the stale screen.

CREATE OR REPLACE FUNCTION recon.week_version_current_enough(p_run_id uuid, p_expected_version bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = recon, public
AS $$
  SELECT CASE
    WHEN p_expected_version IS NULL THEN false
    WHEN p_expected_version = r.version THEN true
    WHEN p_expected_version > r.version THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM recon.run_events e
      WHERE e.run_id = p_run_id
        AND e.version_at_send > p_expected_version
        AND e.kind <> 'calculator_publish'
    )
  END
  FROM recon.week_runs r
  WHERE r.id = p_run_id;
$$;

REVOKE ALL ON FUNCTION recon.week_version_current_enough(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recon.week_version_current_enough(uuid, bigint) TO service_role;

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
  IF NOT recon.week_version_current_enough(p_run_id, p_expected_version) THEN
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
  'Round 2b: repeat-safety + version check (calculator publishes ignored) + version bump + decision-log row + publish hold, in one transaction.';

REVOKE ALL ON FUNCTION recon.claim_week_change(uuid, bigint, text, text, text, text, text, jsonb, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recon.claim_week_change(uuid, bigint, text, text, text, text, text, jsonb, text, boolean)
  TO service_role;

NOTIFY pgrst, 'reload schema';

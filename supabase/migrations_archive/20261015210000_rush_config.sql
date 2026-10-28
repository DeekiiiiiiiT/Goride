-- Rush Settings foundation: typed config store, history, two-person approvals, cron apply.

CREATE SCHEMA IF NOT EXISTS rush_config;

GRANT USAGE ON SCHEMA rush_config TO service_role;

-- Platform scope uses the nil UUID so the PK stays simple (no expression PK).
CREATE TABLE IF NOT EXISTS rush_config.setting_values (
  key         text NOT NULL,
  scope       text NOT NULL CHECK (scope IN ('platform', 'market')),
  scope_id    uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  value       jsonb NOT NULL,
  version     int NOT NULL DEFAULT 1,
  updated_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, scope, scope_id)
);

CREATE TABLE IF NOT EXISTS rush_config.setting_changes (
  id            bigserial PRIMARY KEY,
  key           text NOT NULL,
  scope         text NOT NULL CHECK (scope IN ('platform', 'market')),
  scope_id      uuid,
  old_value     jsonb,
  new_value     jsonb NOT NULL,
  reason        text NOT NULL,
  changed_by    uuid NOT NULL,
  approved_by   uuid,
  effective_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS setting_changes_key_created_idx
  ON rush_config.setting_changes (key, created_at DESC);

CREATE TABLE IF NOT EXISTS rush_config.pending_changes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL,
  scope         text NOT NULL CHECK (scope IN ('platform', 'market')),
  scope_id      uuid,
  new_value     jsonb NOT NULL,
  reason        text NOT NULL,
  requested_by  uuid NOT NULL,
  expected_version int,
  risk_high     boolean NOT NULL DEFAULT false,
  effective_at  timestamptz,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'expired')),
  decided_by    uuid,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pending_changes_status_effective_idx
  ON rush_config.pending_changes (status, effective_at)
  WHERE status IN ('pending', 'approved');

ALTER TABLE rush_config.setting_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_config.setting_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_config.pending_changes ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated — service_role bypasses RLS.
REVOKE ALL ON ALL TABLES IN SCHEMA rush_config FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA rush_config FROM anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA rush_config TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA rush_config TO service_role;

/**
 * Apply a setting change (value + history) in one transaction.
 * Refuses stale expected_version. High-risk requires a different approver.
 */
CREATE OR REPLACE FUNCTION rush_config.apply_change(
  p_key text,
  p_scope text,
  p_scope_id uuid,
  p_new_value jsonb,
  p_reason text,
  p_changed_by uuid,
  p_expected_version int,
  p_approved_by uuid DEFAULT NULL,
  p_risk_high boolean DEFAULT false,
  p_effective_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rush_config, public
AS $$
DECLARE
  v_scope_id uuid;
  v_row rush_config.setting_values%ROWTYPE;
  v_old jsonb;
  v_new_version int;
  v_effective timestamptz;
  v_change_id bigint;
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' THEN
    RAISE EXCEPTION 'invalid_key' USING ERRCODE = 'P0001';
  END IF;
  IF p_scope NOT IN ('platform', 'market') THEN
    RAISE EXCEPTION 'invalid_scope' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_changed_by IS NULL THEN
    RAISE EXCEPTION 'changed_by_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_value IS NULL THEN
    RAISE EXCEPTION 'value_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_risk_high THEN
    IF p_approved_by IS NULL THEN
      RAISE EXCEPTION 'approver_required' USING ERRCODE = 'P0001';
    END IF;
    IF p_approved_by = p_changed_by THEN
      RAISE EXCEPTION 'self_approval_forbidden' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_scope_id := CASE
    WHEN p_scope = 'platform' THEN '00000000-0000-0000-0000-000000000000'::uuid
    ELSE COALESCE(p_scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
  END;
  IF p_scope = 'market' AND (p_scope_id IS NULL OR p_scope_id = '00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION 'market_scope_id_required' USING ERRCODE = 'P0001';
  END IF;

  v_effective := COALESCE(p_effective_at, now());

  SELECT * INTO v_row
  FROM rush_config.setting_values
  WHERE key = p_key AND scope = p_scope AND scope_id = v_scope_id
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_version IS NOT NULL AND v_row.version <> p_expected_version THEN
      RAISE EXCEPTION 'stale_version' USING ERRCODE = 'P0001';
    END IF;
    v_old := v_row.value;
    v_new_version := v_row.version + 1;
    UPDATE rush_config.setting_values
    SET value = p_new_value,
        version = v_new_version,
        updated_by = p_changed_by,
        updated_at = now()
    WHERE key = p_key AND scope = p_scope AND scope_id = v_scope_id;
  ELSE
    IF p_expected_version IS NOT NULL AND p_expected_version <> 0 THEN
      RAISE EXCEPTION 'stale_version' USING ERRCODE = 'P0001';
    END IF;
    v_old := NULL;
    v_new_version := 1;
    INSERT INTO rush_config.setting_values (key, scope, scope_id, value, version, updated_by, updated_at)
    VALUES (p_key, p_scope, v_scope_id, p_new_value, v_new_version, p_changed_by, now());
  END IF;

  INSERT INTO rush_config.setting_changes (
    key, scope, scope_id, old_value, new_value, reason, changed_by, approved_by, effective_at
  ) VALUES (
    p_key, p_scope,
    CASE WHEN p_scope = 'platform' THEN NULL ELSE v_scope_id END,
    v_old, p_new_value, p_reason, p_changed_by, p_approved_by, v_effective
  )
  RETURNING id INTO v_change_id;

  RETURN jsonb_build_object(
    'ok', true,
    'key', p_key,
    'scope', p_scope,
    'scope_id', CASE WHEN p_scope = 'platform' THEN NULL ELSE to_jsonb(v_scope_id) END,
    'version', v_new_version,
    'change_id', v_change_id,
    'old_value', v_old,
    'new_value', p_new_value
  );
END;
$$;

/**
 * Apply approved (or due pending) changes whose effective_at has passed.
 * High-risk rows must already be status=approved with decided_by set.
 */
CREATE OR REPLACE FUNCTION rush_config.apply_due_pending_changes()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rush_config, public
AS $$
DECLARE
  r RECORD;
  v_count int := 0;
  v_approver uuid;
BEGIN
  FOR r IN
    SELECT *
    FROM rush_config.pending_changes
    WHERE status IN ('pending', 'approved')
      AND (effective_at IS NULL OR effective_at <= now())
      AND (
        risk_high = false
        OR (status = 'approved' AND decided_by IS NOT NULL AND decided_by <> requested_by)
      )
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    IF r.risk_high AND r.status <> 'approved' THEN
      CONTINUE;
    END IF;

    v_approver := CASE WHEN r.risk_high THEN r.decided_by ELSE NULL END;

    BEGIN
      PERFORM rush_config.apply_change(
        r.key,
        r.scope,
        r.scope_id,
        r.new_value,
        r.reason,
        r.requested_by,
        r.expected_version,
        v_approver,
        r.risk_high,
        COALESCE(r.effective_at, now())
      );
      UPDATE rush_config.pending_changes
      SET status = 'applied', decided_at = COALESCE(decided_at, now())
      WHERE id = r.id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'apply_due_pending_changes skip %: %', r.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION rush_config.apply_change(
  text, text, uuid, jsonb, text, uuid, int, uuid, boolean, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION rush_config.apply_due_pending_changes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rush_config.apply_change(
  text, text, uuid, jsonb, text, uuid, int, uuid, boolean, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION rush_config.apply_due_pending_changes() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rush-config-apply-pending') THEN
      PERFORM cron.unschedule('rush-config-apply-pending');
    END IF;
    PERFORM cron.schedule(
      'rush-config-apply-pending',
      '* * * * *',
      $cron$SELECT rush_config.apply_due_pending_changes();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not available; schedule rush_config.apply_due_pending_changes() manually.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';

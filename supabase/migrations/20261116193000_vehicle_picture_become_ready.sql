-- C3b: become_ready, resurrect, org day count, edge kicks, BN1 fill cursor age.

CREATE OR REPLACE FUNCTION public.vehicle_picture_become_ready(
  p_picture_id uuid,
  p_version int,
  p_r2_key text,
  p_cost_usd numeric,
  p_provider text,
  p_ai_model text,
  p_prompt_version int,
  p_prompt text,
  p_source text DEFAULT 'ai'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_source NOT IN ('ai', 'staff_upload', 'restore') THEN
    RAISE EXCEPTION 'invalid source %', p_source;
  END IF;

  INSERT INTO public.vehicle_picture_version (
    picture_id, version, r2_key, source, cost_usd, provider, ai_model, prompt_version
  ) VALUES (
    p_picture_id, p_version, p_r2_key, p_source, p_cost_usd, p_provider, p_ai_model, p_prompt_version
  );

  UPDATE public.vehicle_picture_version
  SET retired_at = now()
  WHERE picture_id = p_picture_id
    AND version < p_version
    AND retired_at IS NULL;

  UPDATE public.vehicle_picture
  SET
    status = 'ready',
    r2_key = p_r2_key,
    source = p_source,
    cost_usd = p_cost_usd,
    provider = p_provider,
    ai_model = p_ai_model,
    prompt = p_prompt,
    prompt_version = p_prompt_version,
    made_at = now(),
    lease_until = NULL,
    last_error = NULL,
    updated_at = now()
  WHERE id = p_picture_id;
END;
$$;

ALTER FUNCTION public.vehicle_picture_become_ready(
  uuid, int, text, numeric, text, text, int, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.vehicle_picture_become_ready(
  uuid, int, text, numeric, text, text, int, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_picture_become_ready(
  uuid, int, text, numeric, text, text, int, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.vehicle_picture_resurrect(p_id uuid)
RETURNS SETOF public.vehicle_picture
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.vehicle_picture
  SET
    deleted_at = NULL,
    status = 'queued',
    lane = 'live',
    version = version + 1,
    next_attempt_at = now(),
    updated_at = now()
  WHERE id = p_id
    AND deleted_at IS NOT NULL
  RETURNING *;
$$;

ALTER FUNCTION public.vehicle_picture_resurrect(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.vehicle_picture_resurrect(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_picture_resurrect(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.vehicle_picture_org_day_count(p_org text, p_day date)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::bigint
  FROM public.vehicle_picture vp
  WHERE vp.queued_by_org = p_org
    AND (vp.created_at AT TIME ZONE 'America/Jamaica')::date = p_day;
$$;

ALTER FUNCTION public.vehicle_picture_org_day_count(text, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.vehicle_picture_org_day_count(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_picture_org_day_count(text, date) TO service_role;

CREATE OR REPLACE FUNCTION public.vehicle_picture_increment_attempts(p_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.vehicle_picture
  SET attempts = attempts + 1, updated_at = now()
  WHERE id = p_id
  RETURNING attempts;
$$;

ALTER FUNCTION public.vehicle_picture_increment_attempts(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.vehicle_picture_increment_attempts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_picture_increment_attempts(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.vehicle_picture_try_worker_lease(
  p_holder uuid,
  p_held_until timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.vehicle_picture_worker_lock
  SET holder = p_holder, held_until = p_held_until
  WHERE id = 1
    AND (held_until IS NULL OR held_until < now());
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

ALTER FUNCTION public.vehicle_picture_try_worker_lease(uuid, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.vehicle_picture_try_worker_lease(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_picture_try_worker_lease(uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.vehicle_picture_release_worker_lease(p_holder uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.vehicle_picture_worker_lock
  SET held_until = NULL
  WHERE id = 1 AND holder = p_holder;
$$;

ALTER FUNCTION public.vehicle_picture_release_worker_lease(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.vehicle_picture_release_worker_lease(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_picture_release_worker_lease(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.kick_vehicle_picture_worker()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
  SELECT private.invoke_vehicle_picture_worker();
$$;

ALTER FUNCTION public.kick_vehicle_picture_worker() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.kick_vehicle_picture_worker() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kick_vehicle_picture_worker() TO service_role;

CREATE OR REPLACE FUNCTION public.kick_vehicle_picture_fill(p_after_id text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
  SELECT private.invoke_vehicle_picture_fill(p_after_id);
$$;

ALTER FUNCTION public.kick_vehicle_picture_fill(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.kick_vehicle_picture_fill(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kick_vehicle_picture_fill(text) TO service_role;

CREATE OR REPLACE FUNCTION private.vehicle_picture_fill_cursor_fresh()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT (
        (kv.value->'vehicle_picture_fill_cursor'->>'startedAt')::timestamptz
        > now() - interval '1 hour'
      )
      FROM public.kv_store_37f42386 kv
      WHERE kv.key = 'vehicle_pictures:settings'
        AND kv.value ? 'vehicle_picture_fill_cursor'
        AND kv.value->'vehicle_picture_fill_cursor' IS NOT NULL
        AND kv.value->'vehicle_picture_fill_cursor' <> 'null'::jsonb
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION private.vehicle_picture_fill_cursor_clear()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.kv_store_37f42386
  SET value = value - 'vehicle_picture_fill_cursor'
  WHERE key = 'vehicle_pictures:settings';
END;
$$;

CREATE OR REPLACE FUNCTION private.vehicle_picture_minute_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
DECLARE
  v_worker bigint;
  v_fill bigint;
  v_after text;
BEGIN
  PERFORM private.vehicle_picture_sweep_stuck();

  IF EXISTS (
    SELECT 1
    FROM public.vehicle_picture vp
    WHERE vp.deleted_at IS NULL
      AND vp.status = 'queued'
      AND vp.next_attempt_at IS NOT NULL
      AND vp.next_attempt_at <= now()
  )
  OR private.vehicle_picture_cleanup_due() THEN
    v_worker := private.invoke_vehicle_picture_worker();
  END IF;

  IF private.vehicle_picture_fill_cursor_set() THEN
    IF NOT private.vehicle_picture_fill_cursor_fresh() THEN
      PERFORM private.vehicle_picture_fill_cursor_clear();
    ELSIF private.vehicle_picture_worker_lease_free() THEN
      SELECT kv.value->'vehicle_picture_fill_cursor'->>'afterId' INTO v_after
      FROM public.kv_store_37f42386 kv
      WHERE kv.key = 'vehicle_pictures:settings';
      v_fill := private.invoke_vehicle_picture_fill(v_after);
    END IF;
  END IF;
END;
$$;
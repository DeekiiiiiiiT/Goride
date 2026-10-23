-- The week calculator starts itself.
-- Once a minute, if work is waiting, a close is waiting, or the nightly check is due,
-- the database asks the wake door to start the computer. An emergency stop skips that.
-- The door holds the Google login. The database only holds the same cron secret as the fuel sweep.

CREATE TABLE IF NOT EXISTS recon.worker_control (
  id int PRIMARY KEY CHECK (id = 1),
  emergency_off boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO recon.worker_control (id, emergency_off)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE recon.worker_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON recon.worker_control FROM PUBLIC, anon, authenticated;
GRANT ALL ON recon.worker_control TO service_role;

CREATE INDEX IF NOT EXISTS worker_alerts_kind_created_idx
  ON recon.worker_alerts (kind, created_at DESC);

CREATE OR REPLACE FUNCTION public.recon_worker_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pgmq, recon, public
AS $$
DECLARE
  v_off boolean := false;
  v_queue int := 0;
  v_close int := 0;
  v_started timestamptz;
  v_finished timestamptz;
BEGIN
  SELECT emergency_off INTO v_off FROM recon.worker_control WHERE id = 1;
  BEGIN
    EXECUTE 'SELECT count(*)::int FROM pgmq.q_recon_recompute' INTO v_queue;
  EXCEPTION WHEN undefined_table THEN
    v_queue := 0;
  END;
  SELECT count(*)::int INTO v_close
  FROM recon.close_workflows
  WHERE state = 'running';
  SELECT max(created_at) INTO v_started
  FROM recon.worker_alerts
  WHERE kind = 'nightly_started';
  SELECT max(created_at) INTO v_finished
  FROM recon.worker_alerts
  WHERE kind IN ('shadow_ok', 'shadow_mismatch');
  RETURN jsonb_build_object(
    'emergencyOff', COALESCE(v_off, false),
    'queueWaiting', COALESCE(v_queue, 0),
    'closeRunning', COALESCE(v_close, 0) > 0,
    'nightlyInProgress', v_started IS NOT NULL AND (v_finished IS NULL OR v_finished < v_started),
    'nightlyDue', v_started IS NULL OR v_started < now() - interval '24 hours'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recon_worker_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recon_worker_status() TO service_role;

-- A page open asks for the week picture without creating a driver row.
CREATE OR REPLACE FUNCTION public.recon_enqueue_week_desk(
  p_org text,
  p_line text,
  p_week date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pgmq, public
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
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recon_enqueue_week_desk(text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recon_enqueue_week_desk(text, text, date) TO service_role;

CREATE OR REPLACE FUNCTION private.invoke_recon_worker_wake()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
DECLARE
  status jsonb;
  secret text;
  req_id bigint;
  should_wake boolean;
  nightly boolean;
BEGIN
  status := public.recon_worker_status();
  IF COALESCE((status->>'emergencyOff')::boolean, false) THEN
    RETURN NULL;
  END IF;
  should_wake := COALESCE((status->>'queueWaiting')::int, 0) > 0
    OR COALESCE((status->>'closeRunning')::boolean, false)
    OR COALESCE((status->>'nightlyInProgress')::boolean, false)
    OR COALESCE((status->>'nightlyDue')::boolean, false);
  IF NOT should_wake THEN
    RETURN NULL;
  END IF;
  nightly := COALESCE((status->>'nightlyDue')::boolean, false)
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
    body := jsonb_build_object('nightly', nightly),
    timeout_milliseconds := 120000
  ) INTO req_id;
  RETURN req_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_recon_worker_wake() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.invoke_recon_worker_wake() TO postgres;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('recon-worker-wake');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'recon-worker-wake',
      '* * * * *',
      $cmd$SELECT private.invoke_recon_worker_wake();$cmd$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available; schedule recon-worker-wake manually.';
END;
$cron$;

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

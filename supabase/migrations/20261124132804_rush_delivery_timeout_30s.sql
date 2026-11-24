-- rush-cron is the door the database knocks on for Rush delivery jobs. pg_net's default request
-- timeout is 5 s, but delivery answers in ~6 s: rush-pass-renew (13:00) and rush-money-recon
-- (06:30) were logging a pg_net timeout even though delivery had answered 200, so the job looked
-- failed while the work was actually done.
--
-- 30 s matches the other invoke helpers in this schema (private.invoke_fuel_period_auto_close and
-- private.invoke_petrojam_sync both use 120000; the rush jobs are the slow ones, not the longest).
--
-- Same URL, same headers, same body shape — only the timeout changes.

CREATE OR REPLACE FUNCTION private.invoke_rush_delivery(p_path text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $function$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  IF p_path IS NULL OR left(p_path, 1) <> '/' THEN
    RAISE EXCEPTION 'rush path must start with /';
  END IF;
  SELECT net.http_post(
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/rush-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := jsonb_build_object('path', p_path),
    -- 5 s (pg_net default) was shorter than delivery's ~6 s response time.
    timeout_milliseconds := 30000
  ) INTO req_id;
  RETURN req_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.invoke_rush_delivery(text) FROM PUBLIC, anon, authenticated, service_role;

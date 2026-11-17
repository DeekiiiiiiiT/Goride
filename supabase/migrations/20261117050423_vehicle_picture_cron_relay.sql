-- The vehicle-picture worker/fill calls went straight to fleet-core, whose gateway requires a
-- login token (verify_jwt), so on production every call was refused with 401
-- UNAUTHORIZED_NO_AUTH_HEADER and queued pictures were never made (17 Nov, C-HR 5404LK).
-- Route them through fleet-picture-cron (verify_jwt = false; checks the fleet cron secret and
-- forwards to fleet-core with the service-role key), same pattern as fleet-toll-cron.

CREATE OR REPLACE FUNCTION private.invoke_vehicle_picture_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  SELECT net.http_post(
    url := private.vehicle_picture_functions_url('fleet-picture-cron/run'),
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

ALTER FUNCTION private.invoke_vehicle_picture_worker() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.invoke_vehicle_picture_worker() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.invoke_vehicle_picture_worker() TO postgres;

CREATE OR REPLACE FUNCTION private.invoke_vehicle_picture_fill(after_id text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
DECLARE
  secret text;
  req_id bigint;
  body jsonb;
BEGIN
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  body := '{}'::jsonb;
  IF after_id IS NOT NULL AND length(trim(after_id)) > 0 THEN
    body := jsonb_build_object('afterId', after_id);
  END IF;
  SELECT net.http_post(
    url := private.vehicle_picture_functions_url('fleet-picture-cron/fill'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := body,
    timeout_milliseconds := 120000
  ) INTO req_id;
  RETURN req_id;
END;
$$;

ALTER FUNCTION private.invoke_vehicle_picture_fill(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.invoke_vehicle_picture_fill(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.invoke_vehicle_picture_fill(text) TO postgres;

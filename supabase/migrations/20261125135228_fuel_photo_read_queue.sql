-- Fuel log offline-first, S6 (docs/fuel-log-offline-first-audit.md).
-- Fills that arrive with photos but no total wait here for the photo reader.
-- A small queue keeps the reader off the transactions table (no wide scans every run).
-- Server only. The reader runs every 10 minutes through fleet-fuel-cron (job "photo-read").

CREATE TABLE fleet.fuel_photo_read_queue (
  transaction_id text PRIMARY KEY CHECK (length(btrim(transaction_id)) > 0),
  organization_id text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 500),
  done_at timestamptz,
  outcome text CHECK (outcome IS NULL OR outcome IN ('read', 'needs_look', 'gone'))
);

COMMENT ON TABLE fleet.fuel_photo_read_queue IS
  'Fills waiting for the server photo reader (S6). Server-only.';

CREATE INDEX fuel_photo_read_queue_due_idx
  ON fleet.fuel_photo_read_queue (next_attempt_at)
  WHERE done_at IS NULL;

ALTER TABLE fleet.fuel_photo_read_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fleet.fuel_photo_read_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON fleet.fuel_photo_read_queue TO service_role;

-- Add a fill to the queue (again). A re-queue resets the attempts and makes it due now.
CREATE OR REPLACE FUNCTION public.fuel_photo_read_enqueue(p_transaction_id text, p_organization_id text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $$
  INSERT INTO fleet.fuel_photo_read_queue AS q (transaction_id, organization_id)
  VALUES (btrim(p_transaction_id), NULLIF(btrim(p_organization_id), ''))
  ON CONFLICT (transaction_id) DO UPDATE SET
    organization_id = COALESCE(EXCLUDED.organization_id, q.organization_id),
    queued_at = now(),
    attempts = 0,
    next_attempt_at = now(),
    last_error = NULL,
    done_at = NULL,
    outcome = NULL;
$$;

-- Take up to p_limit due fills. Each one is pushed 15 minutes ahead so two runs never take
-- the same fill; the reader marks it done or sets its next try.
CREATE OR REPLACE FUNCTION public.fuel_photo_read_claim(p_limit int)
RETURNS TABLE (transaction_id text, organization_id text, attempts int)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $$
  WITH due AS (
    SELECT q.transaction_id
    FROM fleet.fuel_photo_read_queue q
    WHERE q.done_at IS NULL AND q.next_attempt_at <= now()
    ORDER BY q.next_attempt_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 20))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE fleet.fuel_photo_read_queue q
  SET attempts = q.attempts + 1,
      next_attempt_at = now() + interval '15 minutes'
  FROM due
  WHERE q.transaction_id = due.transaction_id
  RETURNING q.transaction_id, q.organization_id, q.attempts;
$$;

-- Record the result of one try. p_outcome null = try again at p_retry_at.
CREATE OR REPLACE FUNCTION public.fuel_photo_read_finish(
  p_transaction_id text,
  p_outcome text,
  p_last_error text,
  p_retry_at timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $$
  UPDATE fleet.fuel_photo_read_queue
  SET done_at = CASE WHEN p_outcome IS NULL THEN NULL ELSE now() END,
      outcome = p_outcome,
      last_error = left(NULLIF(btrim(p_last_error), ''), 500),
      next_attempt_at = COALESCE(p_retry_at, next_attempt_at)
  WHERE transaction_id = btrim(p_transaction_id);
$$;

REVOKE ALL ON FUNCTION public.fuel_photo_read_enqueue(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fuel_photo_read_claim(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fuel_photo_read_finish(text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fuel_photo_read_enqueue(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fuel_photo_read_claim(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fuel_photo_read_finish(text, text, text, timestamptz) TO service_role;

-- Every 10 minutes: fleet-fuel-cron with job "photo-read". Does nothing when the queue is empty.
CREATE OR REPLACE FUNCTION private.invoke_fuel_photo_read()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM fleet.fuel_photo_read_queue
    WHERE done_at IS NULL AND next_attempt_at <= now()
  ) THEN
    RETURN NULL;
  END IF;
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  SELECT net.http_post(
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/fleet-fuel-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := '{"job":"photo-read"}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO req_id;
  RETURN req_id;
END;
$$;

ALTER FUNCTION private.invoke_fuel_photo_read() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.invoke_fuel_photo_read() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.invoke_fuel_photo_read() TO postgres;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron missing; fuel-photo-read not scheduled';
    RETURN;
  END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'fuel-photo-read';
  PERFORM cron.schedule(
    'fuel-photo-read',
    '*/10 * * * *',
    $cron$SELECT private.invoke_fuel_photo_read()$cron$
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

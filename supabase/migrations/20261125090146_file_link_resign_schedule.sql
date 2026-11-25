-- Monthly re-sign of stored private file links (docs/cloudflare-r2-storage-migration-audit.md §0,
-- "Link-expiry fix chosen, 25 Nov 2026").
--
-- Every stored private address is a file-link URL with a one-year expiry (FILE_LINK_SECONDS); the
-- ~2,300 links written by the M5 rewrite die on 25 Nov 2027. The file-link-resign edge function
-- renews every link expiring in <= 60 days, rewriting only e=/s= for the same key.
--
-- This migration only creates the door, the compare-and-set function and the schedule. It does not
-- deploy the function and it does not run it.
--
-- Door: same as the other cron jobs — private.fleet_ops_secrets.fleet_cron_secret is sent as
-- X-Fleet-Cron-Secret (checked by _shared/authorizeCronOrServiceRole.ts). No owner step, no copy of
-- the service key in the database.
--
-- Slot: 1st of the month, 08:17 UTC = 03:17 America/Jamaica (no DST). A quiet hour, off the hour
-- boundary so it never competes with the nightly jobs.
--
-- Manual dry run (writes nothing): SELECT private.invoke_file_link_resign(true);

CREATE OR REPLACE FUNCTION private.invoke_file_link_resign(p_dry_run boolean DEFAULT false)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
DECLARE
  secret text;
  base text;
  target text;
  req_id bigint;
BEGIN
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;

  SELECT value INTO base FROM private.fleet_ops_secrets WHERE name = 'functions_base_url';
  base := COALESCE(
    NULLIF(rtrim(base, '/'), ''),
    'https://csfllzzastacofsvcdsc.supabase.co/functions/v1'
  );
  target := base || '/file-link-resign';
  IF p_dry_run THEN
    target := target || '?dryRun=true';
  END IF;

  SELECT net.http_post(
    url := target,
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

ALTER FUNCTION private.invoke_file_link_resign(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.invoke_file_link_resign(boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.invoke_file_link_resign(boolean) TO postgres;

-- One allow-list for every re-sign database function. Schema/table/column names and the primary
-- key type come from here, never from the caller. Must match RESIGN_TARGETS in fileLinkResign.ts.
CREATE OR REPLACE FUNCTION private.file_link_resign_target(p_target text)
RETURNS TABLE (schema_name text, table_name text, pk text, pk_type text, col text, kind text, skip_ledger boolean)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'private'
AS $$
  SELECT m.schema_name, m.table_name, m.pk, m.pk_type, m.col, m.kind, m.skip_ledger
  FROM (VALUES
    ('public.evidence_files.public_url', 'public', 'evidence_files', 'id', 'uuid', 'public_url', 'text', false),
    ('public.kv_store_37f42386.value', 'public', 'kv_store_37f42386', 'key', 'text', 'value', 'json', true),
    ('public.fleet_fuel_entries.payload_json', 'public', 'fleet_fuel_entries', 'id', 'text', 'payload_json', 'json', false),
    ('public.fleet_transactions.payload_json', 'public', 'fleet_transactions', 'id', 'text', 'payload_json', 'json', false),
    ('public.fleet_odometer_readings.payload_json', 'public', 'fleet_odometer_readings', 'id', 'text', 'payload_json', 'json', false),
    ('public.fleet_checkins.payload_json', 'public', 'fleet_checkins', 'id', 'text', 'payload_json', 'json', false),
    ('public.fleet_drivers.payload_json', 'public', 'fleet_drivers', 'id', 'text', 'payload_json', 'json', false),
    ('public.fleet_drivers.license_front_url', 'public', 'fleet_drivers', 'id', 'text', 'license_front_url', 'text', false),
    ('public.fleet_drivers.license_back_url', 'public', 'fleet_drivers', 'id', 'text', 'license_back_url', 'text', false),
    ('public.fleet_drivers.proof_of_address_url', 'public', 'fleet_drivers', 'id', 'text', 'proof_of_address_url', 'text', false),
    ('public.parts_sourcing_requests.photo_url', 'public', 'parts_sourcing_requests', 'id', 'uuid', 'photo_url', 'text', false),
    ('delivery.procurement_tasks.receipt_path', 'delivery', 'procurement_tasks', 'id', 'uuid', 'receipt_path', 'text', false),
    ('delivery.customer_order_issues.photo_url', 'delivery', 'customer_order_issues', 'id', 'uuid', 'photo_url', 'text', false)
  ) AS m(target, schema_name, table_name, pk, pk_type, col, kind, skip_ledger)
  WHERE m.target = p_target;
$$;

ALTER FUNCTION private.file_link_resign_target(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.file_link_resign_target(text) FROM PUBLIC, anon, authenticated, service_role;

-- Filtered, keyset-paged read for the re-sign job: only rows whose column holds a file-link address
-- come back, so the job never downloads whole tables (review 25 Nov). KV ledger/toll/journal keys
-- are never read (CLAUDE.md ledger guardrails). Text columns come back as a JSON string.
CREATE OR REPLACE FUNCTION public.file_link_resign_scan(
  p_target text,
  p_after text DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (pk text, value jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'delivery', 'private'
AS $$
DECLARE
  t record;
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_value text;
  v_after text := '';
  v_ledger text := '';
BEGIN
  SELECT * INTO t FROM private.file_link_resign_target(p_target);
  IF t.table_name IS NULL THEN
    RAISE EXCEPTION 'file_link_resign_scan: target not allowed: %', p_target USING ERRCODE = '22023';
  END IF;

  v_value := CASE WHEN t.kind = 'json' THEN format('%I', t.col) ELSE format('to_jsonb(%I)', t.col) END;
  IF p_after IS NOT NULL THEN
    v_after := format(' AND %I > $1::%s', t.pk, t.pk_type);
  END IF;
  IF t.skip_ledger THEN
    v_ledger := format(
      ' AND NOT (%I LIKE ANY (ARRAY[''ledger:%%'', ''ledger_event:%%'', ''toll_ledger:%%'', ''toll_payout:%%'', ''journal:%%'']))',
      t.pk
    );
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT %I::text, %s FROM %I.%I WHERE %I IS NOT NULL AND %I::text LIKE ''%%/functions/v1/file-link?%%''%s%s ORDER BY %I LIMIT %s',
    t.pk, v_value, t.schema_name, t.table_name, t.col, t.col, v_after, v_ledger, t.pk, v_limit
  ) USING p_after;
END;
$$;

ALTER FUNCTION public.file_link_resign_scan(text, text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.file_link_resign_scan(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.file_link_resign_scan(text, text, integer) TO service_role;
COMMENT ON FUNCTION public.file_link_resign_scan(text, text, integer) IS
  'Keyset-paged read of rows holding a file-link, for the re-sign job. Allow-listed targets only; service_role only.';

-- Compare-and-set for the re-sign job. JSON values cannot travel in a PostgREST `eq.` filter
-- (supabase-js sends "eq.[object Object]", and a payload is far too long for the URL), so the write
-- happens here with both values in the POST body. The key is compared as its own type so the
-- primary-key index is used (review 25 Nov). Text columns receive the text as a JSON string.
CREATE OR REPLACE FUNCTION public.file_link_resign_cas(
  p_target text,
  p_pk text,
  p_old jsonb,
  p_new jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'delivery', 'private'
AS $$
DECLARE
  t record;
  v_rows integer;
BEGIN
  IF p_target IS NULL OR p_pk IS NULL OR p_old IS NULL OR p_new IS NULL THEN
    RAISE EXCEPTION 'file_link_resign_cas: missing argument' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO t FROM private.file_link_resign_target(p_target);
  IF t.table_name IS NULL THEN
    RAISE EXCEPTION 'file_link_resign_cas: target not allowed: %', p_target USING ERRCODE = '22023';
  END IF;

  IF t.kind = 'json' THEN
    EXECUTE format(
      'UPDATE %I.%I SET %I = $1 WHERE %I = $2::%s AND %I = $3',
      t.schema_name, t.table_name, t.col, t.pk, t.pk_type, t.col
    ) USING p_new, p_pk, p_old;
  ELSE
    EXECUTE format(
      'UPDATE %I.%I SET %I = ($1 #>> ''{}'') WHERE %I = $2::%s AND %I = ($3 #>> ''{}'')',
      t.schema_name, t.table_name, t.col, t.pk, t.pk_type, t.col
    ) USING p_new, p_pk, p_old;
  END IF;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

ALTER FUNCTION public.file_link_resign_cas(text, text, jsonb, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.file_link_resign_cas(text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.file_link_resign_cas(text, text, jsonb, jsonb) TO service_role;
COMMENT ON FUNCTION public.file_link_resign_cas(text, text, jsonb, jsonb) IS
  'Compare-and-set write for the file-link re-sign job. Allow-listed targets only; service_role only.';

-- Every run is recorded (same idea as ledger.finance_doctor_runs), so a failed or partial run is
-- never only a log line (review 25 Nov). Counts only: no addresses, no signatures.
-- Check: SELECT ran_at, dry_run, needs_attention, attention FROM private.file_link_resign_runs
--        ORDER BY ran_at DESC LIMIT 3;
CREATE TABLE IF NOT EXISTS private.file_link_resign_runs (
  id bigserial PRIMARY KEY,
  ran_at timestamptz NOT NULL DEFAULT now(),
  dry_run boolean NOT NULL,
  renewed integer NOT NULL DEFAULT 0,
  due integer NOT NULL DEFAULT 0,
  skipped_changed integer NOT NULL DEFAULT 0,
  skipped_invalid integer NOT NULL DEFAULT 0,
  needs_attention boolean NOT NULL DEFAULT false,
  attention text[] NOT NULL DEFAULT '{}',
  report jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE private.file_link_resign_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.file_link_resign_runs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.file_link_resign_record_run(p_report jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'private', 'public'
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO private.file_link_resign_runs
    (dry_run, renewed, due, skipped_changed, skipped_invalid, needs_attention, attention, report)
  VALUES (
    coalesce((p_report->>'dryRun')::boolean, false),
    coalesce((p_report->>'renewed')::integer, 0),
    coalesce((p_report->>'due')::integer, 0),
    coalesce((p_report->>'skippedChanged')::integer, 0),
    coalesce((p_report->>'skippedInvalid')::integer, 0),
    coalesce(jsonb_array_length(p_report->'attention'), 0) > 0,
    coalesce(ARRAY(SELECT jsonb_array_elements_text(p_report->'attention')), '{}'),
    p_report
  )
  RETURNING id INTO v_id;
  -- Keep about two years of monthly runs plus manual dry runs.
  DELETE FROM private.file_link_resign_runs WHERE ran_at < now() - interval '2 years';
  RETURN v_id;
END;
$$;

ALTER FUNCTION public.file_link_resign_record_run(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.file_link_resign_record_run(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.file_link_resign_record_run(jsonb) TO service_role;
COMMENT ON FUNCTION public.file_link_resign_record_run(jsonb) IS
  'Records one file-link re-sign run (counts only). service_role only.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron missing; file-link-resign-monthly not scheduled';
    RETURN;
  END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'file-link-resign-monthly';
  PERFORM cron.schedule(
    'file-link-resign-monthly',
    '17 8 1 * *',
    $cron$SELECT private.invoke_file_link_resign()$cron$
  );
END;
$$;


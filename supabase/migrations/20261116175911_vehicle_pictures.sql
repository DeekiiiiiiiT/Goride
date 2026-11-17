-- Vehicle pictures + document checks (audit Rev 6 §4). Shared public.vehicle_picture; fleet columns + vehicle_document_check.

-- ---------------------------------------------------------------------------
-- public.vehicle_picture
-- ---------------------------------------------------------------------------

CREATE TABLE public.vehicle_picture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  look_key text NOT NULL,
  make text NOT NULL,
  model text NOT NULL,
  generation text NOT NULL,
  body_type text NOT NULL,
  facelift_stage text NOT NULL CHECK (facelift_stage IN ('standard', 'pre_facelift', 'facelift')),
  start_year int,
  end_year int,
  color text NOT NULL CHECK (color IN (
    'white', 'pearl white', 'black', 'silver', 'grey', 'dark grey', 'blue',
    'dark blue', 'red', 'maroon', 'green', 'brown', 'beige', 'gold', 'yellow', 'orange'
  )),
  example_catalog_id uuid REFERENCES public.vehicle_catalog(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('queued', 'generating', 'ready', 'failed')),
  lane text NOT NULL DEFAULT 'live' CHECK (lane IN ('live', 'remake')),
  r2_key text,
  version int NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'staff_upload', 'restore')),
  provider text,
  ai_model text,
  prompt text,
  prompt_version int,
  cost_usd numeric(8, 4),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  lease_until timestamptz,
  last_error text,
  staff_rating text CHECK (staff_rating IN ('good', 'wrong')),
  made_at timestamptz,
  made_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  queued_by_org text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.vehicle_picture.look_key IS 'Unique among live rows (partial index).';
COMMENT ON COLUMN public.vehicle_picture.lane IS 'live = vehicle adds / staff Regenerate; remake = bulk remakes only.';
COMMENT ON COLUMN public.vehicle_picture.r2_key IS 'Current version file key on media storage.';
COMMENT ON COLUMN public.vehicle_picture.version IS 'Current version number.';
COMMENT ON COLUMN public.vehicle_picture.source IS 'Source of the current version: ai, staff_upload, or restore.';
COMMENT ON COLUMN public.vehicle_picture.queued_by_org IS 'Org whose save first queued this look (per-org daily limit).';

CREATE UNIQUE INDEX vehicle_picture_live_look_uidx ON public.vehicle_picture (look_key)
  WHERE deleted_at IS NULL;
CREATE INDEX vehicle_picture_due_idx ON public.vehicle_picture (lane, next_attempt_at)
  WHERE status = 'queued';
CREATE INDEX vehicle_picture_status_idx ON public.vehicle_picture (status)
  WHERE deleted_at IS NULL;
CREATE INDEX vehicle_picture_make_model_idx ON public.vehicle_picture (make, model);
CREATE INDEX vehicle_picture_color_idx ON public.vehicle_picture (color);
CREATE INDEX vehicle_picture_org_day_idx ON public.vehicle_picture (queued_by_org, created_at);

CREATE TRIGGER vehicle_picture_updated_at
  BEFORE UPDATE ON public.vehicle_picture
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.vehicle_picture ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vehicle_picture FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.vehicle_picture_version
-- ---------------------------------------------------------------------------

CREATE TABLE public.vehicle_picture_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  picture_id uuid NOT NULL REFERENCES public.vehicle_picture(id) ON DELETE CASCADE,
  version int NOT NULL,
  r2_key text NOT NULL,
  source text NOT NULL CHECK (source IN ('ai', 'staff_upload', 'restore')),
  cost_usd numeric(8, 4),
  provider text,
  ai_model text,
  prompt_version int,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  file_deleted_at timestamptz,
  UNIQUE (picture_id, version)
);

CREATE INDEX vehicle_picture_version_cleanup_idx ON public.vehicle_picture_version (retired_at)
  WHERE retired_at IS NOT NULL AND file_deleted_at IS NULL;

ALTER TABLE public.vehicle_picture_version ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vehicle_picture_version FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.vehicle_picture_worker_lock
-- ---------------------------------------------------------------------------

CREATE TABLE public.vehicle_picture_worker_lock (
  id int PRIMARY KEY CHECK (id = 1),
  holder uuid,
  held_until timestamptz
);

INSERT INTO public.vehicle_picture_worker_lock (id) VALUES (1);

ALTER TABLE public.vehicle_picture_worker_lock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vehicle_picture_worker_lock FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- fleet.vehicles + fleet.vehicle_document_check
-- ---------------------------------------------------------------------------

ALTER TABLE fleet.vehicles
  ADD COLUMN color_standard text CHECK (color_standard IN (
    'white', 'pearl white', 'black', 'silver', 'grey', 'dark grey', 'blue',
    'dark blue', 'red', 'maroon', 'green', 'brown', 'beige', 'gold', 'yellow', 'orange'
  )),
  ADD COLUMN picture_id uuid REFERENCES public.vehicle_picture(id) ON DELETE SET NULL;

CREATE INDEX vehicles_picture_id_idx ON fleet.vehicles (picture_id);
CREATE INDEX vehicles_needs_picture_idx ON fleet.vehicles (id)
  WHERE picture_id IS NULL
    AND color_standard IS NOT NULL
    AND vehicle_catalog_id IS NOT NULL;

-- PostgREST dual-write uses this wrapper; refresh so color_standard and picture_id are exposed
-- (same pattern as 20261113162537 after plate_aliases).
CREATE OR REPLACE VIEW public.fleet_vehicles AS
  SELECT * FROM fleet.vehicles;

ALTER VIEW public.fleet_vehicles SET (security_invoker = true);
GRANT SELECT ON public.fleet_vehicles TO authenticated;
GRANT ALL ON public.fleet_vehicles TO service_role;

CREATE TABLE fleet.vehicle_document_check (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  vehicle_id text NOT NULL REFERENCES fleet.vehicles(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('fitness', 'registration')),
  issue_date date,
  expiry_date date,
  file_sha256 text NOT NULL,
  fields_json jsonb NOT NULL,
  read_by uuid REFERENCES auth.users(id),
  read_at timestamptz NOT NULL DEFAULT now(),
  reader_provider text NOT NULL,
  reader_model text NOT NULL
);

CREATE INDEX vehicle_document_check_vehicle_idx
  ON fleet.vehicle_document_check (organization_id, vehicle_id, doc_type, read_at DESC);

ALTER TABLE fleet.vehicle_document_check ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fleet.vehicle_document_check FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- pg_net invoke + per-minute gate
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.vehicle_picture_functions_url(path text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'private'
AS $$
DECLARE
  base text;
BEGIN
  SELECT value INTO base FROM private.fleet_ops_secrets WHERE name = 'functions_base_url';
  base := COALESCE(
    NULLIF(rtrim(base, '/'), ''),
    'https://csfllzzastacofsvcdsc.supabase.co/functions/v1'
  );
  RETURN base || '/' || ltrim(path, '/');
END;
$$;

ALTER FUNCTION private.vehicle_picture_functions_url(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.vehicle_picture_functions_url(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.vehicle_picture_functions_url(text) TO postgres;

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
    url := private.vehicle_picture_functions_url('fleet-core/internal/vehicle-pictures/run'),
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
    url := private.vehicle_picture_functions_url('fleet-core/internal/vehicle-pictures/fill'),
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

CREATE OR REPLACE FUNCTION private.vehicle_picture_sweep_stuck()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.vehicle_picture
  SET status = 'queued',
      lease_until = null,
      next_attempt_at = now()
  WHERE status = 'generating'
    AND lease_until < now()
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

ALTER FUNCTION private.vehicle_picture_sweep_stuck() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.vehicle_picture_sweep_stuck() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.vehicle_picture_sweep_stuck() TO postgres;

CREATE OR REPLACE FUNCTION private.vehicle_picture_cleanup_due()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_retention interval;
BEGIN
  SELECT make_interval(
    days => COALESCE((kv.value->>'vehicle_picture_retention_days')::int, 30)
  )
  INTO v_retention
  FROM public.kv_store_37f42386 kv
  WHERE kv.key = 'vehicle_pictures:settings';

  v_retention := COALESCE(v_retention, make_interval(days => 30));

  RETURN EXISTS (
    SELECT 1
    FROM public.vehicle_picture_version v
    WHERE v.retired_at IS NOT NULL
      AND v.file_deleted_at IS NULL
      AND v.retired_at < now() - v_retention
  )
  OR EXISTS (
    SELECT 1
    FROM public.vehicle_picture p
    JOIN public.vehicle_picture_version v ON v.picture_id = p.id
    WHERE p.deleted_at IS NOT NULL
      AND p.deleted_at < now() - v_retention
      AND v.file_deleted_at IS NULL
  );
END;
$$;

ALTER FUNCTION private.vehicle_picture_cleanup_due() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.vehicle_picture_cleanup_due() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.vehicle_picture_cleanup_due() TO postgres;

CREATE OR REPLACE FUNCTION private.vehicle_picture_fill_cursor_set()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT (kv.value ? 'vehicle_picture_fill_cursor')
        AND kv.value->'vehicle_picture_fill_cursor' IS NOT NULL
        AND kv.value->'vehicle_picture_fill_cursor' <> 'null'::jsonb
      FROM public.kv_store_37f42386 kv
      WHERE kv.key = 'vehicle_pictures:settings'
    ),
    false
  );
$$;

ALTER FUNCTION private.vehicle_picture_fill_cursor_set() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.vehicle_picture_fill_cursor_set() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.vehicle_picture_fill_cursor_set() TO postgres;

CREATE OR REPLACE FUNCTION private.vehicle_picture_worker_lease_free()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vehicle_picture_worker_lock l
    WHERE l.id = 1
      AND (l.held_until IS NULL OR l.held_until < now())
  );
$$;

ALTER FUNCTION private.vehicle_picture_worker_lease_free() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.vehicle_picture_worker_lease_free() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.vehicle_picture_worker_lease_free() TO postgres;

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

  IF private.vehicle_picture_fill_cursor_set()
     AND private.vehicle_picture_worker_lease_free() THEN
    SELECT kv.value->'vehicle_picture_fill_cursor'->>'afterId' INTO v_after
    FROM public.kv_store_37f42386 kv
    WHERE kv.key = 'vehicle_pictures:settings';
    v_fill := private.invoke_vehicle_picture_fill(v_after);
  END IF;
END;
$$;

ALTER FUNCTION private.vehicle_picture_minute_tick() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.vehicle_picture_minute_tick() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.vehicle_picture_minute_tick() TO postgres;

-- ---------------------------------------------------------------------------
-- pg_cron
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'vehicle-picture-worker';
    PERFORM cron.schedule(
      'vehicle-picture-worker',
      '* * * * *',
      $cron$SELECT private.vehicle_picture_minute_tick();$cron$
    );

    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'vehicle-picture-fill';
    PERFORM cron.schedule(
      'vehicle-picture-fill',
      '15 5 * * *',
      $cron$SELECT private.invoke_vehicle_picture_fill();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped vehicle-picture cron jobs';
  END IF;
END $$;
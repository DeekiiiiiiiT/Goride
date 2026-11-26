-- Part pictures — Data layer only (docs/part-pictures-audit.md Rev 3, §2 D1–D5 + D1a).
--
-- D1  public.part_picture           one row per physical part (interchange group); the queue and the current picture.
-- D2  public.part_picture_version   one row per earlier picture; files deleted after the retention window.
-- D3  public.part_picture_diagram   the diagram that was read, kept so Remake works; deleted by the same cleanup.
-- D4  public.part_picture_template  one row per part group: the materials line, on/off, version.
-- D5  kv_store 'part_pictures:settings' — the switch and limits, off by default.
-- D1a the seven worker functions, mirroring the car-picture ones by name and behaviour.
--
-- Additive only. No cron and no server route here: those are build step 3 (§3.3), each with its own migration.
-- The logbook line lives in the SQL pasted on production (docs/part_pictures_LIVE_apply.sql), never in this file.

-- ---------------------------------------------------------------------------
-- D1. public.part_picture
-- ---------------------------------------------------------------------------
CREATE TABLE public.part_picture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One picture per physical part. A group can hold several makers' numbers for the same part (PP-06).
  interchange_group_id uuid NOT NULL UNIQUE REFERENCES public.part_interchange_group (id) ON DELETE CASCADE,
  -- Display only: the maker and number this picture was first made from. The group is the key.
  manufacturer text NOT NULL,
  part_number text NOT NULL,
  part_name text NOT NULL,
  -- The catalogue group (Brakes, Engine, …) whose template made this picture, and the part type.
  catalog_group_id uuid REFERENCES public.maintenance_service_categories (id) ON DELETE SET NULL,
  component_id uuid REFERENCES public.maintenance_service_categories (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'making', 'ready', 'failed', 'hidden')),
  -- The diagram callout the prompt names (e.g. 17801), or null when the page has none (PP-16).
  label text,
  r2_key text,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  -- Which template version made the current picture, so a template edit can re-queue old pictures (PP-14).
  template_version int,
  prompt text,
  ai_model text,
  cost_usd numeric(8, 4),
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz,
  lease_until timestamptz,
  last_error text,
  made_at timestamptz,
  hidden_at timestamptz,
  hidden_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  -- Where the picture came from. The saved page row is kept; this link is only for "this upload" (S3).
  source_saved_page_id uuid REFERENCES public.research_saved_page (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- D1 rule: a ready picture must have its file and the time it was made.
  CONSTRAINT part_picture_ready_has_file CHECK (status <> 'ready' OR (r2_key IS NOT NULL AND made_at IS NOT NULL))
);

COMMENT ON TABLE public.part_picture IS
  'Part pictures (docs/part-pictures-audit.md §2 D1): one row per interchange group. Server only.';
COMMENT ON COLUMN public.part_picture.interchange_group_id IS
  'The physical part. Deleting the group deletes its picture (an undone import must not be blocked by a picture).';
COMMENT ON COLUMN public.part_picture.manufacturer IS
  'Display only, copied from part_master.manufacturer when the picture was queued.';
COMMENT ON COLUMN public.part_picture.label IS
  'The diagram callout, from the part group line (§3.1). Null when the page prints none.';
COMMENT ON COLUMN public.part_picture.hidden_at IS
  'Set when staff hide it from Fleet. The file is kept so Show can bring it back (PP-09).';
COMMENT ON COLUMN public.part_picture.source_saved_page_id IS
  'The saved page this picture was queued from. Kept so S3 can filter to one upload.';

CREATE INDEX part_picture_due_idx ON public.part_picture (next_attempt_at)
  WHERE status = 'queued';
CREATE INDEX part_picture_status_idx ON public.part_picture (status);
CREATE INDEX part_picture_catalog_group_idx ON public.part_picture (catalog_group_id);
CREATE INDEX part_picture_saved_page_idx ON public.part_picture (source_saved_page_id)
  WHERE source_saved_page_id IS NOT NULL;

CREATE TRIGGER part_picture_updated_at
  BEFORE UPDATE ON public.part_picture
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.part_picture ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.part_picture FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- D1a (support). public.part_picture_worker_lock — one row, the worker's own lease
-- ---------------------------------------------------------------------------
-- Same shape as public.vehicle_picture_worker_lock: one row, so two worker runs can never overlap.
CREATE TABLE public.part_picture_worker_lock (
  id int PRIMARY KEY CHECK (id = 1),
  holder uuid,
  held_until timestamptz
);

INSERT INTO public.part_picture_worker_lock (id) VALUES (1);

ALTER TABLE public.part_picture_worker_lock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.part_picture_worker_lock FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- D2. public.part_picture_version
-- ---------------------------------------------------------------------------
CREATE TABLE public.part_picture_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  picture_id uuid NOT NULL REFERENCES public.part_picture (id) ON DELETE CASCADE,
  version int NOT NULL CHECK (version >= 1),
  r2_key text NOT NULL,
  prompt text,
  template_version int,
  ai_model text,
  cost_usd numeric(8, 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Retired = a newer version replaced it. The file stays until the cleanup deletes it.
  retired_at timestamptz,
  file_deleted_at timestamptz,
  UNIQUE (picture_id, version)
);

COMMENT ON TABLE public.part_picture_version IS
  'Earlier part pictures (§2 D2). Current and newest retired files are kept; older files are deleted after the retention window.';

CREATE INDEX part_picture_version_cleanup_idx ON public.part_picture_version (retired_at)
  WHERE retired_at IS NOT NULL AND file_deleted_at IS NULL;

ALTER TABLE public.part_picture_version ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.part_picture_version FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- D3. public.part_picture_diagram
-- ---------------------------------------------------------------------------
CREATE TABLE public.part_picture_diagram (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  picture_id uuid NOT NULL REFERENCES public.part_picture (id) ON DELETE CASCADE,
  saved_page_id uuid REFERENCES public.research_saved_page (id) ON DELETE SET NULL,
  -- Private bucket: part-diagrams/<pictureId>/<uuid>.<ext>
  r2_key text NOT NULL,
  -- The part's rectangle from the page's image map, as {x1,y1,x2,y2}. A HINT ONLY: Chrome's single-file
  -- page scales these (17801 was 346,374,388,389 in the .html and 249,269,279,279 in the .mhtml),
  -- so they are never treated as the picture's pixel box.
  map_box jsonb,
  -- Kept 30 days so Remake works (PP-04); the worker sets this from retention_days.
  delete_after timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.part_picture_diagram IS
  'The catalogue diagram a part picture was read from (§2 D3). Private, never shown, kept 30 days for Remake, then deleted.';
COMMENT ON COLUMN public.part_picture_diagram.map_box IS
  'Image-map rectangle {x1,y1,x2,y2} as a hint only. Chrome scales these between .html and .mhtml.';

CREATE INDEX part_picture_diagram_picture_idx ON public.part_picture_diagram (picture_id);
CREATE INDEX part_picture_diagram_due_idx ON public.part_picture_diagram (delete_after)
  WHERE deleted_at IS NULL;

ALTER TABLE public.part_picture_diagram ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.part_picture_diagram FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- D4. public.part_picture_template
-- ---------------------------------------------------------------------------
CREATE TABLE public.part_picture_template (
  catalog_group_id uuid PRIMARY KEY REFERENCES public.maintenance_service_categories (id) ON DELETE CASCADE,
  materials text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.part_picture_template IS
  'The materials line and on/off switch for each of the 13 part groups (§2 D4). Saving a change adds 1 to version.';

CREATE TRIGGER part_picture_template_updated_at
  BEFORE UPDATE ON public.part_picture_template
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.part_picture_template ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.part_picture_template FROM PUBLIC, anon, authenticated;

-- Seed: one row per part group that exists — a system row that is the parent of an active part type. That
-- predicate excludes the 5 non-part system rows (Shop fees, Vehicle OE numbers, Part cross-references, Shared
-- platform links, Car specs). The 13 names below are today's groups on production; a database that does not
-- have one of them yet simply seeds the rest (a fresh replay has 11 of the 13). Materials text is §3.4;
-- Fluids and Tires & wheels start off (PP-10) with no materials.
INSERT INTO public.part_picture_template (catalog_group_id, materials, enabled)
SELECT g.id, seed.materials, seed.enabled
FROM (
  VALUES
    ('Filters', 'Molded black polypropylene housings, pleated white/off-white filter media with orange/amber rubber gasket trim, stamped steel clips.', true),
    ('Engine', 'Cast aluminium and cast-iron parts with machined faces, black molded plastic covers, rubber seals and gaskets, zinc-plated bolts.', true),
    ('Brakes', 'Machined cast-iron rotors with a cross-hatched friction surface, cast aluminium or iron calipers, ceramic/semi-metallic pads on steel backing plates, braided steel or rubber hoses with brass/steel fittings, zinc-plated pins and rubber dust boots.', true),
    ('Suspension & steering', 'Satin-black stamped steel or forged aluminium arms, painted shock absorbers with polished chrome rods, powder-coated coil springs, black rubber or polyurethane bushings, ball joints with black rubber boots, zinc-plated nuts and bolts.', true),
    ('Battery & electrical', 'PVC-insulated copper wiring in black split-loom, molded nylon connectors with seals, black plastic relays and fuse blocks, brass/tin-plated terminals, metal sensor bodies with O-rings.', true),
    ('Exhaust & emissions', 'Stainless or aluminised steel pipes and shells with heat discolouration, ceramic sensor tips, steel flanges and gaskets.', true),
    ('Lighting & visibility', 'Clear polycarbonate lenses, chrome reflectors, glass bulbs with metal bases, black plastic housings, rubber wiper blades on steel or plastic frames.', true),
    ('HVAC', 'Black and grey molded plastic housings, pleated cabin-filter media, aluminium fins and tubes, rubber seals.', true),
    ('Belts & hoses', 'Black EPDM rubber ribbed belts and hoses, steel worm-gear clamps.', true),
    ('Transmission', 'Cast aluminium cases, machined steel gears and shafts, rubber seals, black plastic filters.', true),
    ('Hybrid & electric', 'Orange high-voltage cables and connectors, aluminium inverter and battery housings, black plastic covers.', true),
    ('Fluids', '', false),
    ('Tires & wheels', '', false)
) AS seed (name, materials, enabled)
JOIN public.maintenance_service_categories g
  ON g.name = seed.name
 AND g.kind = 'system'
 AND g.parent_id IS NULL
 AND EXISTS (
   SELECT 1
   FROM public.maintenance_service_categories c
   WHERE c.parent_id = g.id
     AND c.is_part
     AND c.part_type_status = 'active'
 )
ON CONFLICT (catalog_group_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- D5. Settings row
-- ---------------------------------------------------------------------------
-- Off by default (PP-11). The pause fields mirror the car settings, so the worker and S3 read the same shape.
INSERT INTO public.kv_store_37f42386 (key, value)
VALUES (
  'part_pictures:settings',
  jsonb_build_object(
    'ai_part_pictures', false,
    'part_picture_model', 'gemini-3.1-flash-image',
    'max_attempts', 3,
    'daily_max', 50,
    'retention_days', 30,
    'part_pictures_paused_until', NULL,
    'part_pictures_pause_reason', NULL,
    'part_picture_outage_streak', NULL
  )
)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- D1a. Worker functions (7), mirroring the car system's by name and behaviour
-- ---------------------------------------------------------------------------

-- 1a. Acquire the worker lease. One run at a time, like vehicle_picture_try_worker_lease.
CREATE OR REPLACE FUNCTION public.part_picture_try_worker_lease(
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
  UPDATE public.part_picture_worker_lock
  SET holder = p_holder, held_until = p_held_until
  WHERE id = 1
    AND (held_until IS NULL OR held_until < now());
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

ALTER FUNCTION public.part_picture_try_worker_lease(uuid, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.part_picture_try_worker_lease(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_picture_try_worker_lease(uuid, timestamptz) TO service_role;

-- 1b. Release it.
CREATE OR REPLACE FUNCTION public.part_picture_release_worker_lease(p_holder uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.part_picture_worker_lock
  SET held_until = NULL
  WHERE id = 1 AND holder = p_holder;
$$;

ALTER FUNCTION public.part_picture_release_worker_lease(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.part_picture_release_worker_lease(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_picture_release_worker_lease(uuid) TO service_role;

-- 2. Claim the next rows. Atomic: FOR UPDATE SKIP LOCKED, so two runs (or a crash and a retry) can never take
--    the same row, and a row still leased by a live run is skipped (PP-19). Turns them 'making' and sets the lease.
CREATE OR REPLACE FUNCTION public.part_picture_claim(
  p_limit int DEFAULT 5,
  p_lease_seconds int DEFAULT 180
)
RETURNS SETOF public.part_picture
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit int := GREATEST(0, LEAST(COALESCE(p_limit, 5), 50));
  v_lease int := GREATEST(30, LEAST(COALESCE(p_lease_seconds, 180), 3600));
BEGIN
  IF v_limit = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT p.id
    FROM public.part_picture p
    WHERE p.status = 'queued'
      AND (p.next_attempt_at IS NULL OR p.next_attempt_at <= now())
      AND (p.lease_until IS NULL OR p.lease_until < now())
    ORDER BY p.next_attempt_at NULLS FIRST, p.created_at
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.part_picture p
  SET status = 'making',
      lease_until = now() + make_interval(secs => v_lease),
      updated_at = now()
  FROM due
  WHERE p.id = due.id
  RETURNING p.*;
END;
$$;

ALTER FUNCTION public.part_picture_claim(int, int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.part_picture_claim(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_picture_claim(int, int) TO service_role;

-- 3. Add an attempt. Counted only when a Gemini call is actually sent.
CREATE OR REPLACE FUNCTION public.part_picture_increment_attempts(p_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.part_picture
  SET attempts = attempts + 1, updated_at = now()
  WHERE id = p_id
  RETURNING attempts;
$$;

ALTER FUNCTION public.part_picture_increment_attempts(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.part_picture_increment_attempts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_picture_increment_attempts(uuid) TO service_role;

-- 4. Becomes ready — the ONE way a picture becomes current: insert the version, retire the older ones and set the
--    picture ready, all in this one transaction (PP-19). Every path uses it.
CREATE OR REPLACE FUNCTION public.part_picture_become_ready(
  p_picture_id uuid,
  p_version int,
  p_r2_key text,
  p_cost_usd numeric,
  p_ai_model text,
  p_template_version int,
  p_prompt text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.part_picture WHERE id = p_picture_id) THEN
    RAISE EXCEPTION 'part_picture % not found', p_picture_id;
  END IF;

  INSERT INTO public.part_picture_version (
    picture_id, version, r2_key, prompt, template_version, ai_model, cost_usd
  ) VALUES (
    p_picture_id, p_version, p_r2_key, p_prompt, p_template_version, p_ai_model, p_cost_usd
  );

  UPDATE public.part_picture_version
  SET retired_at = now()
  WHERE picture_id = p_picture_id
    AND version < p_version
    AND retired_at IS NULL;

  UPDATE public.part_picture
  SET
    status = 'ready',
    r2_key = p_r2_key,
    version = p_version,
    template_version = p_template_version,
    prompt = p_prompt,
    ai_model = p_ai_model,
    cost_usd = p_cost_usd,
    made_at = now(),
    lease_until = NULL,
    last_error = NULL,
    updated_at = now()
  WHERE id = p_picture_id;
END;
$$;

ALTER FUNCTION public.part_picture_become_ready(uuid, int, text, numeric, text, int, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.part_picture_become_ready(uuid, int, text, numeric, text, int, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_picture_become_ready(uuid, int, text, numeric, text, int, text)
  TO service_role;

-- 5. Sweep stuck 'making' rows back to 'queued' after their lease died. Attempts are kept.
CREATE OR REPLACE FUNCTION public.part_picture_sweep_stuck()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.part_picture
  SET status = 'queued',
      lease_until = NULL,
      next_attempt_at = now(),
      updated_at = now()
  WHERE status = 'making'
    AND lease_until < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

ALTER FUNCTION public.part_picture_sweep_stuck() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.part_picture_sweep_stuck() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_picture_sweep_stuck() TO service_role;

-- 6. Requeue and give the attempt back (budget block, key refusal): the call never happened, so it is not a try.
CREATE OR REPLACE FUNCTION public.part_picture_requeue_give_back_attempt(
  p_id uuid,
  p_next_attempt_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.part_picture
  SET
    status = 'queued',
    attempts = GREATEST(0, attempts - 1),
    next_attempt_at = p_next_attempt_at,
    lease_until = NULL,
    updated_at = now()
  WHERE id = p_id;
$$;

ALTER FUNCTION public.part_picture_requeue_give_back_attempt(uuid, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.part_picture_requeue_give_back_attempt(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_picture_requeue_give_back_attempt(uuid, timestamptz)
  TO service_role;

-- 7. Cleanup candidates: old version files and diagrams past delete_after, in one query (no N+1 loop).
--    Keeps the current version and the newest retired one; deleted after the retention window (PP-04).
--    kind = 'version' → mark part_picture_version.file_deleted_at after the file is gone.
--    kind = 'diagram' → mark part_picture_diagram.deleted_at after the file is gone.
CREATE OR REPLACE FUNCTION public.part_picture_cleanup_candidates(
  p_retention_days int,
  p_limit int
)
RETURNS TABLE(kind text, ref_id uuid, picture_id uuid, version int, r2_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH retention_cutoff AS (
    SELECT now() - make_interval(days => GREATEST(0, COALESCE(p_retention_days, 30))) AS cutoff
  ),
  live_retired AS (
    SELECT
      vv.id,
      vv.picture_id,
      vv.version,
      vv.r2_key,
      vv.retired_at,
      row_number() OVER (PARTITION BY vv.picture_id ORDER BY vv.version DESC) AS rn
    FROM public.part_picture_version vv
    WHERE vv.retired_at IS NOT NULL
      AND vv.file_deleted_at IS NULL
  ),
  version_candidates AS (
    SELECT
      'version'::text AS kind,
      lr.id AS ref_id,
      lr.picture_id,
      lr.version,
      lr.r2_key,
      lr.retired_at AS sort_at
    FROM live_retired lr
    CROSS JOIN retention_cutoff c
    WHERE lr.retired_at < c.cutoff
      AND lr.rn > 1
      AND lr.version <> (SELECT p.version FROM public.part_picture p WHERE p.id = lr.picture_id)
  ),
  diagram_candidates AS (
    SELECT
      'diagram'::text AS kind,
      d.id AS ref_id,
      d.picture_id,
      NULL::int AS version,
      d.r2_key,
      d.delete_after AS sort_at
    FROM public.part_picture_diagram d
    WHERE d.deleted_at IS NULL
      AND d.delete_after <= now()
  ),
  combined AS (
    SELECT kind, ref_id, picture_id, version, r2_key, sort_at FROM version_candidates
    UNION ALL
    SELECT kind, ref_id, picture_id, version, r2_key, sort_at FROM diagram_candidates
  )
  SELECT c.kind, c.ref_id, c.picture_id, c.version, c.r2_key
  FROM combined c
  ORDER BY c.sort_at ASC
  LIMIT GREATEST(0, COALESCE(p_limit, 100));
$$;

ALTER FUNCTION public.part_picture_cleanup_candidates(int, int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.part_picture_cleanup_candidates(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_picture_cleanup_candidates(int, int) TO service_role;

-- The server reads and writes the new tables and functions through PostgREST.
NOTIFY pgrst, 'reload schema';

-- Logbook line (paste-only; never in the committed migration file)
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261126085053', 'part_pictures') ON CONFLICT (version) DO NOTHING;

-- ===========================================================================
-- Part-picture cron (build step S1, §3.3 / PP-20): migration 20261126090807_part_picture_cron
-- The worker job goes through fleet-picture-cron (parts-run), which has verify_jwt = false.
-- ===========================================================================

-- Part-picture worker cron (docs/part-pictures-audit.md §3.3, PP-20).
--
-- A database job has no login token, so a direct call to platform-catalog is refused (401). The job therefore
-- goes through fleet-picture-cron, which has verify_jwt = false, checks the fleet cron secret and forwards to
-- platform-catalog with the service-role key. Same pattern as 20261117050423_vehicle_picture_cron_relay.sql.
--
-- Additive only. The logbook line lives in the SQL pasted on production (docs/part_pictures_LIVE_apply.sql).

CREATE OR REPLACE FUNCTION private.part_picture_functions_url(path text)
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

ALTER FUNCTION private.part_picture_functions_url(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.part_picture_functions_url(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.part_picture_functions_url(text) TO postgres;

-- Every 2 minutes: the relay forwards to platform-catalog's internal part-pictures run route.
CREATE OR REPLACE FUNCTION private.invoke_part_picture_worker()
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
    url := private.part_picture_functions_url('fleet-picture-cron/parts-run'),
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

ALTER FUNCTION private.invoke_part_picture_worker() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.invoke_part_picture_worker() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.invoke_part_picture_worker() TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'part-picture-worker';
    PERFORM cron.schedule(
      'part-picture-worker',
      '*/2 * * * *',
      $cron$SELECT private.invoke_part_picture_worker();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped part-picture-worker cron job';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Logbook line (paste-only; never in the committed migration file)
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261126090807', 'part_picture_cron') ON CONFLICT (version) DO NOTHING;

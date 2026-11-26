-- Saved catalogue pages → parts, Data layer (docs/saved-page-parts-audit.md Rev 4, §3 D1–D3).
--
-- D1: public.research_saved_page — one row per page the owner uploads. The file itself is never stored.
-- D2: research_page_read.saved_page_id — the evidence lines a saved page proved, on the same path as a browser check.
-- D3: public.research_saved_page_job(car, part type, axle, actor) — the one open browser-check job for that axle,
--     opened for the owner, or { busy: true } while Roam is checking it.
-- Additive only. The logbook line lives in the SQL pasted on production, never in this file.

-- ---------------------------------------------------------------------------
-- D1. research_saved_page
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.research_saved_page (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog (id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.catalog_research_job (id) ON DELETE SET NULL,
  -- Plain text with no link to trusted_site: a stopped row may name a site that is not trusted for this car.
  domain text,
  source_url text,
  -- SP-06: saved file names are very long; only the first 120 characters are kept.
  file_name text CHECK (file_name IS NULL OR length(file_name) <= 120),
  file_sha256 text,
  line_count integer NOT NULL DEFAULT 0 CHECK (line_count >= 0),
  status text NOT NULL CHECK (status IN ('reading', 'done', 'stopped')),
  stop_reason text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_cost_usd numeric(8, 4) NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.research_saved_page IS
  'Saved catalogue pages → parts (SP-01…): one row per page the owner uploaded, with what it proved. The file is never stored.';

-- Deliberately no unique (vehicle_catalog_id, file_sha256): "Read again" makes a new row for the same file (R9).
CREATE INDEX IF NOT EXISTS research_saved_page_car_created
  ON public.research_saved_page (vehicle_catalog_id, created_at DESC);
CREATE INDEX IF NOT EXISTS research_saved_page_uploader_created
  ON public.research_saved_page (uploaded_by, created_at);

ALTER TABLE public.research_saved_page ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS research_saved_page_deny_all ON public.research_saved_page;
CREATE POLICY research_saved_page_deny_all ON public.research_saved_page
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.research_saved_page FROM anon;
REVOKE ALL ON TABLE public.research_saved_page FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.research_saved_page TO service_role;

-- ---------------------------------------------------------------------------
-- D2. research_page_read.saved_page_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.research_page_read
  ADD COLUMN IF NOT EXISTS saved_page_id uuid;
ALTER TABLE public.research_page_read
  DROP CONSTRAINT IF EXISTS research_page_read_saved_page_id_fkey;
ALTER TABLE public.research_page_read
  ADD CONSTRAINT research_page_read_saved_page_id_fkey
  FOREIGN KEY (saved_page_id) REFERENCES public.research_saved_page (id) ON DELETE SET NULL;

-- The cascade on delete looks up the evidence rows by this column.
CREATE INDEX IF NOT EXISTS research_page_read_saved_page
  ON public.research_page_read (saved_page_id) WHERE saved_page_id IS NOT NULL;

-- The evidence rows stay append-only. Its guard already lets a removed job / recipe clear its reference to NULL;
-- a removed saved page must do the same, or ON DELETE SET NULL above would raise and block the delete.
CREATE OR REPLACE FUNCTION public.research_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_new jsonb;
  v_old jsonb;
BEGIN
  -- Allow only the FK cascades on research_page_read (job / recipe / saved page removed → reference set to NULL).
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'research_page_read' THEN
    v_new := to_jsonb(NEW);
    v_old := to_jsonb(OLD);
    IF (v_new - 'job_id' - 'recipe_id' - 'saved_page_id') = (v_old - 'job_id' - 'recipe_id' - 'saved_page_id')
       AND (v_new->>'job_id' IS NULL OR v_new->>'job_id' = v_old->>'job_id')
       AND (v_new->>'recipe_id' IS NULL OR v_new->>'recipe_id' = v_old->>'recipe_id')
       AND (v_new->>'saved_page_id' IS NULL OR v_new->>'saved_page_id' = v_old->>'saved_page_id') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;

-- ---------------------------------------------------------------------------
-- D3. research_saved_page_job(car, part type, axle, actor)
-- ---------------------------------------------------------------------------
-- The one open job for a car + part type + axle, as the browser check needs it:
--   * queued / needs_review / browser_check_queued → moved to browser_check and returned;
--   * researching / checking → { busy: true }, left untouched;
--   * anything else open (browser_check, auto_added) → returned as it is;
--   * none → a browser_check job, origin owner_fill, key fill:<car>:<part type>:<axle>, ON CONFLICT on the
--     open-job index, so a race (or a robot job that owns the key) never makes a second open job.
-- The axle word is read from fit_descriptor (front / rear / none), never from group_key: live keys have two shapes
-- (SP-27) and live fit text is "front", "rear:both" or empty. service_role only — the server has already checked the
-- Dominion user before it calls this.
CREATE OR REPLACE FUNCTION public.research_saved_page_job(
  p_vehicle_catalog_id uuid,
  p_component_id uuid,
  p_axle text,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_want text;
  v_job public.catalog_research_job%ROWTYPE;
  v_job_id uuid;
  v_state text;
  v_key text;
BEGIN
  IF p_vehicle_catalog_id IS NULL OR p_component_id IS NULL THEN
    RAISE EXCEPTION 'car and part type required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- The axle word: 'front' / 'rear' / none. Same words the browser-check save uses on fit_descriptor.
  v_want := CASE
    WHEN lower(coalesce(p_axle, '')) LIKE '%rear%' THEN 'rear'
    WHEN lower(coalesce(p_axle, '')) LIKE '%front%' THEN 'front'
    ELSE '' END;

  SELECT * INTO v_job
  FROM public.catalog_research_job j
  WHERE j.vehicle_catalog_id = p_vehicle_catalog_id
    AND j.job_type = 'part'
    AND j.maintenance_component_id = p_component_id
    AND (CASE
           WHEN lower(coalesce(j.fit_descriptor, '')) LIKE '%rear%' THEN 'rear'
           WHEN lower(coalesce(j.fit_descriptor, '')) LIKE '%front%' THEN 'front'
           ELSE '' END) = v_want
    AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check',
                    'browser_check_queued')
  ORDER BY (j.state = 'browser_check') DESC, j.updated_at DESC, j.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_job.state IN ('queued', 'needs_review', 'browser_check_queued') THEN
      UPDATE public.catalog_research_job
      SET state = 'browser_check', updated_at = now()
      WHERE id = v_job.id;
      v_job.state := 'browser_check';
    ELSIF v_job.state IN ('researching', 'checking') THEN
      RETURN jsonb_build_object('busy', true);
    END IF;
    RETURN jsonb_build_object('jobId', v_job.id, 'state', v_job.state);
  END IF;

  -- No open job for this axle: open the browser check the owner would have opened by hand.
  v_key := concat_ws(':', 'fill', p_vehicle_catalog_id::text, p_component_id::text, v_want);
  INSERT INTO public.catalog_research_job (
    job_type, group_key, vehicle_catalog_id, maintenance_component_id, fit_descriptor, fleet_count, state, origin,
    browser_check_allowed
  ) VALUES (
    'part', v_key, p_vehicle_catalog_id, p_component_id, nullif(v_want, ''), 0, 'browser_check', 'owner_fill', true
  )
  ON CONFLICT (group_key) WHERE state IN (
    'queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check', 'browser_check_queued'
  ) DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    -- The key was taken between the lookup and the insert: return that open job, never a second one.
    SELECT j.id, j.state INTO v_job_id, v_state
    FROM public.catalog_research_job j
    WHERE j.group_key = v_key
      AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check',
                      'browser_check_queued')
    ORDER BY (j.state = 'browser_check') DESC, j.updated_at DESC
    LIMIT 1;
  ELSE
    v_state := 'browser_check';
    PERFORM public.catalog_research_log_event(v_job_id, 'browser_check', 'created',
      jsonb_build_object('origin', 'owner_fill', 'source', 'saved_page'), p_actor);
  END IF;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'saved page job could not be opened' USING ERRCODE = 'unique_violation';
  END IF;

  IF v_state IN ('queued', 'needs_review', 'browser_check_queued') THEN
    UPDATE public.catalog_research_job
    SET state = 'browser_check', updated_at = now()
    WHERE id = v_job_id;
    v_state := 'browser_check';
  ELSIF v_state IN ('researching', 'checking') THEN
    RETURN jsonb_build_object('busy', true);
  END IF;

  RETURN jsonb_build_object('jobId', v_job_id, 'state', v_state);
END;
$$;

COMMENT ON FUNCTION public.research_saved_page_job(uuid, uuid, text, uuid) IS
  'The one open browser check for a car + part type + axle; returns { jobId, state } or { busy: true }. service_role only.';

REVOKE ALL ON FUNCTION public.research_saved_page_job(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_saved_page_job(uuid, uuid, text, uuid) TO service_role;

-- The server reads the new table and writes the new evidence column through PostgREST.
NOTIFY pgrst, 'reload schema';

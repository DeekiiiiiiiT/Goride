-- Maintenance rebuild, step 3 (the owner's manual reader) - paste file for the LIVE database.
-- Project: csfllzzastacofsvcdsc. Apply top to bottom in ONE run of the Supabase SQL editor.
--
-- Step 1 is already live, so this file holds only step 3's two migrations. It does not deploy any
-- function: the functions are deployed from the clean copy (C:/Roam/Goride-mm3), see the
-- review doc section 0.
--
-- What it does, in order:
--   1. 20261127122217  the page queue (one row per page), its worker functions, and the draft /
--                     approve / reject / stop functions; plus the first-time interval, the
--                     draft note, and the manual's stop reason (MER-08).
--   2. 20261127122306  the minute cron that wakes the page worker.
--
-- Nothing here changes a live rule: every row the reader writes is a draft until the owner
-- approves it.

-- ===========================================================================================
-- 20261127122217_mm_manual_reader_schema.sql
-- ===========================================================================================
-- Maintenance rebuild step 3: the owner's manual reader (docs/maintenance-enterprise-rebuild-review.md
-- B4 and MER-08). Server side only; no screen changes.
--
-- 1. maintenance_task_templates gains the first-time interval a manual prints, and a short note that
--    says why a draft needs checking (never a silent guess).
-- 2. maintenance_manual gains the plain reason a read stopped.
-- 3. The page queue: one row per page of the maintenance table, read one page per job.
-- 4. The queue's worker functions, the page-draft writer, and the approve / reject / stop functions.
--
-- Step 1 owns the manual table itself and the rule columns; this file only adds to it.

-- ---------------------------------------------------------------------------
-- 1. Rule columns: the first-time interval, and the draft's note
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_task_templates
  ADD COLUMN IF NOT EXISTS first_interval_km integer,
  ADD COLUMN IF NOT EXISTS first_interval_months integer,
  ADD COLUMN IF NOT EXISTS draft_note text;

COMMENT ON COLUMN public.maintenance_task_templates.first_interval_km IS
  'The first-time distance a manual prints for a part (the first service only), or null.';
COMMENT ON COLUMN public.maintenance_task_templates.first_interval_months IS
  'The first-time months a manual prints for a part (the first service only), or null.';
COMMENT ON COLUMN public.maintenance_task_templates.draft_note IS
  'Drafts only: why this read needs a person (no part type matched, a weak match, no interval printed).';

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_first_interval_km_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_first_interval_km_check
  CHECK (first_interval_km IS NULL OR first_interval_km > 0);

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_first_interval_months_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_first_interval_months_check
  CHECK (first_interval_months IS NULL OR (first_interval_months > 0 AND first_interval_months <= 600));

-- ---------------------------------------------------------------------------
-- 2. Manual columns: the plain reason a read stopped
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_manual
  ADD COLUMN IF NOT EXISTS stop_reason text;

COMMENT ON COLUMN public.maintenance_manual.stop_reason IS
  'Plain words for why the read was stopped (the owner pressed Stop, or the file failed a check).';

-- ---------------------------------------------------------------------------
-- 3. The page queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_manual_page_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id uuid NOT NULL REFERENCES public.maintenance_manual (id) ON DELETE CASCADE,
  page_no integer NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  error text,
  rows_found integer,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_manual_page_job_page_check CHECK (page_no >= 1),
  CONSTRAINT maintenance_manual_page_job_status_check
    CHECK (status IN ('queued', 'reading', 'done', 'failed', 'skipped')),
  CONSTRAINT maintenance_manual_page_job_attempts_check CHECK (attempts >= 0),
  CONSTRAINT maintenance_manual_page_job_failed_reason_check
    CHECK (status <> 'failed' OR length(btrim(coalesce(error, ''))) >= 3),
  -- One row per page of a manual. Reading the same page twice updates its row, never adds a second.
  CONSTRAINT maintenance_manual_page_job_once UNIQUE (manual_id, page_no)
);

COMMENT ON TABLE public.maintenance_manual_page_job IS
  'One row per page of a manual''s maintenance table, read one page per job (step 3). Server only.';

CREATE INDEX IF NOT EXISTS idx_mmpj_manual_page
  ON public.maintenance_manual_page_job (manual_id, page_no);

CREATE INDEX IF NOT EXISTS idx_mmpj_due
  ON public.maintenance_manual_page_job (next_attempt_at)
  WHERE status = 'queued';

DROP TRIGGER IF EXISTS maintenance_manual_page_job_updated_at ON public.maintenance_manual_page_job;
CREATE TRIGGER maintenance_manual_page_job_updated_at
  BEFORE UPDATE ON public.maintenance_manual_page_job
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- One row, so two worker runs can never overlap (same shape as part_picture_worker_lock).
CREATE TABLE IF NOT EXISTS public.maintenance_manual_worker_lock (
  id integer PRIMARY KEY,
  holder uuid,
  held_until timestamptz,
  CONSTRAINT maintenance_manual_worker_lock_one_row CHECK (id = 1)
);

INSERT INTO public.maintenance_manual_worker_lock (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Access: server only, exactly like maintenance_manual (step 1)
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_manual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_manual_page_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_manual_worker_lock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_manual_page_job_no_direct ON public.maintenance_manual_page_job;
CREATE POLICY maintenance_manual_page_job_no_direct
  ON public.maintenance_manual_page_job
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS maintenance_manual_worker_lock_no_direct ON public.maintenance_manual_worker_lock;
CREATE POLICY maintenance_manual_worker_lock_no_direct
  ON public.maintenance_manual_worker_lock
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.maintenance_manual_page_job FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.maintenance_manual_worker_lock FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.maintenance_manual_page_job TO service_role;
GRANT ALL ON TABLE public.maintenance_manual_worker_lock TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Worker lease
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.maintenance_manual_try_worker_lease(
  p_holder uuid,
  p_held_until timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.maintenance_manual_worker_lock
  SET holder = p_holder, held_until = p_held_until
  WHERE id = 1
    AND (held_until IS NULL OR held_until < now());
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.maintenance_manual_release_worker_lease(p_holder uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.maintenance_manual_worker_lock
  SET held_until = NULL
  WHERE id = 1 AND holder = p_holder;
$$;

-- Claim the next pages. Atomic (FOR UPDATE SKIP LOCKED), so two runs can never take the same page,
-- and a page still leased by a live run is skipped.
CREATE OR REPLACE FUNCTION public.maintenance_manual_claim_pages(
  p_limit integer DEFAULT 3,
  p_lease_seconds integer DEFAULT 180
)
RETURNS SETOF public.maintenance_manual_page_job
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := GREATEST(0, LEAST(COALESCE(p_limit, 3), 20));
  v_lease integer := GREATEST(30, LEAST(COALESCE(p_lease_seconds, 180), 1800));
BEGIN
  IF v_limit = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT j.id
    FROM public.maintenance_manual_page_job j
    JOIN public.maintenance_manual m ON m.id = j.manual_id
    WHERE j.status = 'queued'
      AND m.status = 'reading'
      AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= now())
      AND (j.lease_until IS NULL OR j.lease_until < now())
    ORDER BY j.next_attempt_at NULLS FIRST, j.manual_id, j.page_no
    LIMIT v_limit
    FOR UPDATE OF j SKIP LOCKED
  )
  UPDATE public.maintenance_manual_page_job j
  SET status = 'reading',
      lease_until = now() + make_interval(secs => v_lease),
      started_at = COALESCE(j.started_at, now()),
      updated_at = now()
  FROM due
  WHERE j.id = due.id
  RETURNING j.*;
END;
$$;

-- A page still 'reading' after its lease died goes back to the queue. Attempts are kept.
CREATE OR REPLACE FUNCTION public.maintenance_manual_sweep_stuck()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.maintenance_manual_page_job
  SET status = 'queued',
      lease_until = NULL,
      next_attempt_at = now(),
      updated_at = now()
  WHERE status = 'reading'
    AND lease_until IS NOT NULL
    AND lease_until < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Counted only when a Gemini call is really sent.
CREATE OR REPLACE FUNCTION public.maintenance_manual_increment_page_attempts(p_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.maintenance_manual_page_job
  SET attempts = attempts + 1, updated_at = now()
  WHERE id = p_id
  RETURNING attempts;
$$;

CREATE OR REPLACE FUNCTION public.maintenance_manual_page_requeue(
  p_id uuid,
  p_next_attempt_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.maintenance_manual_page_job
  SET status = 'queued',
      lease_until = NULL,
      next_attempt_at = COALESCE(p_next_attempt_at, now()),
      updated_at = now()
  WHERE id = p_id;
$$;

-- Give the attempt back (a budget pause, a key refusal, an R2 hiccup): the call never happened.
CREATE OR REPLACE FUNCTION public.maintenance_manual_page_requeue_give_back(
  p_id uuid,
  p_next_attempt_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.maintenance_manual_page_job
  SET status = 'queued',
      lease_until = NULL,
      attempts = GREATEST(0, attempts - 1),
      next_attempt_at = COALESCE(p_next_attempt_at, now()),
      updated_at = now()
  WHERE id = p_id;
$$;

-- Keep the manual's "page N of M" and its status true after a page changes state.
CREATE OR REPLACE FUNCTION public.maintenance_manual_refresh_progress(p_manual_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_finished integer := 0;
  v_pending integer := 0;
  v_from integer;
  v_to integer;
  v_status text;
BEGIN
  SELECT
    count(*) FILTER (WHERE j.status IN ('done', 'failed', 'skipped')),
    count(*) FILTER (WHERE j.status IN ('queued', 'reading')),
    m.page_from,
    m.page_to,
    m.status
  INTO v_finished, v_pending, v_from, v_to, v_status
  FROM public.maintenance_manual m
  LEFT JOIN public.maintenance_manual_page_job j ON j.manual_id = m.id
  WHERE m.id = p_manual_id
  GROUP BY m.page_from, m.page_to, m.status;

  IF v_from IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.maintenance_manual
  SET progress_page = LEAST(v_to, v_from + v_finished - 1),
      status = CASE
        WHEN v_pending = 0 AND status = 'reading' THEN 'waiting_check'
        ELSE status
      END,
      updated_at = now()
  WHERE id = p_manual_id;
END;
$$;

-- A page reached its end state: done, failed (with a plain reason) or skipped.
CREATE OR REPLACE FUNCTION public.maintenance_manual_finish_page(
  p_job_id uuid,
  p_status text,
  p_rows_found integer DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_manual uuid;
BEGIN
  IF p_status NOT IN ('done', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'a page can only finish as done, failed or skipped';
  END IF;

  UPDATE public.maintenance_manual_page_job
  SET status = p_status,
      rows_found = COALESCE(p_rows_found, rows_found),
      error = CASE
        WHEN p_status = 'failed'
          THEN COALESCE(NULLIF(btrim(p_error), ''), 'This page could not be read.')
        ELSE error
      END,
      lease_until = NULL,
      finished_at = now(),
      updated_at = now()
  WHERE id = p_job_id
  RETURNING manual_id INTO v_manual;

  IF v_manual IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.maintenance_manual_refresh_progress(v_manual);
END;
$$;

-- Queue pages of a manual (used by "uploaded" for the whole range and by "reread" for chosen pages).
-- Out-of-range pages are refused. Re-queueing a page keeps its row and resets it.
CREATE OR REPLACE FUNCTION public.maintenance_manual_queue_pages(
  p_manual_id uuid,
  p_pages integer[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_manual public.maintenance_manual%ROWTYPE;
  v_bad integer;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_manual FROM public.maintenance_manual WHERE id = p_manual_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual % not found', p_manual_id;
  END IF;

  SELECT count(*) INTO v_bad
  FROM unnest(COALESCE(p_pages, ARRAY[]::integer[])) AS p
  WHERE p < v_manual.page_from OR p > v_manual.page_to;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'page outside %-%', v_manual.page_from, v_manual.page_to
      USING HINT = 'Only the page range of the maintenance table can be read.';
  END IF;

  INSERT INTO public.maintenance_manual_page_job (manual_id, page_no, status, next_attempt_at)
  SELECT p_manual_id, p, 'queued', now()
  FROM unnest(COALESCE(p_pages, ARRAY[]::integer[])) AS p
  ON CONFLICT (manual_id, page_no) DO UPDATE
  SET status = 'queued',
      attempts = 0,
      error = NULL,
      rows_found = NULL,
      lease_until = NULL,
      next_attempt_at = now(),
      started_at = NULL,
      finished_at = NULL,
      updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.maintenance_manual
  SET status = 'reading',
      stop_reason = NULL,
      updated_at = now()
  WHERE id = p_manual_id
    AND status IN ('reading', 'waiting_check', 'checked', 'stopped');

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Page drafts: re-reading a page replaces that page's drafts only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.maintenance_manual_replace_page_drafts(
  p_manual_id uuid,
  p_page_no integer,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_manual public.maintenance_manual%ROWTYPE;
  v_inserted integer := 0;
BEGIN
  SELECT * INTO v_manual FROM public.maintenance_manual WHERE id = p_manual_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual % not found', p_manual_id;
  END IF;

  IF p_page_no < v_manual.page_from OR p_page_no > v_manual.page_to THEN
    RAISE EXCEPTION 'page % outside %-%', p_page_no, v_manual.page_from, v_manual.page_to;
  END IF;

  -- Only this page's drafts. An approved (active) rule is never touched, and neither is
  -- another page's draft.
  DELETE FROM public.maintenance_task_templates t
  WHERE t.manual_id = p_manual_id
    AND t.evidence_page = p_page_no
    AND t.status = 'draft';

  WITH input AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS x(
      component_id uuid,
      task_name text,
      task_code text,
      interval_km integer,
      interval_months integer,
      severe_interval_km integer,
      severe_interval_months integer,
      severe_same_as_normal boolean,
      first_interval_km integer,
      first_interval_months integer,
      confidence text,
      draft_note text
    )
  ), inserted AS (
    INSERT INTO public.maintenance_task_templates (
      task_name,
      task_code,
      template_scope,
      platform_id,
      component_id,
      interval_km,
      interval_months,
      severe_interval_km,
      severe_interval_months,
      severe_same_as_normal,
      first_interval_km,
      first_interval_months,
      status,
      source_type,
      confidence,
      manual_id,
      evidence_page,
      -- A car-maker part rule must name where it came from (step 1's evidence check). The readable
      -- address is the manual row plus the page; this column names the stored file itself.
      evidence_url,
      applicable_vehicle_classes,
      draft_note
    )
    SELECT
      left(COALESCE(NULLIF(btrim(i.task_name), ''), 'Manual row'), 120),
      NULLIF(btrim(i.task_code), ''),
      'platform',
      v_manual.platform_id,
      i.component_id,
      i.interval_km,
      i.interval_months,
      i.severe_interval_km,
      i.severe_interval_months,
      COALESCE(i.severe_same_as_normal, false),
      i.first_interval_km,
      i.first_interval_months,
      'draft',
      'maker_manual',
      CASE WHEN i.confidence IN ('likely', 'uncertain', 'confirmed') THEN i.confidence ELSE 'uncertain' END,
      p_manual_id,
      p_page_no,
      'r2:private/' || v_manual.file_key,
      ARRAY['car']::text[],
      NULLIF(btrim(i.draft_note), '')
    FROM input i
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  RETURN v_inserted;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Approve / reject / stop (the owner's calls; the routes only check who is asking)
-- ---------------------------------------------------------------------------
-- With p_rule_ids null: every draft that is not needs-checking (confidence = 'uncertain').
-- Rows the overlap guard turns into needs_checking are reported with became_active = false.
CREATE OR REPLACE FUNCTION public.maintenance_manual_approve(
  p_manual_id uuid,
  p_rule_ids uuid[] DEFAULT NULL,
  p_actor uuid DEFAULT NULL
)
RETURNS TABLE (rule_id uuid, component_id uuid, became_active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.maintenance_manual m WHERE m.id = p_manual_id) THEN
    RAISE EXCEPTION 'manual % not found', p_manual_id;
  END IF;

  SELECT array_agg(t.id) INTO v_ids
  FROM public.maintenance_task_templates t
  WHERE t.manual_id = p_manual_id
    AND t.status = 'draft'
    AND (
      (p_rule_ids IS NOT NULL AND t.id = ANY (p_rule_ids))
      OR (p_rule_ids IS NULL AND t.confidence <> 'uncertain')
    );

  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RETURN;
  END IF;

  UPDATE public.maintenance_task_templates t
  SET status = 'active',
      confidence = 'confirmed',
      verified_by = p_actor,
      verified_at = now(),
      updated_by = p_actor,
      updated_at = now()
  WHERE t.id = ANY (v_ids);

  UPDATE public.maintenance_manual
  SET status = 'checked',
      checked_by = p_actor,
      checked_at = now(),
      updated_at = now()
  WHERE id = p_manual_id
    AND status <> 'rejected';

  RETURN QUERY
  SELECT t.id, t.component_id, (t.status = 'active')
  FROM public.maintenance_task_templates t
  WHERE t.id = ANY (v_ids)
  ORDER BY t.task_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.maintenance_manual_reject(
  p_manual_id uuid,
  p_reason text,
  p_actor uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_retired integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.maintenance_manual m WHERE m.id = p_manual_id) THEN
    RAISE EXCEPTION 'manual % not found', p_manual_id;
  END IF;

  IF length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required to reject a manual.';
  END IF;

  UPDATE public.maintenance_task_templates t
  SET status = 'retired',
      updated_by = p_actor,
      updated_at = now()
  WHERE t.manual_id = p_manual_id
    AND t.status = 'draft';
  GET DIAGNOSTICS v_retired = ROW_COUNT;

  UPDATE public.maintenance_manual
  SET status = 'rejected',
      reject_reason = v_reason,
      checked_by = p_actor,
      checked_at = now(),
      updated_at = now()
  WHERE id = p_manual_id;

  RETURN v_retired;
END;
$$;

CREATE OR REPLACE FUNCTION public.maintenance_manual_stop(
  p_manual_id uuid,
  p_reason text DEFAULT NULL,
  p_actor uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_skipped integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.maintenance_manual m WHERE m.id = p_manual_id) THEN
    RAISE EXCEPTION 'manual % not found', p_manual_id;
  END IF;

  -- Pages not started are skipped; drafts already written are kept for the owner to look at.
  UPDATE public.maintenance_manual_page_job j
  SET status = 'skipped',
      lease_until = NULL,
      finished_at = now(),
      updated_at = now()
  WHERE j.manual_id = p_manual_id
    AND j.status IN ('queued', 'reading');
  GET DIAGNOSTICS v_skipped = ROW_COUNT;

  UPDATE public.maintenance_manual
  SET status = 'stopped',
      stop_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'Stopped by the owner.'),
      checked_by = p_actor,
      checked_at = now(),
      updated_at = now()
  WHERE id = p_manual_id;

  PERFORM public.maintenance_manual_refresh_progress(p_manual_id);

  RETURN v_skipped;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants: server only
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.maintenance_manual_try_worker_lease(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_release_worker_lease(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_claim_pages(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_sweep_stuck() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_increment_page_attempts(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_page_requeue(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_page_requeue_give_back(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_refresh_progress(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_finish_page(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_queue_pages(uuid, integer[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_replace_page_drafts(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_approve(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_reject(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_stop(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.maintenance_manual_try_worker_lease(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_release_worker_lease(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_claim_pages(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_sweep_stuck() TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_increment_page_attempts(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_page_requeue(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_page_requeue_give_back(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_refresh_progress(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_finish_page(uuid, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_queue_pages(uuid, integer[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_replace_page_drafts(uuid, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_approve(uuid, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_reject(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_stop(uuid, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261127122217', 'mm_manual_reader_schema') ON CONFLICT (version) DO NOTHING;

-- ===========================================================================================
-- 20261127122306_mm_manual_reader_cron.sql
-- ===========================================================================================
-- Maintenance rebuild step 3: the minute cron that wakes the manual page worker.
--
-- A database job has no login token, so the worker function (maintenance-manual-worker) is deployed with
-- verify_jwt = false and checks this secret itself. Same shape as 20261126090807_part_picture_cron.sql.

CREATE OR REPLACE FUNCTION private.maintenance_manual_functions_url(path text)
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

ALTER FUNCTION private.maintenance_manual_functions_url(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.maintenance_manual_functions_url(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.maintenance_manual_functions_url(text) TO postgres;

-- Every minute: the worker reads a few pages, inside its own time budget.
CREATE OR REPLACE FUNCTION private.invoke_maintenance_manual_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  -- Nothing to read: no call, no net row. Only a due queued page or a dead lease wakes the worker.
  IF NOT EXISTS (
    SELECT 1 FROM public.maintenance_manual_page_job j
    WHERE (j.status = 'queued' AND j.next_attempt_at <= now())
       OR (j.status = 'reading' AND j.lease_until < now())
  ) THEN
    RETURN NULL;
  END IF;

  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;

  SELECT net.http_post(
    url := private.maintenance_manual_functions_url('maintenance-manual-worker/run'),
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

ALTER FUNCTION private.invoke_maintenance_manual_worker() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.invoke_maintenance_manual_worker() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.invoke_maintenance_manual_worker() TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'maintenance-manual-worker';
    PERFORM cron.schedule(
      'maintenance-manual-worker',
      '* * * * *',
      $cron$SELECT private.invoke_maintenance_manual_worker();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped maintenance-manual-worker cron job';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261127122306', 'mm_manual_reader_cron') ON CONFLICT (version) DO NOTHING;

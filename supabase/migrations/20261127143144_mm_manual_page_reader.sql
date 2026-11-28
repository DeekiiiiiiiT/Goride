-- Maintenance rebuild step 3 reader choice (DeepSeek, with Gemini as the backup): the page job records which
-- reader produced its rows, so a DeepSeek page that had to be read again by Gemini is visible instead of silent.
--
-- Small on purpose: one column on the page queue, and the finish function that writes it. The reader itself is a
-- setting (kv_store: `maintenance_manual:settings`), not a database value, so no data is backfilled.

-- ---------------------------------------------------------------------------
-- 1. The reader a page's rows came from
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_manual_page_job
  ADD COLUMN IF NOT EXISTS reader text;

COMMENT ON COLUMN public.maintenance_manual_page_job.reader IS
  'Which reader produced this page''s rows (deepseek or gemini); null for a page read before this was recorded.';

ALTER TABLE public.maintenance_manual_page_job
  DROP CONSTRAINT IF EXISTS maintenance_manual_page_job_reader_check;

ALTER TABLE public.maintenance_manual_page_job
  ADD CONSTRAINT maintenance_manual_page_job_reader_check
  CHECK (reader IS NULL OR reader IN ('deepseek', 'gemini'));

-- ---------------------------------------------------------------------------
-- 2. finish_page records the reader (only for a page that was really read)
-- ---------------------------------------------------------------------------
-- The 4-argument version from step 3 would otherwise stay as a second function and keep answering calls that do
-- not pass a reader.
DROP FUNCTION IF EXISTS public.maintenance_manual_finish_page(uuid, text, integer, text);

CREATE OR REPLACE FUNCTION public.maintenance_manual_finish_page(
  p_job_id uuid,
  p_status text,
  p_rows_found integer DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_reader text DEFAULT NULL
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
      -- Only a page that was really read has a reader. A failed read keeps whatever it had (null after a requeue).
      reader = CASE
        WHEN p_status = 'done' AND p_reader IN ('deepseek', 'gemini') THEN p_reader
        ELSE reader
      END,
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

-- ---------------------------------------------------------------------------
-- 3. Re-queueing a page forgets the old reader (a re-read may use a different one)
-- ---------------------------------------------------------------------------
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
      reader = NULL,
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
-- 4. Grants: server only
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.maintenance_manual_finish_page(uuid, text, integer, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_queue_pages(uuid, integer[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.maintenance_manual_finish_page(uuid, text, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_queue_pages(uuid, integer[]) TO service_role;

NOTIFY pgrst, 'reload schema';

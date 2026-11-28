-- Maintenance rebuild step 6b — "documents in, values out" (docs/maintenance-enterprise-rebuild-review.md,
-- DOC-02 … DOC-05). Database half only; Dominion's screens are built separately.
--
-- 1. A manual now says what kind of document it is: a maintenance sheet/booklet (`schedule`) or an owner's
--    manual (`owners_manual`). A `schedule` document is read for intervals only; an owner's manual is read for
--    specs and for any intervals it prints (DOC-02).
-- 2. Its pages are a LIST, not one range: the useful pages of an owner's manual sit in several places (this
--    book: PDF 3, 406-411, 416-417, 524-530). `page_from`/`page_to` stay as the min/max of the list, because
--    every existing reader, page job and screen still reads them (DOC-03).
-- 3. `page_offset` turns a PDF page into the page number printed on it (printed = PDF - offset), so every page
--    a person sees is the printed one while stored rows keep the PDF page (DOC-04).
-- 4. A dated document covers a range of model years, and every rule made from it copies that range into the
--    rule's own `year_from`/`year_to` (DOC-05).
-- 5. The 27 Nov data fix: the Roomy sheet is dated 1 June 2021, so the eight rules approved from it are bound
--    to 2020 onward, and each gets a `likely` 2016-2020 draft copy until a 2016-2020 document is loaded
--    (MDV-13).
--
-- Nothing is dropped and nothing is renamed: old rows keep their page range and read exactly as before.

-- ---------------------------------------------------------------------------
-- 1. The manual's document shape
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_manual
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'schedule',
  ADD COLUMN IF NOT EXISTS pages integer[],
  ADD COLUMN IF NOT EXISTS page_offset integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS year_from integer,
  ADD COLUMN IF NOT EXISTS year_to integer,
  ADD COLUMN IF NOT EXISTS printed_date date;

COMMENT ON COLUMN public.maintenance_manual.doc_type IS
  'schedule = maintenance booklet / maintenance sheet (intervals only); owners_manual = the car maker''s owner''s manual (specs, plus any intervals it prints).';
COMMENT ON COLUMN public.maintenance_manual.pages IS
  'The PDF pages to read, in one list (e.g. {3,406,407,...,530}). page_from/page_to are kept as its min/max.';
COMMENT ON COLUMN public.maintenance_manual.page_offset IS
  'Printed page = PDF page - this. 4 for the Japanese Roomy book (PDF 409 is printed 405).';
COMMENT ON COLUMN public.maintenance_manual.year_from IS
  'First model year this document speaks for, from its printed date and the catalogue years the owner confirms.';
COMMENT ON COLUMN public.maintenance_manual.year_to IS
  'Last model year, or null for "from year_from onward". Copied into every rule made from this manual.';
COMMENT ON COLUMN public.maintenance_manual.printed_date IS
  'The date printed on the document (1 June 2021 on the Roomy sheet). Null when the document prints none.';

ALTER TABLE public.maintenance_manual
  DROP CONSTRAINT IF EXISTS maintenance_manual_doc_type_check;
ALTER TABLE public.maintenance_manual
  ADD CONSTRAINT maintenance_manual_doc_type_check
  CHECK (doc_type IN ('schedule', 'owners_manual'));

ALTER TABLE public.maintenance_manual
  DROP CONSTRAINT IF EXISTS maintenance_manual_page_offset_check;
ALTER TABLE public.maintenance_manual
  ADD CONSTRAINT maintenance_manual_page_offset_check
  CHECK (page_offset BETWEEN -50 AND 50);

ALTER TABLE public.maintenance_manual
  DROP CONSTRAINT IF EXISTS maintenance_manual_years_check;
ALTER TABLE public.maintenance_manual
  ADD CONSTRAINT maintenance_manual_years_check
  CHECK (
    (year_from IS NULL OR year_from BETWEEN 1900 AND 2100)
    AND (year_to IS NULL OR year_to BETWEEN 1900 AND 2100)
    AND (year_from IS NULL OR year_to IS NULL OR year_from <= year_to)
  );

ALTER TABLE public.maintenance_manual
  DROP CONSTRAINT IF EXISTS maintenance_manual_printed_date_check;
ALTER TABLE public.maintenance_manual
  ADD CONSTRAINT maintenance_manual_printed_date_check
  CHECK (printed_date IS NULL OR printed_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31');

-- A year range with no start is not a range.
ALTER TABLE public.maintenance_manual
  DROP CONSTRAINT IF EXISTS maintenance_manual_year_from_with_year_to_check;
ALTER TABLE public.maintenance_manual
  DROP CONSTRAINT IF EXISTS maintenance_manual_year_to_needs_year_from_check;
ALTER TABLE public.maintenance_manual
  ADD CONSTRAINT maintenance_manual_year_to_needs_year_from_check
  CHECK (year_to IS NULL OR year_from IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 2. pages and page_from/page_to are one fact, kept in step in both directions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_mm_manual_pages_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_bad integer;
BEGIN
  IF NEW.pages IS NULL OR cardinality(NEW.pages) = 0 THEN
    -- An older caller (and every row created before step 6b) gives a range: the list is that range. The table's
    -- own page-range check stays the one that judges it, so a bad range still answers with that constraint.
    NEW.pages := ARRAY(
      SELECT generate_series(NEW.page_from, NEW.page_to)
    );
  ELSE
    NEW.pages := ARRAY(
      SELECT DISTINCT p
      FROM unnest(NEW.pages) AS p
      WHERE p IS NOT NULL
      ORDER BY p
    );

    IF cardinality(NEW.pages) = 0 THEN
      NEW.pages := ARRAY(SELECT generate_series(NEW.page_from, NEW.page_to));
    ELSE
      -- A list can name a page the file does not have while its min and max still look reasonable, so every
      -- page is checked. A range is judged by the table's own constraint above.
      SELECT count(*) INTO v_bad
      FROM unnest(NEW.pages) AS p
      WHERE p < 1 OR p > NEW.page_count;

      IF v_bad > 0 THEN
        RAISE EXCEPTION 'page % is outside this PDF (% pages)', v_bad, NEW.page_count
          USING HINT = 'Every page in the list must be a page of the file.';
      END IF;
    END IF;
  END IF;

  -- The list is the truth; the range is its min and max, so every existing reader still works.
  NEW.page_from := NEW.pages[1];
  NEW.page_to := NEW.pages[cardinality(NEW.pages)];

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_mm_manual_pages_sync() IS
  'Keeps maintenance_manual.pages and page_from/page_to one fact: a list sets the range, a range fills the list.';

DROP TRIGGER IF EXISTS mm_manual_pages_sync ON public.maintenance_manual;
CREATE TRIGGER mm_manual_pages_sync
  BEFORE INSERT OR UPDATE OF pages, page_from, page_to, page_count ON public.maintenance_manual
  FOR EACH ROW EXECUTE FUNCTION public.trg_mm_manual_pages_sync();

-- Backfill every row already on file from its range, then make the list required.
UPDATE public.maintenance_manual
SET pages = ARRAY(SELECT generate_series(page_from, page_to))
WHERE pages IS NULL OR cardinality(pages) = 0;

ALTER TABLE public.maintenance_manual
  ALTER COLUMN pages SET NOT NULL;

CREATE INDEX IF NOT EXISTS maintenance_manual_doc_type_idx
  ON public.maintenance_manual (platform_id, doc_type);

-- ---------------------------------------------------------------------------
-- 3. A page must be one of the manual's listed pages (not merely inside its range)
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
  WHERE NOT (p = ANY (v_manual.pages));

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'page outside %', array_to_string(v_manual.pages, ',')
      USING HINT = 'Only the pages listed on the manual can be read.';
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

-- "Reading page 3 of 16": the count is the list, not the span between its ends.
CREATE OR REPLACE FUNCTION public.maintenance_manual_refresh_progress(p_manual_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_finished integer := 0;
  v_pending integer := 0;
  v_pages integer[];
  v_status text;
BEGIN
  SELECT
    count(*) FILTER (WHERE j.status IN ('done', 'failed', 'skipped')),
    count(*) FILTER (WHERE j.status IN ('queued', 'reading')),
    m.pages,
    m.status
  INTO v_finished, v_pending, v_pages, v_status
  FROM public.maintenance_manual m
  LEFT JOIN public.maintenance_manual_page_job j ON j.manual_id = m.id
  WHERE m.id = p_manual_id
  GROUP BY m.pages, m.status;

  IF v_pages IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.maintenance_manual
  SET progress_page = v_pages[LEAST(cardinality(v_pages), GREATEST(1, v_finished))],
      status = CASE
        WHEN v_pending = 0 AND status = 'reading' THEN 'waiting_check'
        ELSE status
      END,
      updated_at = now()
  WHERE id = p_manual_id;
END;
$$;

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

  IF NOT (p_page_no = ANY (v_manual.pages)) THEN
    RAISE EXCEPTION 'page % outside %', p_page_no, array_to_string(v_manual.pages, ',');
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
      -- DOC-05: a rule made from a dated document carries that document's years.
      year_from,
      year_to,
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
      v_manual.year_from,
      v_manual.year_to,
      NULLIF(btrim(i.draft_note), '')
    FROM input i
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  RETURN v_inserted;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Every rule made from a manual copies the manual's years (DOC-05)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_mtt_years_from_manual()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Only when the caller did not set the years itself: a deliberate 2016-2020 copy of a 2020-on rule keeps
  -- its own years instead of being pulled back to the manual's.
  IF NEW.manual_id IS NOT NULL AND NEW.year_from IS NULL AND NEW.year_to IS NULL THEN
    SELECT m.year_from, m.year_to
    INTO NEW.year_from, NEW.year_to
    FROM public.maintenance_manual m
    WHERE m.id = NEW.manual_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_mtt_years_from_manual() IS
  'A rule made from a manual copies the manual''s year range, so a 2021 sheet never silently covers a 2016 car.';

-- Named to fire before the other template triggers (Postgres runs BEFORE triggers in name order), so the
-- overlap guard sees the years the rule will actually carry.
DROP TRIGGER IF EXISTS mm_a_mtt_years_from_manual ON public.maintenance_task_templates;
CREATE TRIGGER mm_a_mtt_years_from_manual
  BEFORE INSERT OR UPDATE OF manual_id ON public.maintenance_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.trg_mtt_years_from_manual();

-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 5. Binding a dated document to the years it speaks for (DOC-05, MDV-13)
-- ---------------------------------------------------------------------------
-- One call does the whole job, so the same move can be made for any dated sheet and can be tested:
--   * the manual is bound to its years,
--   * every rule approved from it is bound to the same years,
--   * each of those rules gets a draft copy for the earlier years, marked "likely" with the note the owner
--     wrote, until a document for those years is loaded.
-- The eight Roomy rules were approved as a set, so the overlap guard is off for the length of the call: it
-- would otherwise re-open one rule just because its twin is live on the same part.
CREATE OR REPLACE FUNCTION public.mm_manual_bind_years(
  p_manual_id uuid,
  p_year_from integer,
  p_year_to integer DEFAULT NULL,
  p_copy_from integer DEFAULT NULL,
  p_copy_to integer DEFAULT NULL,
  p_copy_note text DEFAULT NULL
)
RETURNS TABLE (action text, rule_id uuid, task_code text, task_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
  v_new uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.maintenance_manual m WHERE m.id = p_manual_id) THEN
    RAISE EXCEPTION 'manual % not found', p_manual_id;
  END IF;

  IF p_year_from IS NULL THEN
    RAISE EXCEPTION 'a document needs a first year';
  END IF;

  UPDATE public.maintenance_manual
  SET year_from = p_year_from,
      year_to = p_year_to,
      updated_at = now()
  WHERE id = p_manual_id;

  action := 'manual_bound';
  rule_id := NULL;
  task_code := NULL;
  task_name := (SELECT m.title FROM public.maintenance_manual m WHERE m.id = p_manual_id);
  RETURN NEXT;

  BEGIN
    EXECUTE 'ALTER TABLE public.maintenance_task_templates DISABLE TRIGGER mm_mtt_overlap_guard_before';
    EXECUTE 'ALTER TABLE public.maintenance_task_templates DISABLE TRIGGER mm_mtt_overlap_guard_after';

    FOR r IN
      SELECT t.id, t.task_code, t.task_name
      FROM public.maintenance_task_templates t
      WHERE t.manual_id = p_manual_id
        AND t.status = 'active'
        AND t.archived_at IS NULL
      ORDER BY t.task_name
    LOOP
      UPDATE public.maintenance_task_templates
      SET year_from = p_year_from,
          year_to = p_year_to,
          updated_at = now()
      WHERE id = r.id;

      action := 'rule_bound';
      rule_id := r.id;
      task_code := r.task_code;
      task_name := r.task_name;
      RETURN NEXT;
    END LOOP;

    IF p_copy_from IS NOT NULL AND p_copy_to IS NOT NULL THEN
      FOR r IN
        SELECT t.*
        FROM public.maintenance_task_templates t
        WHERE t.manual_id = p_manual_id
          AND t.status = 'active'
          AND t.archived_at IS NULL
        ORDER BY t.task_name
      LOOP
        CONTINUE WHEN EXISTS (
          SELECT 1
          FROM public.maintenance_task_templates d
          WHERE d.platform_id = r.platform_id
            AND d.task_code = left(r.task_code || '-' || p_copy_from || '-' || p_copy_to, 120)
        );

        INSERT INTO public.maintenance_task_templates (
          vehicle_catalog_id, task_name, description, interval_km, interval_months, priority, sort_order,
          frequency_kind, frequency_label, template_scope, task_code, interval_km_max, icon_key, due_kind,
          applicable_vehicle_classes, component_id, platform_id, engine_family_id, is_mandatory, status,
          confidence, source_type, evidence_url, year_from, year_to, severe_interval_km, severe_interval_km_max,
          severe_interval_months, manual_id, evidence_page, market, severe_same_as_normal,
          first_interval_km, first_interval_months, draft_note, created_at, updated_at
        ) VALUES (
          r.vehicle_catalog_id, r.task_name, r.description, r.interval_km, r.interval_months, r.priority,
          r.sort_order, r.frequency_kind, r.frequency_label, r.template_scope,
          left(r.task_code || '-' || p_copy_from || '-' || p_copy_to, 120), r.interval_km_max, r.icon_key,
          r.due_kind, r.applicable_vehicle_classes, r.component_id, r.platform_id, r.engine_family_id,
          r.is_mandatory, 'draft', 'likely', r.source_type, r.evidence_url, p_copy_from, p_copy_to,
          r.severe_interval_km, r.severe_interval_km_max, r.severe_interval_months, r.manual_id,
          r.evidence_page, r.market, r.severe_same_as_normal, r.first_interval_km, r.first_interval_months,
          COALESCE(NULLIF(btrim(p_copy_note), ''), 'Read from the dated sheet. Confirm against a document for these years.'),
          now(), now()
        )
        RETURNING id INTO v_new;

        action := 'copy_created';
        rule_id := v_new;
        task_code := left(r.task_code || '-' || p_copy_from || '-' || p_copy_to, 120);
        task_name := r.task_name;
        RETURN NEXT;
      END LOOP;
    END IF;
    EXECUTE 'ALTER TABLE public.maintenance_task_templates ENABLE TRIGGER mm_mtt_overlap_guard_before';
    EXECUTE 'ALTER TABLE public.maintenance_task_templates ENABLE TRIGGER mm_mtt_overlap_guard_after';
  EXCEPTION WHEN OTHERS THEN
    -- Leaving the guard off for the rest of the migration would hide a real conflict, so put it back.
    EXECUTE 'ALTER TABLE public.maintenance_task_templates ENABLE TRIGGER mm_mtt_overlap_guard_before';
    EXECUTE 'ALTER TABLE public.maintenance_task_templates ENABLE TRIGGER mm_mtt_overlap_guard_after';
    RAISE;
  END;
END;
$$;

COMMENT ON FUNCTION public.mm_manual_bind_years(uuid, integer, integer, integer, integer, text) IS
  'Binds a dated document and its rules to the years it speaks for, and adds a likely draft copy for the earlier years (DOC-05, MDV-13).';

-- The 27 Nov Roomy sheet: printed 1 June 2021, so it speaks for 2020 onward, and the 2016-2020 years get a
-- draft copy of every rule until a 2016-2020 document is loaded.
DO $$
DECLARE
  v_manual uuid := '155b08f1-d9f7-43b1-98b5-8df29d2dcd31';
  r record;
  v_bound integer := 0;
  v_copied integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.maintenance_manual m WHERE m.id = v_manual) THEN
    RAISE NOTICE 'step 6b: the 27 Nov Roomy manual is not on this database; nothing to bind.';
    RETURN;
  END IF;

  UPDATE public.maintenance_manual
  SET doc_type = 'schedule',
      printed_date = COALESCE(printed_date, DATE '2021-06-01'),
      page_offset = COALESCE(page_offset, 0),
      updated_at = now()
  WHERE id = v_manual;

  FOR r IN
    SELECT *
    FROM public.mm_manual_bind_years(
      v_manual,
      2020,
      NULL,
      2016,
      2020,
      'Read from the June 2021 sheet. Confirm against a 2016–2020 document.'
    )
  LOOP
    IF r.action = 'rule_bound' THEN
      v_bound := v_bound + 1;
    ELSIF r.action = 'copy_created' THEN
      v_copied := v_copied + 1;
    END IF;
    RAISE NOTICE 'step 6b: % % (%)', r.action, COALESCE(r.task_code, '-'), r.task_name;
  END LOOP;

  RAISE NOTICE 'step 6b: Roomy sheet bound to 2020 onward; % rule(s) bound, % draft copy/copies for 2016-2020.',
    v_bound, v_copied;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Access: the new columns and functions sit behind the same server-only door
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.trg_mm_manual_pages_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_mtt_years_from_manual() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mm_manual_bind_years(uuid, integer, integer, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_manual_bind_years(uuid, integer, integer, integer, integer, text) TO service_role;

NOTIFY pgrst, 'reload schema';

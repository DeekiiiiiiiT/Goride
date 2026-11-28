-- Maintenance rebuild step 6b â€” "documents in, values out" (docs/maintenance-enterprise-rebuild-review.md).
--
-- PASTE THIS WHOLE FILE into the Supabase SQL editor for the GoRide project, once, top to bottom.
-- It is the three step-6b migrations in filename order, each followed by its logbook line, because the SQL
-- editor never records a migration by itself (see CLAUDE.md, "Migration file dates").
--
-- What it does, in order:
--   1. maintenance_manual gains doc_type, pages[], page_offset, year_from, year_to, printed_date, and the page
--      list becomes the truth page_from/page_to follow; every rule made from a dated manual copies its years;
--      the 27 Nov Roomy sheet is bound to 2020 onward and gets a likely 2016-2020 draft copy of each of its
--      eight rules (the run prints one NOTICE per row changed).
--   2. vehicle_tyre and vehicle_bulb (per catalogue version, server only), the six fluid spec_keys, the three
--      part types (differential oil, transfer oil, air cleaner element), catalog_spec_value may record
--      trust_route 'maker_document', and the Roomy's existing draft rows for those parts are matched.
--   3. maintenance_manual_spec_row plus the approve / reject / current-value functions, every approved value
--      written to the ticked versions only and logged in dominion_audit_log.
--
-- Nothing is dropped or renamed. Every statement is safe to re-run (IF NOT EXISTS / ON CONFLICT / CREATE OR
-- REPLACE); the logbook lines are ON CONFLICT DO NOTHING.

-- ===========================================================================
-- 20261127191501  mm_manual_document_fields
-- ===========================================================================

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

-- Logbook: record the migration, because the SQL editor does not.
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261127191501', 'mm_manual_document_fields') ON CONFLICT (version) DO NOTHING;


-- ===========================================================================
-- 20261127191502  mm_tyre_bulb_spec_keys_part_types
-- ===========================================================================

-- Maintenance rebuild step 6b — homes for the values an owner's manual prints (DOC-07 … DOC-09, DOC-11).
--
-- 1. `vehicle_tyre` — tyres, pressures and the spare had nowhere to live: vehicle_catalog keeps ONE tire_size
--    string and catalog_spec_value has no pressure key (G1, MDV-05).
-- 2. `vehicle_bulb` — the five bulb keys cannot describe a Toyota lamp table (G2, MDV-06).
-- 3. Six `spec_key` rows for the fluid capacities that had no key: CVT, transfer, differential, washer (G3,
--    MDV-07).
-- 4. Three part types the schedule needs and Roam had no row for: Differential oil, Transfer oil, Air cleaner
--    element (MDV-12). The Roomy's existing DRAFT rows for two of them are pointed at the new types; they stay
--    drafts until the owner approves them.
-- 5. `catalog_spec_value.trust_route` accepts `maker_document`, so a value read from the car maker's own
--    document is distinguishable from a website read (DOC-09).
--
-- Both new tables are per catalogue version (`vehicle_catalog_id`), carry the manual and the page they came
-- from, and sit behind the same server-only door as `maintenance_manual`.

-- ---------------------------------------------------------------------------
-- 1. Tyres, per catalogue version (G1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicle_tyre (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog (id) ON DELETE CASCADE,
  -- front / rear / spare. One row per size, so a standard and an optional size are two rows.
  position text NOT NULL,
  size text NOT NULL,
  load_speed_index text,
  wheel_size text,
  pressure_kpa integer,
  is_optional boolean NOT NULL DEFAULT false,
  source_note text,
  evidence_url text,
  manual_id uuid REFERENCES public.maintenance_manual (id) ON DELETE SET NULL,
  -- The PDF page the figure was read on (DOC-04 keeps PDF pages in stored rows).
  evidence_page integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_tyre_position_check CHECK (position IN ('front', 'rear', 'spare')),
  CONSTRAINT vehicle_tyre_size_check CHECK (length(btrim(size)) >= 3),
  CONSTRAINT vehicle_tyre_pressure_check
    CHECK (pressure_kpa IS NULL OR (pressure_kpa > 0 AND pressure_kpa <= 1500)),
  CONSTRAINT vehicle_tyre_evidence_page_check
    CHECK (evidence_page IS NULL OR evidence_page >= 1),
  -- A version cannot list the same size on the same axle twice.
  CONSTRAINT vehicle_tyre_version_position_size_key UNIQUE (vehicle_catalog_id, position, size)
);

COMMENT ON TABLE public.vehicle_tyre IS
  'Tyres and pressures for one catalogue version (G1, MDV-05). Server only. vehicle_catalog.tire_size stays the one-line summary.';
COMMENT ON COLUMN public.vehicle_tyre.position IS
  'front / rear / spare. front and rear are different sizes on many cars.';
COMMENT ON COLUMN public.vehicle_tyre.is_optional IS
  'True for an alternative size the maker lists (Roomy: 175/55R15 on 15x5J), not for the standard fit.';
COMMENT ON COLUMN public.vehicle_tyre.evidence_page IS
  'The PDF page the figure was read on; screens show the printed page (PDF page - manual.page_offset).';

CREATE INDEX IF NOT EXISTS vehicle_tyre_version_idx
  ON public.vehicle_tyre (vehicle_catalog_id, position, is_optional);

-- ---------------------------------------------------------------------------
-- 2. Bulbs, per catalogue version (G2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicle_bulb (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog (id) ON DELETE CASCADE,
  -- The maker's own wording for the lamp ("Headlamp", "Front turn signal", "Interior").
  position text NOT NULL,
  bulb_ref text NOT NULL,
  -- "60/55" is a real answer, so watts are text, not an integer.
  wattage_w text,
  is_led boolean NOT NULL DEFAULT false,
  grade_note text,
  source_note text,
  evidence_url text,
  manual_id uuid REFERENCES public.maintenance_manual (id) ON DELETE SET NULL,
  evidence_page integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_bulb_position_check CHECK (length(btrim(position)) >= 2),
  CONSTRAINT vehicle_bulb_bulb_ref_check CHECK (length(btrim(bulb_ref)) >= 1),
  CONSTRAINT vehicle_bulb_evidence_page_check
    CHECK (evidence_page IS NULL OR evidence_page >= 1),
  CONSTRAINT vehicle_bulb_version_position_key UNIQUE (vehicle_catalog_id, position)
);

COMMENT ON TABLE public.vehicle_bulb IS
  'Bulbs for one catalogue version (G2, MDV-06). Server only.';
COMMENT ON COLUMN public.vehicle_bulb.is_led IS
  'True for a lamp the maker prints as LED, and for "any lamp not listed is LED" rows.';
COMMENT ON COLUMN public.vehicle_bulb.grade_note IS
  'The maker''s footnote, in plain words: "grade dependent", "with the electric parking brake", "any lamp not listed is LED".';

CREATE INDEX IF NOT EXISTS vehicle_bulb_version_idx
  ON public.vehicle_bulb (vehicle_catalog_id, position);

DROP TRIGGER IF EXISTS vehicle_tyre_updated_at ON public.vehicle_tyre;
CREATE TRIGGER vehicle_tyre_updated_at
  BEFORE UPDATE ON public.vehicle_tyre
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS vehicle_bulb_updated_at ON public.vehicle_bulb;
CREATE TRIGGER vehicle_bulb_updated_at
  BEFORE UPDATE ON public.vehicle_bulb
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. Access: server only, exactly like maintenance_manual
-- ---------------------------------------------------------------------------
ALTER TABLE public.vehicle_tyre ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_bulb ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_tyre_no_direct ON public.vehicle_tyre;
CREATE POLICY vehicle_tyre_no_direct
  ON public.vehicle_tyre
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS vehicle_bulb_no_direct ON public.vehicle_bulb;
CREATE POLICY vehicle_bulb_no_direct
  ON public.vehicle_bulb
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.vehicle_tyre FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.vehicle_bulb FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.vehicle_tyre TO service_role;
GRANT ALL ON TABLE public.vehicle_bulb TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The six fluid keys that had no home (G3)
-- ---------------------------------------------------------------------------
INSERT INTO public.spec_key (key, label, value_type, unit) VALUES
  ('transmission_fluid_capacity_l', 'Transmission fluid capacity', 'number', 'L'),
  ('transfer_oil_grade', 'Transfer oil grade', 'text', NULL),
  ('transfer_oil_capacity_l', 'Transfer oil capacity', 'number', 'L'),
  ('differential_oil_grade', 'Differential oil grade', 'text', NULL),
  ('differential_oil_capacity_l', 'Differential oil capacity', 'number', 'L'),
  ('washer_capacity_l', 'Washer fluid capacity', 'number', 'L')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. A value read from the maker's own document is its own trust route (DOC-09)
-- ---------------------------------------------------------------------------
ALTER TABLE public.catalog_spec_value
  DROP CONSTRAINT IF EXISTS catalog_spec_value_trust_route_check;

ALTER TABLE public.catalog_spec_value
  ADD CONSTRAINT catalog_spec_value_trust_route_check
  CHECK (trust_route IS NULL OR trust_route IN ('a', 'b', 'c', 'owner_browser', 'maker_document'));

COMMENT ON COLUMN public.catalog_spec_value.trust_route IS
  'a/b/c = a catalogue read, owner_browser = the owner looked it up, maker_document = read from the car maker''s own manual (step 6b).';

-- ---------------------------------------------------------------------------
-- 6. Three part types the schedule needs (MDV-12)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_driveline uuid;
  v_filters uuid;
BEGIN
  -- The right parents: whatever the driveline and filter groups are on this database.
  SELECT c.parent_id INTO v_driveline
  FROM public.maintenance_service_categories c
  WHERE c.code = 'transmission' AND c.parent_id IS NOT NULL
  LIMIT 1;

  IF v_driveline IS NULL THEN
    SELECT c.id INTO v_driveline
    FROM public.maintenance_service_categories c
    WHERE c.code = 'sys_transmission' AND c.kind = 'system'
    LIMIT 1;
  END IF;

  SELECT c.parent_id INTO v_filters
  FROM public.maintenance_service_categories c
  WHERE c.code = 'air_filter' AND c.parent_id IS NOT NULL
  LIMIT 1;

  IF v_filters IS NULL THEN
    SELECT c.id INTO v_filters
    FROM public.maintenance_service_categories c
    WHERE c.code = 'sys_filters' AND c.kind = 'system'
    LIMIT 1;
  END IF;

  INSERT INTO public.maintenance_service_categories (
    code, name, plain_name, kind, parent_id, op_code, icon_key, sort_order, is_part,
    part_type_status, status, default_action, position_scheme
  ) VALUES
    ('differential_oil', 'Differential oil', 'Differential oil', 'component', v_driveline,
     'DRV-DIFF', 'wrench', 111, true, 'active', 'active', 'replace', 'none'),
    ('transfer_oil', 'Transfer oil', 'Transfer oil', 'component', v_driveline,
     'DRV-TRANSFER', 'wrench', 112, true, 'active', 'active', 'replace', 'none'),
    ('air_cleaner_element', 'Air cleaner element', 'Air cleaner element', 'component', v_filters,
     'FILT-ACL-ELEM', 'wrench', 71, true, 'active', 'active', 'replace', 'none')
  ON CONFLICT (code) DO NOTHING;

  RAISE NOTICE 'step 6b: part types ready (differential oil, transfer oil, air cleaner element).';
END $$;

-- ---------------------------------------------------------------------------
-- 7. The Roomy's existing draft rows find their new part types (DOC-11)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_manual uuid := '155b08f1-d9f7-43b1-98b5-8df29d2dcd31';
  v_n int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.maintenance_manual m WHERE m.id = v_manual) THEN
    RAISE NOTICE 'step 6b: the Roomy manual is not on this database; no draft rows to match.';
    RETURN;
  END IF;

  UPDATE public.maintenance_task_templates t
  SET component_id = c.id,
      confidence = 'likely',
      draft_note = 'Matched to the new part type. Still a draft until you approve it.',
      updated_at = now()
  FROM public.maintenance_service_categories c
  WHERE c.code = 'differential_oil'
    AND t.manual_id = v_manual
    AND t.status = 'draft'
    AND (t.task_name ILIKE 'Differential oil%' OR t.task_name ILIKE '%ディファレンシャルオイル%');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'step 6b: % differential-oil draft row(s) matched.', v_n;

  UPDATE public.maintenance_task_templates t
  SET component_id = c.id,
      confidence = 'likely',
      draft_note = 'Matched to the new part type. Still a draft until you approve it.',
      updated_at = now()
  FROM public.maintenance_service_categories c
  WHERE c.code = 'air_cleaner_element'
    AND t.manual_id = v_manual
    AND t.status = 'draft'
    AND (t.task_name ILIKE 'Air cleaner element%' OR t.task_name ILIKE '%エアクリーナエレメント%');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'step 6b: % air-cleaner-element draft row(s) matched.', v_n;
END $$;

NOTIFY pgrst, 'reload schema';

-- Logbook: record the migration, because the SQL editor does not.
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261127191502', 'mm_tyre_bulb_spec_keys_part_types') ON CONFLICT (version) DO NOTHING;


-- ===========================================================================
-- 20261127191503  mm_manual_spec_rows
-- ===========================================================================

-- Maintenance rebuild step 6b — the values an owner's manual prints, as draft SPEC ROWS (DOC-06, DOC-10, DOC-12).
--
-- The interval reader already has its home (maintenance_task_templates). A car's fluids, tyres, battery and
-- bulbs do not: they belong to catalogue versions, and a manual is read once per model while the numbers differ
-- per version (2WD 36 L / 4WD 38 L, turbo coolant 5.0 L). So a read produces SPEC ROWS, the owner ticks the
-- versions each row applies to, and approving writes the value to those versions only — with a history line
-- saying who changed what, from which manual and which printed page.
--
-- 1. `maintenance_manual_spec_row` — one row per value read from a page.
-- 2. `maintenance_manual_replace_page_specs` — re-reading a page replaces that page's DRAFT rows only.
-- 3. `maintenance_manual_spec_approve` — writes the value to the ticked versions, and logs every change.
-- 4. `maintenance_manual_spec_reject` — closes a row with a reason.
-- 5. `maintenance_manual_spec_current` — the catalogue's current value per version, for "Now -> Manual".
--
-- Server only, like the manual itself. Nothing here is readable by anon or authenticated.

-- ---------------------------------------------------------------------------
-- 1. The spec row
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_manual_spec_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id uuid NOT NULL REFERENCES public.maintenance_manual (id) ON DELETE CASCADE,
  -- The PDF page the value was read on. Screens show printed_page (this - manual.page_offset).
  evidence_page integer NOT NULL,
  kind text NOT NULL,
  -- What the value is: a spec_key for fluids/battery/fuel, the tyre position, or the lamp position.
  key text NOT NULL,
  -- The value as printed, with its unit and any second figure: {"value":2.9,"unit":"L"}.
  value jsonb NOT NULL,
  -- The page's own remark: "2WD", "4WD", "Turbo", "with the electric parking brake". Null when none.
  applies_to text,
  -- The catalogue versions the owner ticked; pre-ticked from applies_to when the reader could place it.
  version_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  status text NOT NULL DEFAULT 'draft',
  confidence text NOT NULL DEFAULT 'likely',
  draft_note text,
  reject_reason text,
  verified_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_manual_spec_row_kind_check
    CHECK (kind IN ('fluid', 'tyre', 'battery', 'bulb', 'fuel')),
  CONSTRAINT maintenance_manual_spec_row_status_check
    CHECK (status IN ('draft', 'active', 'rejected')),
  CONSTRAINT maintenance_manual_spec_row_confidence_check
    CHECK (confidence IN ('likely', 'uncertain', 'confirmed')),
  CONSTRAINT maintenance_manual_spec_row_key_check CHECK (length(btrim(key)) >= 1),
  CONSTRAINT maintenance_manual_spec_row_page_check CHECK (evidence_page >= 1),
  CONSTRAINT maintenance_manual_spec_row_reject_reason_check
    CHECK (status <> 'rejected' OR length(btrim(coalesce(reject_reason, ''))) >= 10)
);

COMMENT ON TABLE public.maintenance_manual_spec_row IS
  'One value read from one page of an owner''s manual, before and after the owner approves it (step 6b, DOC-06/10/12). Server only.';
COMMENT ON COLUMN public.maintenance_manual_spec_row.key IS
  'Fluid/battery/fuel: a spec_key. Tyre: front/rear/spare. Bulb: the maker''s lamp position.';
COMMENT ON COLUMN public.maintenance_manual_spec_row.applies_to IS
  'The page''s remark that decides which versions the value fits ("4WD", "Turbo", "with the electric parking brake").';
COMMENT ON COLUMN public.maintenance_manual_spec_row.version_ids IS
  'The catalogue versions the value is written to on approval. Pre-ticked from applies_to; the owner can change it.';

CREATE INDEX IF NOT EXISTS maintenance_manual_spec_row_manual_idx
  ON public.maintenance_manual_spec_row (manual_id, status, evidence_page);

DROP TRIGGER IF EXISTS maintenance_manual_spec_row_updated_at ON public.maintenance_manual_spec_row;
CREATE TRIGGER maintenance_manual_spec_row_updated_at
  BEFORE UPDATE ON public.maintenance_manual_spec_row
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.maintenance_manual_spec_row ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_manual_spec_row_no_direct ON public.maintenance_manual_spec_row;
CREATE POLICY maintenance_manual_spec_row_no_direct
  ON public.maintenance_manual_spec_row
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.maintenance_manual_spec_row FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.maintenance_manual_spec_row TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Re-reading a page replaces that page's drafts only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.maintenance_manual_replace_page_specs(
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

  -- An approved spec row is a catalogue value now: it is never deleted by a re-read.
  DELETE FROM public.maintenance_manual_spec_row s
  WHERE s.manual_id = p_manual_id
    AND s.evidence_page = p_page_no
    AND s.status = 'draft';

  WITH input AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS x(
      kind text,
      key text,
      value jsonb,
      applies_to text,
      version_ids uuid[],
      confidence text,
      draft_note text
    )
  ), inserted AS (
    INSERT INTO public.maintenance_manual_spec_row (
      manual_id, evidence_page, kind, key, value, applies_to, version_ids, status, confidence, draft_note
    )
    SELECT
      p_manual_id,
      p_page_no,
      lower(btrim(i.kind)),
      btrim(i.key),
      COALESCE(i.value, '{}'::jsonb),
      NULLIF(btrim(i.applies_to), ''),
      COALESCE(i.version_ids, ARRAY[]::uuid[]),
      'draft',
      CASE WHEN i.confidence IN ('likely', 'uncertain', 'confirmed') THEN i.confidence ELSE 'uncertain' END,
      NULLIF(btrim(i.draft_note), '')
    FROM input i
    WHERE i.kind IN ('fluid', 'tyre', 'battery', 'bulb', 'fuel')
      AND btrim(coalesce(i.key, '')) <> ''
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  RETURN v_inserted;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Approving: the value reaches the ticked versions, and the change is recorded
-- ---------------------------------------------------------------------------
-- One history line per version per target, in the existing catalogue audit table. `before`/`after` carry the
-- old and new value, the manual and the printed page, so a screen or a person can answer "why is this 2.9?".
CREATE OR REPLACE FUNCTION public.mm_spec_history(
  p_actor uuid,
  p_table text,
  p_row_id text,
  p_before jsonb,
  p_after jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.dominion_audit_log (actor, action, table_name, row_id, before, after)
  VALUES (p_actor, 'spec_approve', p_table, p_row_id, p_before, p_after);
$$;

COMMENT ON FUNCTION public.mm_spec_history(uuid, text, text, jsonb, jsonb) IS
  'Appends one catalogue history line for an approved spec value (DOC-12). Append-only table.';

-- Dropped first because its result columns are named after what was written; a re-run must match.
DROP FUNCTION IF EXISTS public.maintenance_manual_spec_approve(uuid, uuid[], uuid);

CREATE OR REPLACE FUNCTION public.maintenance_manual_spec_approve(
  p_spec_id uuid,
  p_version_ids uuid[] DEFAULT NULL,
  p_actor uuid DEFAULT NULL
)
RETURNS TABLE (written_version_id uuid, target_table text, old_value text, new_value text, changed boolean)LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.maintenance_manual_spec_row%ROWTYPE;
  m public.maintenance_manual%ROWTYPE;
  v_ids uuid[];
  v_id uuid;
  v_printed integer;
  v_text text;
  v_old text;
  v_target text;
  v_note text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  SELECT * INTO r FROM public.maintenance_manual_spec_row s WHERE s.id = p_spec_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'spec row % not found', p_spec_id;
  END IF;

  SELECT * INTO m FROM public.maintenance_manual mm WHERE mm.id = r.manual_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual % not found', r.manual_id;
  END IF;

  IF r.status <> 'draft' THEN
    RAISE EXCEPTION 'this value is already %', r.status
      USING HINT = 'Only a draft can be approved.';
  END IF;

  v_ids := COALESCE(NULLIF(p_version_ids, ARRAY[]::uuid[]), r.version_ids);
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'choose at least one version for this value'
      USING HINT = 'A value is written to catalogue versions, never to the whole model.';
  END IF;

  v_printed := r.evidence_page - COALESCE(m.page_offset, 0);
  v_note := format(
    'Read from %s (%s), printed page %s.',
    m.title,
    COALESCE(m.market, 'market unknown'),
    v_printed
  );

  FOREACH v_id IN ARRAY v_ids LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.vehicle_catalog vc
      LEFT JOIN public.vehicle_platform p ON p.id = vc.platform_id
      WHERE vc.id = v_id
        AND (vc.platform_id = m.platform_id OR p.parent_id = m.platform_id)
    ) THEN
      RAISE EXCEPTION 'car % is not one of this manual''s model', v_id
        USING HINT = 'A value can only be written to a catalogue version of the manual''s own family.';
    END IF;

    v_old := NULL;
    v_target := NULL;
    v_before := NULL;
    v_after := NULL;

    -- --- a plain catalogue column: oil capacity, coolant capacity, fuel tank -------------------------
    IF r.kind IN ('fluid', 'fuel')
       AND r.key IN ('engine_oil_capacity_l', 'coolant_capacity_l', 'fuel_tank_capacity') THEN
      v_target := 'vehicle_catalog';
      v_text := btrim(COALESCE(r.value ->> 'value', ''));
      IF v_text = '' THEN
        RAISE EXCEPTION 'the value for % is empty', r.key;
      END IF;

      EXECUTE format('SELECT %I::text FROM public.vehicle_catalog WHERE id = $1', r.key)
        INTO v_old USING v_id;
      EXECUTE format('UPDATE public.vehicle_catalog SET %I = $1::numeric WHERE id = $2', r.key)
        USING v_text, v_id;

      v_before := jsonb_build_object('column', r.key, 'value', v_old);
      v_after := jsonb_build_object(
        'column', r.key, 'value', v_text, 'spec_key', r.key,
        'vehicle_catalog_id', v_id, 'manual_id', m.id, 'pdf_page', r.evidence_page,
        'printed_page', v_printed, 'spec_row_id', r.id
      );
      written_version_id := v_id;
      target_table := v_target;
      old_value := v_old;
      new_value := v_text;
      changed := v_old IS DISTINCT FROM v_text;
      PERFORM public.mm_spec_history(p_actor, v_target, v_id::text, v_before, v_after);
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- --- tyres: one row per position and size -------------------------------------------------------
    IF r.kind = 'tyre' THEN
      v_target := 'vehicle_tyre';
      v_text := btrim(COALESCE(r.value ->> 'size', ''));
      IF v_text = '' OR r.key NOT IN ('front', 'rear', 'spare') THEN
        RAISE EXCEPTION 'a tyre value needs a position (front/rear/spare) and a size';
      END IF;

      SELECT concat_ws(' ', t.size, t.pressure_kpa || ' kPa')
        INTO v_old
      FROM public.vehicle_tyre t
      WHERE t.vehicle_catalog_id = v_id
        AND t.position = r.key
      ORDER BY (t.is_optional = COALESCE((r.value ->> 'is_optional')::boolean, false)) DESC, t.size
      LIMIT 1;

      INSERT INTO public.vehicle_tyre (
        vehicle_catalog_id, position, size, load_speed_index, wheel_size, pressure_kpa, is_optional,
        source_note, evidence_url, manual_id, evidence_page
      ) VALUES (
        v_id,
        r.key,
        v_text,
        NULLIF(btrim(COALESCE(r.value ->> 'load_speed_index', '')), ''),
        NULLIF(btrim(COALESCE(r.value ->> 'wheel_size', '')), ''),
        NULLIF(btrim(COALESCE(r.value ->> 'pressure_kpa', '')), '')::integer,
        COALESCE((r.value ->> 'is_optional')::boolean, false),
        v_note,
        'r2:private/' || m.file_key,
        m.id,
        r.evidence_page
      )
      ON CONFLICT (vehicle_catalog_id, position, size) DO UPDATE
      SET load_speed_index = EXCLUDED.load_speed_index,
          wheel_size = EXCLUDED.wheel_size,
          pressure_kpa = EXCLUDED.pressure_kpa,
          is_optional = EXCLUDED.is_optional,
          source_note = EXCLUDED.source_note,
          evidence_url = EXCLUDED.evidence_url,
          manual_id = EXCLUDED.manual_id,
          evidence_page = EXCLUDED.evidence_page,
          updated_at = now();

      v_after := jsonb_build_object(
        'position', r.key, 'size', v_text,
        'pressure_kpa', r.value ->> 'pressure_kpa',
        'is_optional', COALESCE((r.value ->> 'is_optional')::boolean, false),
        'vehicle_catalog_id', v_id, 'manual_id', m.id, 'pdf_page', r.evidence_page,
        'printed_page', v_printed, 'spec_row_id', r.id
      );
      written_version_id := v_id;
      target_table := v_target;
      old_value := v_old;
      new_value := concat_ws(' ', v_text, COALESCE(r.value ->> 'pressure_kpa', '') || ' kPa');
      changed := true;
      PERFORM public.mm_spec_history(p_actor, v_target, v_id::text,
        jsonb_build_object('position', r.key, 'value', v_old), v_after);
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- --- bulbs: one row per lamp position -----------------------------------------------------------
    IF r.kind = 'bulb' THEN
      v_target := 'vehicle_bulb';
      v_text := btrim(COALESCE(r.value ->> 'bulb_ref', ''));
      IF v_text = '' THEN
        RAISE EXCEPTION 'a bulb value needs the bulb the page prints';
      END IF;

      SELECT b.bulb_ref INTO v_old
      FROM public.vehicle_bulb b
      WHERE b.vehicle_catalog_id = v_id AND b.position = r.key;

      INSERT INTO public.vehicle_bulb (
        vehicle_catalog_id, position, bulb_ref, wattage_w, is_led, grade_note, source_note,
        evidence_url, manual_id, evidence_page
      ) VALUES (
        v_id,
        r.key,
        v_text,
        NULLIF(btrim(COALESCE(r.value ->> 'wattage_w', '')), ''),
        COALESCE((r.value ->> 'is_led')::boolean, false),
        NULLIF(btrim(COALESCE(r.value ->> 'grade_note', '')), ''),
        v_note,
        'r2:private/' || m.file_key,
        m.id,
        r.evidence_page
      )
      ON CONFLICT (vehicle_catalog_id, position) DO UPDATE
      SET bulb_ref = EXCLUDED.bulb_ref,
          wattage_w = EXCLUDED.wattage_w,
          is_led = EXCLUDED.is_led,
          grade_note = EXCLUDED.grade_note,
          source_note = EXCLUDED.source_note,
          evidence_url = EXCLUDED.evidence_url,
          manual_id = EXCLUDED.manual_id,
          evidence_page = EXCLUDED.evidence_page,
          updated_at = now();

      v_after := jsonb_build_object(
        'position', r.key, 'bulb_ref', v_text,
        'wattage_w', r.value ->> 'wattage_w',
        'vehicle_catalog_id', v_id, 'manual_id', m.id, 'pdf_page', r.evidence_page,
        'printed_page', v_printed, 'spec_row_id', r.id
      );
      written_version_id := v_id;
      target_table := v_target;
      old_value := v_old;
      new_value := v_text;
      changed := v_old IS DISTINCT FROM v_text;
      PERFORM public.mm_spec_history(p_actor, v_target, v_id::text,
        jsonb_build_object('position', r.key, 'value', v_old), v_after);
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- --- everything else is a named spec value on the version ---------------------------------------
    v_target := 'catalog_spec_value';
    v_text := btrim(COALESCE(r.value ->> 'value', ''));
    IF v_text = '' THEN
      RAISE EXCEPTION 'the value for % is empty', r.key;
    END IF;

    SELECT s.value INTO v_old
    FROM public.catalog_spec_value s
    WHERE s.scope = 'variant' AND s.spec_key = r.key AND s.vehicle_catalog_id = v_id;

    INSERT INTO public.catalog_spec_value (
      spec_key, scope, vehicle_catalog_id, value, evidence_url, verified_by, verified_at,
      trust, trust_route, source_note
    ) VALUES (
      r.key, 'variant', v_id, v_text, 'r2:private/' || m.file_key, p_actor, now(),
      'confirmed', 'maker_document',
      v_note || COALESCE(' ' || NULLIF(btrim(COALESCE(r.value ->> 'note', '')), ''), '')
    )
    ON CONFLICT (spec_key, vehicle_catalog_id) WHERE scope = 'variant' DO UPDATE
    SET value = EXCLUDED.value,
        evidence_url = EXCLUDED.evidence_url,
        verified_by = EXCLUDED.verified_by,
        verified_at = EXCLUDED.verified_at,
        trust = EXCLUDED.trust,
        trust_route = EXCLUDED.trust_route,
        source_note = EXCLUDED.source_note;

    v_after := jsonb_build_object(
      'spec_key', r.key, 'value', v_text,
      'vehicle_catalog_id', v_id, 'manual_id', m.id, 'pdf_page', r.evidence_page,
      'printed_page', v_printed, 'spec_row_id', r.id
    );
    written_version_id := v_id;
    target_table := v_target;
    old_value := v_old;
    new_value := v_text;
    changed := v_old IS DISTINCT FROM v_text;
    PERFORM public.mm_spec_history(p_actor, v_target, v_id::text,
      jsonb_build_object('spec_key', r.key, 'value', v_old), v_after);
    RETURN NEXT;
  END LOOP;

  UPDATE public.maintenance_manual_spec_row
  SET status = 'active',
      confidence = 'confirmed',
      version_ids = v_ids,
      verified_by = p_actor,
      verified_at = now(),
      updated_at = now()
  WHERE id = p_spec_id;
END;
$$;

COMMENT ON FUNCTION public.maintenance_manual_spec_approve(uuid, uuid[], uuid) IS
  'Writes one approved spec row to the ticked catalogue versions only, and logs each change (DOC-10, DOC-12).';

CREATE OR REPLACE FUNCTION public.maintenance_manual_spec_reject(
  p_spec_id uuid,
  p_reason text,
  p_actor uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.maintenance_manual_spec_row s WHERE s.id = p_spec_id) THEN
    RAISE EXCEPTION 'spec row % not found', p_spec_id;
  END IF;

  IF length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required to reject a value.';
  END IF;

  UPDATE public.maintenance_manual_spec_row
  SET status = 'rejected',
      reject_reason = v_reason,
      verified_by = p_actor,
      verified_at = now(),
      updated_at = now()
  WHERE id = p_spec_id
    AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'this value is no longer a draft, so it cannot be rejected';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. What the catalogue holds today, per version, for "Now -> Manual"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.maintenance_manual_spec_current(p_manual_id uuid)
RETURNS TABLE (kind text, spec_key text, vehicle_catalog_id uuid, now_value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  m public.maintenance_manual%ROWTYPE;
  v_versions uuid[];
  v_id uuid;
  r record;
  v_now text;
BEGIN
  SELECT * INTO m FROM public.maintenance_manual mm WHERE mm.id = p_manual_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT array_agg(vc.id) INTO v_versions
  FROM public.vehicle_catalog vc
  LEFT JOIN public.vehicle_platform p ON p.id = vc.platform_id
  WHERE vc.platform_id = m.platform_id OR p.parent_id = m.platform_id;

  IF v_versions IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT DISTINCT s.kind, s.key
    FROM public.maintenance_manual_spec_row s
    WHERE s.manual_id = p_manual_id
      AND s.status IN ('draft', 'active')
    ORDER BY s.kind, s.key
  LOOP
    FOREACH v_id IN ARRAY v_versions LOOP
      v_now := NULL;

      IF r.key = 'engine_oil_capacity_l' THEN
        SELECT vc.engine_oil_capacity_l::text INTO v_now FROM public.vehicle_catalog vc WHERE vc.id = v_id;
      ELSIF r.key = 'coolant_capacity_l' THEN
        SELECT vc.coolant_capacity_l::text INTO v_now FROM public.vehicle_catalog vc WHERE vc.id = v_id;
      ELSIF r.key = 'fuel_tank_capacity' THEN
        SELECT vc.fuel_tank_capacity::text INTO v_now FROM public.vehicle_catalog vc WHERE vc.id = v_id;
      ELSIF r.kind = 'tyre' AND r.key IN ('front', 'rear', 'spare') THEN
        SELECT concat_ws(' ', t.size, t.pressure_kpa || ' kPa') INTO v_now
        FROM public.vehicle_tyre t
        WHERE t.vehicle_catalog_id = v_id AND t.position = r.key
        ORDER BY t.is_optional, t.size
        LIMIT 1;
      ELSIF r.kind = 'bulb' THEN
        SELECT concat_ws(' ', b.bulb_ref, b.wattage_w) INTO v_now
        FROM public.vehicle_bulb b
        WHERE b.vehicle_catalog_id = v_id AND b.position = r.key
        LIMIT 1;
      ELSE
        SELECT s.value INTO v_now
        FROM public.catalog_spec_value s
        WHERE s.scope = 'variant' AND s.spec_key = r.key AND s.vehicle_catalog_id = v_id;
      END IF;

      IF v_now IS NOT NULL AND btrim(v_now) <> '' THEN
        kind := r.kind;
        spec_key := r.key;
        vehicle_catalog_id := v_id;
        now_value := v_now;
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.maintenance_manual_spec_current(uuid) IS
  'The catalogue''s current value for every spec the manual lists, per version: the "Now" in "Now -> Manual" (DOC-12).';

-- ---------------------------------------------------------------------------
-- 5. Grants: server only
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.maintenance_manual_replace_page_specs(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mm_spec_history(uuid, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_spec_approve(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_spec_reject(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_spec_current(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.maintenance_manual_replace_page_specs(uuid, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mm_spec_history(uuid, text, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_spec_approve(uuid, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_spec_reject(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_spec_current(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Logbook: record the migration, because the SQL editor does not.
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261127191503', 'mm_manual_spec_rows') ON CONFLICT (version) DO NOTHING;



-- Maintenance rebuild, step 1 (database only) - paste file for the LIVE database.
-- Project: csfllzzastacofsvcdsc. Apply top to bottom in ONE run of the Supabase SQL editor.
--
-- This file is the ONLY thing step 1 asks the owner to run. It does not deploy anything:
-- the server change (parseDueKind + the bootstrap skip) is not part of step 1 and ships with
-- step 3 from a clean copy of origin/main.
--
-- It holds every new migration of the step, in the same order as supabase/migrations, and
-- after each one the line that records it in supabase_migrations.schema_migrations (the SQL
-- editor never records migrations by itself, so the logbook line is what keeps CI's
-- "migration version list matches production" check green).
--
-- The committed files under supabase/migrations must NOT contain the logbook lines; this file
-- is the only place they live.
--
-- What it does, in order:
--   1. 20261127114125  due_kind gains part_schedule + inspection; the 16 part rules become
--                     part_schedule, the 5 packages stay service_package (MER-03).
--   2. 20261127114140  new table public.maintenance_manual, the market rank function, and the
--                     manual_id / evidence_page / market / severe_same_as_normal columns on
--                     maintenance_task_templates (MER-06, MER-07, MER-05 schema half).
--   3. 20261127114220  the engine: As needed never makes a row or a due, never counted as
--                     Overdue/Due soon/OK; market breaks an equally specific tie; a one-figure
--                     manual rule uses the normal numbers on a hard-use car (MER-04, MER-06,
--                     MER-05 engine half). The due view only drops an As needed row; every other
--                     retired row keeps the status and due columns it had before.
--   4. 20261127114508  47 As needed rules, and existing car rows on those parts retired with
--                     the reason "As needed: done only when a job calls for it" (MER-04 data).
--
-- Not touched: no server route, no screen, no live row deleted, no data on vehicle_platform or
-- vehicle_catalog changed.

-- ===========================================================================================
-- 20261127114125_mm_due_kind_part_schedule.sql
-- ===========================================================================================
-- MER-03: the database can finally say "this row is a part schedule".
--
-- Before: due_kind allowed only service_package / statutory_inspection, so the 16 part rules
-- and the 5 service packages all claimed to be packages, and the only way to tell them apart
-- was whether a part was attached. Two values are added and nothing else about the 21 rows
-- changes. No rule, interval, status or revision is touched.
--
--   part_schedule       one part has a rhythm (a component is attached)
--   inspection          a check row that belongs to no single part
--   service_package     Basic / Intermediate / Major style package (unchanged)
--   statutory_inspection  e.g. the shaken-style statutory due (unchanged, unused today)

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_due_kind_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_due_kind_check
  CHECK (due_kind IN ('service_package', 'statutory_inspection', 'part_schedule', 'inspection'));

-- The 16 rows with a component are part schedules. The 5 packages (component_id IS NULL) stay
-- service_package. updated_at is deliberately not touched: no number on these rows changed, so
-- the master revision log and the rule ordering stay as they are.
UPDATE public.maintenance_task_templates
SET due_kind = 'part_schedule'
WHERE component_id IS NOT NULL
  AND due_kind <> 'part_schedule';

COMMENT ON COLUMN public.maintenance_task_templates.due_kind IS
  'part_schedule = a part with a rhythm; service_package = Basic/Major style package; statutory_inspection = e.g. shaken-style statutory due; inspection = a check row with no part attached.';

-- A row with a part attached is a part schedule, never a "package". The column default is still
-- service_package (a package is written without a part), so a writer that leaves the default would
-- quietly recreate the bug MER-03 fixes. The row is corrected on the way in instead.
CREATE OR REPLACE FUNCTION public.trg_mtt_due_kind_from_shape()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.component_id IS NOT NULL AND NEW.due_kind = 'service_package' THEN
    NEW.due_kind := 'part_schedule';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mm_mtt_due_kind_from_shape ON public.maintenance_task_templates;
CREATE TRIGGER mm_mtt_due_kind_from_shape
  BEFORE INSERT OR UPDATE OF component_id, due_kind ON public.maintenance_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.trg_mtt_due_kind_from_shape();

REVOKE ALL ON FUNCTION public.trg_mtt_due_kind_from_shape() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261127114125', 'mm_due_kind_part_schedule') ON CONFLICT (version) DO NOTHING;

-- ===========================================================================================
-- 20261127114140_mm_manual_table_market.sql
-- ===========================================================================================
-- MER-07 + MER-06 (+ the schema half of MER-05): a home for the owner's manual, and the
-- market that decides between two equally specific rules.
--
-- Market is a property of the MANUAL and of the rule copied from it, never of the car:
-- vehicle_catalog.market is null on every row because these cars were built for Japan, so
-- writing JM on the car would be false data. Nothing is added to vehicle_platform or
-- vehicle_catalog by this migration.

CREATE TABLE public.maintenance_manual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The model family row in vehicle_platform (the parent platform), not one chassis variant.
  platform_id uuid NOT NULL REFERENCES public.vehicle_platform (id) ON DELETE RESTRICT,
  -- JM Jamaica - GEN export/general - JP Japan - OTHER. Ranked by public.mm_market_rank().
  market text NOT NULL,
  title text NOT NULL,
  -- R2 object key. The file itself is uploaded by the PDF reader step; this row is its home.
  file_key text NOT NULL,
  file_sha256 text NOT NULL,
  page_count integer NOT NULL,
  -- The pages of the maintenance table the reader was told to read.
  page_from integer NOT NULL,
  page_to integer NOT NULL,
  status text NOT NULL DEFAULT 'reading',
  -- "Reading page 214 of 232". Null until the background read starts.
  progress_page integer,
  uploaded_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  checked_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  checked_at timestamptz,
  reject_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_manual_market_check
    CHECK (market IN ('JM', 'GEN', 'JP', 'OTHER')),
  CONSTRAINT maintenance_manual_status_check
    CHECK (status IN ('reading', 'waiting_check', 'checked', 'rejected', 'stopped')),
  CONSTRAINT maintenance_manual_page_range_check
    CHECK (page_count >= 1 AND page_from >= 1 AND page_from <= page_to AND page_to <= page_count),
  CONSTRAINT maintenance_manual_progress_check
    CHECK (progress_page IS NULL OR (progress_page >= 0 AND progress_page <= page_count)),
  -- A rejection has to say why, in words a person can read.
  CONSTRAINT maintenance_manual_reject_reason_check
    CHECK (status <> 'rejected' OR length(btrim(coalesce(reject_reason, ''))) >= 10),
  CONSTRAINT maintenance_manual_file_sha256_check
    CHECK (file_sha256 ~ '^[0-9a-fA-F]{64}$'),
  -- One file per family: the same PDF uploaded twice cannot make two manual rows.
  CONSTRAINT maintenance_manual_file_once_per_family UNIQUE (platform_id, file_sha256)
);

COMMENT ON TABLE public.maintenance_manual IS
  'One owner''s manual per (model family, market) file (docs/maintenance-enterprise-rebuild-review.md B4, MER-07). Server only.';
COMMENT ON COLUMN public.maintenance_manual.platform_id IS
  'The model family platform row (the vehicle_platform row other variants point at), so one manual covers Roomy/Tank/Thor.';
COMMENT ON COLUMN public.maintenance_manual.market IS
  'JM Jamaica, GEN export/general, JP Japan, OTHER. Chosen between equally specific rules, never stored on the car.';
COMMENT ON COLUMN public.maintenance_manual.page_from IS
  'First page of the maintenance table the reader must read (owner picks it at upload).';
COMMENT ON COLUMN public.maintenance_manual.page_to IS
  'Last page of the maintenance table. page_to <= page_count is enforced.';

CREATE INDEX maintenance_manual_platform_idx ON public.maintenance_manual (platform_id);
CREATE INDEX maintenance_manual_market_idx ON public.maintenance_manual (platform_id, market);

CREATE TRIGGER maintenance_manual_updated_at
  BEFORE UPDATE ON public.maintenance_manual
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Market rank: one small immutable function, so the order lives in one place and app code
-- never holds a copy. Lower wins. No market (a Roam policy rule) sorts after every market.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mm_market_rank(p_market text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE upper(btrim(coalesce(p_market, '')))
    WHEN 'JM' THEN 1
    WHEN 'GEN' THEN 2
    WHEN 'JP' THEN 3
    WHEN 'OTHER' THEN 4
    ELSE 9
  END;
$$;

COMMENT ON FUNCTION public.mm_market_rank(text) IS
  'JM 1, GEN 2, JP 3, OTHER 4, no market 9. Used only to choose between equally specific rules.';

-- ---------------------------------------------------------------------------
-- The rule points at the manual it came from.
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_task_templates
  ADD COLUMN IF NOT EXISTS manual_id uuid REFERENCES public.maintenance_manual (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS evidence_page integer,
  ADD COLUMN IF NOT EXISTS market text,
  ADD COLUMN IF NOT EXISTS severe_same_as_normal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.maintenance_task_templates.manual_id IS
  'The manual this rule was read from. Restrict, so a manual cannot vanish under a live rule.';
COMMENT ON COLUMN public.maintenance_task_templates.evidence_page IS
  'The page the number was read on, so a due line can say "Owner''s manual, page 214".';
COMMENT ON COLUMN public.maintenance_task_templates.market IS
  'Copied from the manual by trigger. Never set on the car.';
COMMENT ON COLUMN public.maintenance_task_templates.severe_same_as_normal IS
  'MER-05: the manual prints one figure only, so a hard-use car uses the normal numbers and the severe columns stay empty.';

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_market_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_market_check
  CHECK (market IS NULL OR market IN ('JM', 'GEN', 'JP', 'OTHER'));

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_evidence_page_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_evidence_page_check
  CHECK (evidence_page IS NULL OR evidence_page >= 1);

-- A car-maker part rule must say which manual and which page. (No maker_manual row exists yet,
-- so nothing is broken by this.) The existing evidence_url rule for part_maker is kept as is.
ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_maker_manual_evidence_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_maker_manual_evidence_check
  CHECK (
    component_id IS NULL
    OR source_type <> 'maker_manual'
    OR (manual_id IS NOT NULL AND evidence_page IS NOT NULL)
  );

-- "The manual gives no severe figure" and severe numbers cannot both be true.
ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_severe_same_as_normal_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_severe_same_as_normal_check
  CHECK (
    NOT severe_same_as_normal
    OR (
      severe_interval_km IS NULL
      AND severe_interval_km_max IS NULL
      AND severe_interval_months IS NULL
    )
  );

-- Market is copied from the manual, always, so a rule can never drift from the manual it cites.
CREATE OR REPLACE FUNCTION public.trg_mtt_market_from_manual()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.manual_id IS NOT NULL THEN
    SELECT m.market INTO NEW.market
    FROM public.maintenance_manual m
    WHERE m.id = NEW.manual_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mm_mtt_market_from_manual ON public.maintenance_task_templates;
CREATE TRIGGER mm_mtt_market_from_manual
  BEFORE INSERT OR UPDATE OF manual_id, market ON public.maintenance_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.trg_mtt_market_from_manual();

-- ---------------------------------------------------------------------------
-- Access: server only, exactly like maintenance_task_templates.
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_manual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_manual_no_direct ON public.maintenance_manual;
CREATE POLICY maintenance_manual_no_direct
  ON public.maintenance_manual
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.maintenance_manual FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.maintenance_manual TO service_role;

REVOKE ALL ON FUNCTION public.mm_market_rank(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_market_rank(text) TO service_role;

REVOKE ALL ON FUNCTION public.trg_mtt_market_from_manual() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261127114140', 'mm_manual_table_market') ON CONFLICT (version) DO NOTHING;

-- ===========================================================================================
-- 20261127114220_mm_as_needed_engine.sql
-- ===========================================================================================
-- MER-04 engine half + MER-06 rule choice + MER-05 severe half.
--
-- As needed (frequency_kind = 'manual_only') means: never a car schedule row, never a due date,
-- never counted as Overdue, Due soon or OK. The resolver simply does not return such a rule, so
-- the recompute engine makes no row for that part; a row that already existed is retired with
-- the reason the screens will show.
--
-- Rule choice is unchanged at the top: most specific wins (one car version, model family,
-- engine family, everyone). Only when two active rules are equally specific does the lower
-- market rank win (JM 1, GEN 2, JP 3, OTHER 4), then the newer rule. Two rules from manuals of
-- different markets are therefore not a conflict: the market decides.

-- ---------------------------------------------------------------------------
-- 1. Is this part "as needed"?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mm_part_is_as_needed(p_component_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.maintenance_task_templates t
      WHERE t.component_id = p_component_id
        AND t.frequency_kind = 'manual_only'
        AND t.status IN ('active', 'needs_checking')
        AND t.archived_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.maintenance_task_templates t
      WHERE t.component_id = p_component_id
        AND coalesce(t.frequency_kind, 'recurring') <> 'manual_only'
        AND t.status IN ('active', 'needs_checking')
        AND t.archived_at IS NULL
    );
$$;

COMMENT ON FUNCTION public.mm_part_is_as_needed(uuid) IS
  'True when the only rule for this part is frequency_kind = manual_only (As needed): no row, no due, never counted.';

-- ---------------------------------------------------------------------------
-- 2. Which rule covers this part for this car (market tie-break, no as-needed rules)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mm_pick_part_rule(
  p_component_id uuid,
  p_catalog_id uuid,
  p_platform_id uuid,
  p_platform_family_id uuid,
  p_engine_family_id uuid,
  p_vehicle_class text,
  p_vehicle_year integer,
  p_statuses text[]
)
RETURNS public.maintenance_task_templates
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT t.*
  FROM public.maintenance_task_templates t
  WHERE t.component_id = p_component_id
    AND t.status = ANY (p_statuses)
    -- As needed: a manual_only rule never resolves to a due date.
    AND coalesce(t.frequency_kind, 'recurring') <> 'manual_only'
    AND (
      p_vehicle_year IS NULL
      OR (
        p_vehicle_year >= coalesce(t.year_from, 0)
        AND p_vehicle_year <= coalesce(t.year_to, 9999)
      )
    )
    AND (
      cardinality(coalesce(t.applicable_vehicle_classes, ARRAY[]::text[])) = 0
      OR p_vehicle_class = ANY (
        SELECT lower(trim(x))
        FROM unnest(t.applicable_vehicle_classes) AS x
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_component_applicability a
      WHERE a.component_id = p_component_id
        AND a.applicable IS FALSE
        AND (
          (a.scope = 'variant' AND a.vehicle_catalog_id = p_catalog_id)
          OR (a.scope = 'platform' AND a.platform_id IN (p_platform_id, p_platform_family_id))
          OR (a.scope = 'engine_family' AND a.engine_family_id = p_engine_family_id)
        )
    )
    AND public.mm_part_rule_rank(
      t.template_scope,
      p_catalog_id,
      p_platform_id,
      p_platform_family_id,
      p_engine_family_id,
      t.vehicle_catalog_id,
      t.platform_id,
      t.engine_family_id
    ) IS NOT NULL
  ORDER BY public.mm_part_rule_rank(
    t.template_scope,
    p_catalog_id,
    p_platform_id,
    p_platform_family_id,
    p_engine_family_id,
    t.vehicle_catalog_id,
    t.platform_id,
    t.engine_family_id
  ),
  -- Only reached on an equally specific tie: Jamaica, then the nearest market, then Japan,
  -- then any other market, then a rule with no market (Roam policy). Then the newer rule.
  public.mm_market_rank(t.market),
  t.updated_at DESC,
  t.id
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 3. The numbers for this car (normal, or the manual's single figure on a hard-use car)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_rule_for_part(
  p_org text,
  p_vehicle_id text,
  p_component_id uuid,
  p_position text DEFAULT NULL,
  p_include_custom boolean DEFAULT true
)
RETURNS TABLE (
  rule_id uuid,
  rank integer,
  interval_km integer,
  interval_km_max integer,
  interval_months integer,
  interval_basis text,
  rule_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ctx record;
  v_rule public.maintenance_task_templates;
  v_sched record;
  v_rank integer;
  v_im int;
  v_im_max int;
  v_im_mo int;
  v_basis text;
BEGIN
  SELECT * INTO v_ctx
  FROM public.mm_vehicle_catalog_for_fleet(p_org, p_vehicle_id);

  IF v_ctx.catalog_id IS NULL THEN
    RETURN;
  END IF;

  IF p_include_custom THEN
    SELECT vcs.*
    INTO v_sched
    FROM public.vehicle_component_schedule vcs
    WHERE vcs.organization_id = p_org
      AND vcs.vehicle_id = p_vehicle_id
      AND vcs.category_id = p_component_id
      AND vcs.position IS NOT DISTINCT FROM p_position
    LIMIT 1;

    IF FOUND
      AND v_sched.schedule_status = 'manual_override'
      AND (
        v_sched.custom_interval_km IS NOT NULL
        OR v_sched.custom_interval_months IS NOT NULL
      )
    THEN
      rule_id := v_sched.rule_id;
      rank := NULL;
      interval_km := v_sched.custom_interval_km;
      interval_km_max := NULL;
      interval_months := v_sched.custom_interval_months;
      interval_basis := 'custom';
      rule_status := 'active';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_rule FROM public.mm_pick_part_rule(
    p_component_id,
    v_ctx.catalog_id,
    v_ctx.platform_id,
    v_ctx.platform_family_id,
    v_ctx.engine_family_id,
    v_ctx.vehicle_class,
    v_ctx.vehicle_year,
    ARRAY['active']::text[]
  );

  IF v_rule.id IS NULL THEN
    SELECT * INTO v_rule FROM public.mm_pick_part_rule(
      p_component_id,
      v_ctx.catalog_id,
      v_ctx.platform_id,
      v_ctx.platform_family_id,
      v_ctx.engine_family_id,
      v_ctx.vehicle_class,
      v_ctx.vehicle_year,
      ARRAY['needs_checking']::text[]
    );
  END IF;

  IF v_rule.id IS NULL THEN
    RETURN;
  END IF;

  -- Belt and braces: mm_pick_part_rule already skips manual_only, and As needed is never a due.
  IF coalesce(v_rule.frequency_kind, 'recurring') = 'manual_only' THEN
    RETURN;
  END IF;

  v_rank := public.mm_part_rule_rank(
    v_rule.template_scope,
    v_ctx.catalog_id,
    v_ctx.platform_id,
    v_ctx.platform_family_id,
    v_ctx.engine_family_id,
    v_rule.vehicle_catalog_id,
    v_rule.platform_id,
    v_rule.engine_family_id
  );

  v_im := v_rule.interval_km;
  v_im_max := v_rule.interval_km_max;
  v_im_mo := v_rule.interval_months;
  v_basis := 'rule';

  -- MER-05: when the manual prints one figure only, a hard-use car gets that figure. The severe
  -- columns are empty on such a rule, and the tick alone must never invent a shorter interval.
  IF v_ctx.severe_duty
    AND NOT coalesce(v_rule.severe_same_as_normal, false)
    AND (
      v_rule.severe_interval_km IS NOT NULL
      OR v_rule.severe_interval_months IS NOT NULL
    )
  THEN
    v_im := coalesce(v_rule.severe_interval_km, v_rule.interval_km);
    v_im_max := coalesce(v_rule.severe_interval_km_max, v_rule.interval_km_max);
    v_im_mo := coalesce(v_rule.severe_interval_months, v_rule.interval_months);
    v_basis := 'severe';
  END IF;

  rule_id := v_rule.id;
  rank := v_rank;
  interval_km := v_im;
  interval_km_max := v_im_max;
  interval_months := v_im_mo;
  interval_basis := v_basis;
  rule_status := v_rule.status;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Recompute one car row (unchanged except: As needed retires, never a due)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mm_recompute_schedule_row(
  p_org text,
  p_vehicle_id text,
  p_category_id uuid,
  p_position text,
  p_existing_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_res record;
  v_row public.vehicle_component_schedule%ROWTYPE;
  v_ref_km numeric;
  v_ref_date date;
  v_next_km numeric;
  v_next_km_max numeric;
  v_next_date date;
  v_has_odo boolean;
  v_status text;
  v_rule_rev int;
  v_keep_manual boolean;
  v_target_status text;
  v_catalog_raw text;
  v_catalog_id uuid;
  v_fits text;
  v_no_fit_reason constant text := 'Job doesn''t fit this car''s powertrain';
  v_as_needed_reason constant text := 'As needed: done only when a job calls for it';
BEGIN
  -- As needed (frequency_kind = 'manual_only'): no car row, no due date, never counted.
  -- A row left from before this rule existed is retired, with the reason the screens show.
  IF public.mm_part_is_as_needed(p_category_id) THEN
    IF p_existing_id IS NULL THEN
      RETURN 'none';
    END IF;

    SELECT * INTO v_row FROM public.vehicle_component_schedule WHERE id = p_existing_id;

    IF coalesce(v_row.schedule_status, '') = 'retired'
      AND v_row.retired_reason IS NOT DISTINCT FROM v_as_needed_reason
    THEN
      RETURN 'skipped_as_needed';
    END IF;

    UPDATE public.vehicle_component_schedule vcs
    SET
      schedule_status = 'retired',
      retired_reason = v_as_needed_reason,
      rule_id = NULL,
      rule_revision_no = NULL,
      interval_km_used = NULL,
      interval_months_used = NULL,
      interval_basis = NULL,
      next_due_km = NULL,
      next_due_km_max = NULL,
      next_due_date = NULL,
      computed_at = now(),
      updated_at = now()
    WHERE vcs.id = p_existing_id;

    PERFORM public.maintenance_alerts_supersede_open(p_existing_id, 'schedule_retired');
    RETURN 'retired_as_needed';
  END IF;

  IF p_existing_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.vehicle_component_schedule WHERE id = p_existing_id;
    IF v_row.schedule_status = 'manual_override' THEN
      SELECT * INTO v_res
      FROM public.schedule_rule_for_part(
        p_org, p_vehicle_id, p_category_id, p_position, false
      )
      LIMIT 1;

      IF FOUND
        AND v_res.interval_basis <> 'custom'
        AND (
          (v_res.interval_km IS NOT NULL AND v_row.custom_interval_km IS NOT NULL
            AND v_res.interval_km < v_row.custom_interval_km)
          OR (v_res.interval_months IS NOT NULL AND v_row.custom_interval_months IS NOT NULL
            AND v_res.interval_months < v_row.custom_interval_months)
        )
      THEN
        UPDATE public.vehicle_component_schedule vcs
        SET
          custom_interval_km = NULL,
          custom_interval_months = NULL,
          custom_reason = NULL,
          custom_set_by = NULL,
          custom_set_at = NULL,
          schedule_status = 'active',
          updated_at = now()
        WHERE vcs.id = p_existing_id;
        v_row.schedule_status := 'active';
      END IF;
    END IF;
  END IF;

  SELECT v.vehicle_catalog_id INTO v_catalog_raw
  FROM fleet.vehicles v
  WHERE v.id = p_vehicle_id;

  v_catalog_id := NULL;
  IF v_catalog_raw IS NOT NULL AND btrim(v_catalog_raw) <> '' THEN
    IF v_catalog_raw ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
      v_catalog_id := v_catalog_raw::uuid;
    END IF;
  END IF;

  SELECT f.fits INTO v_fits
  FROM public.job_fits_car(v_catalog_id, ARRAY[p_category_id]) f
  LIMIT 1;

  v_fits := coalesce(v_fits, 'unknown');

  IF v_fits = 'no' THEN
    IF p_existing_id IS NOT NULL THEN
      SELECT * INTO v_row FROM public.vehicle_component_schedule WHERE id = p_existing_id;
      IF coalesce(v_row.schedule_status, '') = 'retired' THEN
        RETURN 'skipped_no_fit';
      END IF;
      UPDATE public.vehicle_component_schedule vcs
      SET
        schedule_status = 'retired',
        retired_reason = v_no_fit_reason,
        updated_at = now()
      WHERE vcs.id = p_existing_id;
      PERFORM public.maintenance_alerts_supersede_open(p_existing_id, 'schedule_retired');
      RETURN 'retired_no_fit';
    END IF;
    RETURN 'skipped_no_fit';
  END IF;

  SELECT * INTO v_res
  FROM public.schedule_rule_for_part(
    p_org, p_vehicle_id, p_category_id, p_position
  )
  LIMIT 1;

  IF NOT FOUND OR v_res.rule_id IS NULL THEN
    IF p_existing_id IS NOT NULL THEN
      SELECT * INTO v_row FROM public.vehicle_component_schedule WHERE id = p_existing_id;
      UPDATE public.vehicle_component_schedule vcs
      SET
        schedule_status = 'no_rule',
        rule_id = NULL,
        rule_revision_no = NULL,
        interval_km_used = NULL,
        interval_months_used = NULL,
        interval_basis = NULL,
        computed_at = now(),
        updated_at = now()
      WHERE vcs.id = p_existing_id;
      IF v_row.rule_id IS DISTINCT FROM NULL
        OR v_row.next_due_km IS DISTINCT FROM NULL
        OR v_row.next_due_date IS DISTINCT FROM NULL
        OR v_row.schedule_status IS DISTINCT FROM 'no_rule'
      THEN
        PERFORM public.maintenance_alerts_supersede_open(p_existing_id, 'rule_changed');
      END IF;
      RETURN 'no_rule';
    END IF;
    RETURN 'none';
  END IF;

  SELECT revision_no INTO v_rule_rev
  FROM public.maintenance_task_templates
  WHERE id = v_res.rule_id;

  v_ref_km := NULL;
  v_ref_date := NULL;

  IF p_existing_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.vehicle_component_schedule WHERE id = p_existing_id;

    IF public.mm_fleet_has_valid_odometer(p_vehicle_id)
      AND coalesce(v_row.baseline_source, 'bootstrap') = 'bootstrap'
      AND v_row.last_performed_km IS NULL
      AND v_row.last_performed_date IS NULL
      AND coalesce(v_row.schedule_status, '') <> 'manual_override'
    THEN
      SELECT r.reading, coalesce(r.reading_date, r.recorded_at::date)
      INTO v_ref_km, v_ref_date
      FROM fleet.odometer_readings r
      WHERE r.vehicle_id = p_vehicle_id
        AND r.is_voided = false
        AND r.is_anomaly = false
      ORDER BY coalesce(r.reading_date, r.recorded_at::date), r.recorded_at, r.id
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.vehicle_component_schedule vcs
        SET
          baseline_odometer = v_ref_km,
          baseline_date = v_ref_date,
          baseline_source = 'first_reading',
          updated_at = now()
        WHERE vcs.id = p_existing_id;
        SELECT * INTO v_row FROM public.vehicle_component_schedule WHERE id = p_existing_id;
      END IF;
    END IF;

    v_ref_km := coalesce(v_row.last_performed_km, v_row.baseline_odometer);
    v_ref_date := coalesce(v_row.last_performed_date, v_row.baseline_date);
  ELSE
    SELECT o.reading, o.reading_date
    INTO v_ref_km, v_ref_date
    FROM fleet.vehicle_current_odometer_v o
    WHERE o.vehicle_id = p_vehicle_id
    LIMIT 1;
    v_ref_km := coalesce(v_ref_km, 0);
    v_ref_date := coalesce(v_ref_date, current_date);
  END IF;

  v_has_odo := public.mm_fleet_has_valid_odometer(p_vehicle_id);

  IF v_res.interval_km IS NOT NULL AND (v_ref_km IS NULL OR NOT v_has_odo) THEN
    v_next_km := NULL;
    v_next_km_max := NULL;
    v_status := 'odometer_needed';
  ELSE
    v_next_km := CASE
      WHEN v_res.interval_km IS NOT NULL AND v_ref_km IS NOT NULL
        THEN v_ref_km + v_res.interval_km
      ELSE NULL
    END;
    v_next_km_max := CASE
      WHEN v_res.interval_km_max IS NOT NULL AND v_ref_km IS NOT NULL
        THEN v_ref_km + v_res.interval_km_max
      ELSE NULL
    END;
    v_status := 'active';
  END IF;

  v_next_date := CASE
    WHEN v_res.interval_months IS NOT NULL AND v_ref_date IS NOT NULL
      THEN (v_ref_date + (v_res.interval_months || ' months')::interval)::date
    ELSE NULL
  END;

  v_keep_manual := p_existing_id IS NOT NULL
    AND v_row.schedule_status = 'manual_override'
    AND (v_row.custom_interval_km IS NOT NULL OR v_row.custom_interval_months IS NOT NULL);
  v_target_status := CASE WHEN v_keep_manual THEN 'manual_override' ELSE v_status END;

  IF p_existing_id IS NULL THEN
    INSERT INTO public.vehicle_component_schedule (
      organization_id,
      vehicle_id,
      category_id,
      position,
      baseline_odometer,
      baseline_date,
      baseline_source,
      next_due_km,
      next_due_km_max,
      next_due_date,
      rule_id,
      rule_revision_no,
      interval_km_used,
      interval_months_used,
      interval_basis,
      schedule_status,
      computed_at,
      updated_at
    )
    VALUES (
      p_org,
      p_vehicle_id,
      p_category_id,
      p_position,
      coalesce(v_ref_km, 0),
      coalesce(v_ref_date, current_date),
      'bootstrap',
      v_next_km,
      v_next_km_max,
      v_next_date,
      v_res.rule_id,
      v_rule_rev,
      v_res.interval_km,
      v_res.interval_months,
      v_res.interval_basis,
      v_status,
      now(),
      now()
    );
    RETURN 'created';
  END IF;

  UPDATE public.vehicle_component_schedule vcs
  SET
    rule_id = v_res.rule_id,
    rule_revision_no = v_rule_rev,
    interval_km_used = v_res.interval_km,
    interval_months_used = v_res.interval_months,
    interval_basis = v_res.interval_basis,
    next_due_km = v_next_km,
    next_due_km_max = v_next_km_max,
    next_due_date = v_next_date,
    schedule_status = v_target_status,
    retired_reason = CASE
      WHEN v_target_status <> 'retired'
        AND coalesce(v_row.retired_reason, '') = v_no_fit_reason
      THEN NULL
      ELSE vcs.retired_reason
    END,
    computed_at = now(),
    updated_at = now()
  WHERE vcs.id = p_existing_id;

  IF v_row.rule_id IS DISTINCT FROM v_res.rule_id
    OR v_row.next_due_km IS DISTINCT FROM v_next_km
    OR v_row.next_due_date IS DISTINCT FROM v_next_date
    OR v_row.schedule_status IS DISTINCT FROM v_target_status
  THEN
    PERFORM public.maintenance_alerts_supersede_open(p_existing_id, 'rule_changed');
  END IF;
  RETURN 'updated';
END;
$func$;

-- ---------------------------------------------------------------------------
-- 5. Recompute one car (counts the As needed retirements too)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_component_schedules_for_car(
  p_org text,
  p_vehicle_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_part uuid;
  v_pos text;
  v_existing uuid;
  v_action text;
  v_created int := 0;
  v_updated int := 0;
  v_no_rule int := 0;
  v_skipped int := 0;
  v_as_needed int := 0;
BEGIN
  -- Parts with a live rule, plus parts this car already has a row for (so a row whose
  -- rules were all retired is revisited and becomes no_rule).
  FOR v_part IN
    SELECT t.component_id
    FROM public.maintenance_task_templates t
    WHERE t.component_id IS NOT NULL
      AND t.status NOT IN ('draft', 'retired')
    UNION
    SELECT vcs.category_id
    FROM public.vehicle_component_schedule vcs
    WHERE vcs.organization_id = p_org
      AND vcs.vehicle_id = p_vehicle_id
      AND vcs.category_id IS NOT NULL
  LOOP
    FOR v_pos IN
      SELECT pos.p
      FROM public.maintenance_service_categories c
      CROSS JOIN LATERAL (
        SELECT unnest(ARRAY['LF', 'RF', 'LR', 'RR']::text[]) AS p
        WHERE c.position_aware
        UNION ALL
        SELECT NULL::text WHERE NOT c.position_aware
      ) pos
      WHERE c.id = v_part
    LOOP
      SELECT vcs.id INTO v_existing
      FROM public.vehicle_component_schedule vcs
      WHERE vcs.organization_id = p_org
        AND vcs.vehicle_id = p_vehicle_id
        AND vcs.category_id = v_part
        AND vcs.position IS NOT DISTINCT FROM v_pos;

      v_action := public.mm_recompute_schedule_row(
        p_org, p_vehicle_id, v_part, v_pos, v_existing
      );

      CASE v_action
        WHEN 'created' THEN v_created := v_created + 1;
        WHEN 'updated' THEN v_updated := v_updated + 1;
        WHEN 'no_rule' THEN v_no_rule := v_no_rule + 1;
        WHEN 'skipped_custom' THEN v_skipped := v_skipped + 1;
        WHEN 'retired_as_needed' THEN v_as_needed := v_as_needed + 1;
        ELSE NULL;
      END CASE;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'no_rule', v_no_rule,
    'skipped_custom', v_skipped,
    'retired_as_needed', v_as_needed
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Two rules from manuals of different markets are not a conflict
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_mtt_overlap_guard_before()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_other record;
  v_lock_key bigint;
  v_target text;
  v_years int4range;
BEGIN
  IF NEW.component_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('active', 'needs_checking') THEN
    RETURN NEW;
  END IF;

  v_target := public.mm_rule_target_key(
    NEW.template_scope,
    NEW.vehicle_catalog_id,
    NEW.platform_id,
    NEW.engine_family_id
  );

  v_lock_key := hashtext(NEW.component_id::text || NEW.template_scope || v_target);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_years := int4range(
    coalesce(NEW.year_from, 0),
    coalesce(NEW.year_to, 9999),
    '[]'
  );

  SELECT t.id
  INTO v_other
  FROM public.maintenance_task_templates t
  WHERE t.id IS DISTINCT FROM NEW.id
    AND t.component_id = NEW.component_id
    AND t.template_scope = NEW.template_scope
    AND t.status = 'active'
    AND public.mm_rule_target_key(
      t.template_scope, t.vehicle_catalog_id, t.platform_id, t.engine_family_id
    ) = v_target
    -- MER-06: a Jamaica manual and a Japan manual for the same family are both legitimate.
    -- The market rank decides which one a car gets, so that pair is not "needs checking".
    AND NOT (
      t.market IS NOT NULL
      AND NEW.market IS NOT NULL
      AND t.market <> NEW.market
    )
    AND int4range(coalesce(t.year_from, 0), coalesce(t.year_to, 9999), '[]') && v_years
    AND public.mm_classes_overlap(t.applicable_vehicle_classes, NEW.applicable_vehicle_classes)
  LIMIT 1;

  IF FOUND AND NEW.status = 'active' THEN
    NEW.status := 'needs_checking';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. An As needed row is never a due - and nothing else about a retired row changes
-- ---------------------------------------------------------------------------
-- Same columns as before, so this replaces the view in place. Only a retired row whose reason is
-- the As needed one reads 'retired' with no due columns; that is what stops an As needed part
-- being counted as Overdue / Due soon / OK. Every other retired row (a job that does not fit the
-- car's powertrain, a rule retired by hand) keeps exactly the status and due columns it had
-- before this step, so Fleet's due drawer still lists it struck through until step 10 rebuilds it.
CREATE OR REPLACE VIEW fleet.maintenance_due_v AS
WITH settings AS (
  SELECT organization_id, due_soon_km, due_soon_days
  FROM fleet.organization_settings
),
cur AS (
  SELECT * FROM fleet.vehicle_current_odometer_v
),
avg_km AS (
  SELECT
    vehicle_id,
    CASE
      WHEN count(*) >= 2 AND max(recorded_at) > min(recorded_at) THEN
        (max(reading) - min(reading)) / greatest(
          1,
          extract(epoch FROM (max(recorded_at) - min(recorded_at))) / 86400.0
        )
      ELSE NULL
    END AS avg_km_per_day
  FROM fleet.odometer_readings
  WHERE is_voided = false
    AND is_anomaly = false
    AND recorded_at >= now() - interval '30 days'
  GROUP BY vehicle_id
),
scored AS (
  SELECT
    vcs.organization_id,
    vcs.vehicle_id,
    vcs.category_id,
    vcs.position,
    c.name AS category_name,
    c.code AS category_code,
    c.overdue_effect,
    vcs.last_performed_km,
    vcs.last_performed_date,
    vcs.baseline_odometer,
    vcs.baseline_date,
    vcs.baseline_source,
    -- As needed: never a due date, even if a stale number was left on the row.
    CASE
      WHEN vcs.schedule_status = 'retired'
        AND vcs.retired_reason IS NOT DISTINCT FROM 'As needed: done only when a job calls for it'
        THEN NULL
      ELSE vcs.next_due_km
    END AS next_due_km,
    CASE
      WHEN vcs.schedule_status = 'retired'
        AND vcs.retired_reason IS NOT DISTINCT FROM 'As needed: done only when a job calls for it'
        THEN NULL
      ELSE vcs.next_due_km_max
    END AS next_due_km_max,
    CASE
      WHEN vcs.schedule_status = 'retired'
        AND vcs.retired_reason IS NOT DISTINCT FROM 'As needed: done only when a job calls for it'
        THEN NULL
      ELSE vcs.next_due_date
    END AS next_due_date,
    cur.reading AS current_odometer,
    ak.avg_km_per_day,
    CASE
      -- Only an As needed part drops out of the due list. Every other retired row (a job that does
      -- not fit the car, a rule retired by hand) keeps exactly the status and due columns it had
      -- before this step, so Fleet's drawer still shows it struck through with its reason.
      WHEN vcs.schedule_status = 'retired'
        AND vcs.retired_reason IS NOT DISTINCT FROM 'As needed: done only when a job calls for it'
        THEN 'retired'
      WHEN vcs.last_performed_date IS NULL
        AND vcs.last_performed_km IS NULL
        AND vcs.baseline_odometer IS NULL
        AND vcs.baseline_date IS NULL
        THEN 'no_record'
      WHEN cur.reading IS NULL AND vcs.next_due_km IS NOT NULL THEN 'odometer_needed'
      WHEN cur.reading IS NOT NULL AND vcs.next_due_km IS NOT NULL
        AND cur.reading >= vcs.next_due_km THEN 'overdue'
      WHEN vcs.next_due_date IS NOT NULL AND vcs.next_due_date < current_date THEN 'overdue'
      WHEN cur.reading IS NOT NULL AND vcs.next_due_km IS NOT NULL
        AND cur.reading >= vcs.next_due_km - coalesce(s.due_soon_km, 1000)
        AND cur.reading < vcs.next_due_km THEN 'due_soon'
      WHEN vcs.next_due_date IS NOT NULL
        AND vcs.next_due_date <= current_date + coalesce(s.due_soon_days, 14) THEN 'due_soon'
      ELSE 'ok'
    END AS due_status,
    CASE
      WHEN vcs.last_performed_date IS NULL
        AND vcs.last_performed_km IS NULL
        AND vcs.baseline_odometer IS NULL
        AND vcs.baseline_date IS NULL
        THEN NULL
      WHEN vcs.schedule_status = 'retired'
        AND vcs.retired_reason IS NOT DISTINCT FROM 'As needed: done only when a job calls for it'
        THEN NULL
      WHEN cur.reading IS NOT NULL AND vcs.next_due_km IS NOT NULL
        THEN greatest(0, cur.reading - vcs.next_due_km)
      ELSE NULL
    END AS km_overdue,
    CASE
      WHEN vcs.last_performed_date IS NULL
        AND vcs.last_performed_km IS NULL
        AND vcs.baseline_odometer IS NULL
        AND vcs.baseline_date IS NULL
        THEN NULL
      WHEN vcs.schedule_status = 'retired'
        AND vcs.retired_reason IS NOT DISTINCT FROM 'As needed: done only when a job calls for it'
        THEN NULL
      WHEN vcs.next_due_date IS NOT NULL AND vcs.next_due_date < current_date
        THEN current_date - vcs.next_due_date
      ELSE NULL
    END AS days_overdue
  FROM public.vehicle_component_schedule vcs
  JOIN public.maintenance_service_categories c ON c.id = vcs.category_id
  LEFT JOIN cur ON cur.vehicle_id = vcs.vehicle_id
  LEFT JOIN settings s ON s.organization_id = vcs.organization_id
  LEFT JOIN avg_km ak ON ak.vehicle_id = vcs.vehicle_id
)
SELECT
  scored.*,
  CASE
    WHEN scored.due_status = 'overdue' THEN NULL
    WHEN scored.due_status = 'no_record' THEN NULL
    WHEN scored.current_odometer IS NOT NULL
      AND scored.next_due_km IS NOT NULL
      AND scored.avg_km_per_day IS NOT NULL
      AND scored.avg_km_per_day > 0
      AND scored.current_odometer < scored.next_due_km
    THEN least(
      coalesce(scored.next_due_date, current_date + 3650),
      current_date + ceil((scored.next_due_km - scored.current_odometer) / scored.avg_km_per_day)::int
    )
    ELSE scored.next_due_date
  END AS projected_due_date
FROM scored;

CREATE OR REPLACE VIEW public.fleet_maintenance_due_v WITH (security_invoker = true) AS
  SELECT * FROM fleet.maintenance_due_v;

GRANT SELECT ON public.fleet_maintenance_due_v TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Access
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.mm_part_is_as_needed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_part_is_as_needed(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.trg_mtt_overlap_guard_before() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261127114220', 'mm_as_needed_engine') ON CONFLICT (version) DO NOTHING;

-- ===========================================================================================
-- 20261127114508_mm_seed_as_needed_rules.sql
-- ===========================================================================================
-- MER-04 data half: the 47 part types that are only done when a job calls for them.
--
-- frequency_kind = 'manual_only' IS "As needed" - no new value is added. A manual_only rule has
-- no interval, and the engine (previous migration) never makes a car schedule row from it, never
-- gives it a due date and never counts it as Overdue, Due soon or OK.
--
-- Appendix A of docs/maintenance-enterprise-rebuild-review.md lists 49 "As needed" types.
-- Two of them (valve_clearance_adjustment, wheel_alignment) move to "No schedule yet" instead,
-- so 47 rules are written here. The other 104 part types keep no rule at all.
--
-- The seeding is a function so it is idempotent and so a database that does not hold every part
-- type yet (the local copy seeds 103 of them) can be completed by running it again once the part
-- types exist. It inserts nothing twice.

CREATE OR REPLACE FUNCTION public.mm_seed_as_needed_rules()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_added integer := 0;
BEGIN
  INSERT INTO public.maintenance_task_templates (
    task_name,
    task_code,
    template_scope,
    component_id,
    interval_km,
    interval_km_max,
    interval_months,
    frequency_kind,
    due_kind,
    status,
    source_type,
    confidence,
    applicable_vehicle_classes
  )
  SELECT
    c.name || ' (as needed)',
    c.code,
    'global',
    c.id,
    NULL,
    NULL,
    NULL,
    'manual_only',
    'part_schedule',
    'active',
    'roam_policy',
    'uncertain',
    ARRAY['car']::text[]
  FROM (
    VALUES
      ('ac_evaporator_cleaning'),
      ('ac_recharge'),
      ('ac_disinfection'),
      ('adblue_topup'),
      ('battery_terminal_cleaning'),
      ('carburetor_cleaning'),
      ('ev_charging_port_cleaning'),
      ('rod_bearings'),
      ('coolant_part'),
      ('crankshaft_machining'),
      ('cylinder_head_machining'),
      ('cylinder_honing'),
      ('dpf_cleaning'),
      ('egr_cleaning'),
      ('engine_bay_degreasing'),
      ('engine_oil_part'),
      ('engine_overhaul'),
      ('engine_service_labor'),
      ('exhaust_flange_gasket'),
      ('exhaust_manifold_gasket'),
      ('exhaust_inspection'),
      ('fuel_induction_service'),
      ('head_gasket'),
      ('hv_battery_fan_cleaning'),
      ('hv_battery_health_check'),
      ('hv_insulation_inspection'),
      ('inspection_diagnostic_fee'),
      ('intake_manifold_gasket'),
      ('walnut_blasting'),
      ('intercooler_cleaning'),
      ('leak_inspection'),
      ('maf_map_sensor_cleaning'),
      ('main_bearings'),
      ('oil_pan_gasket'),
      ('piston_replacement'),
      ('piston_rings'),
      ('puncture_repair'),
      ('scr_service'),
      ('throttle_body_cleaning'),
      ('throttle_body_relearn'),
      ('turbo_decoking'),
      ('valve_cover_gasket'),
      ('valve_grinding_seating'),
      ('valve_stem_seals'),
      ('washer_fluid_part'),
      ('wheel_balancing'),
      ('wheel_straightening')
  ) AS as_needed(code)
  JOIN public.maintenance_service_categories c ON c.code = as_needed.code
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.maintenance_task_templates t
    WHERE t.component_id = c.id
  );

  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN v_added;
END;
$$;

COMMENT ON FUNCTION public.mm_seed_as_needed_rules() IS
  'Idempotent: writes one global manual_only (As needed) rule per Appendix A part type that exists. Returns rows added.';

SELECT public.mm_seed_as_needed_rules();

-- A part that is As needed must not keep a car row: those rows were the "OK with no interval"
-- padding MER-14 describes. Retire them with the reason the screens will print.
UPDATE public.vehicle_component_schedule vcs
SET
  schedule_status = 'retired',
  retired_reason = 'As needed: done only when a job calls for it',
  rule_id = NULL,
  rule_revision_no = NULL,
  interval_km_used = NULL,
  interval_months_used = NULL,
  interval_basis = NULL,
  next_due_km = NULL,
  next_due_km_max = NULL,
  next_due_date = NULL,
  computed_at = now(),
  updated_at = now()
WHERE vcs.schedule_status <> 'retired'
  AND public.mm_part_is_as_needed(vcs.category_id);

REVOKE ALL ON FUNCTION public.mm_seed_as_needed_rules() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261127114508', 'mm_seed_as_needed_rules') ON CONFLICT (version) DO NOTHING;

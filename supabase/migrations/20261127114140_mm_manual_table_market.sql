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

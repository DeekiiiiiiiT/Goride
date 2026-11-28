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

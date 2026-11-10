-- Engine service sections — Layer 1 Data (Rev 5). Order: D5a → D1 → D1b → D2 → D3a → D3 → D3b → D5 → D5c → D5 rule → D4 → D5b → D6 → D7 → reload.

-- =============================================================================
-- D5a — default_action column + unified 12-value action list
-- =============================================================================
ALTER TABLE public.maintenance_service_categories
  ADD COLUMN IF NOT EXISTS default_action text;

ALTER TABLE public.maintenance_service_categories
  DROP CONSTRAINT IF EXISTS maintenance_service_categories_default_action_check;

ALTER TABLE public.maintenance_service_categories
  ADD CONSTRAINT maintenance_service_categories_default_action_check
  CHECK (
    default_action IS NULL
    OR default_action IN (
      'inspect', 'clean', 'adjust', 'replace', 'rotate', 'balance',
      'flush', 'top_up', 'repair', 'machine', 'rebuild', 'other'
    )
  );

ALTER TABLE public.maintenance_work_order_lines
  DROP CONSTRAINT IF EXISTS maintenance_work_order_lines_action_check;

ALTER TABLE public.maintenance_work_order_lines
  ADD CONSTRAINT maintenance_work_order_lines_action_check
  CHECK (
    action IN (
      'inspect', 'clean', 'adjust', 'replace', 'rotate', 'balance',
      'flush', 'top_up', 'repair', 'machine', 'rebuild', 'other'
    )
  );

-- =============================================================================
-- D1 — maintenance_job_section_groups
-- =============================================================================
CREATE TABLE public.maintenance_job_section_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id uuid NOT NULL REFERENCES public.maintenance_service_categories (id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_job_section_groups_code_key UNIQUE (code),
  CONSTRAINT maintenance_job_section_groups_system_name_key UNIQUE (system_id, name)
);

CREATE INDEX idx_mjsg_system_sort ON public.maintenance_job_section_groups (system_id, sort_order, name);

-- =============================================================================
-- D1b — maintenance_job_sections
-- =============================================================================
CREATE TABLE public.maintenance_job_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.maintenance_job_section_groups (id) ON DELETE CASCADE,
  system_id uuid NOT NULL REFERENCES public.maintenance_service_categories (id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  icon_key text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_job_sections_code_key UNIQUE (code),
  CONSTRAINT maintenance_job_sections_group_name_key UNIQUE (group_id, name)
);

CREATE INDEX idx_mjs_group_sort ON public.maintenance_job_sections (group_id, sort_order, name);

-- =============================================================================
-- D2 — maintenance_job_section_members
-- =============================================================================
CREATE TABLE public.maintenance_job_section_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.maintenance_job_sections (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.maintenance_service_categories (id) ON DELETE RESTRICT,
  system_id uuid NOT NULL REFERENCES public.maintenance_service_categories (id) ON DELETE RESTRICT,
  sort_order integer,
  CONSTRAINT maintenance_job_section_members_section_category_key UNIQUE (section_id, category_id),
  CONSTRAINT maintenance_job_section_members_system_category_key UNIQUE (system_id, category_id)
);

CREATE INDEX idx_mjsm_category ON public.maintenance_job_section_members (category_id);

-- =============================================================================
-- Triggers — system_id integrity (section groups, sections, members)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_mjsg_system_id_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.maintenance_service_categories c
    WHERE c.id = NEW.system_id AND c.kind = 'system'
  ) THEN
    RAISE EXCEPTION 'Section group must belong to a system (kind=system)';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.system_id IS DISTINCT FROM NEW.system_id THEN
    RAISE EXCEPTION 'Section group system cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mjsg_system_id_guard ON public.maintenance_job_section_groups;
CREATE TRIGGER trg_mjsg_system_id_guard
  BEFORE INSERT OR UPDATE ON public.maintenance_job_section_groups
  FOR EACH ROW EXECUTE FUNCTION public.trg_mjsg_system_id_guard();

CREATE OR REPLACE FUNCTION public.trg_mjs_section_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_group_system uuid;
BEGIN
  SELECT g.system_id INTO v_group_system
  FROM public.maintenance_job_section_groups g
  WHERE g.id = NEW.group_id;
  IF v_group_system IS NULL THEN
    RAISE EXCEPTION 'Section group not found';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.system_id := v_group_system;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.system_id IS DISTINCT FROM NEW.system_id OR OLD.group_id IS DISTINCT FROM NEW.group_id THEN
      RAISE EXCEPTION 'Section cannot change group or system';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mjs_section_guard ON public.maintenance_job_sections;
CREATE TRIGGER trg_mjs_section_guard
  BEFORE INSERT OR UPDATE ON public.maintenance_job_sections
  FOR EACH ROW EXECUTE FUNCTION public.trg_mjs_section_guard();

CREATE OR REPLACE FUNCTION public.trg_mjsm_member_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_section_system uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.maintenance_service_categories c
    WHERE c.id = NEW.category_id AND c.kind = 'component'
  ) THEN
    RAISE EXCEPTION 'Section member must be a job (kind=component)';
  END IF;
  SELECT s.system_id INTO v_section_system
  FROM public.maintenance_job_sections s
  WHERE s.id = NEW.section_id;
  IF v_section_system IS NULL THEN
    RAISE EXCEPTION 'Section not found';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.system_id := v_section_system;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.section_id IS DISTINCT FROM OLD.section_id THEN
      IF v_section_system IS DISTINCT FROM OLD.system_id THEN
        RAISE EXCEPTION 'A job can only move between sections of the same group';
      END IF;
      NEW.system_id := OLD.system_id;
    ELSIF OLD.system_id IS DISTINCT FROM NEW.system_id THEN
      RAISE EXCEPTION 'Section member system cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mjsm_member_guard ON public.maintenance_job_section_members;
CREATE TRIGGER trg_mjsm_member_guard
  BEFORE INSERT OR UPDATE ON public.maintenance_job_section_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_mjsm_member_guard();

ALTER TABLE public.maintenance_job_section_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_job_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_job_section_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.maintenance_job_section_groups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.maintenance_job_sections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.maintenance_job_section_members FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.maintenance_job_section_groups TO service_role;
GRANT ALL ON TABLE public.maintenance_job_sections TO service_role;
GRANT ALL ON TABLE public.maintenance_job_section_members TO service_role;

DROP TRIGGER IF EXISTS mm_master_revision_job_section_groups ON public.maintenance_job_section_groups;
CREATE TRIGGER mm_master_revision_job_section_groups
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_job_section_groups
  FOR EACH ROW EXECUTE FUNCTION public.trg_master_revision();

DROP TRIGGER IF EXISTS mm_master_revision_job_sections ON public.maintenance_job_sections;
CREATE TRIGGER mm_master_revision_job_sections
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_job_sections
  FOR EACH ROW EXECUTE FUNCTION public.trg_master_revision();

DROP TRIGGER IF EXISTS mm_master_revision_job_section_members ON public.maintenance_job_section_members;
CREATE TRIGGER mm_master_revision_job_section_members
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_job_section_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_master_revision();

-- =============================================================================
-- D3a — rename guard (every FK referencing maintenance_service_categories)
-- =============================================================================
DO $$
DECLARE
  r record;
  v_cnt bigint;
  v_prb uuid;
  v_chr uuid;
BEGIN
  SELECT id INTO v_prb FROM public.maintenance_service_categories WHERE code = 'piston_rings_bearings';
  SELECT id INTO v_chr FROM public.maintenance_service_categories WHERE code = 'cylinder_head_recondition';
  IF v_prb IS NULL OR v_chr IS NULL THEN
    RAISE EXCEPTION 'D3a: expected piston_rings_bearings and cylinder_head_recondition before rename';
  END IF;

  FOR r IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS rel_name,
      a.attname AS col_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (con.conkey)
    JOIN pg_class ref ON ref.oid = con.confrelid
    JOIN pg_namespace refn ON refn.oid = ref.relnamespace
    WHERE con.contype = 'f'
      AND refn.nspname = 'public'
      AND ref.relname = 'maintenance_service_categories'
      AND a.attnum = con.conkey[1]
  LOOP
    EXECUTE format(
      'SELECT count(*)::bigint FROM %I.%I WHERE %I IN ($1, $2)',
      r.schema_name,
      r.rel_name,
      r.col_name
    )
    INTO v_cnt
    USING v_prb, v_chr;
    IF v_cnt > 0 THEN
      RAISE EXCEPTION 'D3a: % has % rows referencing combined jobs before rename', r.schema_name || '.' || r.rel_name, v_cnt;
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- D3 — renames + 8 new engine jobs
-- =============================================================================
UPDATE public.maintenance_service_categories
SET name = 'Fuel Injector Cleaning / Induction Service',
    plain_name = 'Fuel Injector Cleaning / Induction Service'
WHERE code = 'fuel_induction_service';

UPDATE public.maintenance_service_categories
SET code = 'piston_rings',
    name = 'Piston Ring Replacement',
    plain_name = 'Piston Ring Replacement',
    op_code = 'ENG-PRING'
WHERE code = 'piston_rings_bearings';

UPDATE public.maintenance_service_categories
SET code = 'cylinder_head_machining',
    name = 'Cylinder Head Machining / Resurfacing',
    plain_name = 'Cylinder Head Machining / Resurfacing',
    op_code = 'ENG-CHM',
    is_part = false,
    default_fit_mode = NULL
WHERE code = 'cylinder_head_recondition';

INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, description, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, default_fit_mode, part_type_status, position_scheme, status, default_action
)
SELECT v.code, v.name, v.name, v.description,
       'gears',
       '{"fields":[{"key":"qty","type":"number","label":"Quantity","required":false},{"key":"unit_price","type":"number","label":"Unit price","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
       true, v.sort_order,
       sys.id, 'component', v.op_code, false, true, 'engine', 'active', 'none', 'active', 'replace'
FROM (VALUES
  ('fuel_injector', 'Fuel Injector Replacement', 'ENG-FINJ', 310,
   'Replaces a faulty injector so the engine gets the right amount of fuel again.'),
  ('valve_stem_seals', 'Valve Stem Seal Replacement', 'ENG-VSS', 320,
   'Replaces worn seals that let oil leak past the valve stems into the combustion chamber.'),
  ('piston_replacement', 'Piston Replacement', 'ENG-PIST', 340,
   'Replaces damaged pistons to restore compression and stop the engine from burning oil.'),
  ('rod_bearings', 'Connecting Rod Bearing Replacement', 'ENG-RBRG', 360,
   'Replaces worn bearings between the connecting rods and crankshaft to stop knocking.'),
  ('main_bearings', 'Main Bearing Replacement', 'ENG-MBRG', 370,
   'Replaces the main crankshaft bearings to restore oil pressure and stop deep engine knock.')
) AS v(code, name, op_code, sort_order, description)
CROSS JOIN public.maintenance_service_categories sys
WHERE sys.code = 'sys_engine'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, description, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, part_type_status, position_scheme, status, default_action
)
SELECT v.code, v.name, v.name, v.description,
       'wrench',
       '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false},{"key":"material","type":"number","label":"Parts / materials","required":false}]}'::jsonb,
       true, v.sort_order,
       sys.id, 'component', v.op_code, false, false, 'active', 'none', 'active', v.default_action
FROM (VALUES
  ('valve_grinding_seating', 'Valve Grinding & Seating', 'ENG-VGS', 330, 'machine',
   'Grinds and seats the valves so they seal properly when the head is apart on the bench.'),
  ('cylinder_honing', 'Cylinder Honing / Boring', 'ENG-CHON', 350, 'machine',
   'Hones or bores the cylinders to the correct finish before new rings or pistons go in.'),
  ('crankshaft_machining', 'Crankshaft Machining / Polishing', 'ENG-CRNK', 380, 'machine',
   'Machines or polishes the crankshaft journals so bearings run smoothly with correct oil clearance.')
) AS v(code, name, op_code, sort_order, default_action, description)
CROSS JOIN public.maintenance_service_categories sys
WHERE sys.code = 'sys_engine'
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- D3b — active Engine-home jobs = 29
-- =============================================================================
DO $$
DECLARE
  v_cnt bigint;
  v_engine uuid;
BEGIN
  SELECT id INTO v_engine FROM public.maintenance_service_categories WHERE code = 'sys_engine';
  SELECT count(*)::bigint INTO v_cnt
  FROM public.maintenance_service_categories c
  WHERE c.kind = 'component'
    AND c.status = 'active'
    AND c.parent_id = v_engine;
  IF v_cnt IS DISTINCT FROM 29 THEN
    RAISE EXCEPTION 'D3b: expected 29 active Engine-home jobs, found %', v_cnt;
  END IF;
END $$;

-- =============================================================================
-- D5 — seed default_action by job code / op_code
-- =============================================================================
UPDATE public.maintenance_service_categories AS c
SET default_action = v.action
FROM (
  VALUES
    ('replace', 'belt'), ('replace', 'brakes'), ('replace', 'brake_shoes_drums'),
    ('replace', 'brake_rotor'), ('replace', 'brake_caliper'), ('replace', 'brake_drum'),
    ('replace', 'brake_wheel_cylinder'), ('replace', 'brake_hose'), ('replace', 'brake_master_cylinder'),
    ('replace', 'handbrake_cable'), ('replace', 'abs_wheel_sensor'),
    ('replace', 'ELEC-BATT'), ('replace', 'ELEC-START'), ('replace', 'ELEC-ALT'),
    ('replace', 'oil'), ('replace', 'spark_plugs'), ('replace', 'fuel_injector'),
    ('replace', 'spark_plug_wires'), ('replace', 'pcv_valve'), ('replace', 'timing_belt'),
    ('replace', 'timing_chain'), ('replace', 'valve_cover_gasket'), ('replace', 'oil_pan_gasket'),
    ('replace', 'intake_manifold_gasket'), ('replace', 'head_gasket'), ('replace', 'valve_stem_seals'),
    ('replace', 'piston_rings'), ('replace', 'piston_replacement'), ('replace', 'rod_bearings'),
    ('replace', 'main_bearings'), ('replace', 'oxygen_sensor'), ('replace', 'thermostat'),
    ('replace', 'water_pump'), ('replace', 'ignition_coil'),
    ('replace', 'air_filter'), ('replace', 'fuel_filter'), ('replace', 'cabin_filter'),
    ('replace', 'LGT-IND'), ('replace', 'LGT-TAIL'), ('replace', 'LGT-HEAD'), ('replace', 'fog_light_bulb'),
    ('replace', 'wipers'), ('replace', 'suspension'), ('replace', 'shock_absorber'), ('replace', 'tires'),
    ('clean', 'throttle_body_cleaning'), ('clean', 'fuel_induction_service'),
    ('inspect', 'leak_inspection'), ('inspect', 'lights'),
    ('adjust', 'valve_clearance_adjustment'), ('adjust', 'wheel_alignment'), ('adjust', 'tire_pressure'),
    ('machine', 'cylinder_head_machining'), ('machine', 'valve_grinding_seating'),
    ('machine', 'cylinder_honing'), ('machine', 'crankshaft_machining'),
    ('rebuild', 'engine_overhaul'),
    ('flush', 'brake_fluid'), ('flush', 'coolant_flush'), ('flush', 'transmission'),
    ('top_up', 'fluids'), ('top_up', 'engine_oil_part'), ('top_up', 'coolant_part'), ('top_up', 'washer_fluid_part'),
    ('rotate', 'rotate_tires'),
    ('balance', 'wheel_balancing'),
    ('repair', 'puncture_repair'), ('repair', 'wheel_straightening')
) AS v(action, job_key)
WHERE c.kind = 'component'
  AND (c.code = v.job_key OR upper(c.op_code) = upper(v.job_key));

-- =============================================================================
-- D5c + required rule on component jobs
-- =============================================================================
UPDATE public.maintenance_service_categories
SET default_action = 'replace'
WHERE kind = 'component' AND default_action IS NULL;

ALTER TABLE public.maintenance_service_categories
  DROP CONSTRAINT IF EXISTS maintenance_service_categories_default_action_required;

ALTER TABLE public.maintenance_service_categories
  ADD CONSTRAINT maintenance_service_categories_default_action_required
  CHECK (kind <> 'component' OR default_action IS NOT NULL);

-- =============================================================================
-- D4 — section groups, sections, members, icons
-- =============================================================================
INSERT INTO public.maintenance_job_section_groups (system_id, code, name, sort_order)
SELECT sys.id, g.code, g.name, g.sort_order
FROM (VALUES
  ('eng_g_external', 'External bolt-on & induction', 10),
  ('eng_g_top_end', 'Top end (cylinder head)', 20),
  ('eng_g_bottom_end', 'Bottom end (engine block)', 30),
  ('eng_g_whole', 'Whole engine', 40)
) AS g(code, name, sort_order)
CROSS JOIN public.maintenance_service_categories sys
WHERE sys.code = 'sys_engine'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.maintenance_job_sections (group_id, system_id, code, name, description, icon_key, sort_order)
SELECT grp.id, grp.system_id, s.code, s.name, s.description, s.icon_key, s.sort_order
FROM (VALUES
  ('eng_g_external', 'eng_air_intake', 'Air Intake & Induction', 'wind',
   'Parts that bring clean air into the engine. All on the outside — nothing is taken apart.', 10),
  ('eng_g_external', 'eng_fuel', 'Fuel System', 'droplet',
   'Parts that spray fuel into the engine. Worked on from the outside.', 20),
  ('eng_g_external', 'eng_ignition', 'Ignition System', 'spark',
   'Parts that make the spark that burns the fuel.', 30),
  ('eng_g_external', 'eng_drive', 'Accessory & Timing Drive', 'belt',
   'Belts and chains at the front of the engine that drive its parts and keep the valves in time.', 40),
  ('eng_g_external', 'eng_fluids', 'Fluids & Emissions', 'oil',
   'Oil, coolant and the parts that keep fumes and leaks under control.', 50),
  ('eng_g_external', 'eng_cooling', 'Cooling System', 'thermometer',
   'Parts that move coolant around the engine so it doesn''t overheat.', 60),
  ('eng_g_top_end', 'eng_top_end', 'Cylinder Head', 'gears',
   'Everything from the head gasket up. The valve cover comes off at minimum; most head work means the head comes off.', 10),
  ('eng_g_bottom_end', 'eng_pistons', 'Pistons & Compression', 'gears',
   'Done by pulling the pistons out the top after the head is removed. Restores compression and stops oil burning.', 10),
  ('eng_g_bottom_end', 'eng_crank', 'Crankshaft & Rotating Assembly', 'gears',
   'Done from underneath after the oil pan comes off. Restores oil pressure and fixes knocking.', 20),
  ('eng_g_whole', 'eng_whole', 'Whole Engine', 'wrench',
   'The engine comes out and is taken apart completely.', 10)
) AS s(group_code, code, name, icon_key, description, sort_order)
JOIN public.maintenance_job_section_groups grp ON grp.code = s.group_code
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.maintenance_job_section_members (section_id, category_id, sort_order)
SELECT s.id, c.id, m.sort_order
FROM (VALUES
  ('eng_air_intake', 'air_filter', 10),
  ('eng_air_intake', 'throttle_body_cleaning', 20),
  ('eng_air_intake', 'intake_manifold_gasket', 30),
  ('eng_fuel', 'fuel_induction_service', 10),
  ('eng_fuel', 'fuel_injector', 20),
  ('eng_ignition', 'spark_plugs', 10),
  ('eng_ignition', 'ignition_coil', 20),
  ('eng_ignition', 'spark_plug_wires', 30),
  ('eng_drive', 'belt', 10),
  ('eng_drive', 'timing_belt', 20),
  ('eng_drive', 'timing_chain', 30),
  ('eng_fluids', 'oil', 10),
  ('eng_fluids', 'coolant_flush', 20),
  ('eng_fluids', 'pcv_valve', 30),
  ('eng_fluids', 'oxygen_sensor', 40),
  ('eng_fluids', 'leak_inspection', 50),
  ('eng_cooling', 'thermostat', 10),
  ('eng_cooling', 'water_pump', 20),
  ('eng_top_end', 'valve_cover_gasket', 10),
  ('eng_top_end', 'valve_clearance_adjustment', 20),
  ('eng_top_end', 'valve_stem_seals', 30),
  ('eng_top_end', 'valve_grinding_seating', 40),
  ('eng_top_end', 'cylinder_head_machining', 50),
  ('eng_top_end', 'head_gasket', 60),
  ('eng_pistons', 'piston_rings', 10),
  ('eng_pistons', 'piston_replacement', 20),
  ('eng_pistons', 'cylinder_honing', 30),
  ('eng_crank', 'rod_bearings', 10),
  ('eng_crank', 'main_bearings', 20),
  ('eng_crank', 'crankshaft_machining', 30),
  ('eng_crank', 'oil_pan_gasket', 40),
  ('eng_whole', 'engine_overhaul', 10)
) AS m(section_code, job_code, sort_order)
JOIN public.maintenance_job_sections s ON s.code = m.section_code
JOIN public.maintenance_service_categories c ON c.code = m.job_code
ON CONFLICT DO NOTHING;

UPDATE public.maintenance_service_categories AS c
SET icon_key = s.icon_key
FROM public.maintenance_job_section_members m
JOIN public.maintenance_job_sections s ON s.id = m.section_id,
     public.maintenance_service_categories eng
WHERE c.id = m.category_id
  AND eng.id = c.parent_id
  AND eng.code = 'sys_engine'
  AND c.kind = 'component'
  AND c.status = 'active'
  AND c.code NOT IN ('air_filter', 'belt', 'coolant_flush');

-- =============================================================================
-- D5b — upsert_self_serve_part_type sets default_action on insert
-- =============================================================================
CREATE OR REPLACE FUNCTION public.upsert_self_serve_part_type(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := nullif(p_input->>'id', '')::uuid;
  v_parent uuid := nullif(p_input->>'areaId', '')::uuid;
  v_name text := btrim(coalesce(p_input->>'name', ''));
  v_op text := upper(btrim(coalesce(p_input->>'opCode', '')));
  v_mode text := lower(coalesce(p_input->>'defaultFitMode', 'specific'));
  v_scheme text := lower(coalesce(p_input->>'positionScheme', 'none'));
  v_status text := lower(coalesce(p_input->>'status', 'active'));
  v_hint text := nullif(btrim(coalesce(p_input->>'editorHint', '')), '');
  v_term text := nullif(btrim(coalesce(p_input->>'tradeTerm', '')), '');
  v_field jsonb;
  v_spec_key text;
  v_sort int := 0;
  v_field_count int := 0;
BEGIN
  IF v_name = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF v_parent IS NULL THEN RAISE EXCEPTION 'Choose an area'; END IF;
  IF v_mode NOT IN ('specific', 'engine', 'spec') THEN RAISE EXCEPTION 'Invalid fit mode'; END IF;
  IF v_status NOT IN ('active', 'draft') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  IF v_id IS NULL THEN
    IF v_op = '' THEN RAISE EXCEPTION 'Op code is required for new types'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.maintenance_service_categories c
      WHERE c.is_part IS TRUE AND upper(coalesce(c.op_code, '')) = v_op
    ) THEN
      RAISE EXCEPTION 'Op code already in use';
    END IF;
    INSERT INTO public.maintenance_service_categories (
      code, name, plain_name, parent_id, is_part, op_code, kind,
      default_fit_mode, position_scheme, trade_term, editor_hint, part_type_status, sort_order, default_action
    ) VALUES (
      lower(replace(v_op, '-', '_')), v_name, v_name, v_parent, true, v_op, 'component',
      v_mode, v_scheme, v_term, v_hint, v_status, 900, 'replace'
    )
    RETURNING id INTO v_id;
  ELSE
    IF v_op <> '' AND EXISTS (
      SELECT 1 FROM public.maintenance_service_categories c
      WHERE c.is_part IS TRUE AND upper(coalesce(c.op_code, '')) = v_op AND c.id <> v_id
    ) THEN
      RAISE EXCEPTION 'Op code already in use';
    END IF;
    UPDATE public.maintenance_service_categories
    SET name = v_name,
        plain_name = v_name,
        parent_id = v_parent,
        default_fit_mode = v_mode,
        position_scheme = v_scheme,
        trade_term = v_term,
        editor_hint = v_hint,
        part_type_status = v_status,
        op_code = CASE WHEN v_op <> '' THEN v_op ELSE op_code END
    WHERE id = v_id AND is_part IS TRUE AND kind = 'component';
    IF NOT FOUND THEN RAISE EXCEPTION 'Part type not found'; END IF;
  END IF;

  IF jsonb_typeof(p_input->'specFields') = 'array' THEN
    DELETE FROM public.part_type_spec_field WHERE part_type_id = v_id;
    FOR v_field IN SELECT value FROM jsonb_array_elements(p_input->'specFields') AS value
    LOOP
      v_spec_key := lower(btrim(coalesce(v_field->>'specKey', '')));
      IF v_spec_key = '' OR NOT EXISTS (SELECT 1 FROM public.spec_key sk WHERE sk.key = v_spec_key) THEN
        CONTINUE;
      END IF;
      v_sort := v_sort + 1;
      INSERT INTO public.part_type_spec_field (
        part_type_id, spec_key, label, unit, data_type, options, required, example, sort_order
      ) VALUES (
        v_id,
        v_spec_key,
        coalesce(nullif(btrim(v_field->>'label'), ''), v_spec_key),
        nullif(btrim(v_field->>'unit'), ''),
        lower(coalesce(nullif(v_field->>'dataType', ''), 'text')),
        v_field->'options',
        coalesce((v_field->>'required')::boolean, false),
        nullif(btrim(v_field->>'example'), ''),
        coalesce((v_field->>'sortOrder')::int, v_sort)
      );
      v_field_count := v_field_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'specFieldCount', v_field_count);
END;
$$;

-- =============================================================================
-- D6 — maintenance_job_relations + seed
-- =============================================================================
CREATE TABLE public.maintenance_job_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_category_id uuid NOT NULL REFERENCES public.maintenance_service_categories (id) ON DELETE CASCADE,
  to_category_id uuid NOT NULL REFERENCES public.maintenance_service_categories (id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  note text NOT NULL,
  CONSTRAINT maintenance_job_relations_type_check CHECK (relation_type = 'recommended_with'),
  CONSTRAINT maintenance_job_relations_pair_key UNIQUE (from_category_id, to_category_id, relation_type),
  CONSTRAINT maintenance_job_relations_no_self CHECK (from_category_id <> to_category_id)
);

CREATE INDEX idx_mjr_from ON public.maintenance_job_relations (from_category_id);
CREATE INDEX idx_mjr_to ON public.maintenance_job_relations (to_category_id);

ALTER TABLE public.maintenance_job_relations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.maintenance_job_relations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.maintenance_job_relations TO service_role;

DROP TRIGGER IF EXISTS mm_master_revision_job_relations ON public.maintenance_job_relations;
CREATE TRIGGER mm_master_revision_job_relations
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_job_relations
  FOR EACH ROW EXECUTE FUNCTION public.trg_master_revision();

INSERT INTO public.maintenance_job_relations (from_category_id, to_category_id, relation_type, note)
SELECT f.id, t.id, 'recommended_with', v.note
FROM (VALUES
  ('piston_rings', 'head_gasket', 'The head is already off.'),
  ('piston_rings', 'cylinder_honing', 'New rings need freshly honed cylinders.'),
  ('piston_rings', 'valve_stem_seals', 'Easy while the head is off.'),
  ('piston_rings', 'oil', 'Fresh oil after engine work.'),
  ('main_bearings', 'rod_bearings', 'Same area, same tear-down.'),
  ('main_bearings', 'oil_pan_gasket', 'The pan is already off.'),
  ('main_bearings', 'oil', 'Fresh oil after engine work.'),
  ('rod_bearings', 'oil_pan_gasket', 'The pan is already off.'),
  ('cylinder_head_machining', 'head_gasket', 'A new gasket goes on a machined head.'),
  ('cylinder_head_machining', 'valve_grinding_seating', 'Usually done with the head on the bench.'),
  ('valve_grinding_seating', 'valve_stem_seals', 'The valves are already out.'),
  ('head_gasket', 'oil', 'Oil may be contaminated after a head gasket failure.'),
  ('head_gasket', 'coolant_flush', 'Coolant may be contaminated after a head gasket failure.'),
  ('timing_belt', 'water_pump', 'Usually driven by the timing belt — change together.'),
  ('timing_belt', 'belt', 'The front of the engine is already open.'),
  ('pcv_valve', 'oil', 'A blocked PCV valve dirties the oil.')
) AS v(from_code, to_code, note)
JOIN public.maintenance_service_categories f ON f.code = v.from_code
JOIN public.maintenance_service_categories t ON t.code = v.to_code
ON CONFLICT DO NOTHING;

-- =============================================================================
-- D7 — maintenance_job_used_ids()
-- =============================================================================
CREATE OR REPLACE FUNCTION public.maintenance_job_used_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      ns.nspname AS schema_name,
      c.relname AS table_name,
      a.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (con.conkey) AND a.attnum = con.conkey[1]
    JOIN pg_class ref ON ref.oid = con.confrelid
    JOIN pg_namespace refn ON refn.oid = ref.relnamespace
    WHERE con.contype = 'f'
      AND refn.nspname = 'public'
      AND ref.relname = 'maintenance_service_categories'
      AND NOT (
        c.relname = 'maintenance_service_categories' AND a.attname = 'parent_id'
      )
      AND NOT (
        c.relname = 'maintenance_job_section_members' AND a.attname = 'category_id'
      )
      AND NOT (
        c.relname = 'maintenance_job_relations'
        AND a.attname IN ('from_category_id', 'to_category_id')
      )
  LOOP
    RETURN QUERY EXECUTE format(
      'SELECT DISTINCT %I::uuid FROM %I.%I WHERE %I IS NOT NULL',
      r.column_name,
      r.schema_name,
      r.table_name,
      r.column_name
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.maintenance_job_used_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_job_used_ids() TO service_role;

NOTIFY pgrst, 'reload schema';

-- Garage-grade maintenance: taxonomy hierarchy, work orders, DVI, parts usage, op codes.

-- =============================================================================
-- Phase 1: System → Component taxonomy
-- =============================================================================
ALTER TABLE public.maintenance_service_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.maintenance_service_categories(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'component',
  ADD COLUMN IF NOT EXISTS op_code text;

ALTER TABLE public.maintenance_service_categories
  DROP CONSTRAINT IF EXISTS maintenance_service_categories_kind_check;
ALTER TABLE public.maintenance_service_categories
  ADD CONSTRAINT maintenance_service_categories_kind_check
  CHECK (kind IN ('system', 'component'));

-- Systems cannot have parents; components should have parents (enforced in app; soft DB rule)
CREATE INDEX IF NOT EXISTS idx_msc_parent ON public.maintenance_service_categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_msc_kind ON public.maintenance_service_categories (kind);

COMMENT ON COLUMN public.maintenance_service_categories.parent_id IS
  'Null for systems; set for components under a system.';
COMMENT ON COLUMN public.maintenance_service_categories.kind IS
  'system = parent icon group; component = loggable leaf.';
COMMENT ON COLUMN public.maintenance_service_categories.op_code IS
  'Stable garage op code (e.g. FILT-CABIN, BRK-PADS).';

-- Seed systems (stable UUIDs)
INSERT INTO public.maintenance_service_categories
  (id, code, name, icon_key, field_schema, quick_job_eligible, sort_order, kind, parent_id, op_code)
VALUES
  ('b1000000-0000-4000-8000-000000000001', 'sys_engine', 'Engine', 'oil',
   '{"fields":[]}'::jsonb, true, 1000, 'system', null, 'ENG'),
  ('b1000000-0000-4000-8000-000000000002', 'sys_filters', 'Filters', 'filter',
   '{"fields":[]}'::jsonb, true, 1010, 'system', null, 'FILT'),
  ('b1000000-0000-4000-8000-000000000003', 'sys_tires', 'Tires & wheels', 'tires',
   '{"fields":[]}'::jsonb, true, 1020, 'system', null, 'TIRE'),
  ('b1000000-0000-4000-8000-000000000004', 'sys_brakes', 'Brakes', 'brakes',
   '{"fields":[]}'::jsonb, true, 1030, 'system', null, 'BRK'),
  ('b1000000-0000-4000-8000-000000000005', 'sys_fluids', 'Fluids', 'droplet',
   '{"fields":[]}'::jsonb, true, 1040, 'system', null, 'FLD'),
  ('b1000000-0000-4000-8000-000000000006', 'sys_belts', 'Belts & hoses', 'belt',
   '{"fields":[]}'::jsonb, true, 1050, 'system', null, 'BELT'),
  ('b1000000-0000-4000-8000-000000000007', 'sys_lighting', 'Lighting & visibility', 'lightbulb',
   '{"fields":[]}'::jsonb, true, 1060, 'system', null, 'LGT'),
  ('b1000000-0000-4000-8000-000000000008', 'sys_suspension', 'Suspension & steering', 'suspension',
   '{"fields":[]}'::jsonb, true, 1070, 'system', null, 'SUS'),
  ('b1000000-0000-4000-8000-000000000009', 'sys_transmission', 'Transmission', 'gears',
   '{"fields":[]}'::jsonb, true, 1080, 'system', null, 'TRN'),
  ('b1000000-0000-4000-8000-00000000000a', 'sys_hvac', 'HVAC', 'wind',
   '{"fields":[]}'::jsonb, true, 1090, 'system', null, 'HVAC'),
  ('b1000000-0000-4000-8000-00000000000b', 'sys_electrical', 'Battery & electrical', 'spark',
   '{"fields":[]}'::jsonb, true, 1100, 'system', null, 'ELEC')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  icon_key = EXCLUDED.icon_key,
  kind = 'system',
  parent_id = NULL,
  quick_job_eligible = true,
  op_code = EXCLUDED.op_code,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Remap existing flat rows → components under systems
UPDATE public.maintenance_service_categories SET
  kind = 'component',
  parent_id = CASE code
    WHEN 'oil' THEN 'b1000000-0000-4000-8000-000000000001'::uuid
    WHEN 'spark_plugs' THEN 'b1000000-0000-4000-8000-000000000001'::uuid
    WHEN 'air_filter' THEN 'b1000000-0000-4000-8000-000000000002'::uuid
    WHEN 'cabin_filter' THEN 'b1000000-0000-4000-8000-00000000000a'::uuid
    WHEN 'tires' THEN 'b1000000-0000-4000-8000-000000000003'::uuid
    WHEN 'tire_pressure' THEN 'b1000000-0000-4000-8000-000000000003'::uuid
    WHEN 'rotate_tires' THEN 'b1000000-0000-4000-8000-000000000003'::uuid
    WHEN 'brakes' THEN 'b1000000-0000-4000-8000-000000000004'::uuid
    WHEN 'brake_fluid' THEN 'b1000000-0000-4000-8000-000000000004'::uuid
    WHEN 'fluids' THEN 'b1000000-0000-4000-8000-000000000005'::uuid
    WHEN 'coolant_flush' THEN 'b1000000-0000-4000-8000-000000000005'::uuid
    WHEN 'belt' THEN 'b1000000-0000-4000-8000-000000000006'::uuid
    WHEN 'lights' THEN 'b1000000-0000-4000-8000-000000000007'::uuid
    WHEN 'wipers' THEN 'b1000000-0000-4000-8000-000000000007'::uuid
    WHEN 'suspension' THEN 'b1000000-0000-4000-8000-000000000008'::uuid
    WHEN 'transmission' THEN 'b1000000-0000-4000-8000-000000000009'::uuid
    ELSE parent_id
  END,
  op_code = CASE code
    WHEN 'oil' THEN 'ENG-OIL'
    WHEN 'spark_plugs' THEN 'ENG-SPARK'
    WHEN 'air_filter' THEN 'FILT-AIR'
    WHEN 'cabin_filter' THEN 'HVAC-CABIN'
    WHEN 'tires' THEN 'TIRE-REPL'
    WHEN 'tire_pressure' THEN 'TIRE-PSI'
    WHEN 'rotate_tires' THEN 'TIRE-ROT'
    WHEN 'brakes' THEN 'BRK-PADS'
    WHEN 'brake_fluid' THEN 'BRK-FLUID'
    WHEN 'fluids' THEN 'FLD-TOPUP'
    WHEN 'coolant_flush' THEN 'FLD-COOL'
    WHEN 'belt' THEN 'BELT-SERP'
    WHEN 'lights' THEN 'LGT-CHK'
    WHEN 'wipers' THEN 'LGT-WIPER'
    WHEN 'suspension' THEN 'SUS-INSP'
    WHEN 'transmission' THEN 'TRN-FLUID'
    ELSE op_code
  END,
  name = CASE code
    WHEN 'oil' THEN 'Engine oil & filter'
    ELSE name
  END,
  updated_at = now()
WHERE code NOT LIKE 'sys_%';

-- Ensure leaf rows are components
UPDATE public.maintenance_service_categories
SET kind = 'component', updated_at = now()
WHERE code NOT LIKE 'sys_%';

UPDATE public.maintenance_service_categories
SET kind = 'system', parent_id = NULL, updated_at = now()
WHERE code LIKE 'sys_%';

-- Package due kind (Phase 6 light): service vs statutory inspection
ALTER TABLE public.maintenance_task_templates
  ADD COLUMN IF NOT EXISTS due_kind text NOT NULL DEFAULT 'service_package';

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_due_kind_check;
ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_due_kind_check
  CHECK (due_kind IN ('service_package', 'statutory_inspection'));

COMMENT ON COLUMN public.maintenance_task_templates.due_kind IS
  'service_package = Basic/Major style; statutory_inspection = e.g. 車検-style due (platform).';

-- =============================================================================
-- Phase 2: Work orders + lines
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.maintenance_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  vehicle_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  performed_at_date date,
  odometer integer,
  provider text,
  currency text NOT NULL DEFAULT 'JMD',
  template_id uuid REFERENCES public.maintenance_task_templates(id) ON DELETE SET NULL,
  package_complete boolean NOT NULL DEFAULT false,
  log_mode text NOT NULL DEFAULT 'quick_job'
    CHECK (log_mode IN ('package', 'quick_job')),
  notes text,
  invoice_url text,
  total_cost numeric(12, 2),
  maintenance_record_id uuid REFERENCES public.maintenance_records(id) ON DELETE SET NULL,
  payload_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mwo_org_vehicle ON public.maintenance_work_orders (organization_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_mwo_status ON public.maintenance_work_orders (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_mwo_opened ON public.maintenance_work_orders (opened_at DESC);

CREATE TABLE IF NOT EXISTS public.maintenance_work_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.maintenance_work_orders(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  system_id uuid REFERENCES public.maintenance_service_categories(id) ON DELETE SET NULL,
  component_id uuid REFERENCES public.maintenance_service_categories(id) ON DELETE SET NULL,
  system_code text,
  system_name text,
  component_code text,
  component_name text,
  action text NOT NULL DEFAULT 'replace'
    CHECK (action IN ('inspect', 'replace', 'rotate', 'balance', 'flush', 'top_up', 'repair', 'other')),
  qty numeric(12, 3),
  unit_price numeric(12, 2),
  material numeric(12, 2),
  labor_amount numeric(12, 2),
  labor_hours numeric(8, 2),
  labor_rate numeric(12, 2),
  condition text,
  positions text[],
  brand text,
  part_number text,
  warranty boolean NOT NULL DEFAULT false,
  complimentary boolean NOT NULL DEFAULT false,
  part_id uuid REFERENCES public.part_master(id) ON DELETE SET NULL,
  notes text,
  recommended boolean NOT NULL DEFAULT false,
  declined boolean NOT NULL DEFAULT false,
  values_json jsonb,
  line_total numeric(12, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mwol_wo ON public.maintenance_work_order_lines (work_order_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_mwol_part ON public.maintenance_work_order_lines (part_id);

COMMENT ON TABLE public.maintenance_work_orders IS 'Garage job cards / repair orders for a vehicle visit.';
COMMENT ON TABLE public.maintenance_work_order_lines IS 'Structured job lines: system → component → action + commercial fields.';

-- =============================================================================
-- Phase 4: Digital vehicle inspection
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.maintenance_inspection_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id uuid REFERENCES public.maintenance_service_categories(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_inspection_templates_code_key UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS public.maintenance_inspection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.maintenance_inspection_templates(id) ON DELETE CASCADE,
  component_id uuid REFERENCES public.maintenance_service_categories(id) ON DELETE SET NULL,
  label text NOT NULL,
  default_action text DEFAULT 'inspect',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.maintenance_inspection_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  vehicle_id text NOT NULL,
  work_order_id uuid REFERENCES public.maintenance_work_orders(id) ON DELETE SET NULL,
  item_id uuid REFERENCES public.maintenance_inspection_items(id) ON DELETE SET NULL,
  system_id uuid REFERENCES public.maintenance_service_categories(id) ON DELETE SET NULL,
  component_id uuid REFERENCES public.maintenance_service_categories(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pass'
    CHECK (status IN ('pass', 'attention', 'fail')),
  notes text,
  photo_url text,
  recommended_line_id uuid REFERENCES public.maintenance_work_order_lines(id) ON DELETE SET NULL,
  declined boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mif_org_vehicle ON public.maintenance_inspection_findings (organization_id, vehicle_id);

-- Seed default inspection templates for each system
INSERT INTO public.maintenance_inspection_templates (id, system_id, code, name, sort_order)
SELECT
  gen_random_uuid(),
  s.id,
  'insp_' || replace(s.code, 'sys_', ''),
  s.name || ' inspection',
  s.sort_order
FROM public.maintenance_service_categories s
WHERE s.kind = 'system'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.maintenance_inspection_items (template_id, component_id, label, default_action, sort_order)
SELECT t.id, c.id, c.name, 'inspect', c.sort_order
FROM public.maintenance_inspection_templates t
JOIN public.maintenance_service_categories s ON s.id = t.system_id
JOIN public.maintenance_service_categories c ON c.parent_id = s.id AND c.kind = 'component'
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_inspection_items i
  WHERE i.template_id = t.id AND i.component_id = c.id
);

-- =============================================================================
-- Phase 5: Parts usage on job complete
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.maintenance_parts_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  work_order_id uuid NOT NULL REFERENCES public.maintenance_work_orders(id) ON DELETE CASCADE,
  line_id uuid REFERENCES public.maintenance_work_order_lines(id) ON DELETE SET NULL,
  part_id uuid NOT NULL REFERENCES public.part_master(id) ON DELETE RESTRICT,
  qty numeric(12, 3) NOT NULL DEFAULT 1,
  unit_cost numeric(12, 2),
  currency text NOT NULL DEFAULT 'JMD',
  vehicle_id text NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mpu_org_wo ON public.maintenance_parts_usage (organization_id, work_order_id);
CREATE INDEX IF NOT EXISTS idx_mpu_part ON public.maintenance_parts_usage (part_id);

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE public.maintenance_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_work_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_inspection_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_inspection_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_parts_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mwo_no_direct" ON public.maintenance_work_orders;
CREATE POLICY "mwo_no_direct" ON public.maintenance_work_orders FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "mwol_no_direct" ON public.maintenance_work_order_lines;
CREATE POLICY "mwol_no_direct" ON public.maintenance_work_order_lines FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "mit_no_direct" ON public.maintenance_inspection_templates;
CREATE POLICY "mit_no_direct" ON public.maintenance_inspection_templates FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "mii_no_direct" ON public.maintenance_inspection_items;
CREATE POLICY "mii_no_direct" ON public.maintenance_inspection_items FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "mif_no_direct" ON public.maintenance_inspection_findings;
CREATE POLICY "mif_no_direct" ON public.maintenance_inspection_findings FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "mpu_no_direct" ON public.maintenance_parts_usage;
CREATE POLICY "mpu_no_direct" ON public.maintenance_parts_usage FOR ALL TO authenticated USING (false) WITH CHECK (false);

GRANT ALL ON public.maintenance_work_orders TO service_role;
GRANT ALL ON public.maintenance_work_order_lines TO service_role;
GRANT ALL ON public.maintenance_inspection_templates TO service_role;
GRANT ALL ON public.maintenance_inspection_items TO service_role;
GRANT ALL ON public.maintenance_inspection_findings TO service_role;
GRANT ALL ON public.maintenance_parts_usage TO service_role;

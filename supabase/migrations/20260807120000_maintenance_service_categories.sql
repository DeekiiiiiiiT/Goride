-- Icon-driven service logging: reusable categories + package membership.
-- Packages remain maintenance_task_templates; checklists move from description newlines to structured categories.

-- ---------------------------------------------------------------------------
-- 1. Service categories (platform catalog)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  icon_key text NOT NULL DEFAULT 'wrench',
  -- JSON: { fields: [{ key, type, label, required?, options? }] }
  field_schema jsonb NOT NULL DEFAULT '{"fields":[{"key":"material","type":"number","label":"Parts / materials","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
  quick_job_eligible boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_service_categories_code_key UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_msc_sort ON public.maintenance_service_categories (sort_order, name);

COMMENT ON TABLE public.maintenance_service_categories IS
  'Reusable service categories (Tires, Oil, Brakes) with icon + field schema for fleet log forms.';

-- ---------------------------------------------------------------------------
-- 2. Package ↔ category membership
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_package_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.maintenance_task_templates(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.maintenance_service_categories(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_mpc_template ON public.maintenance_package_categories (template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_mpc_category ON public.maintenance_package_categories (category_id);

COMMENT ON TABLE public.maintenance_package_categories IS
  'Which categories belong inside a service package (Basic / Intermediate / …).';

-- ---------------------------------------------------------------------------
-- 3. Package icon on templates
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_task_templates
  ADD COLUMN IF NOT EXISTS icon_key text NOT NULL DEFAULT 'wrench';

COMMENT ON COLUMN public.maintenance_task_templates.icon_key IS
  'Lucide-style icon key for fleet package picker (e.g. basic, intermediate, major, long_term).';

-- ---------------------------------------------------------------------------
-- 4. RLS (edge uses service role; deny direct authenticated)
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_package_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "maintenance_service_categories_no_direct" ON public.maintenance_service_categories;
CREATE POLICY "maintenance_service_categories_no_direct"
  ON public.maintenance_service_categories FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "maintenance_package_categories_no_direct" ON public.maintenance_package_categories;
CREATE POLICY "maintenance_package_categories_no_direct"
  ON public.maintenance_package_categories FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

GRANT ALL ON public.maintenance_service_categories TO service_role;
GRANT ALL ON public.maintenance_package_categories TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Seed categories (stable UUIDs)
-- ---------------------------------------------------------------------------
INSERT INTO public.maintenance_service_categories (id, code, name, icon_key, field_schema, quick_job_eligible, sort_order)
VALUES
  (
    'a1000000-0000-4000-8000-000000000001',
    'oil',
    'Oil & Filter',
    'oil',
    '{"fields":[{"key":"qty","type":"number","label":"Quantity","required":true},{"key":"unit_price","type":"number","label":"Unit price","required":true},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
    true,
    10
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'tires',
    'Tires',
    'tires',
    '{"fields":[{"key":"qty","type":"number","label":"Quantity","required":true},{"key":"unit_price","type":"number","label":"Unit price (per tire)","required":true},{"key":"condition","type":"select","label":"Condition","required":true,"options":["new","used"]},{"key":"labor","type":"number","label":"Labor / fitment fee","required":false}]}'::jsonb,
    true,
    20
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'tire_pressure',
    'Tire Pressure Check',
    'gauge',
    '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false},{"key":"material","type":"number","label":"Parts / materials","required":false}]}'::jsonb,
    false,
    30
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    'fluids',
    'Fluids (Washer / Coolant)',
    'droplet',
    '{"fields":[{"key":"material","type":"number","label":"Parts / materials","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
    false,
    40
  ),
  (
    'a1000000-0000-4000-8000-000000000005',
    'lights',
    'Lights Check',
    'lightbulb',
    '{"fields":[{"key":"material","type":"number","label":"Parts / materials","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
    false,
    50
  ),
  (
    'a1000000-0000-4000-8000-000000000006',
    'rotate_tires',
    'Rotate Tires',
    'rotate',
    '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
    true,
    60
  ),
  (
    'a1000000-0000-4000-8000-000000000007',
    'air_filter',
    'Engine Air Filter',
    'filter',
    '{"fields":[{"key":"qty","type":"number","label":"Quantity","required":false},{"key":"unit_price","type":"number","label":"Unit price","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
    true,
    70
  ),
  (
    'a1000000-0000-4000-8000-000000000008',
    'cabin_filter',
    'Cabin A/C Filter',
    'wind',
    '{"fields":[{"key":"qty","type":"number","label":"Quantity","required":false},{"key":"unit_price","type":"number","label":"Unit price","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
    true,
    80
  ),
  (
    'a1000000-0000-4000-8000-000000000009',
    'wipers',
    'Wiper Blades',
    'wipers',
    '{"fields":[{"key":"qty","type":"number","label":"Quantity","required":false},{"key":"unit_price","type":"number","label":"Unit price","required":false},{"key":"condition","type":"select","label":"Condition","required":false,"options":["new","used"]},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
    true,
    90
  ),
  (
    'a1000000-0000-4000-8000-00000000000a',
    'brakes',
    'Brakes',
    'brakes',
    '{"fields":[{"key":"qty","type":"number","label":"Quantity","required":false},{"key":"unit_price","type":"number","label":"Unit price","required":false},{"key":"condition","type":"select","label":"Condition","required":false,"options":["new","used"]},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
    true,
    100
  ),
  (
    'a1000000-0000-4000-8000-00000000000b',
    'transmission',
    'Transmission Fluid',
    'gears',
    '{"fields":[{"key":"material","type":"number","label":"Parts / materials","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
    true,
    110
  ),
  (
    'a1000000-0000-4000-8000-00000000000c',
    'brake_fluid',
    'Brake Fluid',
    'droplet',
    '{"fields":[{"key":"material","type":"number","label":"Parts / materials","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
    false,
    120
  ),
  (
    'a1000000-0000-4000-8000-00000000000d',
    'belt',
    'Drive / Serpentine Belt',
    'belt',
    '{"fields":[{"key":"material","type":"number","label":"Parts / materials","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
    true,
    130
  ),
  (
    'a1000000-0000-4000-8000-00000000000e',
    'suspension',
    'Suspension',
    'suspension',
    '{"fields":[{"key":"material","type":"number","label":"Parts / materials","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
    true,
    140
  ),
  (
    'a1000000-0000-4000-8000-00000000000f',
    'spark_plugs',
    'Spark Plugs',
    'spark',
    '{"fields":[{"key":"qty","type":"number","label":"Quantity","required":false},{"key":"unit_price","type":"number","label":"Unit price","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
    true,
    150
  ),
  (
    'a1000000-0000-4000-8000-000000000010',
    'coolant_flush',
    'Radiator Coolant Flush',
    'thermometer',
    '{"fields":[{"key":"material","type":"number","label":"Parts / materials","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
    true,
    160
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  icon_key = EXCLUDED.icon_key,
  field_schema = EXCLUDED.field_schema,
  quick_job_eligible = EXCLUDED.quick_job_eligible,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 6. Set package icons + memberships for known A–D templates (by name / code)
-- ---------------------------------------------------------------------------
UPDATE public.maintenance_task_templates t
SET icon_key = CASE
  WHEN lower(coalesce(t.task_code, '')) IN ('a', 'basic')
    OR lower(t.task_name) LIKE 'basic%' THEN 'basic'
  WHEN lower(coalesce(t.task_code, '')) IN ('b', 'intermediate')
    OR lower(t.task_name) LIKE 'intermediate%' THEN 'intermediate'
  WHEN lower(coalesce(t.task_code, '')) IN ('c', 'major')
    OR lower(t.task_name) LIKE 'major%' THEN 'major'
  WHEN lower(coalesce(t.task_code, '')) IN ('d', 'long_term', 'long-term')
    OR lower(t.task_name) LIKE 'long%term%'
    OR lower(t.task_name) LIKE 'long-term%' THEN 'long_term'
  ELSE coalesce(nullif(t.icon_key, ''), 'wrench')
END,
updated_at = now()
WHERE t.template_scope = 'global'
   OR t.template_scope = 'catalog';

-- Helper: insert memberships for templates matching a name pattern
WITH basic_pkgs AS (
  SELECT id FROM public.maintenance_task_templates
  WHERE lower(coalesce(task_code, '')) IN ('a', 'basic')
     OR lower(task_name) LIKE 'basic%'
),
cats AS (
  SELECT * FROM (VALUES
    ('a1000000-0000-4000-8000-000000000001'::uuid, 10), -- oil
    ('a1000000-0000-4000-8000-000000000002'::uuid, 15), -- tires
    ('a1000000-0000-4000-8000-000000000003'::uuid, 20), -- tire_pressure
    ('a1000000-0000-4000-8000-000000000004'::uuid, 30), -- fluids
    ('a1000000-0000-4000-8000-000000000005'::uuid, 40)  -- lights
  ) AS v(category_id, sort_order)
)
INSERT INTO public.maintenance_package_categories (template_id, category_id, sort_order)
SELECT p.id, c.category_id, c.sort_order
FROM basic_pkgs p CROSS JOIN cats c
ON CONFLICT (template_id, category_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

WITH mid_pkgs AS (
  SELECT id FROM public.maintenance_task_templates
  WHERE lower(coalesce(task_code, '')) IN ('b', 'intermediate')
     OR lower(task_name) LIKE 'intermediate%'
),
cats AS (
  SELECT * FROM (VALUES
    ('a1000000-0000-4000-8000-000000000001'::uuid, 10),
    ('a1000000-0000-4000-8000-000000000002'::uuid, 15),
    ('a1000000-0000-4000-8000-000000000003'::uuid, 20),
    ('a1000000-0000-4000-8000-000000000004'::uuid, 30),
    ('a1000000-0000-4000-8000-000000000005'::uuid, 40),
    ('a1000000-0000-4000-8000-000000000006'::uuid, 50),
    ('a1000000-0000-4000-8000-000000000007'::uuid, 60),
    ('a1000000-0000-4000-8000-000000000008'::uuid, 70),
    ('a1000000-0000-4000-8000-000000000009'::uuid, 80),
    ('a1000000-0000-4000-8000-00000000000a'::uuid, 90)
  ) AS v(category_id, sort_order)
)
INSERT INTO public.maintenance_package_categories (template_id, category_id, sort_order)
SELECT p.id, c.category_id, c.sort_order
FROM mid_pkgs p CROSS JOIN cats c
ON CONFLICT (template_id, category_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

WITH major_pkgs AS (
  SELECT id FROM public.maintenance_task_templates
  WHERE lower(coalesce(task_code, '')) IN ('c', 'major')
     OR lower(task_name) LIKE 'major%'
),
cats AS (
  SELECT * FROM (VALUES
    ('a1000000-0000-4000-8000-000000000001'::uuid, 10),
    ('a1000000-0000-4000-8000-000000000002'::uuid, 15),
    ('a1000000-0000-4000-8000-000000000003'::uuid, 20),
    ('a1000000-0000-4000-8000-000000000004'::uuid, 30),
    ('a1000000-0000-4000-8000-000000000005'::uuid, 40),
    ('a1000000-0000-4000-8000-000000000006'::uuid, 50),
    ('a1000000-0000-4000-8000-000000000007'::uuid, 60),
    ('a1000000-0000-4000-8000-000000000008'::uuid, 70),
    ('a1000000-0000-4000-8000-000000000009'::uuid, 80),
    ('a1000000-0000-4000-8000-00000000000a'::uuid, 90),
    ('a1000000-0000-4000-8000-00000000000b'::uuid, 100),
    ('a1000000-0000-4000-8000-00000000000c'::uuid, 110),
    ('a1000000-0000-4000-8000-00000000000d'::uuid, 120),
    ('a1000000-0000-4000-8000-00000000000e'::uuid, 130)
  ) AS v(category_id, sort_order)
)
INSERT INTO public.maintenance_package_categories (template_id, category_id, sort_order)
SELECT p.id, c.category_id, c.sort_order
FROM major_pkgs p CROSS JOIN cats c
ON CONFLICT (template_id, category_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

WITH long_pkgs AS (
  SELECT id FROM public.maintenance_task_templates
  WHERE lower(coalesce(task_code, '')) IN ('d', 'long_term', 'long-term')
     OR lower(task_name) LIKE 'long%term%'
     OR lower(task_name) LIKE 'long-term%'
),
cats AS (
  SELECT * FROM (VALUES
    ('a1000000-0000-4000-8000-00000000000f'::uuid, 10),
    ('a1000000-0000-4000-8000-000000000010'::uuid, 20)
  ) AS v(category_id, sort_order)
)
INSERT INTO public.maintenance_package_categories (template_id, category_id, sort_order)
SELECT p.id, c.category_id, c.sort_order
FROM long_pkgs p CROSS JOIN cats c
ON CONFLICT (template_id, category_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

-- Keep description in sync as category names (backward-compat for old clients)
UPDATE public.maintenance_task_templates t
SET description = sub.lines,
    updated_at = now()
FROM (
  SELECT
    mpc.template_id,
    string_agg(c.name, E'\n' ORDER BY mpc.sort_order) AS lines
  FROM public.maintenance_package_categories mpc
  JOIN public.maintenance_service_categories c ON c.id = mpc.category_id
  GROUP BY mpc.template_id
) sub
WHERE t.id = sub.template_id;

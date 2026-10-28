-- Maintenance service ledger (ops truth, not finance):
-- Admin catalogs components (+ position_aware); Fleet records work and derives per-component due state.

-- ---------------------------------------------------------------------------
-- 1. Category schedule rules (Admin → Fleet)
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_service_categories
  ADD COLUMN IF NOT EXISTS position_aware boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_interval_miles integer,
  ADD COLUMN IF NOT EXISTS default_interval_months integer;

COMMENT ON COLUMN public.maintenance_service_categories.position_aware IS
  'When true, Fleet tracks LF/RF/LR/RR separately for outstanding work.';
COMMENT ON COLUMN public.maintenance_service_categories.default_interval_miles IS
  'Fallback interval when component is not in a package (quick-job-only).';
COMMENT ON COLUMN public.maintenance_service_categories.default_interval_months IS
  'Fallback months interval when component is not in a package.';

-- Seed position-aware for tires / brakes / wheels (by code or name), excluding fluids/filters
UPDATE public.maintenance_service_categories
SET position_aware = true
WHERE kind = 'component'
  AND (
    lower(code) ~ '(tire|brake|wheel|pad|rotor|disc)'
    OR lower(name) ~ '(tire|brake|wheel|pad|rotor|disc)'
    OR lower(coalesce(icon_key, '')) ~ '(tire|brake|wheel)'
  )
  AND NOT (
    lower(code) ~ '(fluid|pressure|oil|filter|coolant)'
    OR lower(name) ~ '(fluid|pressure|oil|filter|coolant)'
  );

-- ---------------------------------------------------------------------------
-- 2. Append-only service ledger (what was done)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_service_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  vehicle_id text NOT NULL,
  performed_at_date date NOT NULL,
  performed_at_miles numeric,
  category_id uuid REFERENCES public.maintenance_service_categories(id) ON DELETE SET NULL,
  category_code text,
  category_name text,
  position text,
  action text,
  template_id uuid REFERENCES public.maintenance_task_templates(id) ON DELETE SET NULL,
  maintenance_record_id uuid REFERENCES public.maintenance_records(id) ON DELETE SET NULL,
  work_order_id uuid REFERENCES public.maintenance_work_orders(id) ON DELETE SET NULL,
  work_order_line_id uuid REFERENCES public.maintenance_work_order_lines(id) ON DELETE SET NULL,
  voided_at timestamptz,
  notes text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msl_org_vehicle_date
  ON public.maintenance_service_ledger (organization_id, vehicle_id, performed_at_date DESC);
CREATE INDEX IF NOT EXISTS idx_msl_category
  ON public.maintenance_service_ledger (category_id)
  WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msl_record
  ON public.maintenance_service_ledger (maintenance_record_id)
  WHERE maintenance_record_id IS NOT NULL;

COMMENT ON TABLE public.maintenance_service_ledger IS
  'Append-only record of completed maintenance lines (component + optional position). Not finance.';

ALTER TABLE public.maintenance_service_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "maintenance_service_ledger_no_direct" ON public.maintenance_service_ledger;
CREATE POLICY "maintenance_service_ledger_no_direct"
  ON public.maintenance_service_ledger FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
GRANT ALL ON public.maintenance_service_ledger TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Per-vehicle component / position schedule state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicle_component_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  vehicle_id text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.maintenance_service_categories(id) ON DELETE CASCADE,
  position text,
  last_performed_miles numeric,
  last_performed_date date,
  next_due_miles numeric,
  next_due_miles_max numeric,
  next_due_date date,
  schedule_status text NOT NULL DEFAULT 'active'
    CHECK (schedule_status IN ('active', 'fulfilled')),
  source_template_id uuid REFERENCES public.maintenance_task_templates(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_component_schedule_position_chk
    CHECK (position IS NULL OR position IN ('LF', 'RF', 'LR', 'RR'))
);

-- Unique: one row per vehicle×category when position is null; one per corner when set
CREATE UNIQUE INDEX IF NOT EXISTS uq_vcs_org_vehicle_cat_null_pos
  ON public.vehicle_component_schedule (organization_id, vehicle_id, category_id)
  WHERE position IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vcs_org_vehicle_cat_pos
  ON public.vehicle_component_schedule (organization_id, vehicle_id, category_id, position)
  WHERE position IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vcs_org_vehicle
  ON public.vehicle_component_schedule (organization_id, vehicle_id);

COMMENT ON TABLE public.vehicle_component_schedule IS
  'Per-vehicle component (and optional LF/RF/LR/RR) next-due state; source of truth for outstanding work.';

ALTER TABLE public.vehicle_component_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vehicle_component_schedule_no_direct" ON public.vehicle_component_schedule;
CREATE POLICY "vehicle_component_schedule_no_direct"
  ON public.vehicle_component_schedule FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
GRANT ALL ON public.vehicle_component_schedule TO service_role;

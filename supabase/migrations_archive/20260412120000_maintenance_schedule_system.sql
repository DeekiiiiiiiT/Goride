-- Enterprise maintenance: templates (platform), per-vehicle schedule + records (tenant-scoped).
-- Edge functions use service role; RLS blocks direct authenticated access (same pattern as vehicle_catalog).

-- ---------------------------------------------------------------------------
-- 1. Templates per motor vehicle catalog row (Super Admin)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog(id) ON DELETE CASCADE,
  task_name text NOT NULL,
  description text,
  interval_miles integer,
  interval_months integer,
  priority text NOT NULL DEFAULT 'standard' CHECK (priority IN ('critical', 'standard', 'optional')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_catalog_id, task_name)
);

CREATE INDEX IF NOT EXISTS idx_mtt_vehicle_catalog_id ON public.maintenance_task_templates (vehicle_catalog_id);

COMMENT ON TABLE public.maintenance_task_templates IS 'Manufacturer-style maintenance tasks per vehicle_catalog row (platform-managed).';

-- ---------------------------------------------------------------------------
-- 2. Per-tenant vehicle × template schedule (next due / last performed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicle_maintenance_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  vehicle_id text NOT NULL,
  template_id uuid NOT NULL REFERENCES public.maintenance_task_templates(id) ON DELETE CASCADE,
  last_performed_miles integer,
  last_performed_date date,
  next_due_miles integer,
  next_due_date date,
  custom_interval_miles integer,
  custom_interval_months integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, vehicle_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_vms_org_vehicle ON public.vehicle_maintenance_schedule (organization_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vms_template ON public.vehicle_maintenance_schedule (template_id);

COMMENT ON TABLE public.vehicle_maintenance_schedule IS 'Fleet vehicle maintenance schedule rows; scoped by organization_id.';

-- ---------------------------------------------------------------------------
-- 3. Audit log of performed services (replaces KV maintenance_log:* long-term)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  vehicle_id text NOT NULL,
  template_id uuid REFERENCES public.maintenance_task_templates(id) ON DELETE SET NULL,
  performed_at_miles integer NOT NULL,
  performed_at_date date NOT NULL,
  cost numeric(12, 2),
  service_type text,
  provider text,
  notes text,
  invoice_url text,
  status text,
  legacy_kv_id text,
  payload_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mr_org_vehicle ON public.maintenance_records (organization_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_mr_performed ON public.maintenance_records (performed_at_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mr_legacy_kv ON public.maintenance_records (organization_id, legacy_kv_id) WHERE legacy_kv_id IS NOT NULL;

COMMENT ON TABLE public.maintenance_records IS 'Completed maintenance services; payload_json holds full legacy UI shape when needed.';
COMMENT ON COLUMN public.maintenance_records.legacy_kv_id IS 'Original log id from KV migration (idempotency).';
COMMENT ON COLUMN public.maintenance_records.payload_json IS 'Optional full MaintenanceLog-compatible JSON.';

-- ---------------------------------------------------------------------------
-- RLS: deny direct table access from PostgREST (edge uses service role)
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_maintenance_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "maintenance_task_templates_no_direct" ON public.maintenance_task_templates;
CREATE POLICY "maintenance_task_templates_no_direct"
  ON public.maintenance_task_templates FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "vehicle_maintenance_schedule_no_direct" ON public.vehicle_maintenance_schedule;
CREATE POLICY "vehicle_maintenance_schedule_no_direct"
  ON public.vehicle_maintenance_schedule FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "maintenance_records_no_direct" ON public.maintenance_records;
CREATE POLICY "maintenance_records_no_direct"
  ON public.maintenance_records FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

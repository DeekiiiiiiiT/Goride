-- Release 2: work order lifecycle columns + vendor (M-06, M-13 prep)

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS vendor_id text REFERENCES fleet.platform_vendors(id),
  ADD COLUMN IF NOT EXISTS off_road_at timestamptz,
  ADD COLUMN IF NOT EXISTS back_on_road_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS cancel_reason text
CREATE INDEX IF NOT EXISTS idx_mwo_org_status_opened
  ON public.maintenance_work_orders (organization_id, status, opened_at DESC)
UPDATE public.maintenance_work_orders wo
SET source = 'driver_request'
WHERE source IS NULL
  AND (
    coalesce(wo.payload_json->>'source', '') = 'driver_service_request'
    OR wo.provider ILIKE 'Driver Request%'
  )
-- Uniform schedule backfill hook: ensure component rows exist for all package members (M-11)
INSERT INTO public.vehicle_component_schedule (
  organization_id,
  vehicle_id,
  category_id,
  position,
  schedule_status,
  source_template_id,
  updated_at
)
SELECT
  vms.organization_id,
  vms.vehicle_id,
  mpc.category_id,
  CASE WHEN c.position_aware THEN pos.pos ELSE NULL END,
  coalesce(vcs.schedule_status, 'active'),
  vms.template_id,
  now()
FROM public.vehicle_maintenance_schedule vms
JOIN public.maintenance_package_categories mpc ON mpc.template_id = vms.template_id
JOIN public.maintenance_service_categories c ON c.id = mpc.category_id
LEFT JOIN LATERAL (
  SELECT unnest(ARRAY['LF', 'RF', 'LR', 'RR']::text[]) AS pos
  WHERE c.position_aware
  UNION ALL
  SELECT NULL::text WHERE NOT c.position_aware
) pos ON true
LEFT JOIN public.vehicle_component_schedule vcs
  ON vcs.organization_id = vms.organization_id
 AND vcs.vehicle_id = vms.vehicle_id
 AND vcs.category_id = mpc.category_id
 AND (vcs.position IS NOT DISTINCT FROM pos.pos)
WHERE vcs.id IS NULL

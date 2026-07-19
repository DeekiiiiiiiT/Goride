-- Schema audit Wave 1: vehicle catalog needs_info + maintenance RESTRICT + indexes

ALTER TABLE public.vehicle_catalog_pending_requests
  DROP CONSTRAINT IF EXISTS vehicle_catalog_pending_requests_status_check;
ALTER TABLE public.vehicle_catalog_pending_requests
  ADD CONSTRAINT vehicle_catalog_pending_requests_status_check
  CHECK (status IN ('pending','approved','rejected','superseded','needs_info'));

ALTER TABLE public.vehicle_maintenance_schedule
  DROP CONSTRAINT IF EXISTS vehicle_maintenance_schedule_template_id_fkey;
ALTER TABLE public.vehicle_maintenance_schedule
  ADD CONSTRAINT vehicle_maintenance_schedule_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES public.maintenance_task_templates(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS maintenance_records_template_id_idx
  ON public.maintenance_records (template_id);

CREATE INDEX IF NOT EXISTS vehicle_catalog_pending_requests_resolved_vehicle_catalog_id_idx
  ON public.vehicle_catalog_pending_requests (resolved_vehicle_catalog_id);

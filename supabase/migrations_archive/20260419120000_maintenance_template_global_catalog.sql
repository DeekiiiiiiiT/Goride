-- Global (fleet-wide) vs catalog-scoped maintenance templates + optional task_code for merge at bootstrap.

ALTER TABLE public.maintenance_task_templates
  ADD COLUMN IF NOT EXISTS template_scope text NOT NULL DEFAULT 'catalog',
  ADD COLUMN IF NOT EXISTS task_code text;

UPDATE public.maintenance_task_templates SET template_scope = 'catalog' WHERE template_scope IS NULL;

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_vehicle_catalog_id_task_name_key;

ALTER TABLE public.maintenance_task_templates
  ALTER COLUMN vehicle_catalog_id DROP NOT NULL;

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_scope_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_scope_check
  CHECK (
    (template_scope = 'catalog' AND vehicle_catalog_id IS NOT NULL)
    OR (template_scope = 'global' AND vehicle_catalog_id IS NULL)
  );

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_template_scope_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_template_scope_check
  CHECK (template_scope IN ('global', 'catalog'));

CREATE UNIQUE INDEX IF NOT EXISTS mtt_global_task_name_unique
  ON public.maintenance_task_templates (task_name)
  WHERE template_scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS mtt_catalog_vehicle_task_unique
  ON public.maintenance_task_templates (vehicle_catalog_id, task_name)
  WHERE template_scope = 'catalog';

CREATE UNIQUE INDEX IF NOT EXISTS mtt_global_task_code_unique
  ON public.maintenance_task_templates (task_code)
  WHERE template_scope = 'global' AND task_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mtt_catalog_task_code_unique
  ON public.maintenance_task_templates (vehicle_catalog_id, task_code)
  WHERE template_scope = 'catalog' AND task_code IS NOT NULL;

COMMENT ON COLUMN public.maintenance_task_templates.template_scope IS 'global = fleet defaults; catalog = per vehicle_catalog row.';
COMMENT ON COLUMN public.maintenance_task_templates.task_code IS 'Optional stable slug for merge at bootstrap (catalog wins over global on same code or name).';

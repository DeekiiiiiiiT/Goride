-- §3.1 maintenance_task_templates governance columns (names still interval_miles until server layer).

ALTER TABLE public.maintenance_task_templates
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'uncertain',
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'roam_policy',
  ADD COLUMN IF NOT EXISTS evidence_url text,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS year_from integer,
  ADD COLUMN IF NOT EXISTS year_to integer,
  ADD COLUMN IF NOT EXISTS severe_interval_miles integer,
  ADD COLUMN IF NOT EXISTS severe_interval_miles_max integer,
  ADD COLUMN IF NOT EXISTS severe_interval_months integer,
  ADD COLUMN IF NOT EXISTS revision_no integer NOT NULL DEFAULT 1;

UPDATE public.maintenance_task_templates
SET status = CASE WHEN archived_at IS NULL THEN 'active' ELSE 'retired' END;

UPDATE public.maintenance_task_templates
SET source_type = 'roam_policy',
    confidence = 'uncertain'
WHERE source_type IS NULL OR confidence IS NULL;

UPDATE public.maintenance_task_templates
SET applicable_vehicle_classes = ARRAY['car']::text[]
WHERE applicable_vehicle_classes IS NULL;

ALTER TABLE public.maintenance_task_templates
  ALTER COLUMN applicable_vehicle_classes SET NOT NULL;

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_applicable_vehicle_classes_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_applicable_vehicle_classes_check
  CHECK (
    applicable_vehicle_classes <@ ARRAY['car'::text, 'motorcycle'::text]
  );

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_status_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_status_check
  CHECK (status IN ('draft', 'active', 'needs_checking', 'retired'));

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_confidence_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_confidence_check
  CHECK (confidence IN ('confirmed', 'likely', 'uncertain'));

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_source_type_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_source_type_check
  CHECK (source_type IN ('maker_manual', 'part_maker', 'roam_policy'));

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_part_rule_evidence_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_part_rule_evidence_check
  CHECK (
    component_id IS NULL
    OR source_type = 'roam_policy'
    OR evidence_url IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.trg_mtt_block_package_to_part_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.component_id IS NOT NULL AND OLD.component_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.maintenance_package_categories mpc WHERE mpc.template_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Cannot convert package to part rule while package links exist';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mm_mtt_block_package_to_part ON public.maintenance_task_templates;
CREATE TRIGGER mm_mtt_block_package_to_part
  BEFORE UPDATE OF component_id ON public.maintenance_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.trg_mtt_block_package_to_part_rule();

CREATE OR REPLACE FUNCTION public.trg_mpc_reject_part_rule_template()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_component uuid;
BEGIN
  SELECT t.component_id INTO v_component
  FROM public.maintenance_task_templates t
  WHERE t.id = NEW.template_id;

  IF v_component IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot link part rule template to a service package';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mm_mpc_reject_part_rule ON public.maintenance_package_categories;
CREATE TRIGGER mm_mpc_reject_part_rule
  BEFORE INSERT OR UPDATE ON public.maintenance_package_categories
  FOR EACH ROW EXECUTE FUNCTION public.trg_mpc_reject_part_rule_template();

CREATE OR REPLACE FUNCTION public.trg_mtt_revision_bump()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.interval_miles IS DISTINCT FROM OLD.interval_miles
      OR NEW.interval_miles_max IS DISTINCT FROM OLD.interval_miles_max
      OR NEW.interval_months IS DISTINCT FROM OLD.interval_months
      OR NEW.severe_interval_miles IS DISTINCT FROM OLD.severe_interval_miles
      OR NEW.severe_interval_miles_max IS DISTINCT FROM OLD.severe_interval_miles_max
      OR NEW.severe_interval_months IS DISTINCT FROM OLD.severe_interval_months
      OR NEW.year_from IS DISTINCT FROM OLD.year_from
      OR NEW.year_to IS DISTINCT FROM OLD.year_to
      OR NEW.template_scope IS DISTINCT FROM OLD.template_scope
      OR NEW.vehicle_catalog_id IS DISTINCT FROM OLD.vehicle_catalog_id
      OR NEW.platform_id IS DISTINCT FROM OLD.platform_id
      OR NEW.engine_family_id IS DISTINCT FROM OLD.engine_family_id
      OR NEW.status IS DISTINCT FROM OLD.status
    THEN
      NEW.revision_no := coalesce(OLD.revision_no, 1) + 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mm_mtt_revision_bump ON public.maintenance_task_templates;
CREATE TRIGGER mm_mtt_revision_bump
  BEFORE UPDATE ON public.maintenance_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.trg_mtt_revision_bump();

-- R4-01 guard: trigger functions need no EXECUTE for anon/authenticated (triggers fire regardless).
REVOKE EXECUTE ON FUNCTION public.trg_mpc_reject_part_rule_template() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_mtt_block_package_to_part_rule() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_mtt_revision_bump() FROM PUBLIC, anon, authenticated;

-- V-03, M-06: master data revision history (platform_revision), separate from trg_platform_revision.

ALTER TABLE public.maintenance_package_categories
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE public.maintenance_service_categories
  ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE OR REPLACE FUNCTION public.trg_master_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_import uuid;
  v_row jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  v_actor := coalesce(
    auth.uid(),
    (v_row->>'updated_by')::uuid,
    (v_row->>'created_by')::uuid
  );

  IF v_row ? 'import_batch_id' AND v_row->>'import_batch_id' IS NOT NULL THEN
    v_import := (v_row->>'import_batch_id')::uuid;
  ELSE
    v_import := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.platform_revision (
      entity_table, entity_id, old_row, new_row, actor, created_by, import_batch_id
    )
    VALUES (
      TG_TABLE_NAME, NEW.id, '{}'::jsonb, to_jsonb(NEW), v_actor, v_actor, v_import
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.platform_revision (
      entity_table, entity_id, old_row, new_row, actor, created_by, import_batch_id
    )
    VALUES (
      TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW), v_actor, v_actor, v_import
    );
  ELSE
    INSERT INTO public.platform_revision (
      entity_table, entity_id, old_row, new_row, actor, created_by, import_batch_id
    )
    VALUES (
      TG_TABLE_NAME, OLD.id, to_jsonb(OLD), '{}'::jsonb, v_actor, v_actor, v_import
    );
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS mm_master_revision_vehicle_catalog ON public.vehicle_catalog;
CREATE TRIGGER mm_master_revision_vehicle_catalog
  AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_catalog
  FOR EACH ROW EXECUTE FUNCTION public.trg_master_revision();

DROP TRIGGER IF EXISTS mm_master_revision_engine_family ON public.engine_family;
CREATE TRIGGER mm_master_revision_engine_family
  AFTER INSERT OR UPDATE OR DELETE ON public.engine_family
  FOR EACH ROW EXECUTE FUNCTION public.trg_master_revision();

DROP TRIGGER IF EXISTS mm_master_revision_catalog_spec_value ON public.catalog_spec_value;
CREATE TRIGGER mm_master_revision_catalog_spec_value
  AFTER INSERT OR UPDATE OR DELETE ON public.catalog_spec_value
  FOR EACH ROW EXECUTE FUNCTION public.trg_master_revision();

DROP TRIGGER IF EXISTS mm_master_revision_task_templates ON public.maintenance_task_templates;
CREATE TRIGGER mm_master_revision_task_templates
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.trg_master_revision();

DROP TRIGGER IF EXISTS mm_master_revision_package_categories ON public.maintenance_package_categories;
CREATE TRIGGER mm_master_revision_package_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_package_categories
  FOR EACH ROW EXECUTE FUNCTION public.trg_master_revision();

DROP TRIGGER IF EXISTS mm_master_revision_service_categories ON public.maintenance_service_categories;
CREATE TRIGGER mm_master_revision_service_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_service_categories
  FOR EACH ROW EXECUTE FUNCTION public.trg_master_revision();

REVOKE ALL ON FUNCTION public.trg_master_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_master_revision() TO service_role;

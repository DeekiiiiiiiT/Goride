-- Fix: every vehicle catalog CSV import failed (7 Nov 2026, batch 12342f22…, 724 of 724 rows).
-- trg_master_revision copied vehicle_catalog.import_batch_id into platform_revision.import_batch_id,
-- but that column references part_import_batch(id). A vehicle catalog import batch is never a parts
-- import batch, so the foreign key refused the history row and the whole car insert rolled back.
-- Now the history row keeps the batch id only when it really is a parts import batch. The car row
-- itself still carries its own import_batch_id (and new_row in the history holds it too), so the
-- vehicle import can still be traced and undone.
-- Only the v_import lines change; the rest of the body is the live version (md5 0e354996…).

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
    -- platform_revision.import_batch_id references part_import_batch; other batch kinds stay in new_row only.
    IF NOT EXISTS (SELECT 1 FROM public.part_import_batch b WHERE b.id = v_import) THEN
      v_import := NULL;
    END IF;
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

REVOKE ALL ON FUNCTION public.trg_master_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_master_revision() TO service_role;

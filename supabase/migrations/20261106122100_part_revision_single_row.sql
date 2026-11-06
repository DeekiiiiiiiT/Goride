-- One platform_revision row per part edit.
-- 20261109120000 added part_interchange_group_revision_log (AFTER INSERT OR UPDATE on the group),
-- but trg_interchange_group_revision_bump (on part_oe_reference / part_index_number / part_approval)
-- still inserted its own platform_revision row before updating the group, so every part edit was
-- logged twice and the Platforms Diff Log showed it twice. The group trigger now records it.
-- Depends on 20261109120000_part_interchange_group_revision_audit.sql

CREATE OR REPLACE FUNCTION public.trg_interchange_group_revision_bump()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group uuid;
BEGIN
  SELECT pm.interchange_group_id INTO v_group FROM public.part_master pm
  WHERE pm.id = coalesce(NEW.part_id, OLD.part_id);
  IF v_group IS NOT NULL THEN
    -- part_interchange_group_revision_bump sets revision = OLD + 1 and
    -- part_interchange_group_revision_log writes the platform_revision row.
    UPDATE public.part_interchange_group SET revision = revision + 1 WHERE id = v_group;
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

-- AM gate proof 74: group edits write platform_revision and bump revision.

CREATE OR REPLACE FUNCTION public.trg_interchange_group_revision_bump()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group uuid;
  v_old jsonb;
  v_new jsonb;
BEGIN
  SELECT pm.interchange_group_id INTO v_group FROM public.part_master pm
  WHERE pm.id = coalesce(NEW.part_id, OLD.part_id);
  IF v_group IS NOT NULL THEN
    SELECT to_jsonb(ig.*) INTO v_old FROM public.part_interchange_group ig WHERE ig.id = v_group;
    UPDATE public.part_interchange_group SET revision = revision + 1 WHERE id = v_group;
    SELECT to_jsonb(ig.*) INTO v_new FROM public.part_interchange_group ig WHERE ig.id = v_group;
    INSERT INTO public.platform_revision (entity_table, entity_id, old_row, new_row)
    VALUES ('part_interchange_group', v_group, v_old, v_new);
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_part_interchange_group_revision_bump()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.revision := OLD.revision + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_part_interchange_group_revision_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.platform_revision (entity_table, entity_id, old_row, new_row)
    VALUES ('part_interchange_group', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.platform_revision (entity_table, entity_id, old_row, new_row)
    VALUES ('part_interchange_group', NEW.id, '{}'::jsonb, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS part_interchange_group_revision ON public.part_interchange_group;
DROP TRIGGER IF EXISTS part_interchange_group_revision_bump ON public.part_interchange_group;
DROP TRIGGER IF EXISTS part_interchange_group_revision_log ON public.part_interchange_group;

CREATE TRIGGER part_interchange_group_revision_bump
  BEFORE UPDATE ON public.part_interchange_group
  FOR EACH ROW EXECUTE FUNCTION public.trg_part_interchange_group_revision_bump();

CREATE TRIGGER part_interchange_group_revision_log
  AFTER INSERT OR UPDATE ON public.part_interchange_group
  FOR EACH ROW EXECUTE FUNCTION public.trg_part_interchange_group_revision_log();

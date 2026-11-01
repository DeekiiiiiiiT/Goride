CREATE OR REPLACE FUNCTION public.sync_part_listing_rule()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.interchange_fitment_rule
    WHERE interchange_group_id = OLD.interchange_group_id AND target_kind = 'catalog_variant'
      AND vehicle_catalog_id = OLD.vehicle_catalog_id AND source = 'listing'
      AND COALESCE(position, '') = COALESCE(OLD.position, '');
    RETURN OLD;
  END IF;
  DELETE FROM public.interchange_fitment_rule
  WHERE interchange_group_id = NEW.interchange_group_id AND target_kind = 'catalog_variant'
    AND vehicle_catalog_id = NEW.vehicle_catalog_id AND source = 'listing'
    AND COALESCE(position, '') = COALESCE(NEW.position, '');
  INSERT INTO public.interchange_fitment_rule (
    interchange_group_id, target_kind, vehicle_catalog_id, year_from, year_to, position, source, verified_by, verified_at, notes
  ) VALUES (
    NEW.interchange_group_id, 'catalog_variant', NEW.vehicle_catalog_id,
    NEW.year_from, NEW.year_to, NEW.position, 'listing', NEW.verified_by, NEW.verified_at, NEW.note
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS part_listing_sync_rule ON public.part_listing;
CREATE TRIGGER part_listing_sync_rule AFTER INSERT OR UPDATE OR DELETE ON public.part_listing FOR EACH ROW EXECUTE FUNCTION public.sync_part_listing_rule();
ALTER TABLE public.vehicle_platform ADD COLUMN IF NOT EXISTS maker text, ADD COLUMN IF NOT EXISTS family_evidence_url text;
UPDATE public.vehicle_platform vp SET maker = sub.make FROM (
  SELECT platform_id, min(make) AS make FROM public.vehicle_catalog
  WHERE platform_id IS NOT NULL AND coalesce(btrim(make), '') <> '' GROUP BY platform_id
) sub WHERE vp.id = sub.platform_id AND coalesce(btrim(vp.maker), '') = '';
UPDATE public.vehicle_platform SET maker = code WHERE coalesce(btrim(maker), '') = '';
ALTER TABLE public.vehicle_platform DROP CONSTRAINT IF EXISTS vehicle_platform_code_key;
DO $$
DECLARE parent_row record; extra_make text; new_id uuid; kept text;
BEGIN
  FOR parent_row IN
    SELECT vp.id, vp.code, vp.label, vp.notes, vp.maker FROM public.vehicle_platform vp
    WHERE (SELECT count(DISTINCT vc.make) FROM public.vehicle_catalog vc WHERE vc.platform_id = vp.id AND coalesce(btrim(vc.make), '') <> '') > 1
  LOOP
    SELECT min(vc.make) INTO kept FROM public.vehicle_catalog vc WHERE vc.platform_id = parent_row.id;
    UPDATE public.vehicle_platform SET maker = kept WHERE id = parent_row.id;
    FOR extra_make IN
      SELECT DISTINCT vc.make FROM public.vehicle_catalog vc WHERE vc.platform_id = parent_row.id AND vc.make IS DISTINCT FROM kept
    LOOP
      INSERT INTO public.vehicle_platform (code, label, notes, maker) VALUES (parent_row.code, parent_row.label, parent_row.notes, extra_make) RETURNING id INTO new_id;
      UPDATE public.vehicle_catalog SET platform_id = new_id WHERE platform_id = parent_row.id AND make = extra_make;
    END LOOP;
  END LOOP;
END $$;
ALTER TABLE public.vehicle_platform ALTER COLUMN maker SET DEFAULT '', ALTER COLUMN maker SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_platform_maker_code_key ON public.vehicle_platform (maker, code);
ALTER TABLE public.vehicle_platform DROP CONSTRAINT IF EXISTS vehicle_platform_family_evidence_check;
ALTER TABLE public.vehicle_platform ADD CONSTRAINT vehicle_platform_family_evidence_check CHECK (parent_id IS NULL OR coalesce(btrim(family_evidence_url), '') <> '');
CREATE OR REPLACE FUNCTION public.reject_mixed_maker_platform() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.platform_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.vehicle_catalog vc
    WHERE vc.platform_id = NEW.platform_id AND vc.id IS DISTINCT FROM NEW.id
      AND lower(coalesce(vc.make, '')) <> lower(coalesce(NEW.make, ''))
      AND coalesce(btrim(vc.make), '') <> '' AND coalesce(btrim(NEW.make), '') <> ''
  ) THEN
    RAISE EXCEPTION 'One body cannot hold two makers. Put each maker on its own body, then link the sister family.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS vehicle_catalog_one_maker_per_platform ON public.vehicle_catalog;
CREATE TRIGGER vehicle_catalog_one_maker_per_platform BEFORE INSERT OR UPDATE OF platform_id, make ON public.vehicle_catalog FOR EACH ROW EXECUTE FUNCTION public.reject_mixed_maker_platform();
DROP FUNCTION IF EXISTS public.seed_in_use_engine_parts();
REVOKE INSERT, UPDATE, DELETE ON TABLE public.part_fitment FROM PUBLIC, anon, authenticated;;

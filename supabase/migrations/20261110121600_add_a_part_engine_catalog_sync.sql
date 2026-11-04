-- AS7-02: when a catalog car gets an engine_family_id, materialize self-serve engine-fit listings.

CREATE OR REPLACE FUNCTION public.sync_self_serve_engine_listings_for_vehicle(p_vehicle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_family uuid;
  v_rule record;
  v_evidence text;
  v_groups uuid[] := '{}'::uuid[];
  v_group uuid;
BEGIN
  IF p_vehicle_id IS NULL THEN
    RETURN;
  END IF;

  SELECT vc.engine_family_id INTO v_family
  FROM public.vehicle_catalog vc
  WHERE vc.id = p_vehicle_id;

  IF v_family IS NULL THEN
    RETURN;
  END IF;

  FOR v_rule IN
    SELECT r.interchange_group_id, r.position
    FROM public.interchange_fitment_rule r
    WHERE r.target_kind = 'engine_family'
      AND r.source = 'manual'
      AND r.engine_family_id = v_family
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.part_listing_exclusion e
      WHERE e.interchange_group_id = v_rule.interchange_group_id
        AND e.vehicle_catalog_id = p_vehicle_id
    ) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.part_listing pl
      WHERE pl.interchange_group_id = v_rule.interchange_group_id
        AND pl.vehicle_catalog_id = p_vehicle_id
        AND pl.position IS NOT DISTINCT FROM v_rule.position
        AND pl.side IS NULL
    ) THEN
      IF NOT v_rule.interchange_group_id = ANY (v_groups) THEN
        v_groups := array_append(v_groups, v_rule.interchange_group_id);
      END IF;
      CONTINUE;
    END IF;

    SELECT nullif(btrim(pm.evidence_url), '')
    INTO v_evidence
    FROM public.part_master pm
    WHERE pm.interchange_group_id = v_rule.interchange_group_id
    ORDER BY pm.updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_evidence IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.part_listing (
      interchange_group_id, vehicle_catalog_id, position, side,
      evidence_url, origin, import_batch_id
    ) VALUES (
      v_rule.interchange_group_id, p_vehicle_id, v_rule.position, NULL,
      v_evidence, 'manual', NULL
    );

    IF NOT v_rule.interchange_group_id = ANY (v_groups) THEN
      v_groups := array_append(v_groups, v_rule.interchange_group_id);
    END IF;
  END LOOP;

  FOREACH v_group IN ARRAY v_groups
  LOOP
    PERFORM public.part_match_recompute(v_group, NULL);
  END LOOP;

  IF coalesce(array_length(v_groups, 1), 0) > 0 THEN
    PERFORM public.part_match_recompute(NULL, p_vehicle_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_vehicle_catalog_engine_listings_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.engine_family_id IS NOT NULL THEN
      PERFORM public.sync_self_serve_engine_listings_for_vehicle(NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.engine_family_id IS NOT NULL
       AND NEW.engine_family_id IS DISTINCT FROM OLD.engine_family_id THEN
      PERFORM public.sync_self_serve_engine_listings_for_vehicle(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehicle_catalog_engine_listings_sync ON public.vehicle_catalog;
CREATE TRIGGER vehicle_catalog_engine_listings_sync
  AFTER INSERT OR UPDATE OF engine_family_id ON public.vehicle_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_vehicle_catalog_engine_listings_sync();

REVOKE ALL ON FUNCTION public.sync_self_serve_engine_listings_for_vehicle(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_self_serve_engine_listings_for_vehicle(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.trg_vehicle_catalog_engine_listings_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_vehicle_catalog_engine_listings_sync() TO service_role;

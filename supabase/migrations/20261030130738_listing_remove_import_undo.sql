ALTER TABLE public.part_listing ADD COLUMN IF NOT EXISTS import_batch_id uuid;
DROP TABLE IF EXISTS public.platform_family_review;
DROP FUNCTION IF EXISTS public.write_guided_rules(uuid, uuid, text, integer, integer, uuid[], text, text, text, uuid, boolean);
CREATE OR REPLACE FUNCTION public.remove_guided_variant(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group uuid := NULLIF(p_input->>'groupId', '')::uuid; v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid; v_left integer;
BEGIN
  IF v_group IS NULL OR v_variant IS NULL THEN RAISE EXCEPTION 'Choose the part and the vehicle'; END IF;
  DELETE FROM public.part_listing WHERE interchange_group_id = v_group AND vehicle_catalog_id = v_variant;
  SELECT count(*) INTO v_left FROM public.part_listing WHERE interchange_group_id = v_group;
  IF v_left = 0 THEN
    DELETE FROM public.part_master WHERE interchange_group_id = v_group;
    DELETE FROM public.part_interchange_group WHERE id = v_group;
  END IF;
  PERFORM public.refresh_variant_parts_readiness();
  RETURN jsonb_build_object('ok', true, 'listingsLeft', v_left, 'deletedPart', v_left = 0);
END; $$;
CREATE OR REPLACE FUNCTION public.undo_parts_catalog_batch(p_batch_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE listings int; parts int; restored int;
BEGIN
  DELETE FROM public.part_listing WHERE import_batch_id = p_batch_id;
  GET DIAGNOSTICS listings = ROW_COUNT;
  UPDATE public.part_master pm SET category_id = COALESCE((r.previous->>'category_id')::uuid, pm.category_id), interchange_group_id = NULLIF(r.previous->>'interchange_group_id', '')::uuid, maintenance_component_id = NULLIF(r.previous->>'maintenance_component_id', '')::uuid, part_kind = COALESCE(NULLIF(r.previous->>'part_kind', ''), pm.part_kind) FROM public.part_import_restore r WHERE r.batch_id = p_batch_id AND r.part_id = pm.id;
  GET DIAGNOSTICS restored = ROW_COUNT;
  DELETE FROM public.part_import_restore WHERE batch_id = p_batch_id;
  DELETE FROM public.part_master pm WHERE pm.import_batch_id = p_batch_id AND NOT EXISTS (SELECT 1 FROM public.part_listing pl WHERE pl.interchange_group_id = pm.interchange_group_id) AND NOT EXISTS (SELECT 1 FROM public.maintenance_parts_usage u WHERE u.part_id = pm.id);
  GET DIAGNOSTICS parts = ROW_COUNT;
  DELETE FROM public.part_interchange_group g WHERE g.import_batch_id = p_batch_id AND NOT EXISTS (SELECT 1 FROM public.part_master pm WHERE pm.interchange_group_id = g.id);
  RETURN jsonb_build_object('listingsRemoved', listings, 'partsRemoved', parts, 'partsRestored', restored);
END; $$;
REVOKE ALL ON FUNCTION public.remove_guided_variant(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.undo_parts_catalog_batch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_guided_variant(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_parts_catalog_batch(uuid) TO service_role;;

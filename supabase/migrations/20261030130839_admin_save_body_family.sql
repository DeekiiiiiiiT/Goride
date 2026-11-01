CREATE OR REPLACE FUNCTION public.admin_save_body_family(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_label text := NULLIF(btrim(coalesce(p_input->>'label', '')), '');
  v_evidence text := NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_reason text := NULLIF(btrim(coalesce(p_input->>'reason', '')), '');
  v_family uuid := NULLIF(p_input->>'familyId', '')::uuid;
  v_action text := COALESCE(NULLIF(lower(btrim(coalesce(p_input->>'action', ''))), ''), 'add');
  v_dry boolean := COALESCE((p_input->>'dryRun')::boolean, false);
  v_move boolean := COALESCE((p_input->>'move')::boolean, false);
  v_platform uuid; v_ids uuid[] := ARRAY[]::uuid[]; v_before jsonb; v_after jsonb;
BEGIN
  IF v_evidence IS NULL THEN RAISE EXCEPTION 'A sister family needs a source link'; END IF;
  IF v_action NOT IN ('add', 'remove') THEN RAISE EXCEPTION 'Choose add or remove'; END IF;
  IF v_label IS NULL AND v_family IS NULL AND v_action = 'add' THEN RAISE EXCEPTION 'Name the sister family'; END IF;
  IF v_family IS NULL AND v_action = 'remove' THEN RAISE EXCEPTION 'Choose the sister family'; END IF;
  SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[]) INTO v_ids FROM jsonb_array_elements_text(COALESCE(p_input->'platformIds', '[]'::jsonb)) AS value;
  IF EXISTS (SELECT 1 FROM public.vehicle_platform vp WHERE vp.id = ANY(v_ids) AND (vp.maker = 'family' OR EXISTS (SELECT 1 FROM public.vehicle_platform child WHERE child.parent_id = vp.id))) THEN RAISE EXCEPTION 'A family cannot be a member of a family'; END IF;
  IF v_action = 'add' AND NOT v_move AND EXISTS (SELECT 1 FROM public.vehicle_platform vp WHERE vp.id = ANY(v_ids) AND vp.parent_id IS NOT NULL AND (v_family IS NULL OR vp.parent_id IS DISTINCT FROM v_family)) THEN RAISE EXCEPTION 'That body is already in another family'; END IF;
  IF v_family IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('make', vc.make, 'model', vc.model, 'chassis', vc.chassis_code) ORDER BY vc.make, vc.model, vc.chassis_code), '[]'::jsonb) INTO v_before FROM public.vehicle_catalog vc JOIN public.vehicle_platform vp ON vp.id = vc.platform_id WHERE vp.id = v_family OR vp.parent_id = v_family;
  ELSE v_before := '[]'::jsonb; END IF;
  IF v_dry THEN
    IF v_action = 'remove' THEN
      SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'make', row_data->>'model', row_data->>'chassis'), '[]'::jsonb) INTO v_after FROM (SELECT jsonb_build_object('make', vc.make, 'model', vc.model, 'chassis', vc.chassis_code) AS row_data FROM public.vehicle_catalog vc JOIN public.vehicle_platform vp ON vp.id = vc.platform_id WHERE (vp.id = v_family OR vp.parent_id = v_family) AND NOT (vp.id = ANY(v_ids))) listed;
    ELSE
      SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'make', row_data->>'model', row_data->>'chassis'), '[]'::jsonb) INTO v_after FROM (SELECT DISTINCT jsonb_build_object('make', vc.make, 'model', vc.model, 'chassis', vc.chassis_code) AS row_data FROM public.vehicle_catalog vc JOIN public.vehicle_platform vp ON vp.id = vc.platform_id WHERE vp.parent_id = v_family OR vp.id = ANY(v_ids) OR (v_family IS NOT NULL AND vp.id = v_family)) listed;
    END IF;
    RETURN jsonb_build_object('familyId', v_family, 'dryRun', true, 'before', jsonb_array_length(v_before), 'after', jsonb_array_length(v_after), 'beforeCars', v_before, 'afterCars', v_after);
  END IF;
  IF v_family IS NULL THEN
    INSERT INTO public.vehicle_platform (code, label, maker, notes, family_evidence_url) VALUES (left(regexp_replace(upper(v_label), '[^A-Z0-9]+', '-', 'g'), 40) || '-FAMILY', v_label, 'family', COALESCE(v_reason, 'Sister family'), v_evidence) RETURNING id INTO v_family;
  ELSIF v_reason IS NOT NULL THEN UPDATE public.vehicle_platform SET notes = v_reason WHERE id = v_family; END IF;
  FOREACH v_platform IN ARRAY v_ids LOOP
    IF v_action = 'remove' THEN UPDATE public.vehicle_platform SET parent_id = NULL, family_evidence_url = NULL WHERE id = v_platform AND parent_id = v_family;
    ELSE UPDATE public.vehicle_platform SET parent_id = v_family, family_evidence_url = v_evidence WHERE id = v_platform AND id <> v_family; END IF;
  END LOOP;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('make', vc.make, 'model', vc.model, 'chassis', vc.chassis_code) ORDER BY vc.make, vc.model, vc.chassis_code), '[]'::jsonb) INTO v_after FROM public.vehicle_catalog vc JOIN public.vehicle_platform vp ON vp.id = vc.platform_id WHERE vp.id = v_family OR vp.parent_id = v_family;
  RETURN jsonb_build_object('familyId', v_family, 'dryRun', false, 'before', jsonb_array_length(v_before), 'after', jsonb_array_length(v_after), 'beforeCars', v_before, 'afterCars', v_after);
END; $$;
REVOKE ALL ON FUNCTION public.admin_save_body_family(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_body_family(jsonb) TO service_role;;

CREATE OR REPLACE FUNCTION public.save_guided_part(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid;
  v_op text := upper(trim(coalesce(p_input->>'componentOpCode', '')));
  v_from integer := NULLIF(p_input->>'yearFrom', '')::integer;
  v_to integer := NULLIF(p_input->>'yearTo', '')::integer;
  v_ticked uuid[];
  v_position text := NULLIF(trim(coalesce(p_input->>'position', '')), '');
  v_evidence text := NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_note text := NULLIF(btrim(coalesce(p_input->>'note', '')), '');
  v_actor uuid := NULLIF(p_input->>'verifiedBy', '')::uuid;
  v_group uuid := NULLIF(p_input->>'groupId', '')::uuid;
  v_component uuid; v_category uuid; v_part jsonb; v_kind text; v_mfr text; v_number text; v_name text;
  v_part_id uuid; v_existing_group uuid; v_old uuid; v_scope text; v_listed uuid;
BEGIN
  IF v_variant IS NULL THEN RAISE EXCEPTION 'Choose a vehicle'; END IF;
  IF v_evidence IS NULL THEN RAISE EXCEPTION 'A verified part needs a source link'; END IF;
  IF v_op <> '' THEN
    SELECT id INTO v_component FROM public.maintenance_service_categories WHERE op_code = v_op;
    IF v_component IS NULL THEN RAISE EXCEPTION 'That job is not in the catalog'; END IF;
  END IF;
  IF jsonb_typeof(p_input->'parts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'parts') = 0 THEN RAISE EXCEPTION 'Add at least one part number'; END IF;
  IF p_input ? 'tickedVariantIds' AND jsonb_typeof(p_input->'tickedVariantIds') = 'array' THEN
    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[]) INTO v_ticked FROM jsonb_array_elements_text(p_input->'tickedVariantIds') AS value;
  END IF;
  v_category := NULLIF(p_input->>'categoryId', '')::uuid;
  IF v_category IS NULL AND v_op <> '' THEN v_category := public.guided_category_id(v_op); END IF;
  IF v_category IS NULL THEN RAISE EXCEPTION 'Choose a job or a category'; END IF;
  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value LOOP
    v_mfr := NULLIF(btrim(coalesce(v_part->>'manufacturer', '')), '');
    v_number := NULLIF(btrim(coalesce(v_part->>'partNumber', '')), '');
    v_name := COALESCE(NULLIF(btrim(coalesce(v_part->>'name', '')), ''), v_number);
    v_kind := lower(trim(coalesce(NULLIF(v_part->>'kind', ''), 'oem')));
    IF v_mfr IS NULL OR v_number IS NULL THEN RAISE EXCEPTION 'Each part needs a brand and a part number'; END IF;
    IF v_kind = 'factory' THEN v_kind := 'oem'; END IF;
    IF v_kind = 'supplier' THEN v_kind := 'oe_supplier'; END IF;
    IF v_kind = 'other' THEN v_kind := 'aftermarket'; END IF;
    IF v_kind NOT IN ('oem', 'oe_supplier', 'aftermarket') THEN RAISE EXCEPTION 'Choose factory, original supplier, or other brand'; END IF;
    SELECT pm.id, pm.interchange_group_id INTO v_part_id, v_existing_group FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_mfr) AND pm.oem_part_number_norm = upper(regexp_replace(v_number, '[^A-Za-z0-9]', '', 'g')) AND pm.oem_part_number_norm <> '';
    IF v_existing_group IS NOT NULL AND v_group IS NOT NULL AND v_existing_group <> v_group THEN RAISE EXCEPTION 'Those part numbers are already saved under different fits. Edit each one.'; END IF;
    IF v_group IS NULL AND v_existing_group IS NOT NULL THEN v_group := v_existing_group; END IF;
  END LOOP;
  IF v_group IS NULL THEN
    v_scope := CASE WHEN v_op <> '' AND public.is_engine_level_op(v_op) THEN 'powertrain' ELSE 'body' END;
    INSERT INTO public.part_interchange_group (code, label, fit_scope) VALUES ('GD-' || COALESCE(NULLIF(v_op, ''), 'PART') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), COALESCE(NULLIF(v_op, ''), 'PART'), v_scope) RETURNING id INTO v_group;
  END IF;
  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value LOOP
    v_mfr := btrim(v_part->>'manufacturer'); v_number := btrim(v_part->>'partNumber');
    v_name := COALESCE(NULLIF(btrim(coalesce(v_part->>'name', '')), ''), v_number);
    v_kind := lower(trim(coalesce(NULLIF(v_part->>'kind', ''), 'oem')));
    IF v_kind = 'factory' THEN v_kind := 'oem'; END IF;
    IF v_kind = 'supplier' THEN v_kind := 'oe_supplier'; END IF;
    IF v_kind = 'other' THEN v_kind := 'aftermarket'; END IF;
    SELECT pm.id INTO v_part_id FROM public.part_master pm WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_mfr) AND pm.oem_part_number_norm = upper(regexp_replace(v_number, '[^A-Za-z0-9]', '', 'g'));
    IF v_part_id IS NULL THEN
      INSERT INTO public.part_master (category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id, maintenance_component_id, evidence_url, verified_by, verified_at, catalog_decision, updated_at)
      VALUES (v_category, v_name, v_number, v_mfr, v_kind, v_group, v_component, v_evidence, v_actor, now(), 'confirmed', now()) RETURNING id INTO v_part_id;
    ELSE
      UPDATE public.part_master SET name = v_name, part_kind = v_kind, manufacturer = v_mfr, interchange_group_id = v_group, maintenance_component_id = COALESCE(v_component, maintenance_component_id), category_id = v_category, evidence_url = v_evidence, verified_by = v_actor, verified_at = now(), catalog_decision = 'confirmed', updated_at = now() WHERE id = v_part_id;
    END IF;
    IF coalesce(btrim(v_part->>'supersedes'), '') <> '' THEN
      SELECT pm.id INTO v_old FROM public.part_master pm WHERE pm.oem_part_number_norm = upper(regexp_replace(v_part->>'supersedes', '[^A-Za-z0-9]', '', 'g')) AND pm.id <> v_part_id LIMIT 1;
      IF v_old IS NOT NULL THEN INSERT INTO public.part_supersession (old_part_id, new_part_id) VALUES (v_old, v_part_id) ON CONFLICT DO NOTHING; END IF;
    END IF;
  END LOOP;
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, year_from, year_to, evidence_url, note, verified_by)
  VALUES (v_group, v_variant, v_position, v_from, v_to, v_evidence, v_note, v_actor)
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, COALESCE(position, ''))
  DO UPDATE SET year_from = EXCLUDED.year_from, year_to = EXCLUDED.year_to, evidence_url = EXCLUDED.evidence_url, note = EXCLUDED.note, verified_by = EXCLUDED.verified_by, verified_at = now();
  IF v_ticked IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM unnest(v_ticked) AS picked(id) JOIN public.vehicle_catalog other ON other.id = picked.id JOIN public.vehicle_catalog mine ON mine.id = v_variant WHERE lower(coalesce(other.make, '')) IS DISTINCT FROM lower(coalesce(mine.make, '')) OR lower(coalesce(other.model, '')) IS DISTINCT FROM lower(coalesce(mine.model, ''))) THEN
      RAISE EXCEPTION 'Also listed for must be the same make and model';
    END IF;
    FOREACH v_listed IN ARRAY v_ticked LOOP
      IF v_listed IS DISTINCT FROM v_variant THEN
        INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, year_from, year_to, evidence_url, note, verified_by)
        VALUES (v_group, v_listed, v_position, v_from, v_to, v_evidence, v_note, v_actor)
        ON CONFLICT (interchange_group_id, vehicle_catalog_id, COALESCE(position, ''))
        DO UPDATE SET year_from = EXCLUDED.year_from, year_to = EXCLUDED.year_to, evidence_url = EXCLUDED.evidence_url, note = EXCLUDED.note, verified_by = EXCLUDED.verified_by, verified_at = now();
      END IF;
    END LOOP;
  END IF;
  PERFORM public.refresh_variant_parts_readiness();
  RETURN jsonb_build_object('ok', true, 'groupId', v_group);
END;
$$;

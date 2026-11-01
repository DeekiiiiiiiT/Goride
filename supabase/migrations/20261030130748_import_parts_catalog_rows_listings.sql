CREATE OR REPLACE FUNCTION public.import_parts_catalog_rows(p_rows jsonb, p_batch_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row jsonb; applied int := 0; errors jsonb := '[]'::jsonb;
  v_group_id uuid; v_part_id uuid; v_component_id uuid; v_category_id uuid; v_catalog_id uuid;
  v_kind text; v_position text; v_evidence text; v_number text; v_name text; v_mfr text;
BEGIN
  FOR v_row IN SELECT value FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS value LOOP
    BEGIN
      v_catalog_id := NULLIF(COALESCE(v_row->>'vehicle', v_row->>'vehicleId', v_row->>'vehicle_catalog_id'), '')::uuid;
      v_mfr := NULLIF(btrim(coalesce(v_row->>'manufacturer', '')), '');
      v_number := NULLIF(btrim(coalesce(v_row->>'part_number', v_row->>'partNumber', '')), '');
      v_name := COALESCE(NULLIF(btrim(coalesce(v_row->>'part_name', v_row->>'partName', '')), ''), v_number);
      v_kind := lower(COALESCE(NULLIF(v_row->>'part_kind', ''), NULLIF(v_row->>'partKind', ''), 'oem'));
      v_position := NULLIF(btrim(coalesce(v_row->>'position', '')), '');
      v_evidence := NULLIF(btrim(coalesce(v_row->>'evidence_url', v_row->>'evidenceUrl', '')), '');
      IF v_kind = 'factory' THEN v_kind := 'oem'; END IF;
      IF v_catalog_id IS NULL OR v_mfr IS NULL OR v_number IS NULL OR v_evidence IS NULL THEN
        errors := errors || jsonb_build_array('Each row needs a vehicle, brand, part number, and source'); CONTINUE;
      END IF;
      SELECT id INTO v_category_id FROM public.part_category WHERE slug = NULLIF(COALESCE(v_row->>'category_slug', v_row->>'categorySlug'), '') LIMIT 1;
      IF v_category_id IS NULL THEN errors := errors || jsonb_build_array('Missing parts category for ' || v_number); CONTINUE; END IF;
      SELECT id INTO v_component_id FROM public.maintenance_service_categories WHERE op_code = NULLIF(upper(COALESCE(v_row->>'job', v_row->>'componentOpCode', '')), '') LIMIT 1;
      SELECT pm.id, pm.interchange_group_id INTO v_part_id, v_group_id FROM public.part_master pm WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_mfr) AND pm.oem_part_number_norm = upper(regexp_replace(v_number, '[^A-Za-z0-9]', '', 'g')) LIMIT 1;
      IF v_group_id IS NULL THEN
        INSERT INTO public.part_interchange_group (code, label, fit_scope, import_batch_id) VALUES ('IMP-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), v_name, CASE WHEN v_component_id IS NOT NULL AND public.is_engine_level_op(upper(COALESCE(v_row->>'job', v_row->>'componentOpCode', ''))) THEN 'powertrain' ELSE 'body' END, p_batch_id) RETURNING id INTO v_group_id;
      END IF;
      IF v_part_id IS NULL THEN
        INSERT INTO public.part_master (category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id, maintenance_component_id, import_batch_id, evidence_url, catalog_decision, updated_at) VALUES (v_category_id, v_name, v_number, v_mfr, v_kind, v_group_id, v_component_id, p_batch_id, v_evidence, 'pending', now()) RETURNING id INTO v_part_id;
      ELSE
        INSERT INTO public.part_import_restore (batch_id, part_id, previous) SELECT p_batch_id, pm.id, jsonb_build_object('category_id', pm.category_id, 'interchange_group_id', pm.interchange_group_id, 'maintenance_component_id', pm.maintenance_component_id, 'part_kind', pm.part_kind) FROM public.part_master pm WHERE pm.id = v_part_id ON CONFLICT (batch_id, part_id) DO NOTHING;
        UPDATE public.part_master SET category_id = v_category_id, name = v_name, part_kind = v_kind, interchange_group_id = v_group_id, maintenance_component_id = COALESCE(v_component_id, maintenance_component_id), evidence_url = v_evidence, catalog_decision = 'pending', updated_at = now() WHERE id = v_part_id;
      END IF;
      INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, year_from, year_to, evidence_url, import_batch_id) VALUES (v_group_id, v_catalog_id, v_position, NULLIF(COALESCE(v_row->>'year_from', v_row->>'yearFrom'), '')::integer, NULLIF(COALESCE(v_row->>'year_to', v_row->>'yearTo'), '')::integer, v_evidence, p_batch_id) ON CONFLICT (interchange_group_id, vehicle_catalog_id, COALESCE(position, '')) DO UPDATE SET year_from = EXCLUDED.year_from, year_to = EXCLUDED.year_to, evidence_url = EXCLUDED.evidence_url, import_batch_id = EXCLUDED.import_batch_id;
      applied := applied + 1;
    EXCEPTION WHEN OTHERS THEN errors := errors || jsonb_build_array(SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('applied', applied, 'errors', errors, 'batchId', p_batch_id);
END; $$;
REVOKE ALL ON FUNCTION public.import_parts_catalog_rows(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_parts_catalog_rows(jsonb, uuid) TO service_role;;

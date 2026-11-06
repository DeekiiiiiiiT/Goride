-- Spec fit: validate driver_passenger_rear, low_high_beam, front_rear_side positions on save.

CREATE OR REPLACE FUNCTION public.save_self_serve_part(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_batch_code text;
  v_actor uuid := nullif(p_input->>'actorId', '')::uuid;
  v_type_id uuid := nullif(p_input->>'partTypeId', '')::uuid;
  v_brand text := btrim(coalesce(p_input->>'brand', ''));
  v_number text := btrim(coalesce(p_input->>'partNumber', ''));
  v_name text := coalesce(nullif(btrim(p_input->>'name'), ''), btrim(coalesce(p_input->>'partNumber', '')));
  v_source_type text := coalesce(nullif(p_input->>'sourceType', ''), 'other');
  v_evidence text := nullif(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_fit_mode text := lower(coalesce(p_input->>'fitMode', 'specific'));
  v_part_id uuid := nullif(p_input->>'existingPartId', '')::uuid;
  v_type record;
  v_category uuid;
  v_group uuid;
  v_decision text;
  v_row_id uuid;
  v_before jsonb;
  v_row jsonb;
  v_vid uuid;
  v_pos text;
  v_side text;
  v_line int := 0;
  v_engine uuid := nullif(p_input->>'engineFamilyId', '')::uuid;
  v_engine_pos text := nullif(lower(btrim(coalesce(p_input->>'position', ''))), '');
  v_spec_key text := nullif(btrim(p_input->>'specKey'), '');
  v_spec_value text := nullif(btrim(p_input->>'specValue'), '');
  v_oe_brand text;
  v_oe_norm text;
  v_fits int := 0;
  v_norm text;
BEGIN
  IF v_type_id IS NULL THEN RAISE EXCEPTION 'Choose a part type'; END IF;
  IF v_brand = '' OR v_number = '' THEN RAISE EXCEPTION 'Brand and part number are required'; END IF;
  IF v_evidence IS NULL THEN RAISE EXCEPTION 'A source link is required'; END IF;
  IF v_source_type NOT IN ('car_maker_catalogue', 'part_maker_catalogue', 'other') THEN
    RAISE EXCEPTION 'Choose where you saw the part';
  END IF;
  IF v_fit_mode NOT IN ('specific', 'engine', 'spec') THEN RAISE EXCEPTION 'Choose how the part fits'; END IF;

  SELECT c.id, c.op_code, c.parent_id, c.position_scheme INTO v_type
  FROM public.maintenance_service_categories c
  WHERE c.id = v_type_id AND c.is_part IS TRUE AND c.kind = 'component' AND c.part_type_status = 'active';
  IF v_type.id IS NULL THEN RAISE EXCEPTION 'Invalid part type'; END IF;

  -- part_master.category_id points at part_category (one per area), not at the part type
  SELECT pc.id INTO v_category FROM public.part_category pc WHERE pc.area_id = v_type.parent_id LIMIT 1;
  IF v_category IS NULL THEN RAISE EXCEPTION 'This part type has no catalogue area yet'; END IF;

  -- AS-04: every fit's position must belong to the part type's scheme
  IF v_fit_mode = 'specific' AND jsonb_typeof(p_input->'listings') = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_input->'listings') AS value LOOP
      SELECT n.norm_position, n.norm_side INTO v_pos, v_side
      FROM public.part_norm_position(v_row->>'position', v_row->>'side') AS n;
      IF v_type.position_scheme = 'none' AND (v_pos IS NOT NULL OR v_side IS NOT NULL) THEN
        RAISE EXCEPTION 'This part type has no position';
      ELSIF v_type.position_scheme IN ('axle', 'axle_inner_outer') AND (v_pos IS NULL OR v_side IS NOT NULL) THEN
        RAISE EXCEPTION 'Choose Front or Rear';
      ELSIF v_type.position_scheme IN ('four_corners', 'axle_left_right') AND (v_pos IS NULL OR v_side IS NULL) THEN
        RAISE EXCEPTION 'Choose the corner (front/rear and left/right)';
      ELSIF v_type.position_scheme NOT IN ('none', 'axle', 'axle_inner_outer', 'four_corners', 'axle_left_right') THEN
        RAISE EXCEPTION 'This part type is added by engine or by size, not by specific cars';
      END IF;
    END LOOP;
  END IF;
  IF v_fit_mode = 'engine' THEN
    IF v_engine IS NULL THEN RAISE EXCEPTION 'Choose an engine'; END IF;
    IF v_type.position_scheme = 'before_after_catalyst' THEN
      IF v_engine_pos IS NULL OR v_engine_pos NOT IN ('before_cat', 'after_cat') THEN
        RAISE EXCEPTION 'Choose before or after the catalytic converter';
      END IF;
    ELSIF v_engine_pos IS NOT NULL THEN
      RAISE EXCEPTION 'This part type has no position';
    END IF;
  END IF;
  IF v_fit_mode = 'spec' AND (v_spec_key IS NULL OR v_spec_value IS NULL) THEN
    RAISE EXCEPTION 'Enter the size or spec';
  END IF;
  IF v_fit_mode = 'spec' THEN
    IF v_type.position_scheme = 'driver_passenger_rear' AND (v_engine_pos IS NULL OR v_engine_pos NOT IN ('driver', 'passenger', 'rear')) THEN
      RAISE EXCEPTION 'Choose driver, passenger, or rear';
    ELSIF v_type.position_scheme = 'low_high_beam' AND (v_engine_pos IS NULL OR v_engine_pos NOT IN ('low', 'high')) THEN
      RAISE EXCEPTION 'Choose low or high beam';
    ELSIF v_type.position_scheme = 'front_rear_side' AND (v_engine_pos IS NULL OR v_engine_pos NOT IN ('front', 'rear', 'side')) THEN
      RAISE EXCEPTION 'Choose front, rear, or side';
    ELSIF v_type.position_scheme = 'none' AND v_engine_pos IS NOT NULL THEN
      RAISE EXCEPTION 'This part type has no position';
    END IF;
  END IF;

  v_decision := public.self_serve_catalog_decision(v_source_type);
  v_norm := public.part_import_norm_number(v_number);
  v_batch_code := 'AP-' || upper(substr(replace(v_batch_id::text, '-', ''), 1, 8));

  INSERT INTO public.part_import_batch (
    id, code, area_id, template_version, file_name, file_sha256, status, import_kind, promoted_at, promoted_by, uploaded_by
  ) VALUES (
    v_batch_id, v_batch_code, v_type.parent_id, 1, 'self-serve', v_batch_code, 'imported', 'self_serve_add', now(), v_actor, v_actor
  );

  IF v_part_id IS NULL THEN
    SELECT pm.id INTO v_part_id
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_brand)
      AND pm.oem_part_number_norm = v_norm
    LIMIT 1;
  END IF;

  IF v_part_id IS NOT NULL THEN
    -- existing part: log it so Recently added shows this save; undo restores the same values
    SELECT pm.interchange_group_id, to_jsonb(pm.*) INTO v_group, v_before FROM public.part_master pm WHERE pm.id = v_part_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'That part no longer exists'; END IF;
    v_line := v_line + 1;
    INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
    VALUES (v_batch_id, v_line, 'part_master', v_part_id, 'update', v_before, v_before);
  END IF;

  IF v_group IS NULL THEN
    INSERT INTO public.part_interchange_group (code, label, fit_scope)
    VALUES ('SS-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), v_name, CASE v_fit_mode WHEN 'engine' THEN 'powertrain' WHEN 'spec' THEN 'universal' ELSE 'body' END)
    RETURNING id INTO v_group;
    v_line := v_line + 1;
    INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
    SELECT v_batch_id, v_line, 'part_interchange_group', v_group, 'insert', to_jsonb(g.*)
    FROM public.part_interchange_group g WHERE g.id = v_group;
    IF v_part_id IS NOT NULL THEN
      UPDATE public.part_master SET interchange_group_id = v_group WHERE id = v_part_id;
    END IF;
  END IF;

  IF v_part_id IS NULL THEN
    INSERT INTO public.part_master (
      category_id, name, oem_part_number, manufacturer, part_kind,
      interchange_group_id, maintenance_component_id, evidence_url,
      catalog_decision, source_type, verified_by, verified_at,
      updated_at, import_batch_id
    ) VALUES (
      v_category, v_name, v_number, v_brand, 'aftermarket',
      v_group, v_type_id, v_evidence,
      v_decision, v_source_type, v_actor, CASE WHEN v_decision = 'confirmed' THEN now() ELSE NULL END,
      now(), v_batch_id
    )
    RETURNING id INTO v_part_id;
    v_line := v_line + 1;
    INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
    SELECT v_batch_id, v_line, 'part_master', v_part_id, 'insert', to_jsonb(pm.*)
    FROM public.part_master pm WHERE pm.id = v_part_id;
  END IF;

  IF v_fit_mode = 'specific' AND jsonb_typeof(p_input->'listings') = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_input->'listings') AS value
    LOOP
      v_vid := nullif(v_row->>'vehicleId', '')::uuid;
      IF v_vid IS NULL THEN CONTINUE; END IF;
      SELECT n.norm_position, n.norm_side INTO v_pos, v_side
      FROM public.part_norm_position(v_row->>'position', v_row->>'side') AS n;
      v_row_id := NULL;
      SELECT pl.id INTO v_row_id
      FROM public.part_listing pl
      WHERE pl.interchange_group_id = v_group AND pl.vehicle_catalog_id = v_vid
        AND pl.position IS NOT DISTINCT FROM v_pos AND pl.side IS NOT DISTINCT FROM v_side;
      IF v_row_id IS NULL THEN
        INSERT INTO public.part_listing (
          interchange_group_id, vehicle_catalog_id, position, side,
          year_from, year_to, evidence_url, origin, import_batch_id
        ) VALUES (
          v_group, v_vid, v_pos, v_side,
          nullif(v_row->>'yearFrom', '')::int, nullif(v_row->>'yearTo', '')::int,
          v_evidence, 'manual', v_batch_id
        )
        RETURNING id INTO v_row_id;
        v_line := v_line + 1;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
        SELECT v_batch_id, v_line, 'part_listing', v_row_id, 'insert', to_jsonb(pl.*)
        FROM public.part_listing pl WHERE pl.id = v_row_id;
        v_fits := v_fits + 1;
      END IF;
    END LOOP;
  ELSIF v_fit_mode = 'engine' THEN
    v_row_id := NULL;
    SELECT r.id INTO v_row_id FROM public.interchange_fitment_rule r
    WHERE r.interchange_group_id = v_group AND r.target_kind = 'engine_family'
      AND r.engine_family_id = v_engine AND r.position IS NOT DISTINCT FROM v_engine_pos;
    IF v_row_id IS NULL THEN
      INSERT INTO public.interchange_fitment_rule (
        interchange_group_id, target_kind, engine_family_id, position, source, notes, verified_by, verified_at, import_batch_id
      ) VALUES (
        v_group, 'engine_family', v_engine, v_engine_pos, 'manual', v_name,
        v_actor, CASE WHEN v_decision = 'confirmed' THEN now() ELSE NULL END, v_batch_id
      )
      RETURNING id INTO v_row_id;
      v_line := v_line + 1;
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
      SELECT v_batch_id, v_line, 'interchange_fitment_rule', v_row_id, 'insert', to_jsonb(r.*)
      FROM public.interchange_fitment_rule r WHERE r.id = v_row_id;
    END IF;
    FOR v_vid IN
      SELECT vc.id
      FROM public.vehicle_catalog vc
      WHERE vc.engine_family_id = v_engine
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(coalesce(p_input->'excludedVehicleIds', '[]'::jsonb)) AS ex(id_txt)
          WHERE btrim(ex.id_txt) <> '' AND ex.id_txt::uuid = vc.id
        )
    LOOP
      v_row_id := NULL;
      SELECT pl.id INTO v_row_id
      FROM public.part_listing pl
      WHERE pl.interchange_group_id = v_group AND pl.vehicle_catalog_id = v_vid
        AND pl.position IS NOT DISTINCT FROM v_engine_pos AND pl.side IS NULL;
      IF v_row_id IS NULL THEN
        INSERT INTO public.part_listing (
          interchange_group_id, vehicle_catalog_id, position, side,
          evidence_url, origin, import_batch_id
        ) VALUES (
          v_group, v_vid, v_engine_pos, NULL,
          v_evidence, 'manual', v_batch_id
        )
        RETURNING id INTO v_row_id;
        v_line := v_line + 1;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
        SELECT v_batch_id, v_line, 'part_listing', v_row_id, 'insert', to_jsonb(pl.*)
        FROM public.part_listing pl WHERE pl.id = v_row_id;
        v_fits := v_fits + 1;
      END IF;
    END LOOP;
    -- AS4-01: cars the user excluded on the engine step must not get the part
    IF jsonb_typeof(p_input->'excludedVehicleIds') = 'array' THEN
      FOR v_vid IN
        SELECT DISTINCT x::uuid
        FROM jsonb_array_elements_text(p_input->'excludedVehicleIds') AS x
        JOIN public.vehicle_catalog vc ON vc.id = x::uuid AND vc.engine_family_id = v_engine
        WHERE x <> ''
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.part_listing_exclusion e
          WHERE e.interchange_group_id = v_group AND e.vehicle_catalog_id = v_vid
        ) THEN
          INSERT INTO public.part_listing_exclusion (interchange_group_id, vehicle_catalog_id, reason, evidence_url, source, created_by)
          VALUES (v_group, v_vid, 'Excluded when added by engine', v_evidence, 'manual', v_actor)
          RETURNING id INTO v_row_id;
          v_line := v_line + 1;
          INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
          SELECT v_batch_id, v_line, 'part_listing_exclusion', v_row_id, 'insert', to_jsonb(e.*)
          FROM public.part_listing_exclusion e WHERE e.id = v_row_id;
        END IF;
      END LOOP;
    END IF;
  ELSIF v_fit_mode = 'spec' THEN
    v_row_id := NULL;
    v_before := NULL;
    SELECT up.id, to_jsonb(up.*) INTO v_row_id, v_before
    FROM public.universal_part up WHERE up.manufacturer = v_brand AND up.part_number = v_number;
    v_row := public.save_universal_part(jsonb_build_object(
      'specKey', v_spec_key,
      'specValue', v_spec_value,
      'manufacturer', v_brand,
      'partNumber', v_number,
      'name', v_name,
      'evidenceUrl', v_evidence,
      'extra', jsonb_build_object('partId', v_part_id, 'partTypeOpCode', v_type.op_code)
    ));
    v_line := v_line + 1;
    IF v_row_id IS NULL THEN
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
      VALUES (v_batch_id, v_line, 'universal_part', (v_row->>'id')::uuid, 'insert', v_row);
    ELSE
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      VALUES (v_batch_id, v_line, 'universal_part', v_row_id, 'update', v_before, v_row);
    END IF;
    v_fits := v_fits + 1;
  END IF;

  IF jsonb_typeof(p_input->'factoryNumbers') = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_input->'factoryNumbers') AS value
    LOOP
      IF btrim(coalesce(v_row->>'number', '')) = '' THEN CONTINUE; END IF;
      v_oe_brand := coalesce(nullif(btrim(v_row->>'brand'), ''), 'OEM');
      v_oe_norm := public.part_import_norm_number(v_row->>'number');
      v_row_id := NULL;
      SELECT r.id INTO v_row_id FROM public.part_oe_reference r
      WHERE r.part_id = v_part_id AND upper(coalesce(r.oe_brand, '')) = upper(v_oe_brand) AND r.oe_number_norm = v_oe_norm;
      IF v_row_id IS NULL THEN
        INSERT INTO public.part_oe_reference (
          part_id, reference_type, oe_brand, oe_number, oe_number_norm, evidence_url, created_by, import_batch_id
        ) VALUES (
          v_part_id, 'replaces', v_oe_brand, btrim(v_row->>'number'), v_oe_norm, v_evidence, v_actor, v_batch_id
        )
        RETURNING id INTO v_row_id;
        v_line := v_line + 1;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
        SELECT v_batch_id, v_line, 'part_oe_reference', v_row_id, 'insert', to_jsonb(r.*)
        FROM public.part_oe_reference r WHERE r.id = v_row_id;
        v_fits := v_fits + 1;
      END IF;
    END LOOP;
  END IF;

  IF v_fits = 0 AND NOT EXISTS (
    SELECT 1 FROM public.part_import_change WHERE batch_id = v_batch_id AND op = 'insert'
  ) THEN
    RAISE EXCEPTION 'Nothing new to save - this part already has these fits';
  END IF;

  UPDATE public.part_import_batch SET
    parts_created = (SELECT count(*) FROM public.part_import_change WHERE batch_id = v_batch_id AND table_name = 'part_master' AND op = 'insert'),
    fits_created = v_fits
  WHERE id = v_batch_id;

  PERFORM public.part_match_recompute(v_group, NULL);

  UPDATE public.part_import_change pic
  SET after = public.part_import_row_snapshot(pic.table_name, pic.row_id)
  WHERE pic.batch_id = v_batch_id
    AND pic.op = 'insert'
    AND public.part_import_row_snapshot(pic.table_name, pic.row_id) IS NOT NULL;

  RETURN jsonb_build_object(
    'batchId', v_batch_id,
    'batchCode', v_batch_code,
    'partId', v_part_id,
    'groupId', v_group,
    'catalogDecision', v_decision,
    'trustLabel', CASE v_source_type
      WHEN 'car_maker_catalogue' THEN 'Verified · car maker''s catalogue'
      WHEN 'part_maker_catalogue' THEN 'Verified · part maker''s catalogue'
      ELSE 'Needs checking · other source'
    END,
    'preview', public.self_serve_part_add_preview(p_input)
  );
END;
$$;

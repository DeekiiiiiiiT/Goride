-- Add-a-part Rev 4 fix (AS4-01): the engine step lets you exclude cars and the preview
-- drops them, but save ignored the list, so excluded cars still got the part.
-- Save now writes part_listing_exclusion rows (logged), and Undo removes them.

ALTER TABLE public.part_import_change DROP CONSTRAINT IF EXISTS part_import_change_table_name_check;
ALTER TABLE public.part_import_change ADD CONSTRAINT part_import_change_table_name_check CHECK (
  table_name IN (
    'part_master', 'part_listing', 'part_interchange_group', 'universal_part',
    'vehicle_oe_number', 'part_oe_reference', 'part_index_number', 'part_approval',
    'platform_component_link', 'interchange_group_merge_log', 'interchange_fitment_rule',
    'catalog_spec_value', 'part_listing_exclusion'
  )
);

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
    VALUES ('SS-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), v_name, 'body')
    RETURNING id INTO v_group;
    v_line := v_line + 1;
    INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
    VALUES (v_batch_id, v_line, 'part_interchange_group', v_group, 'insert', jsonb_build_object('id', v_group));
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
        VALUES (v_batch_id, v_line, 'part_listing', v_row_id, 'insert',
          jsonb_build_object('interchange_group_id', v_group, 'vehicle_catalog_id', v_vid));
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
      VALUES (v_batch_id, v_line, 'interchange_fitment_rule', v_row_id, 'insert',
        jsonb_build_object('interchange_group_id', v_group, 'engine_family_id', v_engine));
      v_fits := v_fits + 1;
    END IF;
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
          VALUES (v_batch_id, v_line, 'part_listing_exclusion', v_row_id, 'insert',
            jsonb_build_object('interchange_group_id', v_group, 'vehicle_catalog_id', v_vid));
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
        VALUES (v_batch_id, v_line, 'part_oe_reference', v_row_id, 'insert', jsonb_build_object('part_id', v_part_id));
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

CREATE OR REPLACE FUNCTION public.part_import_undo(p_batch_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch record;
  c record;
  v_pf jsonb;
  v_kept int := 0;
  r record;
  v_window interval;
BEGIN
  SELECT * INTO v_batch FROM public.part_import_batch WHERE id = p_batch_id FOR UPDATE;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_batch.status <> 'imported' THEN RAISE EXCEPTION 'Only imported batches can be undone'; END IF;

  v_window := CASE WHEN coalesce(v_batch.import_kind, '') = 'self_serve_add' THEN interval '24 hours' ELSE interval '72 hours' END;
  IF v_batch.promoted_at IS NULL OR v_batch.promoted_at < now() - v_window THEN
    RAISE EXCEPTION 'Rollback window closed';
  END IF;

  v_pf := public.part_import_undo_preflight(p_batch_id);
  IF NOT coalesce((v_pf->>'ok')::boolean, false) THEN
    RETURN v_pf;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS part_import_undo_groups (group_id uuid PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS part_import_undo_vehicles (vehicle_id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE part_import_undo_groups;
  TRUNCATE part_import_undo_vehicles;

  INSERT INTO part_import_undo_vehicles (vehicle_id)
  SELECT DISTINCT coalesce(pic.after->>'vehicle_catalog_id', pic.before->>'vehicle_catalog_id')::uuid
  FROM public.part_import_change pic
  WHERE pic.batch_id = p_batch_id
    AND pic.table_name = 'vehicle_oe_number'
    AND coalesce(pic.after->>'vehicle_catalog_id', pic.before->>'vehicle_catalog_id') IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO part_import_undo_groups (group_id)
  SELECT DISTINCT pm.interchange_group_id
  FROM public.part_import_change pic
  JOIN public.part_master pm ON pm.id = coalesce(pic.after->>'part_id', pic.before->>'part_id')::uuid
  WHERE pic.batch_id = p_batch_id
    AND pic.table_name IN ('part_oe_reference', 'part_index_number', 'part_approval')
    AND pm.interchange_group_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO part_import_undo_groups (group_id)
  SELECT DISTINCT pm.interchange_group_id
  FROM public.part_import_change pic
  JOIN public.part_master pm ON pm.id = pic.row_id
  WHERE pic.batch_id = p_batch_id
    AND pic.table_name = 'part_master'
    AND pm.interchange_group_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO part_import_undo_groups (group_id)
  SELECT DISTINCT coalesce(pic.after->>'interchange_group_id', pic.before->>'interchange_group_id')::uuid
  FROM public.part_import_change pic
  WHERE pic.batch_id = p_batch_id
    AND pic.table_name = 'part_listing'
    AND coalesce(pic.after->>'interchange_group_id', pic.before->>'interchange_group_id') IS NOT NULL
  ON CONFLICT DO NOTHING;

  FOR c IN
    SELECT * FROM public.part_import_change
    WHERE batch_id = p_batch_id
    ORDER BY id DESC
  LOOP
    IF c.op = 'insert' THEN
      IF c.table_name = 'part_listing' THEN
        DELETE FROM public.part_listing WHERE id = c.row_id;
      ELSIF c.table_name = 'part_master' THEN
        IF EXISTS (SELECT 1 FROM public.maintenance_parts_usage u WHERE u.part_id = c.row_id) THEN
          v_kept := v_kept + 1;
        ELSE
          DELETE FROM public.part_master WHERE id = c.row_id;
        END IF;
      ELSIF c.table_name = 'part_interchange_group' THEN
        DELETE FROM public.part_interchange_group g
        WHERE g.id = c.row_id
          AND NOT EXISTS (SELECT 1 FROM public.part_master pm WHERE pm.interchange_group_id = g.id);
      ELSIF c.table_name = 'vehicle_oe_number' THEN
        DELETE FROM public.vehicle_oe_number WHERE id = c.row_id;
      ELSIF c.table_name = 'interchange_fitment_rule' THEN
        DELETE FROM public.interchange_fitment_rule WHERE id = c.row_id;
      ELSIF c.table_name IN ('part_oe_reference', 'part_index_number', 'part_approval') THEN
        EXECUTE format('DELETE FROM public.%I WHERE id = $1', c.table_name) USING c.row_id;
      ELSIF c.table_name = 'platform_component_link' THEN
        DELETE FROM public.platform_component_link WHERE id = c.row_id;
      ELSIF c.table_name = 'universal_part' THEN
        DELETE FROM public.universal_part WHERE id = c.row_id;
      ELSIF c.table_name = 'catalog_spec_value' THEN
        DELETE FROM public.catalog_spec_value WHERE id = c.row_id;
      ELSIF c.table_name = 'part_listing_exclusion' THEN
        DELETE FROM public.part_listing_exclusion WHERE id = c.row_id;
      ELSIF c.table_name = 'interchange_group_merge_log' THEN
        IF EXISTS (
          SELECT 1 FROM public.interchange_group_merge_log ml
          JOIN public.part_match_conflict pc ON pc.id = ml.conflict_id
          WHERE ml.id = c.row_id AND pc.status = 'kept'
        ) THEN
          CONTINUE;
        END IF;
        UPDATE public.interchange_group_merge_log m
        SET reversed_at = now()
        WHERE m.id = c.row_id AND m.reversed_at IS NULL;
      END IF;
    ELSIF c.op = 'update' AND c.before IS NOT NULL THEN
      IF c.table_name = 'part_master' THEN
        UPDATE public.part_master pm SET
          category_id = (c.before->>'category_id')::uuid,
          name = c.before->>'name',
          evidence_url = c.before->>'evidence_url',
          part_kind = c.before->>'part_kind',
          catalog_decision = c.before->>'catalog_decision',
          source_type = c.before->>'source_type',
          maintenance_component_id = nullif(c.before->>'maintenance_component_id', '')::uuid,
          metadata = coalesce(c.before->'metadata', pm.metadata)
        WHERE id = c.row_id;
      ELSIF c.table_name = 'part_listing' THEN
        UPDATE public.part_listing pl SET
          year_from = (c.before->>'year_from')::int,
          year_to = (c.before->>'year_to')::int,
          evidence_url = c.before->>'evidence_url',
          position = c.before->>'position',
          side = c.before->>'side'
        WHERE id = c.row_id;
      ELSIF c.table_name = 'vehicle_oe_number' THEN
        UPDATE public.vehicle_oe_number von SET
          year_from = (c.before->>'year_from')::int,
          year_to = (c.before->>'year_to')::int,
          evidence_url = c.before->>'evidence_url',
          oe_brand = c.before->>'oe_brand',
          oe_number = c.before->>'oe_number',
          oe_number_norm = c.before->>'oe_number_norm'
        WHERE id = c.row_id;
      ELSIF c.table_name = 'universal_part' THEN
        UPDATE public.universal_part up SET
          spec_key = c.before->>'spec_key',
          spec_value = c.before->>'spec_value',
          name = c.before->>'name',
          extra = coalesce(c.before->'extra', up.extra),
          evidence_url = c.before->>'evidence_url'
        WHERE id = c.row_id;
      ELSIF c.table_name = 'catalog_spec_value' THEN
        UPDATE public.catalog_spec_value s SET
          value = c.before->>'value',
          year_from = (c.before->>'year_from')::int,
          year_to = (c.before->>'year_to')::int,
          evidence_url = c.before->>'evidence_url',
          verified_by = nullif(c.before->>'verified_by', '')::uuid,
          verified_at = coalesce((c.before->>'verified_at')::timestamptz, s.verified_at)
        WHERE id = c.row_id;
      ELSIF c.table_name IN ('part_oe_reference', 'part_index_number', 'part_approval', 'platform_component_link') THEN
        EXECUTE format(
          'UPDATE public.%I SET evidence_url = $1 WHERE id = $2',
          c.table_name
        ) USING c.before->>'evidence_url', c.row_id;
      END IF;
    END IF;
  END LOOP;

  FOR r IN SELECT g.group_id FROM part_import_undo_groups g LOOP
    PERFORM public.part_match_recompute(r.group_id, NULL);
  END LOOP;
  FOR r IN SELECT v.vehicle_id FROM part_import_undo_vehicles v LOOP
    PERFORM public.part_match_recompute(NULL, r.vehicle_id);
  END LOOP;

  PERFORM public.refresh_variant_parts_readiness();

  UPDATE public.part_import_batch
  SET status = 'undone', undone_at = now(), undone_by = p_actor
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('ok', true, 'partsKept', v_kept);
END;
$$;

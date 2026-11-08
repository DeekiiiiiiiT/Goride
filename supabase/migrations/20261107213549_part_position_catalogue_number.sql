-- 5-11 / 5-12: Toyota catalogue numbers (No.1–No.3) for handbrake cable and brake hose.

ALTER TABLE public.part_listing
  ADD COLUMN IF NOT EXISTS catalogue_number smallint;

ALTER TABLE public.part_listing
  DROP CONSTRAINT IF EXISTS part_listing_catalogue_number_check;

ALTER TABLE public.part_listing
  ADD CONSTRAINT part_listing_catalogue_number_check
  CHECK (catalogue_number IS NULL OR (catalogue_number >= 1 AND catalogue_number <= 9)) NOT VALID;

ALTER TABLE public.part_listing VALIDATE CONSTRAINT part_listing_catalogue_number_check;

ALTER TABLE public.maintenance_service_categories
  DROP CONSTRAINT IF EXISTS maintenance_service_categories_position_scheme_check;

ALTER TABLE public.maintenance_service_categories
  ADD CONSTRAINT maintenance_service_categories_position_scheme_check
  CHECK (position_scheme IN (
    'none', 'axle', 'four_corners', 'driver_passenger_rear', 'low_high_beam',
    'before_after_catalyst', 'front_rear_side', 'axle_left_right', 'axle_inner_outer',
    'axle_numbered'
  ));

UPDATE public.maintenance_service_categories
SET position_scheme = 'axle_numbered'
WHERE op_code IN ('BRK-HBCABLE', 'BRK-HOSE')
  AND is_part IS TRUE;

DROP INDEX IF EXISTS public.part_listing_group_car_position_side;

CREATE UNIQUE INDEX part_listing_group_car_position_side
  ON public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, catalogue_number)
  NULLS NOT DISTINCT;

DROP FUNCTION IF EXISTS public.self_serve_default_part_name(text, text, text, text);

CREATE OR REPLACE FUNCTION public.self_serve_default_part_name(
  p_plain_name text,
  p_position_scheme text,
  p_position text,
  p_side text,
  p_catalogue_number smallint DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $helper$
DECLARE
  v_base text := btrim(coalesce(p_plain_name, ''));
  v_scheme text := lower(btrim(coalesce(p_position_scheme, 'none')));
  v_pos text := nullif(lower(btrim(coalesce(p_position, ''))), '');
  v_side text := nullif(lower(btrim(coalesce(p_side, ''))), '');
  v_phrase text;
  v_type_tail text;
  v_pos_label text;
  v_cat smallint := p_catalogue_number;
BEGIN
  IF v_base = '' THEN
    v_base := 'Part';
  END IF;

  IF v_scheme = 'none' OR v_pos IS NULL THEN
    RETURN v_base;
  END IF;

  v_phrase := lower(v_base);
  IF length(v_base) >= 2 AND upper(substr(v_base, 2, 1)) = substr(v_base, 2, 1) THEN
    v_type_tail := v_base;
  ELSE
    v_type_tail := lower(substr(v_base, 1, 1)) || substr(v_base, 2);
  END IF;

  IF v_scheme = 'axle_numbered' AND v_pos IN ('front', 'rear') THEN
    IF v_phrase NOT LIKE v_pos || '%' THEN
      v_pos_label := initcap(v_pos) || ' ' || v_type_tail;
    ELSE
      v_pos_label := v_base;
    END IF;
    IF v_cat IS NOT NULL THEN
      v_pos_label := v_pos_label || ' No.' || v_cat::text;
    END IF;
    IF v_side IS NOT NULL THEN
      RETURN v_pos_label || ', ' || v_side;
    END IF;
    RETURN v_pos_label;
  END IF;

  IF v_scheme IN ('axle', 'axle_inner_outer') AND v_pos IN ('front', 'rear') THEN
    IF v_phrase NOT LIKE v_pos || '%' THEN
      RETURN initcap(v_pos) || ' ' || v_type_tail;
    END IF;
    RETURN v_base;
  END IF;

  IF v_scheme IN ('four_corners', 'axle_left_right') AND v_pos IN ('front', 'rear') AND v_side IS NOT NULL THEN
    IF v_phrase NOT LIKE v_pos || '%' THEN
      RETURN initcap(v_pos) || ' ' || v_type_tail || ', ' || v_side;
    END IF;
    RETURN v_base || ', ' || v_side;
  END IF;

  IF v_scheme = 'before_after_catalyst' AND v_pos IN ('before_cat', 'after_cat') THEN
    v_pos_label := CASE v_pos WHEN 'before_cat' THEN 'Before cat' WHEN 'after_cat' THEN 'After cat' END;
    IF v_phrase NOT LIKE 'before cat%' AND v_phrase NOT LIKE 'after cat%' THEN
      RETURN v_pos_label || ' ' || v_type_tail;
    END IF;
    RETURN v_base;
  END IF;

  IF v_scheme = 'driver_passenger_rear' AND v_pos IN ('driver', 'passenger', 'rear') THEN
    v_pos_label := initcap(v_pos);
    IF v_phrase NOT LIKE v_pos || '%' THEN
      RETURN v_pos_label || ' ' || v_type_tail;
    END IF;
    RETURN v_base;
  END IF;

  IF v_scheme = 'low_high_beam' AND v_pos IN ('low', 'high') THEN
    v_pos_label := CASE v_pos WHEN 'low' THEN 'Low beam' WHEN 'high' THEN 'High beam' END;
    IF v_phrase NOT LIKE v_pos || '%' AND v_phrase NOT LIKE v_pos || ' beam%' THEN
      RETURN v_pos_label || ' ' || v_type_tail;
    END IF;
    RETURN v_base;
  END IF;

  IF v_scheme = 'front_rear_side' AND v_pos IN ('front', 'rear', 'side') THEN
    v_pos_label := initcap(v_pos);
    IF v_phrase NOT LIKE v_pos || '%' THEN
      RETURN v_pos_label || ' ' || v_type_tail;
    END IF;
    RETURN v_base;
  END IF;

  IF v_phrase NOT LIKE v_pos || '%' THEN
    RETURN initcap(v_pos) || ' ' || v_type_tail;
  END IF;
  RETURN v_base;
END;
$helper$;

REVOKE EXECUTE ON FUNCTION public.self_serve_default_part_name(text, text, text, text, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_default_part_name(text, text, text, text, smallint) TO service_role;

CREATE OR REPLACE FUNCTION public.save_self_serve_part(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_batch_code text;
  v_actor uuid := nullif(p_input->>'actorId', '')::uuid;
  v_type_id uuid := nullif(p_input->>'partTypeId', '')::uuid;
  v_brand text := btrim(coalesce(p_input->>'brand', ''));
  v_number text := btrim(coalesce(p_input->>'partNumber', ''));
  v_name text := nullif(btrim(p_input->>'name'), '');
  v_source_type text := coalesce(nullif(p_input->>'sourceType', ''), 'other');
  v_kind text := CASE WHEN p_input->>'partKind' IN ('oem', 'aftermarket') THEN p_input->>'partKind' ELSE 'aftermarket' END;
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
  v_cat smallint;
  v_def_cat smallint;
  v_distinct_cat int;
  v_def_pos text;
  v_def_side text;
  v_distinct_sides int;
  v_line int := 0;
  v_engine uuid := nullif(p_input->>'engineFamilyId', '')::uuid;
  v_engine_pos text := nullif(lower(btrim(coalesce(p_input->>'position', ''))), '');
  v_spec_key text := nullif(btrim(p_input->>'specKey'), '');
  v_spec_value text := nullif(btrim(p_input->>'specValue'), '');
  v_oe_brand text;
  v_oe_norm text;
  v_fits int := 0;
  v_norm text;
  v_list_trust text;
  v_list_reason text;
  v_yf int;
  v_yt int;
  v_car_mk text;
  v_link_trust text;
  v_trust_label text;
BEGIN
  IF v_type_id IS NULL THEN RAISE EXCEPTION 'Choose a part type'; END IF;
  IF v_brand = '' OR v_number = '' THEN RAISE EXCEPTION 'Brand and part number are required'; END IF;
  IF v_evidence IS NULL THEN RAISE EXCEPTION 'A source link is required'; END IF;
  IF v_source_type NOT IN ('car_maker_catalogue', 'part_maker_catalogue', 'other') THEN
    RAISE EXCEPTION 'Choose where you saw the part';
  END IF;
  IF v_fit_mode NOT IN ('specific', 'engine', 'spec') THEN RAISE EXCEPTION 'Choose how the part fits'; END IF;

  SELECT c.id, c.op_code, c.parent_id, c.position_scheme, coalesce(c.plain_name, c.name) AS plain_name INTO v_type
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
      v_cat := nullif(v_row->>'catalogueNumber', '')::smallint;
      IF v_cat IS NOT NULL AND (v_cat < 1 OR v_cat > 9) THEN
        RAISE EXCEPTION 'Catalogue number must be 1 to 9';
      END IF;
      IF v_type.position_scheme = 'none' AND (v_pos IS NOT NULL OR v_side IS NOT NULL) THEN
        RAISE EXCEPTION 'This part type has no position';
      ELSIF v_type.position_scheme IN ('axle', 'axle_inner_outer') AND (v_pos IS NULL OR v_side IS NOT NULL) THEN
        RAISE EXCEPTION 'Choose Front or Rear';
      ELSIF v_type.position_scheme IN ('four_corners', 'axle_left_right') AND (v_pos IS NULL OR v_side IS NULL) THEN
        RAISE EXCEPTION 'Choose the corner (front/rear and left/right)';
      ELSIF v_type.position_scheme = 'axle_numbered' AND v_pos IS NULL THEN
        RAISE EXCEPTION 'Choose Front or Rear';
      ELSIF v_type.position_scheme NOT IN ('none', 'axle', 'axle_inner_outer', 'four_corners', 'axle_left_right', 'axle_numbered') THEN
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

  IF v_name IS NULL THEN
    v_def_pos := nullif(lower(btrim(coalesce(p_input->>'position', ''))), '');
    v_def_side := nullif(lower(btrim(coalesce(p_input->>'side', ''))), '');
    IF v_fit_mode = 'specific' AND jsonb_typeof(p_input->'listings') = 'array' AND jsonb_array_length(p_input->'listings') > 0 THEN
      SELECT count(DISTINCT nullif(elem->>'catalogueNumber', '')::smallint) FILTER (WHERE nullif(elem->>'catalogueNumber', '') IS NOT NULL)
      INTO v_distinct_cat
      FROM jsonb_array_elements(p_input->'listings') AS elem;

      SELECT count(DISTINCT n.norm_side) FILTER (WHERE n.norm_side IS NOT NULL)
      INTO v_distinct_sides
      FROM jsonb_array_elements(p_input->'listings') AS elem
      CROSS JOIN LATERAL public.part_norm_position(elem->>'position', elem->>'side') AS n;

      SELECT n.norm_position INTO v_def_pos
      FROM jsonb_array_elements(p_input->'listings') AS elem
      CROSS JOIN LATERAL public.part_norm_position(elem->>'position', elem->>'side') AS n
      LIMIT 1;

      IF coalesce(v_distinct_sides, 0) > 1 THEN
        v_def_side := NULL;
      ELSIF coalesce(v_distinct_sides, 0) = 1 THEN
        SELECT n.norm_side INTO v_def_side
        FROM jsonb_array_elements(p_input->'listings') AS elem
        CROSS JOIN LATERAL public.part_norm_position(elem->>'position', elem->>'side') AS n
        WHERE n.norm_side IS NOT NULL
        LIMIT 1;
      ELSE
        v_def_side := NULL;
      END IF;

      IF coalesce(v_distinct_cat, 0) > 1 THEN
        v_def_cat := NULL;
      ELSIF coalesce(v_distinct_cat, 0) = 1 THEN
        SELECT nullif(elem->>'catalogueNumber', '')::smallint INTO v_def_cat
        FROM jsonb_array_elements(p_input->'listings') AS elem
        WHERE nullif(elem->>'catalogueNumber', '') IS NOT NULL
        LIMIT 1;
      ELSE
        v_def_cat := nullif(p_input->>'catalogueNumber', '')::smallint;
      END IF;
    ELSIF v_fit_mode IN ('engine', 'spec') THEN
      v_def_pos := v_engine_pos;
      v_def_side := NULL;
    END IF;
    v_name := public.self_serve_default_part_name(v_type.plain_name, v_type.position_scheme, v_def_pos, v_def_side, v_def_cat);
  END IF;
  IF v_name IS NULL OR btrim(v_name) = '' THEN
    RAISE EXCEPTION 'Could not build a part name';
  END IF;

  v_car_mk := lower(btrim(coalesce(p_input->>'catalogCarMaker', '')));
  v_link_trust := public.source_trust(v_evidence, v_car_mk, ARRAY[v_brand]);
  v_decision := CASE WHEN v_link_trust = 'confirmed' THEN 'confirmed' ELSE 'pending' END;
  IF v_link_trust = 'confirmed' AND public.source_domain(v_evidence) IS NOT NULL AND v_car_mk <> '' AND EXISTS (
    SELECT 1 FROM public.trusted_source ts
    WHERE ts.kind = 'car_maker' AND ts.maker_norm = v_car_mk AND ts.domain = public.source_domain(v_evidence)
  ) THEN
    v_trust_label := 'Verified · car maker''s catalogue';
  ELSIF v_link_trust = 'confirmed' THEN
    v_trust_label := 'Verified · part maker''s catalogue';
  ELSE
    v_trust_label := 'Needs checking · other source';
  END IF;
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
    VALUES ('SS-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), v_name, CASE WHEN v_fit_mode = 'engine' OR public.is_engine_level_op(v_type.op_code) THEN 'powertrain' WHEN v_fit_mode = 'spec' THEN 'universal' ELSE 'body' END)
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
      v_category, v_name, v_number, v_brand, v_kind,
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
      v_cat := nullif(v_row->>'catalogueNumber', '')::smallint;
      IF v_cat IS NOT NULL AND (v_cat < 1 OR v_cat > 9) THEN
        RAISE EXCEPTION 'Catalogue number must be 1 to 9';
      END IF;
      v_row_id := NULL;
      SELECT pl.id INTO v_row_id
      FROM public.part_listing pl
      WHERE pl.interchange_group_id = v_group AND pl.vehicle_catalog_id = v_vid
        AND pl.position IS NOT DISTINCT FROM v_pos AND pl.side IS NOT DISTINCT FROM v_side
        AND pl.catalogue_number IS NOT DISTINCT FROM v_cat;
      v_yf := nullif(v_row->>'yearFrom', '')::int;
      v_yt := nullif(v_row->>'yearTo', '')::int;
      v_list_trust := nullif(lower(btrim(v_row->>'trust')), '');
      IF v_list_trust IS NOT NULL AND v_list_trust NOT IN ('confirmed', 'needs_checking') THEN
        v_list_trust := NULL;
      END IF;
      v_list_reason := nullif(btrim(v_row->>'reason'), '');

      IF v_row_id IS NULL THEN
        IF v_list_trust IS NOT NULL THEN
          INSERT INTO public.part_listing (
            interchange_group_id, vehicle_catalog_id, position, side, catalogue_number,
            year_from, year_to, evidence_url, origin, import_batch_id,
            trust, trust_reason, trust_set_by, trust_set_at
          ) VALUES (
            v_group, v_vid, v_pos, v_side, v_cat,
            v_yf, v_yt,
            v_evidence, 'manual', v_batch_id,
            v_list_trust, v_list_reason, 'owner', now()
          )
          RETURNING id INTO v_row_id;
        ELSE
          INSERT INTO public.part_listing (
            interchange_group_id, vehicle_catalog_id, position, side, catalogue_number,
            year_from, year_to, evidence_url, origin, import_batch_id
          ) VALUES (
            v_group, v_vid, v_pos, v_side, v_cat,
            v_yf, v_yt,
            v_evidence, 'manual', v_batch_id
          )
          RETURNING id INTO v_row_id;
        END IF;
        v_line := v_line + 1;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
        SELECT v_batch_id, v_line, 'part_listing', v_row_id, 'insert', to_jsonb(pl.*)
        FROM public.part_listing pl WHERE pl.id = v_row_id;
        v_fits := v_fits + 1;
      END IF;
    END LOOP;
  ELSIF v_fit_mode = 'engine' THEN
    UPDATE public.part_interchange_group g SET fit_scope = 'powertrain'
    WHERE g.id = v_group AND g.fit_scope = 'body' AND public.is_engine_level_op(v_type.op_code);
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
    'trustLabel', v_trust_label,
    'preview', public.self_serve_part_add_preview(p_input)
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.save_self_serve_part(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_self_serve_part(jsonb) TO service_role;


DROP MATERIALIZED VIEW public.variant_parts_readiness;

DROP FUNCTION public.parts_for_vehicle(uuid, uuid, integer);

CREATE FUNCTION public.parts_for_vehicle(
  p_catalog_id uuid,
  p_component_id uuid DEFAULT NULL,
  p_vehicle_year integer DEFAULT NULL
)
RETURNS TABLE (
  tier integer,
  part_id uuid,
  part_name text,
  oem_part_number text,
  manufacturer text,
  part_kind text,
  fit_scope text,
  rule_source text,
  "position" text,
  interchange_group_id uuid,
  maintenance_component_id uuid,
  category_id uuid,
  sister_names text,
  source_make text,
  reference_oem text,
  reference_manufacturer text,
  also_known_as text[],
  confirmed_installs integer,
  description text,
  evidence_url text,
  match_reason_code text,
  match_reason_params jsonb,
  match_status text,
  fit_source text,
  via text,
  part_badge_code text,
  part_badge_params jsonb,
  derived_id uuid,
  side text,
  wva text,
  checking_note text,
  catalogue_number integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH cat AS (
    SELECT
      vc.id,
      vc.make,
      vc.model,
      vc.platform_id,
      vc.engine_family_id,
      vc.chassis_code,
      vc.engine_code,
      vc.production_start_year,
      vc.production_end_year,
      COALESCE(p_vehicle_year, vc.production_start_year) AS match_year
    FROM public.vehicle_catalog vc
    WHERE vc.id = p_catalog_id
  ),
  family AS (
    SELECT p.id
    FROM public.vehicle_platform p
    JOIN cat ON true
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    WHERE p.id = cat.platform_id
       OR p.id = mine.parent_id
       OR p.parent_id = cat.platform_id
       OR (mine.parent_id IS NOT NULL AND p.parent_id = mine.parent_id)
  ),
  sister AS (
    SELECT string_agg(DISTINCT (vc.make || ' ' || vc.model), ', ' ORDER BY (vc.make || ' ' || vc.model)) AS names
    FROM public.vehicle_catalog vc
    JOIN cat ON vc.platform_id IN (SELECT id FROM family)
    WHERE lower(vc.make || ' ' || vc.model) <> lower(cat.make || ' ' || cat.model)
  ),
  listings AS (
    SELECT
      pl.interchange_group_id AS group_id,
      pl.vehicle_catalog_id AS listed_id,
      pl.position,
      pl.side,
      pl.catalogue_number,
      pl.origin,
      pl.year_from,
      pl.year_to,
      g.fit_scope,
      lvc.make AS listed_make,
      lvc.model AS listed_model,
      lvc.chassis_code AS listed_chassis,
      lvc.engine_family_id AS listed_engine,
      lvc.platform_id AS listed_platform,
      (lvc.make || ' ' || lvc.model || ' ' || coalesce(lvc.chassis_code, '')) AS listed_label,
      pl.evidence_url,
      pl.id AS listing_id
    FROM public.part_listing pl
    JOIN public.part_interchange_group g ON g.id = pl.interchange_group_id
    JOIN public.vehicle_catalog lvc ON lvc.id = pl.vehicle_catalog_id
    CROSS JOIN cat
    WHERE NOT public.part_listing_exclusion_blocks(
      pl.interchange_group_id, cat.id, pl.position, pl.side, cat.match_year
    )
  ),
  scored AS (
    SELECT
      listings.*,
      CASE
        WHEN listings.listed_id = cat.id
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 1
        WHEN lower(listings.listed_make) = lower(cat.make)
          AND lower(listings.listed_model) = lower(cat.model)
          AND upper(trim(coalesce(listings.listed_chassis, ''))) = upper(trim(coalesce(cat.chassis_code, '')))
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          )
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 1
        WHEN listings.listed_platform IN (SELECT id FROM family)
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          )
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 2
        WHEN listings.fit_scope = 'powertrain'
          AND listings.listed_engine IS NOT NULL
          AND listings.listed_engine = cat.engine_family_id
          AND (listings.listed_platform IS NULL OR listings.listed_platform NOT IN (SELECT id FROM family))
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to)
          THEN 3
        ELSE NULL
      END AS listing_tier
    FROM listings
    CROSS JOIN cat
  ),
  best_group AS (
    SELECT DISTINCT ON (group_id, position, side, catalogue_number)
      group_id,
      listing_tier,
      position,
      side,
      catalogue_number,
      origin,
      fit_scope,
      listed_label,
      evidence_url,
      listing_id
    FROM scored
    WHERE listing_tier IS NOT NULL
    ORDER BY group_id, position, side, catalogue_number, listing_tier ASC, listed_id
  ),
  listing_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      bg.fit_scope,
      'listing'::text AS rule_source,
      bg.position,
      bg.group_id AS interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE
        WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4
        ELSE bg.listing_tier
      END AS tier,
      bg.listed_label AS source_make,
      bg.evidence_url,
      CASE WHEN bg.origin = 'auto_match_kept' THEN 'kept' ELSE 'listed' END AS fit_source,
      CASE bg.listing_tier
        WHEN 1 THEN 'direct'
        WHEN 2 THEN 'sister'
        WHEN 3 THEN 'engine'
        ELSE 'direct'
      END AS via,
      'live'::text AS match_status,
      'listed_direct'::text AS match_reason_code,
      jsonb_build_object('part_listing_id', bg.listing_id) AS match_reason_params,
      bg.side,
      bg.catalogue_number,
      NULL::uuid AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      NULL::text AS checking_note
    FROM best_group bg
    JOIN public.part_master pm ON pm.interchange_group_id = bg.group_id
    WHERE pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_component_applicability a
        JOIN cat ON true
        WHERE a.applicable = false
          AND a.component_id = pm.maintenance_component_id
          AND (
            (a.scope = 'variant' AND a.vehicle_catalog_id = cat.id)
            OR (a.scope = 'platform' AND a.platform_id = cat.platform_id)
            OR (a.scope = 'engine_family' AND a.engine_family_id = cat.engine_family_id)
          )
      )
  ),
  derived_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      d.position,
      d.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4 ELSE 1 END AS tier,
      NULL::text AS source_make,
      NULL::text AS evidence_url,
      'derived'::text AS fit_source,
      'direct'::text AS via,
      d.status AS match_status,
      d.reason_code AS match_reason_code,
      d.reason_params AS match_reason_params,
      d.side,
      NULL::smallint AS catalogue_number,
      d.id AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      d.checking_note
    FROM public.part_fit_derived d
    JOIN public.part_master pm ON pm.interchange_group_id = d.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = d.interchange_group_id
    JOIN cat ON cat.id = d.vehicle_catalog_id
    WHERE public.parts_auto_match_enabled()
      AND d.status IN ('live', 'needs_checking')
      AND pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND NOT public.part_listing_exclusion_blocks(
        d.interchange_group_id, cat.id, d.position, d.side, cat.match_year
      )
      AND (
        d.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= d.year_from
      )
      AND (
        d.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= d.year_to
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_component_applicability a
        WHERE a.applicable = false
          AND a.component_id = pm.maintenance_component_id
          AND (
            (a.scope = 'variant' AND a.vehicle_catalog_id = cat.id)
            OR (a.scope = 'platform' AND a.platform_id = cat.platform_id)
            OR (a.scope = 'engine_family' AND a.engine_family_id = cat.engine_family_id)
          )
      )
  ),
  tier1_fits AS (
    SELECT d.interchange_group_id, d.position, d.side, d.status AS match_status,
           d.reason_code, d.reason_params, 'derived'::text AS fit_source, d.vehicle_catalog_id
    FROM public.part_fit_derived d
    WHERE public.parts_auto_match_enabled() AND d.status IN ('live', 'needs_checking')
    UNION ALL
    SELECT pl.interchange_group_id, pl.position, pl.side, 'live'::text,
           'listed_direct'::text, jsonb_build_object('part_listing_id', pl.id),
           CASE WHEN pl.origin = 'auto_match_kept' THEN 'kept' ELSE 'listed' END,
           pl.vehicle_catalog_id
    FROM public.part_listing pl
    WHERE public.parts_auto_match_enabled()
  ),
  tier1_on_car AS (
    SELECT t.* FROM tier1_fits t JOIN cat ON cat.id = t.vehicle_catalog_id
  ),
  link_tier3_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      t1.position,
      t1.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4 ELSE 3 END AS tier,
      NULL::text AS source_make,
      NULL::text AS evidence_url,
      t1.fit_source,
      'platform_link'::text AS via,
      CASE
        WHEN l.scope = 'system' OR t1.match_status = 'needs_checking' THEN 'needs_checking'
        ELSE 'live'
      END AS match_status,
      'via_platform_link'::text AS match_reason_code,
      jsonb_build_object(
        'link_id', l.id,
        'platform_code', vp.code,
        'source_vehicle_id', src.id,
        'source_tier', 1
      ) AS match_reason_params,
      t1.side,
      NULL::smallint AS catalogue_number,
      NULL::uuid AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      NULL::text AS checking_note
    FROM public.platform_component_link l
    JOIN cat ON true
    JOIN public.vehicle_catalog src
      ON src.platform_id = CASE
        WHEN cat.platform_id = l.platform_a_id THEN l.platform_b_id
        ELSE l.platform_a_id
      END
    JOIN public.vehicle_platform vp ON vp.id = src.platform_id
    JOIN tier1_fits t1 ON t1.vehicle_catalog_id = src.id
    JOIN public.part_master pm ON pm.interchange_group_id = t1.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
    WHERE public.parts_auto_match_enabled()
      AND cat.platform_id IN (l.platform_a_id, l.platform_b_id)
      AND l.maintenance_component_id = pm.maintenance_component_id
      AND public.part_side_covers(l.position, l.side, t1.position, t1.side)
      AND NOT public.part_listing_exclusion_blocks(
        t1.interchange_group_id, cat.id, t1.position, t1.side, cat.match_year
      )
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_component_applicability a
        WHERE a.applicable = false
          AND a.component_id = pm.maintenance_component_id
          AND (
            (a.scope = 'variant' AND a.vehicle_catalog_id = cat.id)
            OR (a.scope = 'platform' AND a.platform_id = cat.platform_id)
            OR (a.scope = 'engine_family' AND a.engine_family_id = cat.engine_family_id)
          )
      )
      AND (
        cat.match_year IS NULL
        OR (
          cat.platform_id = l.platform_a_id
          AND (l.platform_a_year_from IS NULL OR cat.match_year >= l.platform_a_year_from)
          AND (l.platform_a_year_to IS NULL OR cat.match_year <= l.platform_a_year_to)
        )
        OR (
          cat.platform_id = l.platform_b_id
          AND (l.platform_b_year_from IS NULL OR cat.match_year >= l.platform_b_year_from)
          AND (l.platform_b_year_to IS NULL OR cat.match_year <= l.platform_b_year_to)
        )
      )
  ),
  sister_derived AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      d.position,
      d.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      2 AS tier,
      (src.make || ' ' || src.model) AS source_make,
      NULL::text AS evidence_url,
      'derived'::text AS fit_source,
      'sister'::text AS via,
      d.status AS match_status,
      d.reason_code AS match_reason_code,
      d.reason_params AS match_reason_params,
      d.side,
      NULL::smallint AS catalogue_number,
      d.id AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      d.checking_note
    FROM public.part_fit_derived d
    JOIN public.vehicle_catalog src ON src.id = d.vehicle_catalog_id
    JOIN cat ON true
    JOIN public.part_master pm ON pm.interchange_group_id = d.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = d.interchange_group_id
    WHERE public.parts_auto_match_enabled()
      AND d.status IN ('live', 'needs_checking')
      AND d.vehicle_catalog_id <> cat.id
      AND src.platform_id IN (SELECT id FROM family)
      AND lower(src.make || ' ' || src.model) <> lower(cat.make || ' ' || cat.model)
      AND pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND NOT public.part_listing_exclusion_blocks(
        d.interchange_group_id, cat.id, d.position, d.side, cat.match_year
      )
      AND (
        d.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= d.year_from
      )
      AND (
        d.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= d.year_to
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_component_applicability a
        WHERE a.applicable = false
          AND a.component_id = pm.maintenance_component_id
          AND (
            (a.scope = 'variant' AND a.vehicle_catalog_id = cat.id)
            OR (a.scope = 'platform' AND a.platform_id = cat.platform_id)
            OR (a.scope = 'engine_family' AND a.engine_family_id = cat.engine_family_id)
          )
      )
  ),
  hits AS (
    SELECT * FROM listing_hits
    UNION ALL
    SELECT * FROM derived_hits
    UNION ALL
    SELECT * FROM sister_derived
    UNION ALL
    SELECT * FROM link_tier3_hits
  ),
  oem_ref AS (
    SELECT DISTINCT ON (h.interchange_group_id)
      h.interchange_group_id,
      h.oem_part_number AS reference_oem,
      h.manufacturer AS reference_manufacturer
    FROM hits h
    WHERE h.part_kind = 'oem' AND h.interchange_group_id IS NOT NULL
    ORDER BY h.interchange_group_id, h.tier ASC
  ),
  ranked AS (
    SELECT DISTINCT ON (h.part_id, h."position", h.side, h.catalogue_number)
      h.*
    FROM hits h
    ORDER BY h.part_id, h."position", h.side, h.catalogue_number NULLS LAST, h.tier ASC, (h.match_status = 'live') DESC, h.rule_source
  ),
  matched AS (
    SELECT
      h.tier,
      h.part_id,
      h.part_name,
      h.oem_part_number,
      h.manufacturer,
      h.part_kind,
      h.fit_scope,
      h.rule_source,
      h.position,
      h.interchange_group_id,
      h.maintenance_component_id,
      h.category_id,
      sister.names AS sister_names,
      h.source_make,
      COALESCE(oem_ref.reference_oem, h.oem_part_number) AS reference_oem,
      COALESCE(oem_ref.reference_manufacturer, h.manufacturer) AS reference_manufacturer,
      COALESCE((
        SELECT array_agg(old.oem_part_number)
        FROM public.part_supersession s
        JOIN public.part_master old ON old.id = s.old_part_id
        WHERE s.new_part_id = h.part_id AND old.oem_part_number IS NOT NULL
      ), ARRAY[]::text[]) AS also_known_as,
      COALESCE((
        SELECT count(*)::integer
        FROM public.part_fit_feedback f
        WHERE f.part_id = h.part_id AND f.outcome = 'fit'
      ), 0) AS confirmed_installs,
      h.description,
      h.evidence_url,
      h.match_reason_code,
      h.match_reason_params,
      h.match_status,
      h.fit_source,
      h.via,
      (
        SELECT CASE WHEN m.rule = 'index' THEN 'index_badge' END
        FROM public.interchange_group_merge_log m
        WHERE m.reversed_at IS NULL
          AND m.part_id = h.part_id
          AND m.rule = 'index'
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS part_badge_code,
      (
        SELECT jsonb_build_object(
          'index_type', m.matched_key,
          'merge_log_id', m.id
        )
        FROM public.interchange_group_merge_log m
        WHERE m.reversed_at IS NULL
          AND m.part_id = h.part_id
          AND m.rule = 'index'
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS part_badge_params,
      h.derived_id,
      h.side,
      h.wva,
      h.checking_note,
      h.catalogue_number
    FROM ranked h
    LEFT JOIN sister ON true
    LEFT JOIN oem_ref ON oem_ref.interchange_group_id = h.interchange_group_id

    UNION ALL

    SELECT
      5 AS tier,
      u.universal_part_id AS part_id,
      u.name AS part_name,
      u.part_number AS oem_part_number,
      u.manufacturer,
      'universal'::text AS part_kind,
      'universal'::text AS fit_scope,
      'universal'::text AS rule_source,
      NULL::text AS "position",
      NULL::uuid AS interchange_group_id,
      sk.component_id AS maintenance_component_id,
      NULL::uuid AS category_id,
      NULL::text AS sister_names,
      NULL::text AS source_make,
      NULL::text AS reference_oem,
      NULL::text AS reference_manufacturer,
      NULL::text[] AS also_known_as,
      NULL::integer AS confirmed_installs,
      NULL::text AS description,
      NULL::text AS evidence_url,
      'universal_spec'::text AS match_reason_code,
      jsonb_build_array(
        jsonb_build_object('spec_key', u.spec_key, 'value', u.spec_value, 'unit', u.unit)
      ) AS match_reason_params,
      'live'::text AS match_status,
      'universal'::text AS fit_source,
      'universal'::text AS via,
      NULL::text AS part_badge_code,
      NULL::jsonb AS part_badge_params,
      NULL::uuid AS derived_id,
      NULL::text AS side,
      NULL::text AS wva,
      NULL::text AS checking_note,
      NULL::integer AS catalogue_number
    FROM public.universal_parts_for_variant(p_catalog_id, p_vehicle_year) u
    JOIN public.spec_key sk ON sk.key = u.spec_key
    WHERE u.universal_part_id IS NOT NULL
      AND (p_component_id IS NULL OR sk.component_id = p_component_id)
  )
  SELECT
    m.tier,
    m.part_id,
    m.part_name,
    m.oem_part_number,
    m.manufacturer,
    m.part_kind,
    m.fit_scope,
    m.rule_source,
    m.position,
    m.interchange_group_id,
    m.maintenance_component_id,
    m.category_id,
    m.sister_names,
    m.source_make,
    m.reference_oem,
    m.reference_manufacturer,
    m.also_known_as,
    m.confirmed_installs,
    m.description,
    m.evidence_url,
    m.match_reason_code,
    m.match_reason_params,
    m.match_status,
    m.fit_source,
    m.via,
    m.part_badge_code,
    m.part_badge_params,
    m.derived_id,
    m.side,
    m.wva,
    m.checking_note,
    m.catalogue_number
  FROM matched m
  ORDER BY
    m.tier ASC NULLS LAST,
    m.part_name ASC NULLS LAST,
    m.position ASC NULLS LAST,
    m.side ASC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) TO service_role;

CREATE MATERIALIZED VIEW public.variant_parts_readiness AS
 WITH core AS (
         SELECT v.op_code
           FROM ( VALUES ('ENG-OIL'::text), ('ENG-SPARK'::text), ('ENG-THERM'::text), ('FILT-AIR'::text), ('HVAC-CABIN'::text), ('BRK-PADS'::text), ('BELT-SERP'::text), ('LGT-WIPER'::text), ('BRK-ROTOR'::text), ('SUS-SHOCK'::text)) v(op_code)
        ), comp AS (
         SELECT c.id,
            c.op_code
           FROM public.maintenance_service_categories c
             JOIN core ON core.op_code = c.op_code
        ), na AS (
         SELECT DISTINCT ON (vc.id, comp.op_code) vc.id AS variant_id,
            comp.op_code,
            a.applicable
           FROM public.vehicle_catalog vc
             CROSS JOIN comp
             JOIN public.catalog_component_applicability a ON a.component_id = comp.id
             LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
          WHERE a.scope = 'variant'::text AND a.vehicle_catalog_id = vc.id OR a.scope = 'platform'::text AND (a.platform_id = vc.platform_id OR a.platform_id = mine.parent_id) OR a.scope = 'engine_family'::text AND a.engine_family_id = vc.engine_family_id
          ORDER BY vc.id, comp.op_code, (
                CASE a.scope
                    WHEN 'variant'::text THEN 1
                    WHEN 'platform'::text THEN 2
                    ELSE 3
                END)
        ), spec_hit AS (
         SELECT DISTINCT vc.id AS variant_id,
            c.op_code
           FROM public.vehicle_catalog vc
             JOIN public.catalog_spec_value sv ON true
             JOIN public.spec_key sk ON sk.key = sv.spec_key
             JOIN public.maintenance_service_categories c ON c.id = sk.component_id
             JOIN core ON core.op_code = c.op_code
             LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
          WHERE COALESCE(btrim(sv.evidence_url), ''::text) <> ''::text AND COALESCE(btrim(sv.value), ''::text) <> ''::text AND (sv.scope = 'variant'::text AND sv.vehicle_catalog_id = vc.id OR sv.scope = 'platform'::text AND (sv.platform_id = vc.platform_id OR sv.platform_id = mine.parent_id) OR sv.scope = 'engine_family'::text AND sv.engine_family_id = vc.engine_family_id)
        ), hits AS (
         SELECT vc.id AS variant_id,
            comp.op_code,
            bool_or(pm.catalog_decision = 'confirmed'::text AND p.tier >= 1 AND p.tier <= 3) OR bool_or(sh.op_code IS NOT NULL) AS verified,
            bool_or(p.part_id IS NOT NULL AND pm.catalog_decision IS DISTINCT FROM 'rejected'::text AND p.tier >= 1 AND p.tier <= 3) AS any_part,
            bool_or(na.applicable = false) AS not_applicable
           FROM public.vehicle_catalog vc
             CROSS JOIN comp
             LEFT JOIN LATERAL public.parts_for_vehicle(vc.id, comp.id, NULL::integer) p ON true
             LEFT JOIN public.part_master pm ON pm.id = p.part_id
             LEFT JOIN na ON na.variant_id = vc.id AND na.op_code = comp.op_code
             LEFT JOIN spec_hit sh ON sh.variant_id = vc.id AND sh.op_code = comp.op_code
          GROUP BY vc.id, comp.op_code
        ), rolled AS (
         SELECT hits.variant_id,
            count(*) FILTER (WHERE hits.verified OR hits.not_applicable)::integer AS components_ready,
            jsonb_object_agg(hits.op_code,
                CASE
                    WHEN hits.verified THEN 'verified'::text
                    WHEN hits.not_applicable THEN 'not_applicable'::text
                    WHEN hits.any_part THEN 'unverified'::text
                    ELSE 'missing'::text
                END) AS cells
           FROM hits
          GROUP BY hits.variant_id
        )
 SELECT variant_id,
    components_ready,
    components_ready = (( SELECT count(*) AS count
           FROM core)) AS ready,
    cells
   FROM rolled;

CREATE UNIQUE INDEX variant_parts_readiness_variant_id ON public.variant_parts_readiness USING btree (variant_id);
REVOKE ALL ON TABLE public.variant_parts_readiness FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.variant_parts_readiness TO service_role;

REFRESH MATERIALIZED VIEW public.variant_parts_readiness;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.variant_parts_readiness
    WHERE variant_id = '3cd9cbf3-a804-4817-82db-400cf6abf13a'::uuid
  ) THEN
    RAISE EXCEPTION '5-11/5-12 done-check: Roomy missing from variant_parts_readiness after refresh';
  END IF;
END $$;


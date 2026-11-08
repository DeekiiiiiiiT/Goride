-- Dominion Add parts: catalog-page batch save (D3–D6), link hints, sister cars


-- D3: frame codes from Partsouq-style URLs
CREATE OR REPLACE FUNCTION public.self_serve_link_frame_codes(p_url text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fc$
DECLARE
  u text := btrim(coalesce(p_url, ''));
  seg text;
  codes text[] := ARRAY[]::text[];
  m text;
BEGIN
  IF u = '' OR u !~* '^https?://' THEN
    RETURN codes;
  END IF;
  IF position('://' IN u) > 0 THEN
    u := regexp_replace(u, '^[a-zA-Z][a-zA-Z0-9+.-]*://[^/]+', '');
  END IF;
  FOR seg IN
    SELECT unnest(string_to_array(u, '/'))
  LOOP
    IF seg ~ '^[A-Za-z]{1,4}[0-9]{2,4}[A-Za-z]?(-[A-Za-z0-9]+)?$' THEN
      m := upper(split_part(seg, '-', 1));
      IF m ~ '^[A-Z]{1,4}[0-9]{2,4}[A-Z]?$' AND NOT (m = ANY (codes)) THEN
        codes := array_append(codes, m);
      END IF;
    END IF;
  END LOOP;
  RETURN codes;
END;
$fc$;

REVOKE ALL ON FUNCTION public.self_serve_link_frame_codes(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_link_frame_codes(text) TO service_role;

CREATE OR REPLACE FUNCTION public.self_serve_link_hints(p_url text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $lh$
DECLARE
  u text := btrim(coalesce(p_url, ''));
  d text;
  frames text[];
  path_lower text;
  catalog_maker text;
  trust text;
  trusted_site boolean := false;
BEGIN
  IF u = '' OR u !~* '^https?://' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_url');
  END IF;
  d := public.source_domain(u);
  frames := public.self_serve_link_frame_codes(u);
  path_lower := lower(u);
  IF path_lower ~ '/toyota/' THEN catalog_maker := 'Toyota';
  ELSIF path_lower ~ '/daihatsu/' THEN catalog_maker := 'Daihatsu';
  ELSIF path_lower ~ '/subaru/' THEN catalog_maker := 'Subaru';
  ELSIF path_lower ~ '/suzuki/' THEN catalog_maker := 'Suzuki';
  END IF;
  trust := public.source_trust(u, lower(coalesce(catalog_maker, '')), ARRAY[]::text[]);
  trusted_site := trust = 'confirmed';
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'host', d,
    'trustedSite', trusted_site,
    'catalogMaker', catalog_maker,
    'frameCodes', to_jsonb(frames),
    'sourceTrust', trust
  ));
END;
$lh$;

REVOKE ALL ON FUNCTION public.self_serve_link_hints(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_link_hints(text) TO service_role;

-- D5: sister cars via platform family (same platform, shared non-null parent, or parent/child platform)
CREATE OR REPLACE FUNCTION public.self_serve_sister_vehicles(p_vehicle_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $sv$
DECLARE
  items jsonb := '[]'::jsonb;
BEGIN
  IF p_vehicle_ids IS NULL OR cardinality(p_vehicle_ids) = 0 THEN
    RETURN jsonb_build_object('items', items);
  END IF;
  SELECT coalesce(jsonb_agg(row ORDER BY row->>'make', row->>'model', row->>'chassis_code'), '[]'::jsonb)
  INTO items
  FROM (
    SELECT DISTINCT jsonb_build_object(
      'id', vc2.id,
      'make', vc2.make,
      'model', vc2.model,
      'chassis_code', vc2.chassis_code,
      'production_start_year', vc2.production_start_year,
      'production_end_year', vc2.production_end_year,
      'drivetrain', vc2.drivetrain,
      'platform_id', vc2.platform_id
    ) AS row
    FROM public.vehicle_catalog vc0
    JOIN public.vehicle_platform vp0 ON vp0.id = vc0.platform_id
    JOIN public.vehicle_catalog vc2 ON vc2.id <> ALL (p_vehicle_ids)
    JOIN public.vehicle_platform vp2 ON vp2.id = vc2.platform_id
    WHERE vc0.id = ANY (p_vehicle_ids)
      AND (lower(vc2.make), lower(vc2.model)) IS DISTINCT FROM (lower(vc0.make), lower(vc0.model))
      AND (
        (vc2.platform_id = vc0.platform_id AND vc2.id IS DISTINCT FROM vc0.id)
        OR (
          vp0.parent_id IS NOT NULL
          AND (
            (vp2.parent_id = vp0.parent_id AND vp2.id IS DISTINCT FROM vp0.id)
            OR vp2.id = vp0.parent_id
            OR vp2.parent_id = vp0.id
          )
        )
      )
  ) sub;
  RETURN jsonb_build_object('items', items);
END;
$sv$;

REVOKE ALL ON FUNCTION public.self_serve_sister_vehicles(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_sister_vehicles(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.save_self_serve_part_in_batch(p_input jsonb, p_batch_id uuid, p_line_base int DEFAULT 0, p_allow_no_new boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_batch_id uuid := p_batch_id;
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
  v_line int := p_line_base;
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
  SELECT code INTO v_batch_code FROM public.part_import_batch WHERE id = v_batch_id;

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

  PERFORM public.part_match_recompute(v_group, NULL);

  UPDATE public.part_import_change pic
  SET after = public.part_import_row_snapshot(pic.table_name, pic.row_id)
  WHERE pic.batch_id = v_batch_id
    AND pic.op = 'insert'
    AND public.part_import_row_snapshot(pic.table_name, pic.row_id) IS NOT NULL;

  IF NOT p_allow_no_new AND v_fits = 0 AND NOT EXISTS (
    SELECT 1 FROM public.part_import_change pic2
    WHERE pic2.batch_id = v_batch_id AND pic2.line_no > p_line_base AND pic2.op = 'insert'
  ) THEN
    RAISE EXCEPTION 'Nothing new to save - this part already has these fits';
  END IF;

  RETURN jsonb_build_object(
    'partId', v_part_id,
    'groupId', v_group,
    'catalogDecision', v_decision,
    'trustLabel', v_trust_label,
    'fits', v_fits,
    'lineNext', v_line
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.save_self_serve_part_in_batch(jsonb, uuid, int, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_self_serve_part_in_batch(jsonb, uuid, int, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.save_self_serve_part(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $wrap$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_batch_code text;
  v_actor uuid := nullif(p_input->>'actorId', '')::uuid;
  v_type_id uuid := nullif(p_input->>'partTypeId', '')::uuid;
  v_area uuid;
  v_inner jsonb;
BEGIN
  IF v_type_id IS NULL THEN RAISE EXCEPTION 'Choose a part type'; END IF;
  SELECT c.parent_id INTO v_area
  FROM public.maintenance_service_categories c
  WHERE c.id = v_type_id AND c.is_part IS TRUE AND c.kind = 'component' AND c.part_type_status = 'active';
  IF v_area IS NULL THEN RAISE EXCEPTION 'Invalid part type'; END IF;

  v_batch_code := 'AP-' || upper(substr(replace(v_batch_id::text, '-', ''), 1, 8));
  INSERT INTO public.part_import_batch (
    id, code, area_id, template_version, file_name, file_sha256, status, import_kind, promoted_at, promoted_by, uploaded_by
  ) VALUES (
    v_batch_id, v_batch_code, v_area, 1, 'self-serve', v_batch_code, 'imported', 'self_serve_add', now(), v_actor, v_actor
  );

  v_inner := public.save_self_serve_part_in_batch(p_input, v_batch_id, 0, false);

  UPDATE public.part_import_batch SET
    parts_created = (SELECT count(*) FROM public.part_import_change WHERE batch_id = v_batch_id AND table_name = 'part_master' AND op = 'insert'),
    fits_created = coalesce((v_inner->>'fits')::int, 0)
  WHERE id = v_batch_id;

  RETURN v_inner || jsonb_build_object(
    'batchId', v_batch_id,
    'batchCode', v_batch_code,
    'preview', public.self_serve_part_add_preview(p_input)
  );
END;
$wrap$;

REVOKE EXECUTE ON FUNCTION public.save_self_serve_part(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_self_serve_part(jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.save_self_serve_catalog_page(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $cp$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_batch_code text;
  v_actor uuid := nullif(p_input->>'actorId', '')::uuid;
  v_evidence text := nullif(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_source_type text := coalesce(nullif(p_input->>'sourceType', ''), 'other');
  v_part_kind text := CASE WHEN p_input->>'partKind' IN ('oem', 'aftermarket') THEN p_input->>'partKind' ELSE 'aftermarket' END;
  v_car_mk text := nullif(btrim(coalesce(p_input->>'catalogCarMaker', '')), '');
  v_area uuid;
  v_part jsonb;
  v_one jsonb;
  v_listings jsonb := '[]'::jsonb;
  v_car jsonb;
  v_line int := 0;
  v_total_fits int := 0;
  v_part_ids uuid[] := ARRAY[]::uuid[];
  v_part_names text[] := ARRAY[]::text[];
  v_type_id uuid;
  v_inner jsonb;
  v_first_type uuid;
BEGIN
  IF v_evidence IS NULL THEN RAISE EXCEPTION 'A source link is required'; END IF;
  IF jsonb_typeof(p_input->'vehicleListings') <> 'array' OR jsonb_array_length(p_input->'vehicleListings') = 0 THEN
    RAISE EXCEPTION 'Pick at least one car';
  END IF;
  IF jsonb_typeof(p_input->'parts') <> 'array' OR jsonb_array_length(p_input->'parts') = 0 THEN
    RAISE EXCEPTION 'Add at least one part';
  END IF;

  v_first_type := nullif(p_input->'parts'->0->>'partTypeId', '')::uuid;
  IF v_first_type IS NULL THEN RAISE EXCEPTION 'Choose a part type on each row'; END IF;
  SELECT c.parent_id INTO v_area
  FROM public.maintenance_service_categories c
  WHERE c.id = v_first_type AND c.is_part IS TRUE AND c.kind = 'component' AND c.part_type_status = 'active';
  IF v_area IS NULL THEN RAISE EXCEPTION 'Invalid part type'; END IF;

  v_batch_code := 'AP-' || upper(substr(replace(v_batch_id::text, '-', ''), 1, 8));
  INSERT INTO public.part_import_batch (
    id, code, area_id, template_version, file_name, file_sha256, status, import_kind, promoted_at, promoted_by, uploaded_by
  ) VALUES (
    v_batch_id, v_batch_code, v_area, 1, 'self-serve-catalog', v_batch_code, 'imported', 'self_serve_add', now(), v_actor, v_actor
  );

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value
  LOOP
    v_type_id := nullif(v_part->>'partTypeId', '')::uuid;
    IF v_type_id IS NULL THEN RAISE EXCEPTION 'Choose a part type on each row'; END IF;
    v_listings := '[]'::jsonb;
    FOR v_car IN SELECT value FROM jsonb_array_elements(p_input->'vehicleListings') AS value
    LOOP
      v_listings := v_listings || jsonb_build_array(
        jsonb_build_object(
          'vehicleId', v_car->>'vehicleId',
          'position', coalesce(v_part->>'position', v_car->>'position'),
          'side', coalesce(v_part->>'side', v_car->>'side'),
          'catalogueNumber', coalesce(v_part->'catalogueNumber', v_car->'catalogueNumber'),
          'yearFrom', v_car->'yearFrom',
          'yearTo', v_car->'yearTo',
          'trust', v_car->>'trust',
          'reason', v_car->>'reason'
        )
      );
    END LOOP;
    v_one := jsonb_build_object(
      'actorId', p_input->>'actorId',
      'partTypeId', v_type_id,
      'brand', coalesce(v_part->>'brand', p_input->>'brand'),
      'partNumber', v_part->>'partNumber',
      'name', v_part->>'name',
      'sourceType', v_source_type,
      'partKind', v_part_kind,
      'evidenceUrl', v_evidence,
      'catalogCarMaker', v_car_mk,
      'fitMode', 'specific',
      'listings', v_listings,
      'existingPartId', v_part->>'existingPartId',
      'factoryNumbers', coalesce(v_part->'factoryNumbers', '[]'::jsonb)
    );
    v_inner := public.save_self_serve_part_in_batch(v_one, v_batch_id, v_line, true);
    v_line := coalesce((v_inner->>'lineNext')::int, v_line);
    v_total_fits := v_total_fits + coalesce((v_inner->>'fits')::int, 0);
    v_part_ids := array_append(v_part_ids, (v_inner->>'partId')::uuid);
    IF v_part->>'partNumber' IS NOT NULL THEN
      v_part_names := array_append(v_part_names, btrim(v_part->>'partNumber'));
    END IF;
  END LOOP;

  IF v_total_fits = 0 AND NOT EXISTS (
    SELECT 1 FROM public.part_import_change WHERE batch_id = v_batch_id AND op = 'insert'
  ) THEN
    RAISE EXCEPTION 'Nothing was saved — every part already had these fits';
  END IF;

  UPDATE public.part_import_batch SET
    parts_created = (SELECT count(*) FROM public.part_import_change WHERE batch_id = v_batch_id AND table_name = 'part_master' AND op = 'insert'),
    fits_created = v_total_fits
  WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'batchId', v_batch_id,
    'batchCode', v_batch_code,
    'partIds', to_jsonb(v_part_ids),
    'partCount', coalesce(array_length(v_part_ids, 1), 0),
    'carCount', jsonb_array_length(p_input->'vehicleListings'),
    'fitCount', v_total_fits
  );
END;
$cp$;

REVOKE EXECUTE ON FUNCTION public.save_self_serve_catalog_page(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_self_serve_catalog_page(jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.self_serve_catalog_spec_car_value(
  p_spec_key text,
  p_brand text,
  p_number text,
  p_spec_value text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_spec_key, ''))) IN (
      'brake_fluid', 'transmission_fluid', 'coolant_type', 'washer_fluid'
    ) THEN nullif(btrim(coalesce(p_brand, '') || ' ' || coalesce(p_number, '')), '')
    ELSE nullif(btrim(coalesce(p_spec_value, '')), '')
  END;
$$;

REVOKE ALL ON FUNCTION public.self_serve_catalog_spec_car_value(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_catalog_spec_car_value(text, text, text, text) TO service_role;


CREATE OR REPLACE FUNCTION public.save_self_serve_fluid_bundle(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fl$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_batch_code text;
  v_actor uuid := nullif(p_input->>'actorId', '')::uuid;
  v_type_id uuid := nullif(p_input->>'partTypeId', '')::uuid;
  v_area uuid;
  v_spec_key text := nullif(btrim(p_input->>'specKey'), '');
  v_spec_value text := nullif(btrim(p_input->>'specValue'), '');
  v_brand text := btrim(coalesce(p_input->>'brand', ''));
  v_number text := btrim(coalesce(p_input->>'partNumber', ''));
  v_car_spec_value text;
  v_evidence text := nullif(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_inner jsonb;
  v_vid uuid;
  v_car jsonb;
  v_row_id uuid;
  v_before jsonb;
  v_line int;
  v_fits int := 0;
BEGIN
  IF v_type_id IS NULL OR v_spec_key IS NULL OR v_spec_value IS NULL OR v_evidence IS NULL THEN
    RAISE EXCEPTION 'Part type, spec, and source link are required';
  END IF;
  IF v_brand = '' OR v_number = '' THEN
    RAISE EXCEPTION 'Brand and part number are required';
  END IF;
  v_car_spec_value := public.self_serve_catalog_spec_car_value(v_spec_key, v_brand, v_number, v_spec_value);
  IF v_car_spec_value IS NULL THEN
    RAISE EXCEPTION 'Could not work out the car spec value';
  END IF;
  IF jsonb_typeof(p_input->'vehicleListings') <> 'array' OR jsonb_array_length(p_input->'vehicleListings') = 0 THEN
    RAISE EXCEPTION 'Pick at least one car';
  END IF;

  SELECT c.parent_id INTO v_area
  FROM public.maintenance_service_categories c
  WHERE c.id = v_type_id AND c.is_part IS TRUE AND c.kind = 'component' AND c.part_type_status = 'active';
  IF v_area IS NULL THEN RAISE EXCEPTION 'Invalid part type'; END IF;

  v_batch_code := 'AP-' || upper(substr(replace(v_batch_id::text, '-', ''), 1, 8));
  INSERT INTO public.part_import_batch (
    id, code, area_id, template_version, file_name, file_sha256, status, import_kind, promoted_at, promoted_by, uploaded_by
  ) VALUES (
    v_batch_id, v_batch_code, v_area, 1, 'self-serve-fluid', v_batch_code, 'imported', 'self_serve_add', now(), v_actor, v_actor
  );

  v_inner := public.save_self_serve_part_in_batch(
    p_input || jsonb_build_object('fitMode', 'spec'),
    v_batch_id,
    0,
    false
  );
  v_line := coalesce((v_inner->>'lineNext')::int, 0);
  v_fits := coalesce((v_inner->>'fits')::int, 0);

  FOR v_car IN SELECT value FROM jsonb_array_elements(p_input->'vehicleListings') AS value
  LOOP
    v_vid := nullif(v_car->>'vehicleId', '')::uuid;
    IF v_vid IS NULL THEN CONTINUE; END IF;
    v_row_id := NULL;
    v_before := NULL;
    SELECT id, to_jsonb(sv.*) INTO v_row_id, v_before
    FROM public.catalog_spec_value sv
    WHERE sv.spec_key = v_spec_key AND sv.scope = 'variant' AND sv.vehicle_catalog_id = v_vid;
    IF v_row_id IS NULL THEN
      INSERT INTO public.catalog_spec_value (
        spec_key, scope, vehicle_catalog_id, value, year_from, year_to, evidence_url, verified_by
      ) VALUES (
        v_spec_key, 'variant', v_vid, v_car_spec_value,
        nullif(v_car->>'yearFrom', '')::int,
        nullif(v_car->>'yearTo', '')::int,
        v_evidence, v_actor
      )
      RETURNING id INTO v_row_id;
      v_line := v_line + 1;
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
      SELECT v_batch_id, v_line, 'catalog_spec_value', v_row_id, 'insert', to_jsonb(sv.*)
      FROM public.catalog_spec_value sv WHERE sv.id = v_row_id;
    ELSE
      UPDATE public.catalog_spec_value
      SET value = v_car_spec_value,
          year_from = coalesce(nullif(v_car->>'yearFrom', '')::int, year_from),
          year_to = coalesce(nullif(v_car->>'yearTo', '')::int, year_to),
          evidence_url = v_evidence,
          verified_by = coalesce(v_actor, verified_by),
          verified_at = now()
      WHERE id = v_row_id;
      v_line := v_line + 1;
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      SELECT v_batch_id, v_line, 'catalog_spec_value', v_row_id, 'update', v_before, to_jsonb(sv.*)
      FROM public.catalog_spec_value sv WHERE sv.id = v_row_id;
    END IF;
    v_fits := v_fits + 1;
  END LOOP;

  UPDATE public.part_import_batch SET
    parts_created = (SELECT count(*) FROM public.part_import_change WHERE batch_id = v_batch_id AND table_name = 'part_master' AND op = 'insert'),
    fits_created = v_fits
  WHERE id = v_batch_id;

  PERFORM public.refresh_variant_parts_readiness();

  RETURN v_inner || jsonb_build_object(
    'batchId', v_batch_id,
    'batchCode', v_batch_code,
    'specCarsUpdated', jsonb_array_length(p_input->'vehicleListings')
  );
END;
$fl$;

REVOKE EXECUTE ON FUNCTION public.save_self_serve_fluid_bundle(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_self_serve_fluid_bundle(jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.self_serve_batch_recent_summary(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $bs$
DECLARE
  v_part_count int;
  v_fit_count int;
  v_type_name text;
  v_type_count int;
  v_models text;
  v_line text;
BEGIN
  SELECT count(*)::int INTO v_part_count
  FROM public.part_import_change pic
  WHERE pic.batch_id = p_batch_id AND pic.table_name = 'part_master';
  SELECT coalesce(fits_created, 0) INTO v_fit_count FROM public.part_import_batch WHERE id = p_batch_id;
  SELECT coalesce(c.plain_name, c.name), count(DISTINCT c.id)::int
  INTO v_type_name, v_type_count
  FROM public.part_import_change pic
  JOIN public.part_master pm ON pm.id = pic.row_id
  JOIN public.maintenance_service_categories c ON c.id = pm.maintenance_component_id
  WHERE pic.batch_id = p_batch_id AND pic.table_name = 'part_master'
  GROUP BY c.id, c.plain_name, c.name
  ORDER BY count(*) DESC
  LIMIT 1;
  SELECT string_agg(m, ' + ' ORDER BY m) INTO v_models
  FROM (
    SELECT DISTINCT vc.model AS m
    FROM public.part_import_change pic
    JOIN public.part_listing pl ON pl.part_id = pic.row_id
    JOIN public.vehicle_catalog vc ON vc.id = pl.vehicle_catalog_id
    WHERE pic.batch_id = p_batch_id AND pic.table_name = 'part_master'
    LIMIT 4
  ) sub;
  IF v_part_count > 1 AND v_type_name IS NOT NULL AND v_type_count = 1 THEN
    v_line := format('%s %s%s · %s',
      v_part_count,
      lower(v_type_name),
      CASE WHEN v_part_count = 1 THEN '' ELSE CASE WHEN right(lower(v_type_name), 1) = 's' THEN '' ELSE 's' END END,
      coalesce(v_models, '?'));
  ELSIF v_part_count = 1 AND v_type_name IS NOT NULL THEN
    v_line := format('1 %s · %s', lower(v_type_name), coalesce(v_models, '?'));
  ELSE
    v_line := format('%s parts · %s fits', v_part_count, v_fit_count);
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'partCount', v_part_count,
    'fitCount', v_fit_count,
    'summaryLine', v_line
  ));
END;
$bs$;

REVOKE ALL ON FUNCTION public.self_serve_batch_recent_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_batch_recent_summary(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.self_serve_part_recent(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(row ORDER BY row->>'promotedAt' DESC), '[]'::jsonb)
  FROM (
    SELECT (
      jsonb_build_object(
        'batchId', b.id,
        'batchCode', b.code,
        'promotedAt', b.promoted_at,
        'undoEligible', b.promoted_at >= now() - interval '24 hours' AND b.status = 'imported',
        'undoReason', CASE
          WHEN b.status <> 'imported' THEN 'Already undone'
          WHEN b.promoted_at < now() - interval '24 hours' THEN 'Older than 24 hours — edit the part instead'
          ELSE NULL
        END,
        'partId', pm.id,
        'brand', pm.manufacturer,
        'partNumber', pm.oem_part_number,
        'partTypeId', pm.maintenance_component_id,
        'trustLabel', CASE pm.source_type
          WHEN 'car_maker_catalogue' THEN 'Verified · car maker''s catalogue'
          WHEN 'part_maker_catalogue' THEN 'Verified · part maker''s catalogue'
          ELSE 'Needs checking · other source'
        END
      )
      || coalesce(public.self_serve_recent_row_enrichment(pm.id), '{}'::jsonb)
      || coalesce(public.self_serve_batch_recent_summary(b.id), '{}'::jsonb)
    ) AS row
    FROM public.part_import_batch b
    JOIN LATERAL (
      SELECT pic.row_id FROM public.part_import_change pic
      WHERE pic.batch_id = b.id AND pic.table_name = 'part_master'
      ORDER BY pic.id LIMIT 1
    ) first_part ON true
    JOIN public.part_master pm ON pm.id = first_part.row_id
    WHERE b.import_kind = 'self_serve_add' AND b.status = 'imported'
    ORDER BY b.promoted_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 20), 50))
  ) sub;
$$;

REVOKE ALL ON FUNCTION public.self_serve_part_recent(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_part_recent(int) TO service_role;


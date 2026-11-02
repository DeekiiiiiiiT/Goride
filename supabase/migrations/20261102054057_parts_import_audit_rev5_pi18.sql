-- Parts import by area audit Rev 5 (PI-18): normalize and validate side

CREATE OR REPLACE FUNCTION public.part_import_validate_postprocess(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH d AS (
    SELECT
      r.line_no,
      row_number() OVER (
        PARTITION BY
          upper(btrim(coalesce(r.raw->>'brand', r.raw->>'manufacturer', ''))),
          public.part_import_norm_number(coalesce(r.raw->>'part_number', '')),
          r.vehicle_catalog_id,
          coalesce(nullif(btrim(r.raw->>'position', ''), ''), ''),
          coalesce(nullif(r.normalized->>'side', ''), '')
        ORDER BY r.line_no
      ) AS rn
    FROM public.part_import_row r
    WHERE r.batch_id = p_batch_id
  )
  UPDATE public.part_import_row r
  SET
    status = 'duplicate',
    action = 'skip',
    issues = CASE
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(r.issues, '[]'::jsonb)) elem
        WHERE elem->>'code' = 'DUPLICATE'
      ) THEN r.issues
      ELSE coalesce(r.issues, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'code', 'DUPLICATE', 'column', 'part_number', 'message', 'Duplicate row in file', 'severity', 'duplicate'))
    END
  FROM d
  WHERE r.batch_id = p_batch_id
    AND r.line_no = d.line_no
    AND d.rn > 1
    AND r.status IS DISTINCT FROM 'duplicate';

  WITH first_lines AS (
    SELECT
      r.line_no,
      min(r.line_no) OVER (
        PARTITION BY
          upper(btrim(coalesce(r.raw->>'brand', r.raw->>'manufacturer', ''))),
          public.part_import_norm_number(coalesce(r.raw->>'part_number', ''))
      ) AS first_line
    FROM public.part_import_row r
    WHERE r.batch_id = p_batch_id
      AND r.status NOT IN ('duplicate', 'error')
  )
  UPDATE public.part_import_row r
  SET
    action = CASE WHEN r.line_no = fl.first_line THEN r.action ELSE 'add_fit' END,
    existing_line_no = CASE WHEN r.line_no = fl.first_line THEN NULL ELSE fl.first_line END
  FROM first_lines fl
  WHERE r.batch_id = p_batch_id
    AND r.line_no = fl.line_no
    AND r.status NOT IN ('duplicate', 'error', 'unchanged')
    AND r.action IN ('create_part', 'add_fit', 'update_part');
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_validate_rows(
  p_batch_id uuid,
  p_only_line int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_area uuid;
  v_area_name text;
  v_allowed uuid[];
  r record;
  v_vehicle uuid;
  v_candidates jsonb;
  v_part_type uuid;
  v_part_parent uuid;
  v_brand text;
  v_number text;
  v_number_norm text;
  v_match_type text;
  v_existing uuid;
  v_confirmed boolean;
  v_replaces uuid;
  v_issues jsonb;
  v_status text;
  v_action text;
  v_yf int;
  v_yt int;
  v_yf_txt text;
  v_yt_txt text;
  v_src text;
  v_domain text;
  v_pos text;
  v_side text;
  v_listing uuid;
  v_live_name text;
  v_live_kind text;
  v_live_url text;
  v_prod_start int;
  v_prod_end int;
BEGIN
  SELECT b.area_id, coalesce(sys.plain_name, sys.name)
  INTO v_area, v_area_name
  FROM public.part_import_batch b
  JOIN public.maintenance_service_categories sys ON sys.id = b.area_id
  WHERE b.id = p_batch_id
  FOR UPDATE;

  IF v_area IS NULL THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  SELECT allowed_part_type_ids INTO v_allowed
  FROM public.part_import_template
  WHERE area_id = v_area AND active IS TRUE
  ORDER BY version DESC
  LIMIT 1;

  FOR r IN
    SELECT *
    FROM public.part_import_row
    WHERE batch_id = p_batch_id
      AND (p_only_line IS NULL OR line_no = p_only_line)
    ORDER BY line_no
  LOOP
    v_issues := '[]'::jsonb;
    v_status := 'valid';
    v_action := 'create_part';
    v_vehicle := r.vehicle_catalog_id;
    v_part_type := NULL;
    v_existing := NULL;
    v_replaces := NULL;
    v_brand := public.part_import_strip_brand(coalesce(r.raw->>'brand', r.raw->>'manufacturer', ''));
    v_number := btrim(coalesce(r.raw->>'part_number', ''));
    v_number_norm := public.part_import_norm_number(v_number);
    v_match_type := lower(btrim(coalesce(r.raw->>'match_type', r.raw->>'part_kind', 'oem')));
    IF v_match_type IN ('factory', 'genuine') THEN v_match_type := 'oem'; END IF;
    v_src := btrim(coalesce(r.raw->>'source_url', r.raw->>'evidence_url', ''));
    v_pos := btrim(coalesce(r.raw->>'position', ''));
    v_side := lower(btrim(coalesce(r.raw->>'side', '')));
    v_yf_txt := btrim(coalesce(r.raw->>'year_from', ''));
    v_yt_txt := btrim(coalesce(r.raw->>'year_to', ''));
    v_yf := CASE WHEN v_yf_txt ~ '^\d{4}$' THEN v_yf_txt::int ELSE NULL END;
    v_yt := CASE WHEN v_yt_txt ~ '^\d{4}$' THEN v_yt_txt::int ELSE NULL END;

    IF public.part_import_raw_has_fleet_data(r.raw) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'FLEET_DATA_FORBIDDEN', 'column', 'raw', 'message', 'Fleet plate or org id in row', 'severity', 'error'));
    END IF;

    IF v_brand = '' OR v_number = '' OR v_src = '' OR btrim(coalesce(r.raw->>'vehicle', '')) = ''
       OR btrim(coalesce(r.raw->>'part_type', r.raw->>'job', '')) = '' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'PARAM_MISSING', 'column', 'required', 'message', 'Required cells missing', 'severity', 'error'));
    END IF;

    IF v_match_type NOT IN ('oem', 'sister', 'engine', 'aftermarket', 'universal') THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'MATCH_TYPE_INVALID', 'column', 'match_type', 'message', 'Match type not allowed', 'severity', 'error'));
    END IF;

    IF v_side <> '' AND v_side NOT IN ('left', 'right', 'both') THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'SIDE_INVALID', 'column', 'side', 'message', 'Side must be left, right, or both', 'severity', 'error'));
    END IF;

    IF v_src <> '' AND v_src !~* '^https://' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'SOURCE_INVALID', 'column', 'source_url', 'message', 'Source must be https', 'severity', 'error'));
    END IF;

    v_candidates := coalesce(r.normalized->'vehicle_candidates', '[]'::jsonb);
    IF v_vehicle IS NULL THEN
      IF jsonb_array_length(v_candidates) = 0 THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'VEHICLE_NOT_FOUND', 'column', 'vehicle', 'message', 'Car not in Vehicle Database', 'severity', 'error'));
      ELSIF jsonb_array_length(v_candidates) > 1 THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'DISAMBIGUATION_REQ', 'column', 'vehicle',
          'message', 'Pick one car version from candidates', 'severity', 'error'));
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM public.vehicle_catalog vc WHERE vc.id = v_vehicle) THEN
      v_vehicle := NULL;
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'VEHICLE_NOT_FOUND', 'column', 'vehicle', 'message', 'Car not in Vehicle Database', 'severity', 'error'));
    END IF;

    IF (v_yf_txt <> '' AND v_yf IS NULL) OR (v_yt_txt <> '' AND v_yt IS NULL)
       OR (v_yf IS NOT NULL AND v_yt IS NOT NULL AND v_yf > v_yt) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'YEAR_RANGE_INVALID', 'column', 'year_from', 'message', 'Invalid year range', 'severity', 'error'));
    END IF;

    IF v_vehicle IS NOT NULL AND (v_yf IS NOT NULL OR v_yt IS NOT NULL) THEN
      SELECT vc.production_start_year, coalesce(vc.production_end_year, vc.production_start_year)
      INTO v_prod_start, v_prod_end
      FROM public.vehicle_catalog vc WHERE vc.id = v_vehicle;
      IF v_yf IS NOT NULL AND v_prod_start IS NOT NULL AND v_yf < v_prod_start THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'YEAR_OUTSIDE_PRODUCTION', 'column', 'year_from', 'message', 'Year before production', 'severity', 'label'));
      END IF;
      IF v_yt IS NOT NULL AND v_prod_end IS NOT NULL AND v_yt > v_prod_end THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'YEAR_OUTSIDE_PRODUCTION', 'column', 'year_to', 'message', 'Year after production', 'severity', 'label'));
      END IF;
    END IF;

    SELECT c.id, c.parent_id INTO v_part_type, v_part_parent
    FROM public.maintenance_service_categories c
    WHERE c.parent_id = v_area
      AND c.is_part IS TRUE
      AND (
        upper(c.op_code) = upper(btrim(coalesce(r.raw->>'part_type', r.raw->>'job', '')))
        OR lower(coalesce(c.plain_name, c.name)) = lower(btrim(coalesce(r.raw->>'part_type', r.raw->>'job', '')))
      )
    LIMIT 1;

    IF v_part_type IS NULL THEN
      SELECT c.id, c.parent_id INTO v_part_type, v_part_parent
      FROM public.maintenance_service_categories c
      WHERE c.is_part IS TRUE
        AND (
          upper(c.op_code) = upper(btrim(coalesce(r.raw->>'part_type', r.raw->>'job', '')))
          OR lower(coalesce(c.plain_name, c.name)) = lower(btrim(coalesce(r.raw->>'part_type', r.raw->>'job', '')))
        )
      LIMIT 1;
      IF v_part_type IS NOT NULL AND v_part_parent IS DISTINCT FROM v_area THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'DOMAIN_MISMATCH', 'column', 'part_type', 'message', 'Part type not in this area', 'severity', 'error'));
      ELSIF v_part_type IS NULL THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'DOMAIN_MISMATCH', 'column', 'part_type', 'message', 'Part type not in this area', 'severity', 'error'));
      END IF;
    ELSIF v_allowed IS NOT NULL AND NOT (v_part_type = ANY (v_allowed)) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'DOMAIN_MISMATCH', 'column', 'part_type', 'message', 'Part type not in this area', 'severity', 'error'));
    END IF;

    IF v_part_type IS NOT NULL AND coalesce((
      SELECT c.position_aware FROM public.maintenance_service_categories c WHERE c.id = v_part_type
    ), false) THEN
      IF v_pos = '' OR upper(v_pos) NOT IN (
        'FRONT', 'REAR', 'FRONT LEFT', 'FRONT RIGHT', 'REAR LEFT', 'REAR RIGHT', 'FL', 'FR', 'RL', 'RR'
      ) THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'PARAM_MISSING', 'column', 'position', 'message', 'Position required for this part type', 'severity', 'error'));
      END IF;
    END IF;

    IF v_part_type IS NOT NULL THEN
      v_issues := v_issues || public.part_import_area_spec_issues(v_area, v_part_type, r.raw, v_match_type);
    END IF;

    IF v_brand <> '' AND NOT EXISTS (
      SELECT 1 FROM public.part_master pm
      WHERE upper(coalesce(pm.manufacturer, '')) = v_brand
    ) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'BRAND_NEW', 'column', 'brand', 'message', 'Brand not seen in catalog before', 'severity', 'label'));
    END IF;

    IF public.part_import_number_shape_unusual(v_brand, v_number_norm) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'NUMBER_SHAPE_UNUSUAL', 'column', 'part_number', 'message', 'Unusual OEM number shape', 'severity', 'label'));
    END IF;

    IF v_src <> '' THEN
      v_domain := public.part_import_source_domain(v_src);
      IF v_domain <> '' AND NOT EXISTS (
        SELECT 1 FROM public.catalog_trusted_source ts
        WHERE ts.domain = v_domain AND ts.active IS TRUE
      ) THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'SOURCE_UNTRUSTED', 'column', 'source_url', 'message', 'Source domain not on trusted list', 'severity', 'label'));
      END IF;
    END IF;

    IF btrim(coalesce(r.raw->>'replaces_oem_number', '')) <> '' THEN
      SELECT pm.id INTO v_replaces
      FROM public.part_master pm
      WHERE pm.oem_part_number_norm = public.part_import_norm_number(r.raw->>'replaces_oem_number')
        AND upper(coalesce(pm.manufacturer, '')) = v_brand
      LIMIT 1;
      IF v_replaces IS NULL THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'OEM_NOT_ON_FILE', 'column', 'replaces_oem_number', 'message', 'Replaced OEM not in catalog', 'severity', 'label'));
      END IF;
    END IF;

    SELECT pm.id, (pm.catalog_decision = 'confirmed'), pm.name, pm.part_kind, pm.evidence_url
    INTO v_existing, v_confirmed, v_live_name, v_live_kind, v_live_url
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = v_brand
      AND pm.oem_part_number_norm = v_number_norm
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.part_master pm
        JOIN public.maintenance_service_categories comp ON comp.id = pm.maintenance_component_id
        WHERE pm.id = v_existing AND comp.parent_id IS NOT NULL AND comp.parent_id <> v_area
      ) THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'AREA_CONFLICT', 'column', 'part_number', 'message', 'Part already filed under another area', 'severity', 'error'));
      END IF;
    END IF;

    IF v_existing IS NOT NULL AND v_confirmed THEN
      v_action := 'add_fit';
      IF coalesce(nullif(btrim(r.raw->>'part_name', ''), ''), v_number) IS DISTINCT FROM v_live_name
         OR v_match_type IS DISTINCT FROM v_live_kind
         OR v_src IS DISTINCT FROM coalesce(v_live_url, '') THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'DIFFERS_FROM_CONFIRMED', 'column', 'part_name', 'message', 'Differs from confirmed part — fit only', 'severity', 'label'));
      END IF;
    ELSIF v_existing IS NOT NULL THEN
      v_action := 'update_part';
    ELSE
      v_action := 'create_part';
    END IF;

    IF v_existing IS NOT NULL AND v_vehicle IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_issues) elem WHERE elem->>'severity' = 'error'
    ) THEN
      SELECT pl.id INTO v_listing
      FROM public.part_master pm
      JOIN public.part_listing pl ON pl.interchange_group_id = pm.interchange_group_id
      WHERE pm.id = v_existing
        AND pl.vehicle_catalog_id = v_vehicle
        AND coalesce(pl.position, '') = coalesce(nullif(v_pos, ''), '')
        AND coalesce(pl.side, '') = coalesce(nullif(v_side, ''), '');

      IF v_listing IS NOT NULL
         AND coalesce(nullif(btrim(r.raw->>'part_name', ''), ''), v_number) IS NOT DISTINCT FROM v_live_name
         AND v_match_type IS NOT DISTINCT FROM v_live_kind
         AND v_src IS NOT DISTINCT FROM coalesce(v_live_url, '')
         AND (v_yf IS NOT DISTINCT FROM (SELECT pl2.year_from FROM public.part_listing pl2 WHERE pl2.id = v_listing))
         AND (v_yt IS NOT DISTINCT FROM (SELECT pl2.year_to FROM public.part_listing pl2 WHERE pl2.id = v_listing)) THEN
        v_status := 'unchanged';
        v_action := 'unchanged';
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'UNCHANGED', 'column', 'part_number', 'message', 'Matches catalog', 'severity', 'unchanged'));
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_issues) elem WHERE elem->>'severity' = 'error'
    ) THEN
      v_status := 'error';
      v_action := 'skip';
    ELSIF v_status = 'unchanged' THEN
      NULL;
    ELSIF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_issues) elem WHERE elem->>'severity' = 'label'
    ) THEN
      v_status := 'labelled';
    END IF;

    UPDATE public.part_import_row
    SET normalized = coalesce(r.normalized, '{}'::jsonb) || jsonb_build_object(
          'brand', v_brand,
          'number', v_number,
          'number_norm', v_number_norm,
          'match_type', v_match_type,
          'year_from', v_yf,
          'year_to', v_yt,
          'source_url', v_src,
          'side', v_side,
          'specs', public.part_import_row_specs(v_area, r.raw)
        ),
        vehicle_catalog_id = v_vehicle,
        part_type_id = v_part_type,
        existing_part_id = v_existing,
        replaces_part_id = v_replaces,
        existing_line_no = NULL,
        issues = v_issues,
        status = v_status,
        action = v_action
    WHERE batch_id = p_batch_id AND line_no = r.line_no;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_promote(p_batch_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch record;
  v_lock int;
  r record;
  v_group uuid;
  v_part uuid;
  v_listing uuid;
  v_category uuid;
  v_before jsonb;
  v_created_parts int := 0;
  v_updated_parts int := 0;
  v_created_fits int := 0;
  v_updated_fits int := 0;
  v_refresh text;
  v_fit_scope text;
  v_specs jsonb;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS part_import_batch_parts (
    line_no int PRIMARY KEY,
    part_id uuid NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE part_import_batch_parts;

  SELECT * INTO v_batch FROM public.part_import_batch WHERE id = p_batch_id FOR UPDATE;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_batch.status <> 'checked' THEN RAISE EXCEPTION 'Batch must be checked before import'; END IF;

  v_lock := hashtext('part_import:' || v_batch.area_id::text);
  IF NOT pg_try_advisory_xact_lock(v_lock) THEN
    RAISE EXCEPTION 'Already importing this area';
  END IF;

  v_fit_scope := coalesce(public.part_import_area_fit_scope(v_batch.area_id), 'body');

  UPDATE public.part_import_batch SET status = 'promoting' WHERE id = p_batch_id;

  SELECT pc.id INTO v_category FROM public.part_category pc WHERE pc.area_id = v_batch.area_id LIMIT 1;

  FOR r IN
    SELECT *
    FROM public.part_import_row
    WHERE batch_id = p_batch_id
      AND accepted IS TRUE
      AND status IN ('valid', 'labelled')
      AND action IN ('create_part', 'update_part', 'add_fit')
    ORDER BY line_no
  LOOP
    v_group := NULL;
    v_part := r.existing_part_id;
    v_specs := coalesce(r.normalized->'specs', public.part_import_row_specs(v_batch.area_id, r.raw));

    IF r.action = 'add_fit' THEN
      SELECT bpp.part_id INTO v_part FROM part_import_batch_parts bpp WHERE bpp.line_no = r.existing_line_no;
      IF v_part IS NULL THEN
        v_part := r.existing_part_id;
      END IF;
    END IF;

    IF r.replaces_part_id IS NOT NULL AND r.action = 'create_part' THEN
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = r.replaces_part_id;
    END IF;

    IF r.action = 'create_part' THEN
      IF v_group IS NULL THEN
        INSERT INTO public.part_interchange_group (code, label, fit_scope, import_batch_id)
        VALUES (
          'IMP-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
          coalesce(r.raw->>'part_name', r.raw->>'part_number'),
          v_fit_scope,
          p_batch_id
        )
        RETURNING id INTO v_group;
      END IF;

      INSERT INTO public.part_master (
        category_id, name, oem_part_number, manufacturer, part_kind,
        interchange_group_id, maintenance_component_id, import_batch_id, evidence_url,
        catalog_decision, metadata, updated_at
      ) VALUES (
        v_category,
        coalesce(nullif(btrim(r.raw->>'part_name', ''), ''), r.raw->>'part_number'),
        r.raw->>'part_number',
        coalesce(r.normalized->>'brand', r.raw->>'brand'),
        coalesce(r.normalized->>'match_type', 'oem'),
        v_group,
        r.part_type_id,
        p_batch_id,
        r.normalized->>'source_url',
        'pending',
        jsonb_build_object('import_labels', r.issues, 'specs', v_specs),
        now()
      )
      RETURNING id INTO v_part;

      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      VALUES (
        p_batch_id, r.line_no, 'part_interchange_group', v_group, 'insert', NULL,
        public.part_import_row_snapshot('part_interchange_group', v_group)
      );
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      VALUES (
        p_batch_id, r.line_no, 'part_master', v_part, 'insert', NULL,
        public.part_import_row_snapshot('part_master', v_part)
      );
      INSERT INTO part_import_batch_parts (line_no, part_id) VALUES (r.line_no, v_part);
      v_created_parts := v_created_parts + 1;
    ELSIF r.action = 'update_part' AND v_part IS NOT NULL THEN
      v_before := public.part_import_row_snapshot('part_master', v_part);
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = v_part;
      UPDATE public.part_master pm
      SET name = coalesce(nullif(btrim(r.raw->>'part_name', ''), ''), pm.name),
          evidence_url = coalesce(r.normalized->>'source_url', pm.evidence_url),
          maintenance_component_id = coalesce(r.part_type_id, pm.maintenance_component_id),
          part_kind = coalesce(r.normalized->>'match_type', pm.part_kind),
          metadata = coalesce(pm.metadata, '{}'::jsonb) || jsonb_build_object('specs', v_specs, 'import_labels', r.issues),
          catalog_decision = 'pending',
          updated_at = now()
      WHERE id = v_part AND pm.catalog_decision IS DISTINCT FROM 'confirmed';
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      VALUES (
        p_batch_id, r.line_no, 'part_master', v_part, 'update', v_before,
        public.part_import_row_snapshot('part_master', v_part)
      );
      INSERT INTO part_import_batch_parts (line_no, part_id) VALUES (r.line_no, v_part)
      ON CONFLICT (line_no) DO UPDATE SET part_id = EXCLUDED.part_id;
      v_updated_parts := v_updated_parts + 1;
    ELSIF r.action = 'add_fit' AND v_part IS NOT NULL THEN
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = v_part;
      INSERT INTO part_import_batch_parts (line_no, part_id) VALUES (r.line_no, v_part)
      ON CONFLICT (line_no) DO UPDATE SET part_id = EXCLUDED.part_id;
    END IF;

    IF v_group IS NULL AND v_part IS NOT NULL THEN
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = v_part;
    END IF;

    IF v_group IS NOT NULL AND r.vehicle_catalog_id IS NOT NULL THEN
      SELECT pl.id INTO v_listing
      FROM public.part_listing pl
      WHERE pl.interchange_group_id = v_group
        AND pl.vehicle_catalog_id = r.vehicle_catalog_id
        AND coalesce(pl.position, '') = coalesce(nullif(btrim(r.raw->>'position', ''), ''), '')
        AND coalesce(pl.side, '') = coalesce(nullif(r.normalized->>'side', ''), '');

      IF v_listing IS NULL THEN
        INSERT INTO public.part_listing (
          interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to, evidence_url, import_batch_id
        ) VALUES (
          v_group,
          r.vehicle_catalog_id,
          nullif(btrim(r.raw->>'position', ''), ''),
          nullif(r.normalized->>'side', ''),
          (r.normalized->>'year_from')::int,
          (r.normalized->>'year_to')::int,
          r.normalized->>'source_url',
          p_batch_id
        )
        RETURNING id INTO v_listing;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
        VALUES (
          p_batch_id, r.line_no, 'part_listing', v_listing, 'insert', NULL,
          public.part_import_row_snapshot('part_listing', v_listing)
        );
        v_created_fits := v_created_fits + 1;
      ELSE
        v_before := public.part_import_row_snapshot('part_listing', v_listing);
        UPDATE public.part_listing pl
        SET year_from = (r.normalized->>'year_from')::int,
            year_to = (r.normalized->>'year_to')::int,
            evidence_url = r.normalized->>'source_url',
            side = coalesce(nullif(r.normalized->>'side', ''), pl.side)
        WHERE id = v_listing;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
        VALUES (
          p_batch_id, r.line_no, 'part_listing', v_listing, 'update', v_before,
          public.part_import_row_snapshot('part_listing', v_listing)
        );
        v_updated_fits := v_updated_fits + 1;
      END IF;
    END IF;
  END LOOP;

  BEGIN
    PERFORM public.refresh_variant_parts_readiness();
  EXCEPTION WHEN OTHERS THEN
    v_refresh := SQLERRM;
  END;

  UPDATE public.part_import_batch
  SET status = 'imported',
      promoted_at = now(),
      promoted_by = p_actor,
      parts_created = v_created_parts,
      parts_updated = v_updated_parts,
      fits_created = v_created_fits,
      fits_updated = v_updated_fits,
      refresh_warning = v_refresh
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'partsCreated', v_created_parts,
    'partsUpdated', v_updated_parts,
    'fitsCreated', v_created_fits,
    'fitsUpdated', v_updated_fits,
    'refreshWarning', v_refresh
  );
END;
$$;

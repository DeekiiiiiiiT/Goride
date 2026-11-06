-- part_import_validate_rows: the 'unchanged' check compared the typed position ('Front') to the stored
-- listing position ('front') case-sensitively, so re-importing an identical file never showed 'unchanged'.
-- Compare case-insensitively (side is already lowercased). Rest unchanged.

CREATE OR REPLACE FUNCTION public.part_import_validate_rows(p_batch_id uuid, p_only_line integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        AND lower(coalesce(pl.position, '')) = lower(coalesce(nullif(v_pos, ''), ''))
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
$function$;

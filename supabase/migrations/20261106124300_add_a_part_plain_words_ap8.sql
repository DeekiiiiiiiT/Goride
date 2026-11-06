-- AS7-04: brake pad trade term + AP8 structured fit summary on preview.

UPDATE public.maintenance_service_categories c
SET trade_term = 'brake pad set'
WHERE c.op_code = 'BRK-PADS' AND c.is_part IS TRUE;

CREATE OR REPLACE FUNCTION public.self_serve_plain_words(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_brand text := btrim(coalesce(p_input->>'brand', ''));
  v_number text := btrim(coalesce(p_input->>'partNumber', ''));
  v_type_name text := btrim(coalesce(p_input->>'partTypeName', 'part'));
  v_trade text := nullif(btrim(coalesce(p_input->>'tradeTerm', '')), '');
  v_mode text := lower(coalesce(p_input->>'fitMode', 'specific'));
  v_position text := lower(btrim(coalesce(p_input->>'position', '')));
  v_scheme text := lower(btrim(coalesce(p_input->>'positionScheme', '')));
  v_reach int := coalesce((p_input->>'totalReach')::int, (p_input->>'carCount')::int, 0);
  v_engine text := nullif(btrim(coalesce(p_input->>'engineCode', '')), '');
  v_spec_val text := nullif(btrim(coalesce(p_input->>'specValue', '')), '');
  v_type_phrase text;
  v_fit_phrase text;
  v_oe_phrase text;
  v_sentence text;
  v_lines jsonb := '[]'::jsonb;
  v_trust text;
  v_source text := lower(coalesce(p_input->>'sourceType', 'other'));
  v_position_label text;
  v_years_label text;
  v_vehicle_summary text;
  v_year_min int;
  v_year_max int;
BEGIN
  IF v_source = 'car_maker_catalogue' THEN
    v_trust := 'Verified · car maker''s catalogue';
  ELSIF v_source = 'part_maker_catalogue' THEN
    v_trust := 'Verified · part maker''s catalogue';
  ELSE
    v_trust := 'Needs checking · other source';
  END IF;

  v_type_phrase := coalesce(v_trade, lower(v_type_name));
  IF v_position IN ('front', 'rear') AND v_type_phrase NOT LIKE v_position || '%' THEN
    v_type_phrase := v_position || ' ' || v_type_phrase;
  END IF;

  IF v_mode = 'engine' AND v_engine IS NOT NULL THEN
    v_fit_phrase := format('It fits cars with engine %s', v_engine);
    IF v_reach > 0 THEN
      v_fit_phrase := format('It fits %s car version(s) with engine %s', v_reach, v_engine);
    END IF;
  ELSIF v_mode = 'spec' AND v_spec_val IS NOT NULL THEN
    v_fit_phrase := format('It fits cars matching spec %s', v_spec_val);
    IF v_reach > 0 THEN
      v_fit_phrase := format('It fits %s car version(s) at %s', v_reach, v_spec_val);
    END IF;
  ELSE
    IF v_reach = 1 THEN
      v_fit_phrase := 'It fits 1 car';
    ELSIF v_reach > 1 THEN
      v_fit_phrase := format('It fits %s cars', v_reach);
    ELSE
      v_fit_phrase := 'It fits no cars yet';
    END IF;
  END IF;

  v_oe_phrase := '';
  IF jsonb_typeof(p_input->'factoryNumbers') = 'array'
     AND jsonb_array_length(p_input->'factoryNumbers') > 0 THEN
    SELECT format(' and replaces %s',
      string_agg(
        format('%s %s', btrim(coalesce(elem->>'brand', 'Factory')), btrim(elem->>'number')),
        ' and '
        ORDER BY elem->>'brand', elem->>'number'
      )
    )
    INTO v_oe_phrase
    FROM jsonb_array_elements(p_input->'factoryNumbers') AS elem
    WHERE coalesce(elem->>'number', '') <> '';
    v_oe_phrase := coalesce(v_oe_phrase, '');
  END IF;

  v_sentence := format('%s %s is a %s. %s%s.',
    v_brand, v_number, v_type_phrase, v_fit_phrase, coalesce(v_oe_phrase, ''));

  IF v_position = 'front' AND v_scheme IN ('axle', 'axle_inner_outer', 'axle_left_right') THEN
    v_position_label := 'Front Axle';
  ELSIF v_position = 'rear' AND v_scheme IN ('axle', 'axle_inner_outer', 'axle_left_right') THEN
    v_position_label := 'Rear Axle';
  ELSIF v_position = 'before_cat' THEN
    v_position_label := 'Before catalytic converter';
  ELSIF v_position = 'after_cat' THEN
    v_position_label := 'After catalytic converter';
  ELSIF v_position IN ('front', 'rear') THEN
    v_position_label := initcap(v_position);
  ELSE
    v_position_label := NULL;
  END IF;

  IF jsonb_typeof(p_input->'listings') = 'array' THEN
    SELECT coalesce(jsonb_agg(line ORDER BY line), '[]'::jsonb)
    INTO v_lines
    FROM (
      SELECT DISTINCT format('%s %s %s%s%s',
        vc.make, vc.model,
        coalesce(vc.chassis_code, ''),
        CASE WHEN l->>'position' IS NOT NULL AND btrim(l->>'position') <> ''
          THEN format(' · %s', initcap(btrim(l->>'position'))) ELSE '' END,
        CASE
          WHEN nullif(l->>'yearFrom', '') IS NOT NULL OR nullif(l->>'yearTo', '') IS NOT NULL THEN
            format(' · %s–%s',
              coalesce(nullif(l->>'yearFrom', ''), vc.production_start_year::text, '?'),
              coalesce(nullif(l->>'yearTo', ''), CASE WHEN vc.production_end_year >= 9999 THEN 'present' ELSE vc.production_end_year::text END, 'present')
            )
          ELSE ''
        END
      ) AS line
      FROM jsonb_array_elements(p_input->'listings') AS l
      JOIN public.vehicle_catalog vc ON vc.id = (l->>'vehicleId')::uuid
      WHERE coalesce(l->>'vehicleId', '') <> ''
      LIMIT 12
    ) sub;

    SELECT
      min(coalesce(nullif(l->>'yearFrom', '')::int, vc.production_start_year)),
      max(coalesce(nullif(l->>'yearTo', '')::int, CASE WHEN vc.production_end_year >= 9999 THEN extract(year from now())::int ELSE vc.production_end_year END))
    INTO v_year_min, v_year_max
    FROM jsonb_array_elements(p_input->'listings') AS l
    JOIN public.vehicle_catalog vc ON vc.id = (l->>'vehicleId')::uuid
    WHERE coalesce(l->>'vehicleId', '') <> '';

    IF v_year_min IS NOT NULL THEN
      IF v_year_max IS NULL OR v_year_max >= extract(year from now())::int THEN
        v_years_label := format('%s–present', v_year_min);
      ELSE
        v_years_label := format('%s–%s', v_year_min, v_year_max);
      END IF;
    END IF;

    SELECT string_agg(sub.label, '; ' ORDER BY sub.label)
    INTO v_vehicle_summary
    FROM (
      SELECT DISTINCT format('%s %s', vc.make, vc.model) AS label
      FROM jsonb_array_elements(p_input->'listings') AS l
      JOIN public.vehicle_catalog vc ON vc.id = (l->>'vehicleId')::uuid
      WHERE coalesce(l->>'vehicleId', '') <> ''
      LIMIT 8
    ) sub;
  ELSIF jsonb_typeof(p_input->'vehicleIds') = 'array' THEN
    SELECT coalesce(jsonb_agg(line ORDER BY line), '[]'::jsonb)
    INTO v_lines
    FROM (
      SELECT DISTINCT format('%s %s %s', vc.make, vc.model, coalesce(vc.chassis_code, '')) AS line
      FROM jsonb_array_elements_text(p_input->'vehicleIds') AS vid
      JOIN public.vehicle_catalog vc ON vc.id = vid::uuid
      WHERE vid <> ''
      LIMIT 12
    ) sub;
  END IF;

  RETURN jsonb_build_object(
    'sentence', v_sentence,
    'trustLabel', v_trust,
    'fitSummaryLines', coalesce(v_lines, '[]'::jsonb),
    'fitSummaryStructured', jsonb_strip_nulls(jsonb_build_object(
      'positionLabel', v_position_label,
      'modelYearsLabel', v_years_label,
      'vehicleSummary', v_vehicle_summary
    ))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_serve_part_add_preview(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mode text := lower(coalesce(p_input->>'fitMode', ''));
  v_engine uuid := nullif(p_input->>'engineFamilyId', '')::uuid;
  v_spec_key text := nullif(btrim(p_input->>'specKey'), '');
  v_spec_value text := nullif(btrim(p_input->>'specValue'), '');
  v_oe_norm text;
  v_car_count int := 0;
  v_oe_extra int := 0;
  v_excluded int := 0;
  v_base jsonb;
  v_plain jsonb;
  v_preview_input jsonb;
BEGIN
  IF v_mode = 'engine' AND v_engine IS NOT NULL THEN
    SELECT count(*)::int INTO v_car_count FROM public.vehicle_catalog vc WHERE vc.engine_family_id = v_engine;
    IF jsonb_typeof(p_input->'excludedVehicleIds') = 'array' THEN
      SELECT count(DISTINCT vid)::int INTO v_excluded
      FROM jsonb_array_elements_text(p_input->'excludedVehicleIds') AS vid
      JOIN public.vehicle_catalog vc ON vc.id = vid::uuid
      WHERE vid <> '' AND vc.engine_family_id = v_engine;
      v_car_count := greatest(0, v_car_count - v_excluded);
    END IF;
  ELSIF v_mode = 'spec' AND v_spec_key IS NOT NULL AND v_spec_value IS NOT NULL THEN
    SELECT count(DISTINCT sv.vehicle_catalog_id)::int INTO v_car_count
    FROM public.catalog_spec_value sv
    WHERE sv.spec_key = v_spec_key AND btrim(sv.value) = v_spec_value;
  ELSIF v_mode = 'specific' AND jsonb_typeof(p_input->'vehicleIds') = 'array' THEN
    SELECT count(DISTINCT vid)::int INTO v_car_count
    FROM jsonb_array_elements_text(p_input->'vehicleIds') AS vid
    WHERE vid <> '';
  ELSIF v_mode = 'specific' AND jsonb_typeof(p_input->'listings') = 'array' THEN
    SELECT count(DISTINCT l->>'vehicleId')::int INTO v_car_count
    FROM jsonb_array_elements(p_input->'listings') AS l
    WHERE coalesce(l->>'vehicleId', '') <> '';
  END IF;

  IF jsonb_typeof(p_input->'factoryNumbers') = 'array' THEN
    FOR v_oe_norm IN
      SELECT public.part_import_norm_number(elem->>'number')
      FROM jsonb_array_elements(p_input->'factoryNumbers') AS elem
      WHERE coalesce(elem->>'number', '') <> ''
    LOOP
      IF v_oe_norm IS NOT NULL AND v_oe_norm <> '' THEN
        SELECT v_oe_extra + count(DISTINCT von.vehicle_catalog_id)::int INTO v_oe_extra
        FROM public.vehicle_oe_number von
        WHERE von.oe_number_norm = v_oe_norm;
      END IF;
    END LOOP;
  END IF;

  v_base := jsonb_build_object(
    'carCount', coalesce(v_car_count, 0),
    'oeExtraCarCount', coalesce(v_oe_extra, 0),
    'totalReach', coalesce(v_car_count, 0) + coalesce(v_oe_extra, 0),
    'excludedCount', coalesce(v_excluded, 0)
  );

  v_preview_input := p_input || jsonb_build_object(
    'carCount', coalesce(v_car_count, 0),
    'totalReach', coalesce(v_car_count, 0) + coalesce(v_oe_extra, 0)
  );
  v_plain := public.self_serve_plain_words(v_preview_input);

  RETURN v_base || coalesce(v_plain, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.self_serve_plain_words(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_plain_words(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.self_serve_part_add_preview(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_part_add_preview(jsonb) TO service_role;

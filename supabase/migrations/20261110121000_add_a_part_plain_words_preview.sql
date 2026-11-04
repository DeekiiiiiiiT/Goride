-- Engine family vehicle cap fix (AS5-04) + plain-words preview for AP8.

CREATE OR REPLACE FUNCTION public.self_serve_engine_family_detail(p_engine_family_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', ef.id,
    'code', ef.code,
    'notes', ef.notes,
    'variantCount', (
      SELECT count(*)::int FROM public.vehicle_catalog vc WHERE vc.engine_family_id = ef.id
    ),
    'makeCounts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('make', sub.make, 'count', sub.cnt) ORDER BY sub.make)
      FROM (
        SELECT vc.make, count(*)::int AS cnt
        FROM public.vehicle_catalog vc
        WHERE vc.engine_family_id = ef.id
        GROUP BY vc.make
      ) sub
    ), '[]'::jsonb),
    'vehicles', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sub.id,
          'make', sub.make,
          'model', sub.model,
          'chassisCode', sub.chassis_code,
          'year', sub.production_start_year,
          'engineCode', sub.engine_code,
          'fuelType', sub.fuel_type,
          'displacementCc', sub.engine_displacement_cc
        ) ORDER BY sub.make, sub.model, sub.production_start_year
      )
      FROM (
        SELECT vc.id, vc.make, vc.model, vc.chassis_code, vc.production_start_year,
          vc.engine_code, vc.fuel_type, vc.engine_displacement_cc
        FROM public.vehicle_catalog vc
        WHERE vc.engine_family_id = ef.id
        ORDER BY vc.make, vc.model, vc.production_start_year
        LIMIT 200
      ) sub
    ), '[]'::jsonb)
  )
  FROM public.engine_family ef
  WHERE ef.id = p_engine_family_id;
$$;

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

  IF jsonb_typeof(p_input->'listings') = 'array' THEN
    SELECT coalesce(jsonb_agg(line ORDER BY line), '[]'::jsonb)
    INTO v_lines
    FROM (
      SELECT DISTINCT format('%s %s %s%s',
        vc.make, vc.model,
        coalesce(vc.chassis_code, ''),
        CASE WHEN l->>'position' IS NOT NULL AND btrim(l->>'position') <> ''
          THEN format(' · %s', initcap(btrim(l->>'position'))) ELSE '' END
      ) AS line
      FROM jsonb_array_elements(p_input->'listings') AS l
      JOIN public.vehicle_catalog vc ON vc.id = (l->>'vehicleId')::uuid
      WHERE coalesce(l->>'vehicleId', '') <> ''
      LIMIT 12
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
    'fitSummaryLines', coalesce(v_lines, '[]'::jsonb)
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

REVOKE ALL ON FUNCTION public.self_serve_engine_family_detail(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_engine_family_detail(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.self_serve_part_add_preview(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_part_add_preview(jsonb) TO service_role;

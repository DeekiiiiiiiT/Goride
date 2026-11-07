-- Phase 1C/1D: AP13 part-type spec fields + engine preview exclusions + engine family detail

CREATE OR REPLACE FUNCTION public.upsert_self_serve_part_type(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := nullif(p_input->>'id', '')::uuid;
  v_parent uuid := nullif(p_input->>'areaId', '')::uuid;
  v_name text := btrim(coalesce(p_input->>'name', ''));
  v_op text := upper(btrim(coalesce(p_input->>'opCode', '')));
  v_mode text := lower(coalesce(p_input->>'defaultFitMode', 'specific'));
  v_scheme text := lower(coalesce(p_input->>'positionScheme', 'none'));
  v_status text := lower(coalesce(p_input->>'status', 'active'));
  v_hint text := nullif(btrim(coalesce(p_input->>'editorHint', '')), '');
  v_term text := nullif(btrim(coalesce(p_input->>'tradeTerm', '')), '');
  v_field jsonb;
  v_spec_key text;
  v_sort int := 0;
  v_field_count int := 0;
BEGIN
  IF v_name = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF v_parent IS NULL THEN RAISE EXCEPTION 'Choose an area'; END IF;
  IF v_mode NOT IN ('specific', 'engine', 'spec') THEN RAISE EXCEPTION 'Invalid fit mode'; END IF;
  IF v_status NOT IN ('active', 'draft') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  IF v_id IS NULL THEN
    IF v_op = '' THEN RAISE EXCEPTION 'Op code is required for new types'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.maintenance_service_categories c
      WHERE c.is_part IS TRUE AND upper(coalesce(c.op_code, '')) = v_op
    ) THEN
      RAISE EXCEPTION 'Op code already in use';
    END IF;
    INSERT INTO public.maintenance_service_categories (
      code, name, plain_name, parent_id, is_part, op_code, kind,
      default_fit_mode, position_scheme, trade_term, editor_hint, part_type_status, sort_order
    ) VALUES (
      lower(replace(v_op, '-', '_')), v_name, v_name, v_parent, true, v_op, 'component',
      v_mode, v_scheme, v_term, v_hint, v_status, 900
    )
    RETURNING id INTO v_id;
  ELSE
    IF v_op <> '' AND EXISTS (
      SELECT 1 FROM public.maintenance_service_categories c
      WHERE c.is_part IS TRUE AND upper(coalesce(c.op_code, '')) = v_op AND c.id <> v_id
    ) THEN
      RAISE EXCEPTION 'Op code already in use';
    END IF;
    UPDATE public.maintenance_service_categories
    SET name = v_name,
        plain_name = v_name,
        parent_id = v_parent,
        default_fit_mode = v_mode,
        position_scheme = v_scheme,
        trade_term = v_term,
        editor_hint = v_hint,
        part_type_status = v_status,
        op_code = CASE WHEN v_op <> '' THEN v_op ELSE op_code END
    WHERE id = v_id AND is_part IS TRUE AND kind = 'component';
    IF NOT FOUND THEN RAISE EXCEPTION 'Part type not found'; END IF;
  END IF;

  IF jsonb_typeof(p_input->'specFields') = 'array' THEN
    DELETE FROM public.part_type_spec_field WHERE part_type_id = v_id;
    FOR v_field IN SELECT value FROM jsonb_array_elements(p_input->'specFields') AS value
    LOOP
      v_spec_key := lower(btrim(coalesce(v_field->>'specKey', '')));
      IF v_spec_key = '' OR NOT EXISTS (SELECT 1 FROM public.spec_key sk WHERE sk.key = v_spec_key) THEN
        CONTINUE;
      END IF;
      v_sort := v_sort + 1;
      INSERT INTO public.part_type_spec_field (
        part_type_id, spec_key, label, unit, data_type, options, required, example, sort_order
      ) VALUES (
        v_id,
        v_spec_key,
        coalesce(nullif(btrim(v_field->>'label'), ''), v_spec_key),
        nullif(btrim(v_field->>'unit'), ''),
        lower(coalesce(nullif(v_field->>'dataType', ''), 'text')),
        v_field->'options',
        coalesce((v_field->>'required')::boolean, false),
        nullif(btrim(v_field->>'example'), ''),
        coalesce((v_field->>'sortOrder')::int, v_sort)
      );
      v_field_count := v_field_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'specFieldCount', v_field_count);
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

  RETURN jsonb_build_object(
    'carCount', coalesce(v_car_count, 0),
    'oeExtraCarCount', coalesce(v_oe_extra, 0),
    'totalReach', coalesce(v_car_count, 0) + coalesce(v_oe_extra, 0),
    'excludedCount', coalesce(v_excluded, 0)
  );
END;
$$;

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
      SELECT jsonb_agg(jsonb_build_object(
        'id', vc.id,
        'make', vc.make,
        'model', vc.model,
        'chassisCode', vc.chassis_code,
        'year', vc.production_start_year,
        'engineCode', vc.engine_code,
        'fuelType', vc.fuel_type,
        'displacementCc', vc.engine_displacement_cc
      ) ORDER BY vc.make, vc.model, vc.production_start_year)
      FROM public.vehicle_catalog vc
      WHERE vc.engine_family_id = ef.id
      LIMIT 200
    ), '[]'::jsonb)
  )
  FROM public.engine_family ef
  WHERE ef.id = p_engine_family_id;
$$;

REVOKE ALL ON FUNCTION public.self_serve_engine_family_detail(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_engine_family_detail(uuid) TO service_role;

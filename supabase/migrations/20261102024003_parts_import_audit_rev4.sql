-- Parts import by area audit Rev 4 (PI-12, PI-13, PI-14)

-- PI-13: OEM number shape — unknown brands not flagged; Honda alphanumeric norm
CREATE OR REPLACE FUNCTION public.part_import_number_shape_unusual(p_brand text, p_number_norm text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_norm text := upper(coalesce(p_number_norm, ''));
  v_brand text := lower(coalesce(p_brand, ''));
BEGIN
  IF v_norm = '' THEN
    RETURN true;
  END IF;
  IF v_brand LIKE '%toyota%' OR v_brand LIKE '%daihatsu%' THEN
    RETURN NOT (v_norm ~ '^\d{5}[A-Z0-9]{5}$');
  END IF;
  IF v_brand LIKE '%honda%' THEN
    RETURN NOT (v_norm ~ '^\d{5}[A-Z0-9]{6}$');
  END IF;
  RETURN false;
END;
$$;

-- PI-14: position for position_aware types comes from PARAM_MISSING only
CREATE OR REPLACE FUNCTION public.part_import_area_spec_issues(
  p_area_id uuid,
  p_part_type_id uuid,
  p_raw jsonb,
  p_match_type text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_op text;
  v_pt_op text;
  v_pt_name text;
  v_issues jsonb := '[]'::jsonb;
  v_spec text := btrim(coalesce(p_raw->>'spec', ''));
  v_pos text := btrim(coalesce(p_raw->>'position', ''));
  v_engine text := btrim(coalesce(p_raw->>'engine_code', ''));
  v_size text := btrim(coalesce(p_raw->>'size', ''));
  v_bulb text := btrim(coalesce(p_raw->>'bulb_code', ''));
  v_len text := btrim(coalesce(p_raw->>'length_mm', ''));
  v_group text := btrim(coalesce(p_raw->>'group_size', ''));
BEGIN
  SELECT op_code INTO v_op FROM public.maintenance_service_categories WHERE id = p_area_id;
  SELECT upper(coalesce(op_code, '')), lower(coalesce(plain_name, name, ''))
  INTO v_pt_op, v_pt_name
  FROM public.maintenance_service_categories
  WHERE id = p_part_type_id;

  IF v_op = 'BRK' THEN
    IF v_pt_op LIKE '%FLUID%' OR v_pt_name LIKE '%fluid%' THEN
      IF v_spec = '' OR upper(v_spec) !~ 'DOT\s*(3|4|5\.1)' THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'AREA_SPEC_MISSING', 'column', 'spec', 'message', 'Brake fluid needs DOT 3/4/5.1 in spec', 'severity', 'error'));
      END IF;
    END IF;
  ELSIF v_op = 'ENG' THEN
    IF p_match_type = 'engine' OR v_engine <> '' THEN
      IF v_engine = '' THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'AREA_SPEC_MISSING', 'column', 'engine_code', 'message', 'Engine parts need engine_code', 'severity', 'error'));
      END IF;
    END IF;
  ELSIF v_op = 'TIRE' THEN
    IF v_size <> '' AND v_size !~ '^\d{3}/\d{2}R\d{2}$' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'AREA_SPEC_MISSING', 'column', 'size', 'message', 'Tire size must match ###/##R##', 'severity', 'error'));
    ELSIF v_size = '' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'AREA_SPEC_MISSING', 'column', 'size', 'message', 'Tires need size', 'severity', 'error'));
    END IF;
  ELSIF v_op IN ('FLD', 'TRN') THEN
    IF v_spec = '' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'AREA_SPEC_MISSING', 'column', 'spec', 'message', 'Spec column required for this area', 'severity', 'error'));
    END IF;
  ELSIF v_op = 'LGT' THEN
    IF v_pt_name LIKE '%bulb%' OR v_pt_name LIKE '%lamp%' THEN
      IF v_bulb = '' THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'AREA_SPEC_MISSING', 'column', 'bulb_code', 'message', 'Bulbs need bulb_code', 'severity', 'error'));
      END IF;
    ELSIF v_pt_name LIKE '%wiper%' THEN
      IF v_len = '' OR v_pos = '' THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'AREA_SPEC_MISSING', 'column', 'length_mm', 'message', 'Wipers need length_mm and position', 'severity', 'error'));
      END IF;
    END IF;
  ELSIF v_op = 'ELEC' THEN
    IF v_pt_name LIKE '%battery%' AND v_group = '' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'AREA_SPEC_MISSING', 'column', 'group_size', 'message', 'Battery needs group_size', 'severity', 'error'));
    END IF;
  END IF;

  RETURN v_issues;
END;
$$;

-- PI-12: batch helpers must not be callable via PostgREST anon/authenticated
REVOKE ALL ON FUNCTION public.part_import_validate_rows(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_validate_rows(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.part_import_validate_postprocess(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_validate_postprocess(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.part_import_refresh_batch_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_refresh_batch_counts(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.part_import_area_spec_issues(uuid, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_area_spec_issues(uuid, uuid, jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.part_import_raw_has_fleet_data(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_raw_has_fleet_data(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.part_import_row_specs(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_row_specs(uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.part_import_snapshot_comparable(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_snapshot_comparable(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.part_import_source_domain(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_source_domain(text) TO service_role;

REVOKE ALL ON FUNCTION public.part_import_strip_brand(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_strip_brand(text) TO service_role;

REVOKE ALL ON FUNCTION public.part_import_undo_row_reason(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_undo_row_reason(text, uuid, uuid) TO service_role;

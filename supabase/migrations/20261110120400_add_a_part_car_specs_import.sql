-- AP-06: car_specs import check/promote → catalog_spec_value (variant scope)

ALTER TABLE public.part_import_change DROP CONSTRAINT IF EXISTS part_import_change_table_name_check;
ALTER TABLE public.part_import_change ADD CONSTRAINT part_import_change_table_name_check CHECK (
  table_name IN (
    'part_master', 'part_listing', 'part_interchange_group', 'universal_part',
    'vehicle_oe_number', 'part_oe_reference', 'part_index_number', 'part_approval',
    'platform_component_link', 'interchange_group_merge_log', 'interchange_fitment_rule',
    'catalog_spec_value'
  )
);

CREATE OR REPLACE FUNCTION public.part_import_validate_car_specs_rows(
  p_batch_id uuid,
  p_only_line int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
  v_issues jsonb;
  v_status text;
  v_vehicle uuid;
  v_key text;
  v_value text;
  v_src text;
BEGIN
  FOR r IN
    SELECT * FROM public.part_import_row
    WHERE batch_id = p_batch_id AND (p_only_line IS NULL OR line_no = p_only_line)
    ORDER BY line_no
  LOOP
    v_issues := '[]'::jsonb;
    v_status := 'valid';
    v_vehicle := r.vehicle_catalog_id;
    v_key := lower(btrim(coalesce(r.raw->>'spec_key', '')));
    v_value := btrim(coalesce(r.raw->>'spec_value', ''));
    v_src := btrim(coalesce(r.raw->>'source_url', r.raw->>'evidence_url', ''));

    IF v_vehicle IS NULL OR NOT EXISTS (SELECT 1 FROM public.vehicle_catalog vc WHERE vc.id = v_vehicle) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'VEHICLE_NOT_FOUND', 'column', 'vehicle', 'message', 'Car not in Vehicle Database', 'severity', 'error'));
    END IF;
    IF v_key = '' OR NOT EXISTS (SELECT 1 FROM public.spec_key sk WHERE sk.key = v_key) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'DOMAIN_MISMATCH', 'column', 'spec_key', 'message', 'Spec key not on the list', 'severity', 'error'));
    END IF;
    IF v_value = '' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'PARAM_MISSING', 'column', 'spec_value', 'message', 'Spec value required', 'severity', 'error'));
    END IF;
    IF v_src = '' OR v_src !~* '^https://' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'PARAM_MISSING', 'column', 'source_url', 'message', 'Source link required (https)', 'severity', 'error'));
    END IF;

    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_issues) e WHERE e->>'severity' = 'error') THEN
      v_status := 'invalid';
    END IF;

    UPDATE public.part_import_row
    SET status = v_status,
        action = 'upsert_catalog_spec',
        issues = v_issues,
        normalized = jsonb_build_object(
          'spec_key', v_key,
          'spec_value', v_value,
          'source_url', v_src
        )
    WHERE batch_id = p_batch_id AND line_no = r.line_no;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_validate_car_specs_rows(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_validate_car_specs_rows(uuid, int) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_promote_car_specs(p_batch_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch record;
  r record;
  v_row_id uuid;
  v_before jsonb;
  v_created int := 0;
  v_updated int := 0;
  v_vehicle uuid;
  v_key text;
  v_value text;
  v_src text;
  v_yf int;
  v_yt int;
BEGIN
  SELECT * INTO v_batch FROM public.part_import_batch WHERE id = p_batch_id FOR UPDATE;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_batch.status <> 'checked' THEN RAISE EXCEPTION 'Batch must be checked before import'; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('part_import:car_specs')) THEN
    RAISE EXCEPTION 'Already importing car specs';
  END IF;

  UPDATE public.part_import_batch SET status = 'promoting' WHERE id = p_batch_id;

  FOR r IN
    SELECT * FROM public.part_import_row
    WHERE batch_id = p_batch_id
      AND accepted IS TRUE
      AND status IN ('valid', 'labelled')
      AND action = 'upsert_catalog_spec'
    ORDER BY line_no
  LOOP
    v_vehicle := r.vehicle_catalog_id;
    v_key := r.normalized->>'spec_key';
    v_value := r.normalized->>'spec_value';
    v_src := r.normalized->>'source_url';
    v_yf := nullif(r.raw->>'year_from', '')::int;
    v_yt := nullif(r.raw->>'year_to', '')::int;

    SELECT id INTO v_row_id
    FROM public.catalog_spec_value
    WHERE spec_key = v_key AND scope = 'variant' AND vehicle_catalog_id = v_vehicle;

    IF v_row_id IS NULL THEN
      INSERT INTO public.catalog_spec_value (
        spec_key, scope, vehicle_catalog_id, value, year_from, year_to, evidence_url, verified_by
      ) VALUES (
        v_key, 'variant', v_vehicle, v_value, v_yf, v_yt, v_src, p_actor
      )
      RETURNING id INTO v_row_id;
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      VALUES (p_batch_id, r.line_no, 'catalog_spec_value', v_row_id, 'insert', NULL,
        public.part_import_row_snapshot('catalog_spec_value', v_row_id));
      v_created := v_created + 1;
    ELSE
      v_before := public.part_import_row_snapshot('catalog_spec_value', v_row_id);
      UPDATE public.catalog_spec_value
      SET value = v_value,
          year_from = coalesce(v_yf, year_from),
          year_to = coalesce(v_yt, year_to),
          evidence_url = v_src,
          verified_by = coalesce(p_actor, verified_by),
          verified_at = now()
      WHERE id = v_row_id;
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      VALUES (p_batch_id, r.line_no, 'catalog_spec_value', v_row_id, 'update', v_before,
        public.part_import_row_snapshot('catalog_spec_value', v_row_id));
      v_updated := v_updated + 1;
    END IF;
    PERFORM public.refresh_variant_parts_readiness();
  END LOOP;

  UPDATE public.part_import_batch
  SET status = 'imported',
      promoted_at = now(),
      promoted_by = p_actor,
      parts_created = v_created,
      parts_updated = v_updated
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'partsCreated', v_created,
    'partsUpdated', v_updated,
    'fitsCreated', 0,
    'fitsUpdated', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_promote_car_specs(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_promote_car_specs(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_validate(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
  v_stats jsonb;
BEGIN
  SELECT import_kind INTO v_kind FROM public.part_import_batch WHERE id = p_batch_id;
  IF coalesce(v_kind, 'area') = 'area' THEN
    PERFORM public.part_import_validate_rows(p_batch_id, NULL);
    PERFORM public.part_import_validate_postprocess(p_batch_id);
  ELSIF v_kind = 'car_specs' THEN
    PERFORM public.part_import_validate_car_specs_rows(p_batch_id, NULL);
  ELSE
    PERFORM public.part_import_validate_auto_match_rows(p_batch_id, NULL);
    PERFORM public.part_import_validate_auto_match_postprocess(p_batch_id);
  END IF;
  PERFORM public.part_import_route_review_rows(p_batch_id);
  v_stats := public.part_import_refresh_batch_counts(p_batch_id);
  RETURN v_stats;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_revalidate_line(p_batch_id uuid, p_line_no int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
  v_kind text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.part_import_row WHERE batch_id = p_batch_id AND line_no = p_line_no) THEN
    RAISE EXCEPTION 'Row not found';
  END IF;
  SELECT import_kind INTO v_kind FROM public.part_import_batch WHERE id = p_batch_id;
  IF coalesce(v_kind, 'area') = 'area' THEN
    PERFORM public.part_import_validate_rows(p_batch_id, p_line_no);
    PERFORM public.part_import_validate_postprocess(p_batch_id);
  ELSIF v_kind = 'car_specs' THEN
    PERFORM public.part_import_validate_car_specs_rows(p_batch_id, p_line_no);
  ELSE
    PERFORM public.part_import_validate_auto_match_rows(p_batch_id, p_line_no);
    PERFORM public.part_import_validate_auto_match_postprocess(p_batch_id);
  END IF;
  SELECT to_jsonb(r.*) INTO v_row FROM public.part_import_row r WHERE r.batch_id = p_batch_id AND r.line_no = p_line_no;
  PERFORM public.part_import_refresh_batch_counts(p_batch_id);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_promote(p_batch_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT import_kind INTO v_kind FROM public.part_import_batch WHERE id = p_batch_id;
  IF coalesce(v_kind, 'area') = 'car_specs' THEN
    RETURN public.part_import_promote_car_specs(p_batch_id, p_actor);
  ELSIF coalesce(v_kind, 'area') <> 'area' THEN
    RETURN public.part_import_promote_auto_match(p_batch_id, p_actor);
  END IF;
  RETURN public.part_import_promote_area_parts(p_batch_id, p_actor);
END;
$$;

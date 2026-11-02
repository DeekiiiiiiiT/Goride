-- Parts import pipeline: stage, validate, promote, undo

CREATE OR REPLACE FUNCTION public.part_import_norm_number(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.part_import_next_code(p_area_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_op text;
  v_day text := to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD');
  v_base text;
  v_n int;
BEGIN
  SELECT upper(coalesce(nullif(op_code, ''), substr(replace(id::text, '-', ''), 1, 4)))
  INTO v_op
  FROM public.maintenance_service_categories
  WHERE id = p_area_id;
  v_base := 'IMP-' || v_day || '-' || coalesce(v_op, 'AREA');
  SELECT count(*) + 1 INTO v_n
  FROM public.part_import_batch
  WHERE code LIKE v_base || '%';
  IF v_n <= 1 THEN
    RETURN v_base;
  END IF;
  RETURN v_base || '-' || v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_row_snapshot(
  p_table text,
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_table = 'part_master' THEN
    RETURN (SELECT to_jsonb(pm.*) FROM public.part_master pm WHERE pm.id = p_id);
  ELSIF p_table = 'part_listing' THEN
    RETURN (SELECT to_jsonb(pl.*) FROM public.part_listing pl WHERE pl.id = p_id);
  ELSIF p_table = 'part_interchange_group' THEN
    RETURN (SELECT to_jsonb(g.*) FROM public.part_interchange_group g WHERE g.id = p_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_insert_staged_rows(
  p_batch_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_line int;
BEGIN
  DELETE FROM public.part_import_row WHERE batch_id = p_batch_id;
  FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  LOOP
    v_line := coalesce((v_row->>'line_no')::int, 0);
    IF v_line <= 0 THEN CONTINUE; END IF;
    IF coalesce(v_row->'raw'->>'note', '') = 'EXAMPLE' THEN CONTINUE; END IF;
    INSERT INTO public.part_import_row (batch_id, line_no, raw)
    VALUES (p_batch_id, v_line, coalesce(v_row->'raw', v_row));
  END LOOP;
  UPDATE public.part_import_batch
  SET rows_total = (SELECT count(*) FROM public.part_import_row WHERE batch_id = p_batch_id),
      rows_checked = 0
  WHERE id = p_batch_id;
  RETURN jsonb_build_object('rows', (SELECT count(*) FROM public.part_import_row WHERE batch_id = p_batch_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_validate(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_area uuid;
  v_allowed uuid[];
  r record;
  v_vehicle uuid;
  v_matches int;
  v_part_type uuid;
  v_brand text;
  v_number text;
  v_number_norm text;
  v_match_type text;
  v_existing uuid;
  v_confirmed boolean;
  v_category uuid;
  v_issues jsonb;
  v_status text;
  v_action text;
  v_dup int;
  v_yf int;
  v_yt int;
  v_src text;
  v_valid int := 0;
  v_label int := 0;
  v_err int := 0;
  v_dupc int := 0;
  v_unch int := 0;
BEGIN
  SELECT area_id INTO v_area FROM public.part_import_batch WHERE id = p_batch_id FOR UPDATE;
  IF v_area IS NULL THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  SELECT allowed_part_type_ids INTO v_allowed
  FROM public.part_import_template
  WHERE area_id = v_area AND active IS TRUE
  ORDER BY version DESC
  LIMIT 1;

  FOR r IN SELECT * FROM public.part_import_row WHERE batch_id = p_batch_id ORDER BY line_no
  LOOP
    v_issues := '[]'::jsonb;
    v_status := 'valid';
    v_action := 'create_part';
    v_vehicle := NULL;
    v_part_type := NULL;
    v_existing := NULL;
    v_brand := upper(btrim(coalesce(r.raw->>'brand', r.raw->>'manufacturer', '')));
    v_number := btrim(coalesce(r.raw->>'part_number', ''));
    v_number_norm := public.part_import_norm_number(v_number);
    v_match_type := lower(btrim(coalesce(r.raw->>'match_type', r.raw->>'part_kind', 'oem')));
    IF v_match_type IN ('factory', 'genuine') THEN v_match_type := 'oem'; END IF;
    v_src := btrim(coalesce(r.raw->>'source_url', r.raw->>'evidence_url', ''));

    IF v_brand = '' OR v_number = '' OR v_src = '' OR btrim(coalesce(r.raw->>'vehicle', '')) = ''
       OR btrim(coalesce(r.raw->>'part_type', r.raw->>'job', '')) = '' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'PARAM_MISSING', 'column', 'required', 'message', 'Required cells missing', 'severity', 'error'));
    END IF;

    IF v_match_type NOT IN ('oem', 'sister', 'engine', 'aftermarket', 'universal') THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'MATCH_TYPE_INVALID', 'column', 'match_type', 'message', 'Match type not allowed', 'severity', 'error'));
    END IF;

    IF v_src <> '' AND v_src !~* '^https://' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'SOURCE_INVALID', 'column', 'source_url', 'message', 'Source must be https', 'severity', 'error'));
    END IF;

    -- Vehicle: UUID or exact single match (make/model/chassis/year) — no fuzzy
    IF btrim(coalesce(r.raw->>'vehicle', '')) ~* '^[0-9a-f-]{36}$' THEN
      v_vehicle := btrim(r.raw->>'vehicle')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.vehicle_catalog WHERE id = v_vehicle) THEN
        v_vehicle := NULL;
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'VEHICLE_NOT_FOUND', 'column', 'vehicle', 'message', 'Car not in Vehicle Database', 'severity', 'error'));
      END IF;
    ELSE
      SELECT count(*) INTO v_matches
      FROM public.vehicle_catalog vc
      WHERE lower(vc.make) = lower(split_part(btrim(r.raw->>'vehicle'), ' ', 1))
        AND lower(vc.model) = lower(split_part(btrim(r.raw->>'vehicle'), ' ', 2));
      IF v_matches = 0 THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'VEHICLE_NOT_FOUND', 'column', 'vehicle', 'message', 'Car not in Vehicle Database', 'severity', 'error'));
      ELSIF v_matches > 1 THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'DISAMBIGUATION_REQ', 'column', 'vehicle',
          'message', 'Matches ' || v_matches || ' car versions — use the version id', 'severity', 'error'));
      ELSE
        SELECT vc.id INTO v_vehicle
        FROM public.vehicle_catalog vc
        WHERE lower(vc.make) = lower(split_part(btrim(r.raw->>'vehicle'), ' ', 1))
          AND lower(vc.model) = lower(split_part(btrim(r.raw->>'vehicle'), ' ', 2))
        LIMIT 1;
      END IF;
    END IF;

    SELECT c.id INTO v_part_type
    FROM public.maintenance_service_categories c
    WHERE c.parent_id = v_area
      AND c.is_part IS TRUE
      AND (
        upper(c.op_code) = upper(btrim(coalesce(r.raw->>'part_type', r.raw->>'job', '')))
        OR lower(coalesce(c.plain_name, c.name)) = lower(btrim(coalesce(r.raw->>'part_type', r.raw->>'job', '')))
      )
    LIMIT 1;

    IF v_part_type IS NULL THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'DOMAIN_MISMATCH', 'column', 'part_type', 'message', 'Part type not in this area', 'severity', 'error'));
    ELSIF v_allowed IS NOT NULL AND NOT (v_part_type = ANY (v_allowed)) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'DOMAIN_MISMATCH', 'column', 'part_type', 'message', 'Part type not in this area', 'severity', 'error'));
    END IF;

    v_yf := nullif(btrim(coalesce(r.raw->>'year_from', '')), '')::int;
    v_yt := nullif(btrim(coalesce(r.raw->>'year_to', '')), '')::int;
    IF v_yf IS NULL OR v_yt IS NULL OR v_yf > v_yt THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'YEAR_RANGE_INVALID', 'column', 'year_from', 'message', 'Invalid year range', 'severity', 'error'));
    END IF;

    SELECT pm.id, (pm.catalog_decision = 'confirmed') INTO v_existing, v_confirmed
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = v_brand
      AND pm.oem_part_number_norm = v_number_norm
    LIMIT 1;

    IF v_existing IS NOT NULL AND v_confirmed THEN
      v_action := 'add_fit';
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'DIFFERS_FROM_CONFIRMED', 'column', 'part_name', 'message', 'Differs from confirmed part — fit only', 'severity', 'label'));
    ELSIF v_existing IS NOT NULL THEN
      v_action := 'update_part';
    ELSE
      v_action := 'create_part';
    END IF;

    SELECT count(*) INTO v_dup
    FROM public.part_import_row x
    WHERE x.batch_id = p_batch_id
      AND x.line_no < r.line_no
      AND public.part_import_norm_number(coalesce(x.raw->>'part_number', '')) = v_number_norm
      AND upper(btrim(coalesce(x.raw->>'brand', x.raw->>'manufacturer', ''))) = v_brand
      AND coalesce(x.raw->>'vehicle', '') = coalesce(r.raw->>'vehicle', '')
      AND coalesce(x.raw->>'position', '') = coalesce(r.raw->>'position', '');
    IF v_dup > 0 THEN
      v_status := 'duplicate';
      v_action := 'skip';
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'DUPLICATE', 'column', 'part_number', 'message', 'Duplicate row in file', 'severity', 'duplicate'));
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_issues) elem
      WHERE elem->>'severity' = 'error'
    ) THEN
      v_status := 'error';
      v_action := 'skip';
    ELSIF v_status = 'valid' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_issues) elem WHERE elem->>'severity' = 'label'
    ) THEN
      v_status := 'labelled';
    END IF;

    SELECT pc.id INTO v_category
    FROM public.part_category pc
    WHERE pc.area_id = v_area
    LIMIT 1;

    UPDATE public.part_import_row
    SET normalized = jsonb_build_object(
          'brand', v_brand,
          'number', v_number,
          'number_norm', v_number_norm,
          'match_type', v_match_type,
          'year_from', v_yf,
          'year_to', v_yt,
          'source_url', v_src
        ),
        vehicle_catalog_id = v_vehicle,
        part_type_id = v_part_type,
        existing_part_id = v_existing,
        issues = v_issues,
        status = v_status,
        action = v_action
    WHERE batch_id = p_batch_id AND line_no = r.line_no;

    IF v_status = 'valid' THEN v_valid := v_valid + 1;
    ELSIF v_status = 'labelled' THEN v_label := v_label + 1;
    ELSIF v_status = 'duplicate' THEN v_dupc := v_dupc + 1;
    ELSIF v_status = 'error' THEN v_err := v_err + 1;
    END IF;
  END LOOP;

  UPDATE public.part_import_batch
  SET status = 'checked',
      checked_at = now(),
      rows_valid = v_valid,
      rows_labelled = v_label,
      rows_error = v_err,
      rows_duplicate = v_dupc,
      rows_unchanged = v_unch,
      rows_checked = rows_total
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'valid', v_valid,
    'labelled', v_label,
    'error', v_err,
    'duplicate', v_dupc
  );
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
BEGIN
  SELECT * INTO v_batch FROM public.part_import_batch WHERE id = p_batch_id FOR UPDATE;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_batch.status <> 'checked' THEN RAISE EXCEPTION 'Batch must be checked before import'; END IF;

  v_lock := hashtext('part_import:' || v_batch.area_id::text);
  IF NOT pg_try_advisory_xact_lock(v_lock) THEN
    RAISE EXCEPTION 'Already importing this area';
  END IF;

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

    IF r.action = 'create_part' THEN
      INSERT INTO public.part_interchange_group (code, label, fit_scope, import_batch_id)
      VALUES (
        'IMP-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
        coalesce(r.raw->>'part_name', r.raw->>'part_number'),
        'body',
        p_batch_id
      )
      RETURNING id INTO v_group;

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
        jsonb_build_object('import_labels', r.issues),
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
      v_created_parts := v_created_parts + 1;
    ELSIF r.action = 'update_part' AND v_part IS NOT NULL THEN
      v_before := public.part_import_row_snapshot('part_master', v_part);
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = v_part;
      UPDATE public.part_master pm
      SET name = coalesce(nullif(btrim(r.raw->>'part_name', ''), ''), pm.name),
          evidence_url = coalesce(r.normalized->>'source_url', pm.evidence_url),
          maintenance_component_id = coalesce(r.part_type_id, pm.maintenance_component_id),
          part_kind = coalesce(r.normalized->>'match_type', pm.part_kind),
          catalog_decision = 'pending',
          updated_at = now()
      WHERE id = v_part AND pm.catalog_decision IS DISTINCT FROM 'confirmed';
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      VALUES (
        p_batch_id, r.line_no, 'part_master', v_part, 'update', v_before,
        public.part_import_row_snapshot('part_master', v_part)
      );
      v_updated_parts := v_updated_parts + 1;
    ELSIF r.action = 'add_fit' AND v_part IS NOT NULL THEN
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = v_part;
    END IF;

    IF v_group IS NULL AND v_part IS NOT NULL THEN
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = v_part;
    END IF;

    IF v_group IS NOT NULL AND r.vehicle_catalog_id IS NOT NULL THEN
      SELECT pl.id INTO v_listing
      FROM public.part_listing pl
      WHERE pl.interchange_group_id = v_group
        AND pl.vehicle_catalog_id = r.vehicle_catalog_id
        AND coalesce(pl.position, '') = coalesce(nullif(btrim(r.raw->>'position', ''), ''), '');

      IF v_listing IS NULL THEN
        INSERT INTO public.part_listing (
          interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to, evidence_url, import_batch_id
        ) VALUES (
          v_group,
          r.vehicle_catalog_id,
          nullif(btrim(r.raw->>'position', ''), ''),
          nullif(btrim(r.raw->>'side', ''), ''),
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
            side = coalesce(nullif(btrim(r.raw->>'side', ''), ''), pl.side)
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

CREATE OR REPLACE FUNCTION public.part_import_undo(p_batch_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch record;
  c record;
  v_kept int := 0;
BEGIN
  SELECT * INTO v_batch FROM public.part_import_batch WHERE id = p_batch_id FOR UPDATE;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_batch.status <> 'imported' THEN RAISE EXCEPTION 'Only imported batches can be undone'; END IF;
  IF v_batch.promoted_at IS NULL OR v_batch.promoted_at < now() - interval '72 hours' THEN
    RAISE EXCEPTION 'Rollback window closed';
  END IF;

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
      END IF;
    ELSIF c.op = 'update' AND c.before IS NOT NULL THEN
      IF c.table_name = 'part_master' THEN
        UPDATE public.part_master pm SET
          category_id = (c.before->>'category_id')::uuid,
          name = c.before->>'name',
          evidence_url = c.before->>'evidence_url',
          part_kind = c.before->>'part_kind',
          catalog_decision = c.before->>'catalog_decision',
          maintenance_component_id = nullif(c.before->>'maintenance_component_id', '')::uuid
        WHERE id = c.row_id;
      ELSIF c.table_name = 'part_listing' THEN
        UPDATE public.part_listing pl SET
          year_from = (c.before->>'year_from')::int,
          year_to = (c.before->>'year_to')::int,
          evidence_url = c.before->>'evidence_url',
          position = c.before->>'position',
          side = c.before->>'side'
        WHERE id = c.row_id;
      END IF;
    END IF;
  END LOOP;

  PERFORM public.refresh_variant_parts_readiness();

  UPDATE public.part_import_batch
  SET status = 'undone', undone_at = now(), undone_by = p_actor
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('ok', true, 'partsKept', v_kept);
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_cancel_check(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.part_import_row WHERE batch_id = p_batch_id;
  UPDATE public.part_import_batch
  SET status = 'cancelled', failure_message = 'Check cancelled'
  WHERE id = p_batch_id AND status IN ('uploaded', 'checking', 'checked');
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_norm_number(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_next_code(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_row_snapshot(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_insert_staged_rows(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_validate(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_promote(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_undo(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_cancel_check(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.part_import_norm_number(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_next_code(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_row_snapshot(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_insert_staged_rows(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_validate(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_promote(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_undo(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_cancel_check(uuid) TO service_role;

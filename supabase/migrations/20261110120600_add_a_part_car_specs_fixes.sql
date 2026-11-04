-- Add-a-part Rev 3 fixes for the car_specs import (AP-06)
-- 1. part_import_row refused action 'upsert_catalog_spec', so every car-specs check failed.
-- 2. Bad rows were written with status 'invalid', which part_import_row does not allow; use 'error'.
-- 3. Promote refreshed the readiness view once per row; refresh once at the end.
-- 4. Undo ignored catalog_spec_value, so undoing a car-specs import left every value in place.

ALTER TABLE public.part_import_row DROP CONSTRAINT IF EXISTS part_import_row_action_check;
ALTER TABLE public.part_import_row ADD CONSTRAINT part_import_row_action_check CHECK (
  action IN (
    'create_part', 'update_part', 'add_fit', 'update_fit', 'unchanged', 'skip',
    'upsert_vehicle_oe', 'upsert_part_cross', 'upsert_platform_link', 'upsert_catalog_spec'
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
      v_status := 'error';
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
  END LOOP;

  PERFORM public.refresh_variant_parts_readiness();

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

CREATE OR REPLACE FUNCTION public.part_import_undo(p_batch_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch record;
  c record;
  v_pf jsonb;
  v_kept int := 0;
  r record;
  v_window interval;
BEGIN
  SELECT * INTO v_batch FROM public.part_import_batch WHERE id = p_batch_id FOR UPDATE;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_batch.status <> 'imported' THEN RAISE EXCEPTION 'Only imported batches can be undone'; END IF;

  v_window := CASE WHEN coalesce(v_batch.import_kind, '') = 'self_serve_add' THEN interval '24 hours' ELSE interval '72 hours' END;
  IF v_batch.promoted_at IS NULL OR v_batch.promoted_at < now() - v_window THEN
    RAISE EXCEPTION 'Rollback window closed';
  END IF;

  v_pf := public.part_import_undo_preflight(p_batch_id);
  IF NOT coalesce((v_pf->>'ok')::boolean, false) THEN
    RETURN v_pf;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS part_import_undo_groups (group_id uuid PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS part_import_undo_vehicles (vehicle_id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE part_import_undo_groups;
  TRUNCATE part_import_undo_vehicles;

  INSERT INTO part_import_undo_vehicles (vehicle_id)
  SELECT DISTINCT coalesce(pic.after->>'vehicle_catalog_id', pic.before->>'vehicle_catalog_id')::uuid
  FROM public.part_import_change pic
  WHERE pic.batch_id = p_batch_id
    AND pic.table_name = 'vehicle_oe_number'
    AND coalesce(pic.after->>'vehicle_catalog_id', pic.before->>'vehicle_catalog_id') IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO part_import_undo_groups (group_id)
  SELECT DISTINCT pm.interchange_group_id
  FROM public.part_import_change pic
  JOIN public.part_master pm ON pm.id = coalesce(pic.after->>'part_id', pic.before->>'part_id')::uuid
  WHERE pic.batch_id = p_batch_id
    AND pic.table_name IN ('part_oe_reference', 'part_index_number', 'part_approval')
    AND pm.interchange_group_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO part_import_undo_groups (group_id)
  SELECT DISTINCT pm.interchange_group_id
  FROM public.part_import_change pic
  JOIN public.part_master pm ON pm.id = pic.row_id
  WHERE pic.batch_id = p_batch_id
    AND pic.table_name = 'part_master'
    AND pm.interchange_group_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO part_import_undo_groups (group_id)
  SELECT DISTINCT coalesce(pic.after->>'interchange_group_id', pic.before->>'interchange_group_id')::uuid
  FROM public.part_import_change pic
  WHERE pic.batch_id = p_batch_id
    AND pic.table_name = 'part_listing'
    AND coalesce(pic.after->>'interchange_group_id', pic.before->>'interchange_group_id') IS NOT NULL
  ON CONFLICT DO NOTHING;

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
      ELSIF c.table_name = 'vehicle_oe_number' THEN
        DELETE FROM public.vehicle_oe_number WHERE id = c.row_id;
      ELSIF c.table_name = 'interchange_fitment_rule' THEN
        DELETE FROM public.interchange_fitment_rule WHERE id = c.row_id;
      ELSIF c.table_name IN ('part_oe_reference', 'part_index_number', 'part_approval') THEN
        EXECUTE format('DELETE FROM public.%I WHERE id = $1', c.table_name) USING c.row_id;
      ELSIF c.table_name = 'platform_component_link' THEN
        DELETE FROM public.platform_component_link WHERE id = c.row_id;
      ELSIF c.table_name = 'universal_part' THEN
        DELETE FROM public.universal_part WHERE id = c.row_id;
      ELSIF c.table_name = 'catalog_spec_value' THEN
        DELETE FROM public.catalog_spec_value WHERE id = c.row_id;
      ELSIF c.table_name = 'interchange_group_merge_log' THEN
        IF EXISTS (
          SELECT 1 FROM public.interchange_group_merge_log ml
          JOIN public.part_match_conflict pc ON pc.id = ml.conflict_id
          WHERE ml.id = c.row_id AND pc.status = 'kept'
        ) THEN
          CONTINUE;
        END IF;
        UPDATE public.interchange_group_merge_log m
        SET reversed_at = now()
        WHERE m.id = c.row_id AND m.reversed_at IS NULL;
      END IF;
    ELSIF c.op = 'update' AND c.before IS NOT NULL THEN
      IF c.table_name = 'part_master' THEN
        UPDATE public.part_master pm SET
          category_id = (c.before->>'category_id')::uuid,
          name = c.before->>'name',
          evidence_url = c.before->>'evidence_url',
          part_kind = c.before->>'part_kind',
          catalog_decision = c.before->>'catalog_decision',
          source_type = c.before->>'source_type',
          maintenance_component_id = nullif(c.before->>'maintenance_component_id', '')::uuid,
          metadata = coalesce(c.before->'metadata', pm.metadata)
        WHERE id = c.row_id;
      ELSIF c.table_name = 'part_listing' THEN
        UPDATE public.part_listing pl SET
          year_from = (c.before->>'year_from')::int,
          year_to = (c.before->>'year_to')::int,
          evidence_url = c.before->>'evidence_url',
          position = c.before->>'position',
          side = c.before->>'side'
        WHERE id = c.row_id;
      ELSIF c.table_name = 'vehicle_oe_number' THEN
        UPDATE public.vehicle_oe_number von SET
          year_from = (c.before->>'year_from')::int,
          year_to = (c.before->>'year_to')::int,
          evidence_url = c.before->>'evidence_url',
          oe_brand = c.before->>'oe_brand',
          oe_number = c.before->>'oe_number',
          oe_number_norm = c.before->>'oe_number_norm'
        WHERE id = c.row_id;
      ELSIF c.table_name = 'universal_part' THEN
        UPDATE public.universal_part up SET
          spec_key = c.before->>'spec_key',
          spec_value = c.before->>'spec_value',
          name = c.before->>'name',
          extra = coalesce(c.before->'extra', up.extra),
          evidence_url = c.before->>'evidence_url'
        WHERE id = c.row_id;
      ELSIF c.table_name = 'catalog_spec_value' THEN
        UPDATE public.catalog_spec_value s SET
          value = c.before->>'value',
          year_from = (c.before->>'year_from')::int,
          year_to = (c.before->>'year_to')::int,
          evidence_url = c.before->>'evidence_url',
          verified_by = nullif(c.before->>'verified_by', '')::uuid,
          verified_at = coalesce((c.before->>'verified_at')::timestamptz, s.verified_at)
        WHERE id = c.row_id;
      ELSIF c.table_name IN ('part_oe_reference', 'part_index_number', 'part_approval', 'platform_component_link') THEN
        EXECUTE format(
          'UPDATE public.%I SET evidence_url = $1 WHERE id = $2',
          c.table_name
        ) USING c.before->>'evidence_url', c.row_id;
      END IF;
    END IF;
  END LOOP;

  FOR r IN SELECT g.group_id FROM part_import_undo_groups g LOOP
    PERFORM public.part_match_recompute(r.group_id, NULL);
  END LOOP;
  FOR r IN SELECT v.vehicle_id FROM part_import_undo_vehicles v LOOP
    PERFORM public.part_match_recompute(NULL, r.vehicle_id);
  END LOOP;

  PERFORM public.refresh_variant_parts_readiness();

  UPDATE public.part_import_batch
  SET status = 'undone', undone_at = now(), undone_by = p_actor
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('ok', true, 'partsKept', v_kept);
END;
$$;

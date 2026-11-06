-- part_import_undo: the interchange_fitment_rule branch aliased the table as r, which shadows the
-- record variable r, so undoing a by-engine Add a part failed with 55000 'record "r" is not assigned yet'.
-- Rename the alias to ifr (same fix as 20261107160000 for c). Rest unchanged.

CREATE OR REPLACE FUNCTION public.part_import_undo(p_batch_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    AND pic.table_name IN ('vehicle_oe_number', 'part_listing')
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
        INSERT INTO part_import_undo_vehicles (vehicle_id)
        SELECT DISTINCT pl.vehicle_catalog_id
        FROM public.part_listing pl
        JOIN public.interchange_fitment_rule ifr ON ifr.id = c.row_id
        WHERE pl.interchange_group_id = ifr.interchange_group_id
          AND pl.import_batch_id = p_batch_id
        ON CONFLICT DO NOTHING;
        DELETE FROM public.part_listing pl
        USING public.interchange_fitment_rule ifr
        WHERE ifr.id = c.row_id
          AND pl.interchange_group_id = ifr.interchange_group_id
          AND pl.import_batch_id = p_batch_id;
        DELETE FROM public.interchange_fitment_rule WHERE id = c.row_id;
      ELSIF c.table_name IN ('part_oe_reference', 'part_index_number', 'part_approval') THEN
        EXECUTE format('DELETE FROM public.%I WHERE id = $1', c.table_name) USING c.row_id;
      ELSIF c.table_name = 'platform_component_link' THEN
        DELETE FROM public.platform_component_link WHERE id = c.row_id;
      ELSIF c.table_name = 'universal_part' THEN
        DELETE FROM public.universal_part WHERE id = c.row_id;
      ELSIF c.table_name = 'catalog_spec_value' THEN
        DELETE FROM public.catalog_spec_value WHERE id = c.row_id;
      ELSIF c.table_name = 'part_listing_exclusion' THEN
        DELETE FROM public.part_listing_exclusion WHERE id = c.row_id;
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

  FOR r IN SELECT g.group_id FROM part_import_undo_groups g
  WHERE EXISTS (SELECT 1 FROM public.part_interchange_group ig WHERE ig.id = g.group_id)
  LOOP
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
$function$;

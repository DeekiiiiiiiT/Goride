-- Parts auto-matching Rev 13 closeout (audit X8, X2, X4, status timing)
-- Depends on 20261105120000_parts_auto_match_rev12_audit.sql

CREATE OR REPLACE FUNCTION public.part_match_refresh_derived_status(
  p_group_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_scoped boolean := false;
BEGIN
  BEGIN
    v_scoped := EXISTS (SELECT 1 FROM _pm_scope LIMIT 1);
  EXCEPTION WHEN undefined_table THEN
    v_scoped := false;
  END;
  IF NOT v_scoped THEN
    BEGIN
      v_scoped := EXISTS (SELECT 1 FROM _pm_batch_scope LIMIT 1);
    EXCEPTION WHEN undefined_table THEN
      v_scoped := false;
    END;
  END IF;

  UPDATE public.part_fit_derived d
  SET status = public.part_match_derived_status_for(
    d.interchange_group_id, d.vehicle_catalog_id, d.vehicle_oe_number_id
  )
  WHERE d.status <> 'suppressed'
    AND (
      (NOT v_scoped AND (p_group_id IS NULL OR d.interchange_group_id = p_group_id)
        AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id))
      OR (v_scoped AND EXISTS (
        SELECT 1 FROM _pm_scope sp
        WHERE sp.group_id = d.interchange_group_id AND sp.vehicle_id = d.vehicle_catalog_id
      ))
      OR (v_scoped AND EXISTS (
        SELECT 1 FROM _pm_batch_scope bs
        WHERE bs.group_id = d.interchange_group_id AND bs.vehicle_id = d.vehicle_catalog_id
      ))
    );
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_refresh_derived_status(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_refresh_derived_status(uuid, uuid) TO service_role;




CREATE OR REPLACE FUNCTION public.part_match_recompute_pairs(
  p_group_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL,
  OUT rows_added integer,
  OUT rows_changed integer,
  OUT rows_removed integer,
  OUT rows_scanned integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_engine integer := public.part_match_engine_version();
BEGIN
  rows_added := 0;
  rows_changed := 0;
  rows_removed := 0;
  rows_scanned := 0;

  CREATE TEMP TABLE IF NOT EXISTS _pm_scope (group_id uuid NOT NULL, vehicle_id uuid NOT NULL, PRIMARY KEY (group_id, vehicle_id)) ON COMMIT DROP;
  TRUNCATE _pm_scope;
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _pm_import_batch_id (batch_id uuid) ON COMMIT DROP;
  IF EXISTS (SELECT 1 FROM _pm_batch_scope LIMIT 1) THEN
    INSERT INTO _pm_scope SELECT bs.group_id, bs.vehicle_id FROM _pm_batch_scope bs;
  ELSIF p_group_id IS NOT NULL AND p_vehicle_id IS NOT NULL THEN
    INSERT INTO _pm_scope VALUES (p_group_id, p_vehicle_id);
  ELSIF p_group_id IS NOT NULL THEN
    INSERT INTO _pm_scope
    SELECT DISTINCT p_group_id, von.vehicle_catalog_id
    FROM public.vehicle_oe_number von
    JOIN public.part_match_oe_chain(von.id) ch ON true
    JOIN public.part_match_group_numbers(p_group_id) gn
      ON gn.norm = ch.norm AND gn.brand = ch.brand AND gn.interchange_group_id = p_group_id
    UNION
    SELECT p_group_id, d.vehicle_catalog_id
    FROM public.part_fit_derived d
    WHERE d.interchange_group_id = p_group_id;
  ELSIF p_vehicle_id IS NOT NULL THEN
    INSERT INTO _pm_scope
    SELECT DISTINCT gn.interchange_group_id, p_vehicle_id
    FROM public.vehicle_oe_number von
    JOIN public.part_match_oe_chain(von.id) ch ON true
    JOIN public.part_match_group_numbers(NULL) gn ON gn.norm = ch.norm AND gn.brand = ch.brand
    WHERE von.vehicle_catalog_id = p_vehicle_id
    UNION
    SELECT d.interchange_group_id, p_vehicle_id
    FROM public.part_fit_derived d
    WHERE d.vehicle_catalog_id = p_vehicle_id;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _pm_desired (
    interchange_group_id uuid NOT NULL,
    vehicle_catalog_id uuid NOT NULL,
    position text,
    side text,
    year_from integer,
    year_to integer,
    vehicle_oe_number_id uuid NOT NULL,
    part_oe_reference_ids uuid[] NOT NULL,
    reason_code text NOT NULL,
    reason_params jsonb NOT NULL,
    status text NOT NULL,
    matched_keys text[] NOT NULL,
    rule text NOT NULL DEFAULT 'oe_number'
  ) ON COMMIT DROP;
  TRUNCATE _pm_desired;

  SELECT count(*)::integer INTO rows_scanned FROM _pm_scope;

  INSERT INTO public.part_match_conflict (
    conflict_type, interchange_group_id, vehicle_catalog_id, vehicle_oe_number_id, part_listing_id,
    matched_key, detail, status, engine_version
  )
  SELECT
    'part_type_mismatch',
    gn.interchange_group_id,
    sp.vehicle_id,
    von.id,
    NULL,
    von.oe_number_norm,
    jsonb_build_object(
      'vehicle_oe_number_id', von.id,
      'expected_part_type_id', von.maintenance_component_id,
      'actual_part_type_id', gn.maintenance_component_id
    ),
    'open',
    v_engine
  FROM _pm_scope sp
  JOIN public.vehicle_oe_number von ON von.vehicle_catalog_id = sp.vehicle_id
  JOIN public.part_match_oe_chain(von.id) ch ON true
  JOIN public.part_match_group_numbers(sp.group_id) gn
    ON gn.norm = ch.norm AND gn.brand = ch.brand AND gn.interchange_group_id = sp.group_id
  WHERE von.maintenance_component_id IS DISTINCT FROM gn.maintenance_component_id
    AND NOT EXISTS (
      SELECT 1 FROM public.part_match_conflict c
      WHERE c.conflict_type = 'part_type_mismatch'
        AND c.vehicle_oe_number_id = von.id
        AND c.interchange_group_id = gn.interchange_group_id
        AND c.vehicle_catalog_id = sp.vehicle_id
    );

  INSERT INTO public.part_match_conflict (
    conflict_type, interchange_group_id, vehicle_catalog_id, vehicle_oe_number_id, part_listing_id,
    matched_key, detail, status, engine_version
  )
  SELECT
    'position_side_mismatch',
    pl.interchange_group_id,
    sp.vehicle_id,
    von.id,
    pl.id,
    von.oe_number_norm,
    jsonb_build_object(
      'vehicle_oe_number_id', von.id,
      'part_listing_id', pl.id,
      'expected', jsonb_build_object('position', von.position, 'side', von.side),
      'actual', jsonb_build_object('position', pl.position, 'side', pl.side)
    ),
    'open',
    v_engine
  FROM _pm_scope sp
  JOIN public.vehicle_oe_number von ON von.vehicle_catalog_id = sp.vehicle_id
  JOIN public.part_listing pl
    ON pl.interchange_group_id = sp.group_id AND pl.vehicle_catalog_id = sp.vehicle_id
  JOIN public.part_match_oe_chain(von.id) ch ON true
  JOIN public.part_match_group_numbers(sp.group_id) gn
    ON gn.norm = ch.norm AND gn.brand = ch.brand AND gn.interchange_group_id = sp.group_id
  WHERE NOT public.part_side_covers(pl.position, pl.side, von.position, von.side)
    AND NOT EXISTS (
      SELECT 1 FROM public.part_match_conflict c
      WHERE c.conflict_type = 'position_side_mismatch'
        AND c.part_listing_id = pl.id
        AND c.vehicle_oe_number_id = von.id
        AND c.interchange_group_id = pl.interchange_group_id
        AND c.vehicle_catalog_id = sp.vehicle_id
    );


  INSERT INTO _pm_desired
  SELECT DISTINCT ON (sp.group_id, sp.vehicle_id, von.position, von.side)
    sp.group_id,
    sp.vehicle_id,
    von.position,
    von.side,
    CASE
      WHEN clip.yf IS NOT NULL AND clip.yt IS NOT NULL AND clip.yf > clip.yt THEN NULL
      ELSE clip.yf
    END,
    CASE
      WHEN clip.yf IS NOT NULL AND clip.yt IS NOT NULL AND clip.yf > clip.yt THEN NULL
      ELSE clip.yt
    END,
    von.id,
    gn.part_oe_reference_ids,
    CASE WHEN ch.superseded THEN 'oe_number_superseded' ELSE 'oe_number' END,
    jsonb_build_object(
      'oe_number', von.oe_number,
      'oe_brand', von.oe_brand,
      'vehicle_oe_number_id', von.id,
      'part_oe_reference_ids', gn.part_oe_reference_ids,
      'chain', ch.chain,
      'from', CASE
        WHEN clip.yf IS NOT NULL AND clip.yt IS NOT NULL AND clip.yf > clip.yt THEN NULL
        ELSE clip.yf
      END,
      'to', CASE
        WHEN clip.yf IS NOT NULL AND clip.yt IS NOT NULL AND clip.yf > clip.yt THEN NULL
        ELSE clip.yt
      END
    ),
    'live'::text,
    (ch.chain)[1:6],
    'oe_number'
  FROM _pm_scope sp
  JOIN public.vehicle_oe_number von ON von.vehicle_catalog_id = sp.vehicle_id
  JOIN public.vehicle_catalog vc ON vc.id = sp.vehicle_id
  JOIN public.part_match_oe_chain(von.id) ch ON true
  JOIN public.part_match_group_numbers(sp.group_id) gn
    ON gn.norm = ch.norm AND gn.brand = ch.brand
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN vc.production_start_year IS NOT NULL THEN
          greatest(coalesce(von.year_from, vc.production_start_year), vc.production_start_year)
        ELSE von.year_from
      END AS yf,
      CASE
        WHEN vc.production_end_year IS NOT NULL THEN
          least(coalesce(von.year_to, vc.production_end_year), vc.production_end_year)
        ELSE von.year_to
      END AS yt
  ) clip
  WHERE sp.group_id = gn.interchange_group_id
    AND von.maintenance_component_id = gn.maintenance_component_id
    AND NOT public.part_listing_exclusion_blocks(
      sp.group_id, sp.vehicle_id, von.position, von.side,
      coalesce(vc.production_start_year, von.year_from)
    )
    AND (
      (clip.yf IS NULL AND clip.yt IS NULL)
      OR (clip.yf IS NOT NULL AND clip.yt IS NOT NULL AND clip.yf <= clip.yt)
      OR (clip.yf IS NOT NULL AND clip.yt IS NULL)
      OR (clip.yf IS NULL AND clip.yt IS NOT NULL)
    )
  ORDER BY sp.group_id, sp.vehicle_id, von.position, von.side, von.id;

  WITH merge_run AS (
    MERGE INTO public.part_fit_derived AS tgt
    USING _pm_desired AS src
    ON tgt.interchange_group_id = src.interchange_group_id
     AND tgt.vehicle_catalog_id = src.vehicle_catalog_id
     AND tgt.position IS NOT DISTINCT FROM src.position
     AND tgt.side IS NOT DISTINCT FROM src.side
     AND tgt.rule = src.rule
    WHEN MATCHED AND (
      tgt.engine_version IS DISTINCT FROM v_engine
      OR tgt.year_from IS DISTINCT FROM src.year_from
      OR tgt.year_to IS DISTINCT FROM src.year_to
      OR tgt.matched_keys IS DISTINCT FROM src.matched_keys
      OR tgt.vehicle_oe_number_id IS DISTINCT FROM src.vehicle_oe_number_id
      OR tgt.part_oe_reference_ids IS DISTINCT FROM src.part_oe_reference_ids
      OR tgt.reason_code IS DISTINCT FROM src.reason_code
      OR tgt.reason_params IS DISTINCT FROM src.reason_params
      OR tgt.status IS DISTINCT FROM src.status
      OR (
        EXISTS (SELECT 1 FROM _pm_import_batch_id ib LIMIT 1)
        AND tgt.import_batch_id IS DISTINCT FROM (SELECT ib.batch_id FROM _pm_import_batch_id ib LIMIT 1)
      )
    ) THEN UPDATE SET
      year_from = src.year_from,
      year_to = src.year_to,
      matched_keys = src.matched_keys,
      vehicle_oe_number_id = src.vehicle_oe_number_id,
      part_oe_reference_ids = src.part_oe_reference_ids,
      reason_code = src.reason_code,
      reason_params = src.reason_params,
      status = src.status,
      engine_version = v_engine,
      computed_at = now(),
      import_batch_id = coalesce((SELECT ib.batch_id FROM _pm_import_batch_id ib LIMIT 1), tgt.import_batch_id)
    WHEN NOT MATCHED THEN INSERT (
      interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to, rule,
      matched_keys, vehicle_oe_number_id, part_oe_reference_ids, reason_code, reason_params,
      status, engine_version, computed_at, import_batch_id
    ) VALUES (
      src.interchange_group_id, src.vehicle_catalog_id, src.position, src.side, src.year_from, src.year_to, src.rule,
      src.matched_keys, src.vehicle_oe_number_id, src.part_oe_reference_ids, src.reason_code, src.reason_params,
      src.status, v_engine, now(), (SELECT ib.batch_id FROM _pm_import_batch_id ib LIMIT 1)
    )
    RETURNING (merge_action() = 'INSERT') AS inserted
  )
  SELECT
    count(*) FILTER (WHERE inserted)::integer,
    count(*) FILTER (WHERE NOT inserted)::integer
  INTO rows_added, rows_changed
  FROM merge_run;

  WITH to_remove AS (
    SELECT d.*
    FROM public.part_fit_derived d
    JOIN _pm_scope sp
      ON sp.group_id = d.interchange_group_id AND sp.vehicle_id = d.vehicle_catalog_id
    WHERE NOT EXISTS (
      SELECT 1 FROM _pm_desired x
      WHERE x.interchange_group_id = d.interchange_group_id
        AND x.vehicle_catalog_id = d.vehicle_catalog_id
        AND x.position IS NOT DISTINCT FROM d.position
        AND x.side IS NOT DISTINCT FROM d.side
    )
  ), archived AS (
    INSERT INTO public.part_fit_derived_archive (
      derived_id, interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
      rule, matched_keys, vehicle_oe_number_id, part_oe_reference_ids, reason_code, reason_params,
      status, engine_version, computed_at, checking_note, archive_reason, removal_cause, superseded_by_engine_version
    )
    SELECT
      tr.id, tr.interchange_group_id, tr.vehicle_catalog_id, tr.position, tr.side, tr.year_from, tr.year_to,
      tr.rule, tr.matched_keys, tr.vehicle_oe_number_id, tr.part_oe_reference_ids, tr.reason_code, tr.reason_params,
      tr.status, tr.engine_version, tr.computed_at, tr.checking_note, 'removed', 'scope_removed', v_engine
    FROM to_remove tr
    RETURNING 1
  ), deleted AS (
    DELETE FROM public.part_fit_derived d
    USING to_remove tr
    WHERE d.id = tr.id
    RETURNING 1
  )
  SELECT count(*)::integer INTO rows_removed FROM deleted;

  PERFORM public.part_match_apply_suppression(p_group_id, p_vehicle_id);

END;
$$;



CREATE OR REPLACE FUNCTION public.part_match_recompute(
  p_group_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run_id uuid := gen_random_uuid();
  v_batch_done boolean;
  v_engine integer := public.part_match_engine_version();
  v_log_id uuid;
  v_started timestamptz := clock_timestamp();
  v_kind text := CASE WHEN p_group_id IS NULL AND p_vehicle_id IS NULL THEN 'nightly' ELSE 'scoped' END;
  lock_rec record;
  v_stats record;
  v_group uuid;
  v_last uuid;
  v_batch uuid[];
  v_checkpoint_run uuid;
BEGIN
  PERFORM set_config('part_match.busy', 'on', true);
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  TRUNCATE _pm_batch_scope;

  PERFORM public.part_match_archive_derived_changes(public.part_match_engine_version());

  IF p_group_id IS NULL AND p_vehicle_id IS NULL THEN
    SELECT c.run_id, c.last_group_id INTO v_checkpoint_run, v_last
    FROM public.part_match_recompute_checkpoint c
    WHERE c.finished_at IS NULL
    ORDER BY c.started_at DESC
    LIMIT 1;

    IF v_checkpoint_run IS NULL THEN
      v_checkpoint_run := v_run_id;
      INSERT INTO public.part_match_recompute_checkpoint (run_id, started_at, updated_at)
      VALUES (v_checkpoint_run, v_started, v_started);
    ELSE
      v_run_id := v_checkpoint_run;
    END IF;

    SELECT array_agg(id ORDER BY id) INTO v_batch
    FROM (
      SELECT ig.id
      FROM public.part_interchange_group ig
      WHERE v_last IS NULL OR ig.id > v_last
      ORDER BY ig.id
      LIMIT 500
    ) q;

    IF v_batch IS NULL OR array_length(v_batch, 1) IS NULL THEN
      UPDATE public.part_match_recompute_checkpoint
      SET finished_at = now(), updated_at = now()
      WHERE run_id = v_checkpoint_run;
      INSERT INTO public.part_match_recompute_log (
        run_id, kind, engine_version, started_at, finished_at, duration_ms, rows_scanned
      )
      VALUES (
        v_run_id, v_kind, v_engine, v_started, clock_timestamp(),
        (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer, 0
      );
      PERFORM set_config('part_match.busy', 'off', true);
      RETURN;
    END IF;

    INSERT INTO _pm_batch_scope (group_id, vehicle_id)
    SELECT DISTINCT sp.gid, sp.vid
    FROM unnest(v_batch) AS u(gid)
    CROSS JOIN LATERAL (
      SELECT von.vehicle_catalog_id AS vid
      FROM public.vehicle_oe_number von
      JOIN public.part_match_oe_chain(von.id) ch ON true
      JOIN public.part_match_group_numbers(u.gid) gn
        ON gn.norm = ch.norm AND gn.brand = ch.brand AND gn.interchange_group_id = u.gid
      UNION
      SELECT d.vehicle_catalog_id
      FROM public.part_fit_derived d
      WHERE d.interchange_group_id = u.gid
    ) sp;

    FOR lock_rec IN
      SELECT bs.group_id, bs.vehicle_id FROM _pm_batch_scope bs ORDER BY bs.group_id, bs.vehicle_id
    LOOP
      PERFORM pg_advisory_xact_lock(
        hashtext('part_match:' || lock_rec.group_id::text || ':' || lock_rec.vehicle_id::text)
      );
    END LOOP;

    SELECT * INTO v_stats FROM public.part_match_recompute_pairs(NULL, NULL);
    PERFORM public.part_match_index_rules(NULL);

    UPDATE public.part_match_recompute_checkpoint
    SET last_group_id = v_batch[array_length(v_batch, 1)], updated_at = now()
    WHERE run_id = v_checkpoint_run;

    SELECT NOT EXISTS (
      SELECT 1 FROM public.part_interchange_group ig
      WHERE ig.id > v_batch[array_length(v_batch, 1)]
    ) INTO v_batch_done;
    IF v_batch_done THEN
      UPDATE public.part_match_recompute_checkpoint
      SET finished_at = now(), updated_at = now()
      WHERE run_id = v_checkpoint_run;
    END IF;

    INSERT INTO public.part_match_recompute_log (
      run_id, kind, engine_version, started_at, finished_at, duration_ms, rows_scanned,
      rows_added, rows_changed, rows_removed
    )
    VALUES (
      v_run_id, v_kind, v_engine, v_started, clock_timestamp(),
      (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer,
      coalesce(v_stats.rows_scanned, array_length(v_batch, 1)),
      coalesce(v_stats.rows_added, 0),
      coalesce(v_stats.rows_changed, 0),
      coalesce(v_stats.rows_removed, 0)
    );
    PERFORM public.part_match_sync_conflicts(NULL, NULL);
    PERFORM public.part_match_refresh_derived_status(p_group_id, p_vehicle_id);
    PERFORM public.part_match_apply_suppression(p_group_id, p_vehicle_id);
    TRUNCATE _pm_batch_scope;
    PERFORM set_config('part_match.busy', 'off', true);
    RETURN;
  END IF;

  FOR lock_rec IN
    SELECT sp.group_id, sp.vehicle_id
    FROM (
      SELECT p_group_id AS group_id, p_vehicle_id AS vehicle_id
      WHERE p_group_id IS NOT NULL AND p_vehicle_id IS NOT NULL
      UNION ALL
      SELECT p_group_id, d.vehicle_catalog_id
      FROM public.part_fit_derived d
      WHERE p_group_id IS NOT NULL AND p_vehicle_id IS NULL
      UNION ALL
      SELECT gn.interchange_group_id, p_vehicle_id
      FROM public.vehicle_oe_number von
      JOIN public.part_match_oe_chain(von.id) ch ON true
      JOIN public.part_match_group_numbers(NULL) gn ON gn.norm = ch.norm AND gn.brand = ch.brand
      WHERE p_vehicle_id IS NOT NULL AND p_group_id IS NULL
    ) sp
    WHERE sp.group_id IS NOT NULL AND sp.vehicle_id IS NOT NULL
    ORDER BY sp.group_id, sp.vehicle_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('part_match:' || lock_rec.group_id::text || ':' || lock_rec.vehicle_id::text)
    );
  END LOOP;

  INSERT INTO public.part_match_recompute_log (
    run_id, kind, scope_group_id, scope_vehicle_id, engine_version, started_at
  )
  VALUES (v_run_id, v_kind, p_group_id, p_vehicle_id, v_engine, v_started)
  RETURNING id INTO v_log_id;

  BEGIN
    SELECT * INTO v_stats FROM public.part_match_recompute_pairs(p_group_id, p_vehicle_id);
    PERFORM public.part_match_index_rules(p_group_id);
    PERFORM public.part_match_sync_conflicts(p_group_id, p_vehicle_id);
    PERFORM public.part_match_refresh_derived_status(p_group_id, p_vehicle_id);
    PERFORM public.part_match_apply_suppression(p_group_id, p_vehicle_id);

    UPDATE public.part_match_recompute_log
    SET finished_at = clock_timestamp(),
        duration_ms = (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer,
        rows_added = v_stats.rows_added,
        rows_changed = v_stats.rows_changed,
        rows_removed = v_stats.rows_removed,
        rows_scanned = v_stats.rows_scanned
    WHERE id = v_log_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('part_match.busy', 'off', true);
    UPDATE public.part_match_recompute_log
    SET finished_at = clock_timestamp(),
        error = SQLERRM,
        duration_ms = (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer
    WHERE id = v_log_id;
    RAISE;
  END;
  PERFORM set_config('part_match.busy', 'off', true);
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
BEGIN
  SELECT * INTO v_batch FROM public.part_import_batch WHERE id = p_batch_id FOR UPDATE;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_batch.status <> 'imported' THEN RAISE EXCEPTION 'Only imported batches can be undone'; END IF;
  IF v_batch.promoted_at IS NULL OR v_batch.promoted_at < now() - interval '72 hours' THEN
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
  SELECT DISTINCT coalesce(c.after->>'vehicle_catalog_id', c.before->>'vehicle_catalog_id')::uuid
  FROM public.part_import_change c
  WHERE c.batch_id = p_batch_id
    AND c.table_name = 'vehicle_oe_number'
    AND coalesce(c.after->>'vehicle_catalog_id', c.before->>'vehicle_catalog_id') IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO part_import_undo_groups (group_id)
  SELECT DISTINCT pm.interchange_group_id
  FROM public.part_import_change c
  JOIN public.part_master pm ON pm.id = coalesce(c.after->>'part_id', c.before->>'part_id')::uuid
  WHERE c.batch_id = p_batch_id
    AND c.table_name IN ('part_oe_reference', 'part_index_number', 'part_approval')
    AND pm.interchange_group_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO part_import_undo_groups (group_id)
  SELECT DISTINCT pm.interchange_group_id
  FROM public.part_import_change c
  JOIN public.part_master pm ON pm.id = c.row_id
  WHERE c.batch_id = p_batch_id
    AND c.table_name = 'part_master'
    AND pm.interchange_group_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO part_import_undo_groups (group_id)
  SELECT DISTINCT coalesce(c.after->>'interchange_group_id', c.before->>'interchange_group_id')::uuid
  FROM public.part_import_change c
  WHERE c.batch_id = p_batch_id
    AND c.table_name = 'part_listing'
    AND coalesce(c.after->>'interchange_group_id', c.before->>'interchange_group_id') IS NOT NULL
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
      ELSIF c.table_name IN ('part_oe_reference', 'part_index_number', 'part_approval') THEN
        EXECUTE format('DELETE FROM public.%I WHERE id = $1', c.table_name) USING c.row_id;
      ELSIF c.table_name = 'platform_component_link' THEN
        DELETE FROM public.platform_component_link WHERE id = c.row_id;
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

DROP MATERIALIZED VIEW IF EXISTS public.variant_parts_readiness;

CREATE MATERIALIZED VIEW public.variant_parts_readiness AS
 WITH core AS (
         SELECT v.op_code
           FROM ( VALUES ('ENG-OIL'::text), ('ENG-SPARK'::text), ('ENG-THERM'::text), ('FILT-AIR'::text), ('HVAC-CABIN'::text), ('BRK-PADS'::text), ('BELT-SERP'::text), ('LGT-WIPER'::text), ('BRK-ROTOR'::text), ('SUS-SHOCK'::text)) v(op_code)
        ), comp AS (
         SELECT c.id,
            c.op_code
           FROM public.maintenance_service_categories c
             JOIN core ON core.op_code = c.op_code
        ), na AS (
         SELECT DISTINCT ON (vc.id, comp.op_code) vc.id AS variant_id,
            comp.op_code,
            a.applicable
           FROM public.vehicle_catalog vc
             CROSS JOIN comp
             JOIN public.catalog_component_applicability a ON a.component_id = comp.id
             LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
          WHERE a.scope = 'variant'::text AND a.vehicle_catalog_id = vc.id OR a.scope = 'platform'::text AND (a.platform_id = vc.platform_id OR a.platform_id = mine.parent_id) OR a.scope = 'engine_family'::text AND a.engine_family_id = vc.engine_family_id
          ORDER BY vc.id, comp.op_code, (
                CASE a.scope
                    WHEN 'variant'::text THEN 1
                    WHEN 'platform'::text THEN 2
                    ELSE 3
                END)
        ), spec_hit AS (
         SELECT DISTINCT vc.id AS variant_id,
            c.op_code
           FROM public.vehicle_catalog vc
             JOIN public.catalog_spec_value sv ON true
             JOIN public.spec_key sk ON sk.key = sv.spec_key
             JOIN public.maintenance_service_categories c ON c.id = sk.component_id
             JOIN core ON core.op_code = c.op_code
             LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
          WHERE COALESCE(btrim(sv.evidence_url), ''::text) <> ''::text AND COALESCE(btrim(sv.value), ''::text) <> ''::text AND (sv.scope = 'variant'::text AND sv.vehicle_catalog_id = vc.id OR sv.scope = 'platform'::text AND (sv.platform_id = vc.platform_id OR sv.platform_id = mine.parent_id) OR sv.scope = 'engine_family'::text AND sv.engine_family_id = vc.engine_family_id)
        ), hits AS (
         SELECT vc.id AS variant_id,
            comp.op_code,
            bool_or(pm.catalog_decision = 'confirmed'::text AND p.tier >= 1 AND p.tier <= 3) OR bool_or(sh.op_code IS NOT NULL) AS verified,
            bool_or(p.part_id IS NOT NULL AND pm.catalog_decision IS DISTINCT FROM 'rejected'::text AND p.tier >= 1 AND p.tier <= 3) AS any_part,
            bool_or(na.applicable = false) AS not_applicable
           FROM public.vehicle_catalog vc
             CROSS JOIN comp
             LEFT JOIN LATERAL public.parts_for_vehicle(vc.id, comp.id, NULL::integer) p ON true
             LEFT JOIN public.part_master pm ON pm.id = p.part_id
             LEFT JOIN na ON na.variant_id = vc.id AND na.op_code = comp.op_code
             LEFT JOIN spec_hit sh ON sh.variant_id = vc.id AND sh.op_code = comp.op_code
          GROUP BY vc.id, comp.op_code
        ), rolled AS (
         SELECT hits.variant_id,
            count(*) FILTER (WHERE hits.verified OR hits.not_applicable)::integer AS components_ready,
            jsonb_object_agg(hits.op_code,
                CASE
                    WHEN hits.verified THEN 'verified'::text
                    WHEN hits.not_applicable THEN 'not_applicable'::text
                    WHEN hits.any_part THEN 'unverified'::text
                    ELSE 'missing'::text
                END) AS cells
           FROM hits
          GROUP BY hits.variant_id
        )
 SELECT variant_id,
    components_ready,
    components_ready = (( SELECT count(*) AS count
           FROM core)) AS ready,
    cells
   FROM rolled;

CREATE UNIQUE INDEX variant_parts_readiness_variant_id ON public.variant_parts_readiness USING btree (variant_id);
REVOKE ALL ON TABLE public.variant_parts_readiness FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.variant_parts_readiness TO service_role;

REFRESH MATERIALIZED VIEW public.variant_parts_readiness;


-- part_match_recompute: nightly batch scope uses u.gid from unnest(v_batch)
-- Depends on 20261107200000_part_match_sync_conflicts_manual_note.sql

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
  DELETE FROM _pm_batch_scope;

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
      CREATE TEMP TABLE IF NOT EXISTS _pm_scope (group_id uuid NOT NULL, vehicle_id uuid NOT NULL, PRIMARY KEY (group_id, vehicle_id)) ON COMMIT DROP;
      DELETE FROM _pm_scope;
      PERFORM set_config('part_match.busy', 'off', true);
      RETURN;
    END IF;

    INSERT INTO _pm_batch_scope (group_id, vehicle_id)
    SELECT DISTINCT u.gid, sp.vid
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
    DELETE FROM _pm_batch_scope;
    CREATE TEMP TABLE IF NOT EXISTS _pm_scope (group_id uuid NOT NULL, vehicle_id uuid NOT NULL, PRIMARY KEY (group_id, vehicle_id)) ON COMMIT DROP;
    DELETE FROM _pm_scope;
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
    CREATE TEMP TABLE IF NOT EXISTS _pm_scope (group_id uuid NOT NULL, vehicle_id uuid NOT NULL, PRIMARY KEY (group_id, vehicle_id)) ON COMMIT DROP;
    DELETE FROM _pm_scope;
    PERFORM set_config('part_match.busy', 'off', true);
    UPDATE public.part_match_recompute_log
    SET finished_at = clock_timestamp(),
        error = SQLERRM,
        duration_ms = (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer
    WHERE id = v_log_id;
    RAISE;
  END;
  CREATE TEMP TABLE IF NOT EXISTS _pm_scope (group_id uuid NOT NULL, vehicle_id uuid NOT NULL, PRIMARY KEY (group_id, vehicle_id)) ON COMMIT DROP;
  DELETE FROM _pm_scope;
  PERFORM set_config('part_match.busy', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_recompute(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_recompute(uuid, uuid) TO service_role;


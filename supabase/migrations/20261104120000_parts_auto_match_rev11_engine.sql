-- Parts auto-matching audit Rev 11 (database engine fixes)
-- New migration only; do not edit M / R10 / import templates.


CREATE OR REPLACE FUNCTION public.part_match_derived_status_for(
  p_group_id uuid,
  p_vehicle_id uuid,
  p_von_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.part_match_conflict c
      WHERE c.status = 'open'
        AND c.vehicle_catalog_id = p_vehicle_id
        AND (
          (c.interchange_group_id = p_group_id AND c.conflict_type IN (
            'oe_ambiguous', 'part_type_mismatch', 'position_side_mismatch'
          ))
          OR (
            c.conflict_type = 'oe_ambiguous'
            AND c.detail ? 'group_ids'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(c.detail->'group_ids') gid
              WHERE gid::uuid = p_group_id
            )
          )
        )
        AND (p_von_id IS NULL OR c.vehicle_oe_number_id IS NULL OR c.vehicle_oe_number_id = p_von_id)
    ) THEN 'needs_checking'
    ELSE 'live'
  END;
$$;


CREATE OR REPLACE FUNCTION public.part_match_apply_suppression(
  p_group_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer := 0;
  v_extra integer := 0;
  v_scoped boolean := false;
BEGIN
  BEGIN
    v_scoped := EXISTS (SELECT 1 FROM _pm_scope LIMIT 1);
  EXCEPTION WHEN undefined_table THEN
    v_scoped := false;
  END;

  WITH upd AS (
    UPDATE public.part_fit_derived d
    SET status = 'suppressed'
    WHERE d.status <> 'suppressed'
      AND (
        (NOT v_scoped AND (p_group_id IS NULL OR d.interchange_group_id = p_group_id)
          AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id))
        OR (v_scoped AND EXISTS (
          SELECT 1 FROM _pm_scope sp
          WHERE sp.group_id = d.interchange_group_id AND sp.vehicle_id = d.vehicle_catalog_id
        ))
      )
      AND EXISTS (
        SELECT 1
        FROM public.part_listing pl
        WHERE pl.interchange_group_id = d.interchange_group_id
          AND pl.vehicle_catalog_id = d.vehicle_catalog_id
          AND public.part_side_covers(pl.position, pl.side, d.position, d.side)
      )
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM upd;

  WITH upd2 AS (
    UPDATE public.part_fit_derived d
    SET status = public.part_match_derived_status_for(
      d.interchange_group_id, d.vehicle_catalog_id, d.vehicle_oe_number_id
    )
    WHERE d.status = 'suppressed'
      AND (
        (NOT v_scoped AND (p_group_id IS NULL OR d.interchange_group_id = p_group_id)
          AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id))
        OR (v_scoped AND EXISTS (
          SELECT 1 FROM _pm_scope sp
          WHERE sp.group_id = d.interchange_group_id AND sp.vehicle_id = d.vehicle_catalog_id
        ))
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.part_listing pl
        WHERE pl.interchange_group_id = d.interchange_group_id
          AND pl.vehicle_catalog_id = d.vehicle_catalog_id
          AND public.part_side_covers(pl.position, pl.side, d.position, d.side)
      )
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_extra FROM upd2;

  RETURN v_count + v_extra;
END;
$$;


CREATE OR REPLACE FUNCTION public.part_match_index_rules(
  p_group_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  WITH pairs AS (
    SELECT
      pin.id AS index_id,
      pin.part_id,
      pin2.part_id AS matched_part_id,
      pin.index_type,
      pin.value_norm,
      pin.wear_sensor AS sensor_a,
      pin2.wear_sensor AS sensor_b,
      pm.interchange_group_id AS from_group,
      pm2.interchange_group_id AS to_group
    FROM public.part_index_number pin
    JOIN public.part_master pm ON pm.id = pin.part_id
    JOIN public.part_index_number pin2
      ON pin2.index_type = pin.index_type
     AND pin2.value_norm = pin.value_norm
     AND pin2.part_id <> pin.part_id
    JOIN public.part_master pm2 ON pm2.id = pin2.part_id
    WHERE pin.part_id < pin2.part_id
      AND pm.interchange_group_id IS DISTINCT FROM pm2.interchange_group_id
      AND pm.interchange_group_id IS NOT NULL
      AND pm2.interchange_group_id IS NOT NULL
      AND (p_group_id IS NULL OR pm.interchange_group_id = p_group_id OR pm2.interchange_group_id = p_group_id)
  ),
  wear_conflicts AS (
    INSERT INTO public.part_match_conflict (
      conflict_type, part_id, interchange_group_id, matched_key, detail, status, engine_version
    )
    SELECT
      'index_wear_sensor',
      p.part_id,
      p.from_group,
      p.index_type || ':' || p.value_norm,
      jsonb_build_object(
        'index_type', p.index_type,
        'value', p.value_norm,
        'part_a_id', p.part_id,
        'sensor_a', p.sensor_a,
        'part_b_id', p.matched_part_id,
        'sensor_b', p.sensor_b
      ),
      'open',
      public.part_match_engine_version()
    FROM pairs p
    WHERE p.sensor_a IS DISTINCT FROM p.sensor_b
      AND NOT EXISTS (
        SELECT 1 FROM public.part_match_conflict c
        WHERE c.conflict_type = 'index_wear_sensor'
          AND c.part_id = p.part_id
          AND c.matched_key = p.index_type || ':' || p.value_norm
      )
    ON CONFLICT DO NOTHING
    RETURNING 1
  ),
  merge_pairs AS (
    SELECT p.*
    FROM pairs p
    WHERE p.sensor_a IS NOT DISTINCT FROM p.sensor_b
      AND NOT EXISTS (
        SELECT 1 FROM public.part_match_conflict c
        WHERE c.conflict_type = 'index_merge_proposed'
          AND c.part_id = p.part_id
          AND c.matched_key = p.index_type || ':' || p.value_norm
          AND c.status = 'removed'
      )
  ),
  group_busy AS (
    SELECT ig.id AS group_id,
      (
        EXISTS (SELECT 1 FROM public.part_listing pl WHERE pl.interchange_group_id = ig.id)
        OR EXISTS (SELECT 1 FROM public.part_fit_derived d WHERE d.interchange_group_id = ig.id)
      ) AS busy
    FROM public.part_interchange_group ig
    WHERE ig.id IN (SELECT from_group FROM merge_pairs UNION SELECT to_group FROM merge_pairs)
  ),
  merge_proposals AS (
    INSERT INTO public.part_match_conflict (
      conflict_type, part_id, interchange_group_id, matched_key, detail, status, engine_version
    )
    SELECT
      'index_merge_proposed',
      mp.part_id,
      mp.from_group,
      mp.index_type || ':' || mp.value_norm,
      jsonb_build_object(
        'index_type', mp.index_type,
        'value', mp.value_norm,
        'moving_part_id', mp.part_id,
        'source_group_id', mp.from_group,
        'target_group_id', mp.to_group
      ),
      'open',
      public.part_match_engine_version()
    FROM merge_pairs mp
    WHERE EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.from_group AND gb.busy)
      AND EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.to_group AND gb.busy)
    ON CONFLICT DO NOTHING
    RETURNING 1
  ),
  empty_merges AS (
    SELECT DISTINCT ON (least(mp.from_group, mp.to_group), greatest(mp.from_group, mp.to_group), mp.index_type, mp.value_norm)
      mp.index_id,
      mp.index_type,
      mp.value_norm,
      ig_target.id AS target_group,
      CASE WHEN ig_target.id = mp.from_group THEN mp.matched_part_id ELSE mp.part_id END AS moving_part_id,
      CASE WHEN ig_target.id = mp.from_group THEN mp.to_group ELSE mp.from_group END AS source_group
    FROM merge_pairs mp
    JOIN group_busy gb_from ON gb_from.group_id = mp.from_group AND NOT gb_from.busy
    JOIN group_busy gb_to ON gb_to.group_id = mp.to_group AND NOT gb_to.busy
    CROSS JOIN LATERAL (
      SELECT ig.id
      FROM public.part_interchange_group ig
      WHERE ig.id IN (mp.from_group, mp.to_group)
      ORDER BY ig.created_at NULLS LAST, ig.id
      LIMIT 1
    ) ig_target
    ORDER BY least(mp.from_group, mp.to_group), greatest(mp.from_group, mp.to_group), mp.index_type, mp.value_norm, mp.part_id
  ),
  moved AS (
    UPDATE public.part_master pm
    SET interchange_group_id = em.target_group
    FROM empty_merges em
    WHERE pm.id = em.moving_part_id
      AND pm.interchange_group_id IS DISTINCT FROM em.target_group
    RETURNING pm.id, em.source_group, em.target_group, em.index_type, em.value_norm, em.index_id
  )
  INSERT INTO public.interchange_group_merge_log (
    part_id, from_group, to_group, rule, matched_key, index_number_id
  )
  SELECT
    em.moving_part_id,
    em.source_group,
    em.target_group,
    'index',
    em.index_type || ':' || em.value_norm,
    em.index_id
  FROM empty_merges em
  WHERE em.source_group IS DISTINCT FROM em.target_group
    AND EXISTS (SELECT 1 FROM moved m WHERE m.id = em.moving_part_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.interchange_group_merge_log l
      WHERE l.part_id = em.moving_part_id AND l.to_group = em.target_group AND l.reversed_at IS NULL
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.part_match_archive_derived_changes(
  p_new_engine_version integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.part_fit_derived_archive (
    derived_id, interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    rule, matched_keys, vehicle_oe_number_id, part_oe_reference_ids, reason_code, reason_params,
    status, engine_version, computed_at, checking_note, archive_reason, superseded_by_engine_version
  )
  SELECT
    d.id, d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
    d.rule, d.matched_keys, d.vehicle_oe_number_id, d.part_oe_reference_ids, d.reason_code, d.reason_params,
    d.status, d.engine_version, d.computed_at, d.checking_note, 'changed', p_new_engine_version
  FROM public.part_fit_derived d
  WHERE d.engine_version IS DISTINCT FROM p_new_engine_version;
END;
$$;

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
    public.part_match_derived_status_for(sp.group_id, sp.vehicle_id, von.id),
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
    AND NOT EXISTS (
      SELECT 1 FROM public.part_listing pl
      WHERE pl.interchange_group_id = sp.group_id
        AND pl.vehicle_catalog_id = sp.vehicle_id
        AND NOT public.part_side_covers(pl.position, pl.side, von.position, von.side)
    )
    AND (
      (clip.yf IS NULL AND clip.yt IS NULL)
      OR (clip.yf IS NOT NULL AND clip.yt IS NOT NULL AND clip.yf <= clip.yt)
      OR (clip.yf IS NOT NULL AND clip.yt IS NULL)
      OR (clip.yf IS NULL AND clip.yt IS NOT NULL)
    )
  ORDER BY sp.group_id, sp.vehicle_id, von.position, von.side, von.id;

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
      status, engine_version, computed_at, checking_note, archive_reason, superseded_by_engine_version
    )
    SELECT
      tr.id, tr.interchange_group_id, tr.vehicle_catalog_id, tr.position, tr.side, tr.year_from, tr.year_to,
      tr.rule, tr.matched_keys, tr.vehicle_oe_number_id, tr.part_oe_reference_ids, tr.reason_code, tr.reason_params,
      tr.status, tr.engine_version, tr.computed_at, tr.checking_note, 'removed', v_engine
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
    FOREACH v_group IN ARRAY v_batch LOOP
      PERFORM public.part_match_index_rules(v_group);
    END LOOP;

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
      run_id, kind, engine_version, started_at, finished_at, duration_ms, rows_scanned
    )
    VALUES (
      v_run_id, v_kind, v_engine, v_started, clock_timestamp(),
      (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer,
      coalesce(array_length(v_batch, 1), 0)
    );
    PERFORM public.part_match_sync_conflicts(NULL, NULL);
    RETURN;
  END IF;

  FOR lock_rec IN
    SELECT sp.group_id, sp.vehicle_id
    FROM (
      SELECT p_group_id AS group_id, p_vehicle_id AS vehicle_id
      WHERE p_group_id IS NOT NULL AND p_vehicle_id IS NOT NULL
      UNION ALL
      SELECT p_group_id, von.vehicle_catalog_id
      FROM public.vehicle_oe_number von
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

    UPDATE public.part_match_recompute_log
    SET finished_at = clock_timestamp(),
        duration_ms = (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer,
        rows_added = v_stats.rows_added,
        rows_changed = v_stats.rows_changed,
        rows_removed = v_stats.rows_removed,
        rows_scanned = v_stats.rows_scanned
    WHERE id = v_log_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.part_match_recompute_log
    SET finished_at = clock_timestamp(),
        error = SQLERRM,
        duration_ms = (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer
    WHERE id = v_log_id;
    RAISE;
  END;
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
          SELECT 1 FROM public.part_match_conflict pc WHERE pc.status = 'kept'
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


CREATE OR REPLACE FUNCTION public.part_match_conflict_keep(
  p_conflict_id uuid,
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.part_match_conflict%ROWTYPE;
  v_derived uuid;
  v_other uuid;
  v_group uuid;
  v_manual boolean;
  v_kept_code text;
  v_other_code text;
BEGIN
  SELECT * INTO c FROM public.part_match_conflict WHERE id = p_conflict_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'open' THEN RAISE EXCEPTION 'Conflict not open'; END IF;

  IF c.conflict_type IN ('oe_ambiguous', 'index_merge_proposed', 'system_link')
     AND nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Resolution note is required for this conflict type';
  END IF;

  IF c.conflict_type = 'index_merge_proposed' THEN
    UPDATE public.part_master pm
    SET interchange_group_id = (c.detail->>'target_group_id')::uuid
    WHERE pm.id = (c.detail->>'moving_part_id')::uuid;
    INSERT INTO public.interchange_group_merge_log (
      part_id, from_group, to_group, rule, matched_key, conflict_id, created_by
    ) VALUES (
      (c.detail->>'moving_part_id')::uuid,
      (c.detail->>'source_group_id')::uuid,
      (c.detail->>'target_group_id')::uuid,
      'index', c.matched_key, c.id, p_actor
    );
  ELSE
    v_group := c.interchange_group_id;
    SELECT ig.code INTO v_kept_code
    FROM public.part_interchange_group ig
    WHERE ig.id = v_group;
    SELECT d.id INTO v_derived
    FROM public.part_fit_derived d
    WHERE d.interchange_group_id = v_group
      AND d.vehicle_catalog_id = c.vehicle_catalog_id
    ORDER BY d.computed_at DESC
    LIMIT 1;
    IF v_derived IS NOT NULL THEN
      INSERT INTO public.part_listing (
        interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
        evidence_url, origin, derived_fit_id, verified_by
      )
      SELECT
        d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
        von.evidence_url,
        'auto_match_kept', d.id, p_actor
      FROM public.part_fit_derived d
      LEFT JOIN public.vehicle_oe_number von ON von.id = d.vehicle_oe_number_id
      WHERE d.id = v_derived
      ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side) DO UPDATE
        SET origin = EXCLUDED.origin,
            derived_fit_id = EXCLUDED.derived_fit_id
        WHERE public.part_listing.origin IS DISTINCT FROM 'manual';
    END IF;

    IF c.conflict_type = 'oe_ambiguous' AND c.detail ? 'group_ids' THEN
      FOR v_other IN
        SELECT value::uuid FROM jsonb_array_elements_text(c.detail->'group_ids') AS value
      LOOP
        IF v_other = v_group THEN CONTINUE; END IF;
        SELECT EXISTS (
          SELECT 1 FROM public.part_listing pl
          WHERE pl.interchange_group_id = v_other
            AND pl.vehicle_catalog_id = c.vehicle_catalog_id
            AND pl.origin IN ('manual', 'import')
        ) INTO v_manual;
        SELECT ig.code INTO v_other_code
        FROM public.part_interchange_group ig
        WHERE ig.id = v_other;
        IF v_manual THEN
          UPDATE public.part_match_conflict oc
          SET status = 'superseded',
              resolution_note = format(
                'Manual fit exists on %s; both kept',
                coalesce(v_other_code, v_other::text)
              ),
              resolved_at = now(), resolved_by = p_actor
          WHERE oc.status = 'open' AND oc.conflict_type = 'oe_ambiguous'
            AND oc.interchange_group_id = v_other
            AND oc.vehicle_catalog_id = c.vehicle_catalog_id
            AND oc.vehicle_oe_number_id IS NOT DISTINCT FROM c.vehicle_oe_number_id;
        ELSE
          INSERT INTO public.part_listing_exclusion (
            interchange_group_id, vehicle_catalog_id, reason, evidence_url, source, created_by
          ) VALUES (
            v_other,
            c.vehicle_catalog_id,
            coalesce(p_note, format('Resolved by keeping %s', coalesce(v_kept_code, v_group::text))),
            NULL,
            'auto_match_removed',
            p_actor
          )
          ON CONFLICT DO NOTHING;
          UPDATE public.part_match_conflict oc
          SET status = 'removed',
              resolution_note = format(
                'Resolved by keeping %s',
                coalesce(v_kept_code, v_group::text)
              ),
              resolved_at = now(), resolved_by = p_actor
          WHERE oc.status = 'open' AND oc.conflict_type = 'oe_ambiguous'
            AND oc.interchange_group_id = v_other
            AND oc.vehicle_catalog_id = c.vehicle_catalog_id
            AND oc.vehicle_oe_number_id IS NOT DISTINCT FROM c.vehicle_oe_number_id;
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.part_match_conflict
  SET status = 'kept', resolution_note = p_note, resolved_by = p_actor, resolved_at = now()
  WHERE id = p_conflict_id;
END;
$$;


DROP MATERIALIZED VIEW IF EXISTS public.variant_parts_readiness;

DROP FUNCTION IF EXISTS public.parts_for_vehicle(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.parts_for_vehicle(
  p_catalog_id uuid,
  p_component_id uuid DEFAULT NULL,
  p_vehicle_year integer DEFAULT NULL
)
RETURNS TABLE (
  tier integer,
  part_id uuid,
  part_name text,
  oem_part_number text,
  manufacturer text,
  part_kind text,
  fit_scope text,
  rule_source text,
  "position" text,
  interchange_group_id uuid,
  maintenance_component_id uuid,
  category_id uuid,
  sister_names text,
  source_make text,
  reference_oem text,
  reference_manufacturer text,
  also_known_as text[],
  confirmed_installs integer,
  description text,
  evidence_url text,
  match_reason_code text,
  match_reason_params jsonb,
  match_status text,
  fit_source text,
  via text,
  part_badge_code text,
  part_badge_params jsonb,
  derived_id uuid,
  side text,
  wva text,
  checking_note text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH cat AS (
    SELECT
      vc.id,
      vc.make,
      vc.model,
      vc.platform_id,
      vc.engine_family_id,
      vc.chassis_code,
      vc.engine_code,
      vc.production_start_year,
      vc.production_end_year,
      COALESCE(p_vehicle_year, vc.production_start_year) AS match_year
    FROM public.vehicle_catalog vc
    WHERE vc.id = p_catalog_id
  ),
  family AS (
    SELECT p.id
    FROM public.vehicle_platform p
    JOIN cat ON true
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    WHERE p.id = cat.platform_id
       OR p.id = mine.parent_id
       OR p.parent_id = cat.platform_id
       OR (mine.parent_id IS NOT NULL AND p.parent_id = mine.parent_id)
  ),
  sister AS (
    SELECT string_agg(DISTINCT (vc.make || ' ' || vc.model), ', ' ORDER BY (vc.make || ' ' || vc.model)) AS names
    FROM public.vehicle_catalog vc
    JOIN cat ON vc.platform_id IN (SELECT id FROM family)
    WHERE lower(vc.make || ' ' || vc.model) <> lower(cat.make || ' ' || cat.model)
  ),
  listings AS (
    SELECT
      pl.interchange_group_id AS group_id,
      pl.vehicle_catalog_id AS listed_id,
      pl.position,
      pl.side,
      pl.origin,
      pl.year_from,
      pl.year_to,
      g.fit_scope,
      lvc.make AS listed_make,
      lvc.model AS listed_model,
      lvc.chassis_code AS listed_chassis,
      lvc.engine_family_id AS listed_engine,
      lvc.platform_id AS listed_platform,
      (lvc.make || ' ' || lvc.model || ' ' || coalesce(lvc.chassis_code, '')) AS listed_label,
      pl.evidence_url,
      pl.id AS listing_id
    FROM public.part_listing pl
    JOIN public.part_interchange_group g ON g.id = pl.interchange_group_id
    JOIN public.vehicle_catalog lvc ON lvc.id = pl.vehicle_catalog_id
    CROSS JOIN cat
    WHERE NOT public.part_listing_exclusion_blocks(
      pl.interchange_group_id, cat.id, pl.position, pl.side, cat.match_year
    )
  ),
  scored AS (
    SELECT
      listings.*,
      CASE
        WHEN listings.listed_id = cat.id
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 1
        WHEN lower(listings.listed_make) = lower(cat.make)
          AND lower(listings.listed_model) = lower(cat.model)
          AND upper(trim(coalesce(listings.listed_chassis, ''))) = upper(trim(coalesce(cat.chassis_code, '')))
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          )
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 1
        WHEN listings.listed_platform IN (SELECT id FROM family)
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          )
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 2
        WHEN listings.fit_scope = 'powertrain'
          AND listings.listed_engine IS NOT NULL
          AND listings.listed_engine = cat.engine_family_id
          AND (listings.listed_platform IS NULL OR listings.listed_platform NOT IN (SELECT id FROM family))
          THEN 3
        ELSE NULL
      END AS listing_tier
    FROM listings
    CROSS JOIN cat
  ),
  best_group AS (
    SELECT DISTINCT ON (group_id, position, side)
      group_id,
      listing_tier,
      position,
      side,
      origin,
      fit_scope,
      listed_label,
      evidence_url,
      listing_id
    FROM scored
    WHERE listing_tier IS NOT NULL
    ORDER BY group_id, position, side, listing_tier ASC, listed_id
  ),
  listing_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      bg.fit_scope,
      'listing'::text AS rule_source,
      bg.position,
      bg.group_id AS interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE
        WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4
        ELSE bg.listing_tier
      END AS tier,
      bg.listed_label AS source_make,
      bg.evidence_url,
      CASE WHEN bg.origin = 'auto_match_kept' THEN 'kept' ELSE 'listed' END AS fit_source,
      CASE bg.listing_tier
        WHEN 1 THEN 'direct'
        WHEN 2 THEN 'sister'
        WHEN 3 THEN 'engine'
        ELSE 'direct'
      END AS via,
      'live'::text AS match_status,
      'listed_direct'::text AS match_reason_code,
      jsonb_build_object('part_listing_id', bg.listing_id) AS match_reason_params,
      bg.side,
      NULL::uuid AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      NULL::text AS checking_note
    FROM best_group bg
    JOIN public.part_master pm ON pm.interchange_group_id = bg.group_id
    WHERE pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_component_applicability a
        JOIN cat ON true
        WHERE a.applicable = false
          AND a.component_id = pm.maintenance_component_id
          AND (
            (a.scope = 'variant' AND a.vehicle_catalog_id = cat.id)
            OR (a.scope = 'platform' AND a.platform_id = cat.platform_id)
            OR (a.scope = 'engine_family' AND a.engine_family_id = cat.engine_family_id)
          )
      )
  ),
  derived_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      d.position,
      d.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4 ELSE 1 END AS tier,
      NULL::text AS source_make,
      NULL::text AS evidence_url,
      'derived'::text AS fit_source,
      'direct'::text AS via,
      d.status AS match_status,
      d.reason_code AS match_reason_code,
      d.reason_params AS match_reason_params,
      d.side,
      d.id AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      d.checking_note
    FROM public.part_fit_derived d
    JOIN public.part_master pm ON pm.interchange_group_id = d.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = d.interchange_group_id
    JOIN cat ON cat.id = d.vehicle_catalog_id
    WHERE public.parts_auto_match_enabled()
      AND d.status IN ('live', 'needs_checking')
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
  ),
  tier1_fits AS (
    SELECT d.interchange_group_id, d.position, d.side, d.status AS match_status,
           d.reason_code, d.reason_params, 'derived'::text AS fit_source, d.vehicle_catalog_id
    FROM public.part_fit_derived d
    WHERE public.parts_auto_match_enabled() AND d.status IN ('live', 'needs_checking')
    UNION ALL
    SELECT pl.interchange_group_id, pl.position, pl.side, 'live'::text,
           'listed_direct'::text, jsonb_build_object('part_listing_id', pl.id),
           CASE WHEN pl.origin = 'auto_match_kept' THEN 'kept' ELSE 'listed' END,
           pl.vehicle_catalog_id
    FROM public.part_listing pl
    WHERE public.parts_auto_match_enabled()
  ),
  tier1_on_car AS (
    SELECT t.* FROM tier1_fits t JOIN cat ON cat.id = t.vehicle_catalog_id
  ),
  link_tier3_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      t1.position,
      t1.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4 ELSE 3 END AS tier,
      NULL::text AS source_make,
      NULL::text AS evidence_url,
      t1.fit_source,
      'platform_link'::text AS via,
      CASE
        WHEN l.scope = 'system' OR t1.match_status = 'needs_checking' THEN 'needs_checking'
        ELSE 'live'
      END AS match_status,
      'via_platform_link'::text AS match_reason_code,
      jsonb_build_object(
        'link_id', l.id,
        'platform_code', vp.code,
        'source_vehicle_id', src.id,
        'source_tier', 1
      ) AS match_reason_params,
      t1.side,
      NULL::uuid AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      NULL::text AS checking_note
    FROM public.platform_component_link l
    JOIN cat ON true
    JOIN public.vehicle_catalog src
      ON src.platform_id = CASE
        WHEN cat.platform_id = l.platform_a_id THEN l.platform_b_id
        ELSE l.platform_a_id
      END
    JOIN public.vehicle_platform vp ON vp.id = src.platform_id
    JOIN tier1_fits t1 ON t1.vehicle_catalog_id = src.id
    JOIN public.part_master pm ON pm.interchange_group_id = t1.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
    WHERE public.parts_auto_match_enabled()
      AND cat.platform_id IN (l.platform_a_id, l.platform_b_id)
      AND l.maintenance_component_id = pm.maintenance_component_id
      AND public.part_side_covers(l.position, l.side, t1.position, t1.side)
      AND NOT public.part_listing_exclusion_blocks(
        t1.interchange_group_id, cat.id, t1.position, t1.side, cat.match_year
      )
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)

      AND (
        cat.match_year IS NULL
        OR (
          cat.platform_id = l.platform_a_id
          AND (l.platform_a_year_from IS NULL OR cat.match_year >= l.platform_a_year_from)
          AND (l.platform_a_year_to IS NULL OR cat.match_year <= l.platform_a_year_to)
        )
        OR (
          cat.platform_id = l.platform_b_id
          AND (l.platform_b_year_from IS NULL OR cat.match_year >= l.platform_b_year_from)
          AND (l.platform_b_year_to IS NULL OR cat.match_year <= l.platform_b_year_to)
        )
      )
  ),
  hits AS (
    SELECT * FROM listing_hits
    UNION ALL
    SELECT * FROM derived_hits
    UNION ALL
    SELECT * FROM link_tier3_hits
  ),
  oem_ref AS (
    SELECT DISTINCT ON (h.interchange_group_id)
      h.interchange_group_id,
      h.oem_part_number AS reference_oem,
      h.manufacturer AS reference_manufacturer
    FROM hits h
    WHERE h.part_kind = 'oem' AND h.interchange_group_id IS NOT NULL
    ORDER BY h.interchange_group_id, h.tier ASC
  ),
  badges AS (
    SELECT
      m.part_id,
      CASE WHEN m.rule = 'index' THEN 'index_badge' END AS part_badge_code,
      jsonb_build_object(
        'index_type', m.matched_key,
        'merge_log_id', m.id
      ) AS part_badge_params
    FROM public.interchange_group_merge_log m
    WHERE m.reversed_at IS NULL
  ),
  ranked AS (
    SELECT DISTINCT ON (h.part_id, h."position", h.side)
      h.*
    FROM hits h
    ORDER BY h.part_id, h."position", h.side, h.tier ASC, h.rule_source
  )
  SELECT
    h.tier,
    h.part_id,
    h.part_name,
    h.oem_part_number,
    h.manufacturer,
    h.part_kind,
    h.fit_scope,
    h.rule_source,
    h.position,
    h.interchange_group_id,
    h.maintenance_component_id,
    h.category_id,
    sister.names AS sister_names,
    h.source_make,
    COALESCE(oem_ref.reference_oem, h.oem_part_number) AS reference_oem,
    COALESCE(oem_ref.reference_manufacturer, h.manufacturer) AS reference_manufacturer,
    COALESCE((
      SELECT array_agg(old.oem_part_number)
      FROM public.part_supersession s
      JOIN public.part_master old ON old.id = s.old_part_id
      WHERE s.new_part_id = h.part_id AND old.oem_part_number IS NOT NULL
    ), ARRAY[]::text[]) AS also_known_as,
    COALESCE((
      SELECT count(*)::integer
      FROM public.part_fit_feedback f
      WHERE f.part_id = h.part_id AND f.outcome = 'fit'
    ), 0) AS confirmed_installs,
    h.description,
    h.evidence_url,
    h.match_reason_code,
    h.match_reason_params,
    h.match_status,
    h.fit_source,
    h.via,
    b.part_badge_code,
    b.part_badge_params,
    h.derived_id,
    h.side,
    h.wva,
    h.checking_note
  FROM ranked h
  LEFT JOIN sister ON true
  LEFT JOIN oem_ref ON oem_ref.interchange_group_id = h.interchange_group_id
  LEFT JOIN badges b ON b.part_id = h.part_id;
$$;


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

REVOKE ALL ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.part_match_derived_status_for(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_derived_status_for(uuid, uuid, uuid) TO service_role;


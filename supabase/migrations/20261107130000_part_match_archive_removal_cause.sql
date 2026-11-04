-- Archive removal_cause: exclusion vs keys_no_longer_match; changed rows leave removal_cause null
-- Depends on 20261107120000_parts_for_vehicle_live_tiebreak.sql

CREATE OR REPLACE FUNCTION public.part_match_archive_derived_changes(
  p_new_engine_version integer
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

  INSERT INTO public.part_fit_derived_archive (
    derived_id, interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    rule, matched_keys, vehicle_oe_number_id, part_oe_reference_ids, reason_code, reason_params,
    status, engine_version, computed_at, checking_note, archive_reason, removal_cause, superseded_by_engine_version
  )
  SELECT
    d.id, d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
    d.rule, d.matched_keys, d.vehicle_oe_number_id, d.part_oe_reference_ids, d.reason_code, d.reason_params,
    d.status, d.engine_version, d.computed_at, d.checking_note,
    CASE WHEN d.engine_version IS DISTINCT FROM p_new_engine_version THEN 'changed' ELSE 'removed' END,
    CASE WHEN d.engine_version IS DISTINCT FROM p_new_engine_version THEN NULL ELSE 'keys_no_longer_match' END,
    p_new_engine_version
  FROM public.part_fit_derived d
  WHERE (
    NOT v_scoped
    AND d.engine_version IS DISTINCT FROM p_new_engine_version
  ) OR (
    v_scoped AND EXISTS (
      SELECT 1 FROM _pm_scope sp
      WHERE sp.group_id = d.interchange_group_id AND sp.vehicle_id = d.vehicle_catalog_id
    )
    AND d.engine_version IS DISTINCT FROM p_new_engine_version
  ) OR (
    v_scoped AND NOT EXISTS (SELECT 1 FROM _pm_scope LIMIT 1)
    AND EXISTS (
      SELECT 1 FROM _pm_batch_scope bs
      WHERE bs.group_id = d.interchange_group_id AND bs.vehicle_id = d.vehicle_catalog_id
    )
    AND d.engine_version IS DISTINCT FROM p_new_engine_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_archive_derived_changes(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_archive_derived_changes(integer) TO service_role;


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
      tr.status, tr.engine_version, tr.computed_at, tr.checking_note, 'removed', CASE WHEN EXISTS (SELECT 1 FROM public.part_listing_exclusion ex WHERE ex.interchange_group_id = tr.interchange_group_id AND ex.vehicle_catalog_id = tr.vehicle_catalog_id) THEN 'exclusion' ELSE 'keys_no_longer_match' END, v_engine
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

REVOKE ALL ON FUNCTION public.part_match_recompute_pairs(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_recompute_pairs(uuid, uuid) TO service_role;


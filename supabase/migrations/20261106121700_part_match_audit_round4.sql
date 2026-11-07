-- Reopen identity, supersession chain scope, health tierBreakdown (no car), listing report resolve, keep_batch once
-- Depends on 20261107270000_part_match_nightly_status_archive.sql

CREATE OR REPLACE FUNCTION public.part_match_supersession_norm_closure(
  p_brand text,
  p_seeds text[]
)
RETURNS TABLE (brand text, norm text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE seeds AS (
    SELECT upper(btrim(p_brand)) AS brand, btrim(s) AS norm
    FROM unnest(coalesce(p_seeds, ARRAY[]::text[])) AS s
    WHERE btrim(s) <> ''
  ),
  -- Both directions as one edge list: Postgres allows a single recursive reference.
  edges AS (
    SELECT upper(s.oe_brand) AS brand, s.from_norm AS a, s.to_norm AS b
    FROM public.oe_number_supersession s
    UNION ALL
    SELECT upper(s.oe_brand), s.to_norm, s.from_norm
    FROM public.oe_number_supersession s
  ),
  walk AS (
    SELECT s.brand, s.norm FROM seeds s
    UNION
    SELECT e.brand, e.b
    FROM walk w
    JOIN edges e ON e.brand = w.brand AND e.a = w.norm
  )
  SELECT DISTINCT walk.brand, walk.norm FROM walk;
$$;

CREATE OR REPLACE FUNCTION public.part_match_part_supersession_closure(
  p_seed_part_ids uuid[]
)
RETURNS TABLE (part_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE seeds AS (
    SELECT unnest(coalesce(p_seed_part_ids, ARRAY[]::uuid[])) AS part_id
  ),
  -- Both directions as one edge list: Postgres allows a single recursive reference.
  edges AS (
    SELECT ps.old_part_id AS a, ps.new_part_id AS b FROM public.part_supersession ps
    UNION ALL
    SELECT ps.new_part_id, ps.old_part_id FROM public.part_supersession ps
  ),
  walk AS (
    SELECT s.part_id FROM seeds s WHERE s.part_id IS NOT NULL
    UNION
    SELECT e.b
    FROM walk w
    JOIN edges e ON e.a = w.part_id
  )
  SELECT DISTINCT walk.part_id FROM walk WHERE walk.part_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.part_match_supersession_norm_closure(text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_supersession_norm_closure(text, text[]) TO service_role;
REVOKE ALL ON FUNCTION public.part_match_part_supersession_closure(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_part_supersession_closure(uuid[]) TO service_role;


CREATE OR REPLACE FUNCTION public.part_match_sync_conflicts(
  p_group_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_engine integer := public.part_match_engine_version();
BEGIN
  UPDATE public.part_match_conflict c
  SET status = 'superseded',
      resolved_at = now(),
      resolution_note = coalesce(
        c.resolution_note,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM public.part_listing pl
            WHERE pl.vehicle_catalog_id = c.vehicle_catalog_id
              AND pl.interchange_group_id = c.interchange_group_id
              AND pl.origin IN ('manual', 'import')
          ) THEN format(
            'Manual fit exists on %s; both kept',
            (SELECT ig.code FROM public.part_interchange_group ig WHERE ig.id = c.interchange_group_id)
          )
          ELSE 'Auto-superseded by recompute'
        END
      )
  WHERE c.status = 'open'
    AND (p_vehicle_id IS NULL OR c.vehicle_catalog_id = p_vehicle_id)
    AND (p_group_id IS NULL OR c.interchange_group_id = p_group_id)
    AND (
      EXISTS (
        SELECT 1 FROM public.part_listing pl
        WHERE pl.vehicle_catalog_id = c.vehicle_catalog_id
          AND pl.interchange_group_id = c.interchange_group_id
          AND pl.origin IN ('manual', 'import')
      )
      OR EXISTS (
        SELECT 1 FROM public.part_listing_exclusion ex
        WHERE ex.vehicle_catalog_id = c.vehicle_catalog_id
          AND ex.interchange_group_id = c.interchange_group_id
      )
    );

  WITH ambiguous AS (
    SELECT
      von.vehicle_catalog_id,
      von.id AS vehicle_oe_number_id,
      von.oe_number_norm,
      von.position,
      von.side,
      array_agg(DISTINCT gn.interchange_group_id ORDER BY gn.interchange_group_id) AS group_ids
    FROM public.vehicle_oe_number von
    JOIN LATERAL public.part_match_oe_chain(von.id) ch ON true
    JOIN LATERAL public.part_match_group_numbers(NULL) gn
      ON gn.norm = ch.norm AND gn.brand = ch.brand
    WHERE (p_vehicle_id IS NULL OR von.vehicle_catalog_id = p_vehicle_id)
    GROUP BY von.vehicle_catalog_id, von.id, von.oe_number_norm, von.position, von.side
    HAVING count(DISTINCT gn.interchange_group_id) > 1
  ),
  per_group AS (
    SELECT
      a.vehicle_catalog_id,
      a.vehicle_oe_number_id,
      a.oe_number_norm,
      a.position,
      a.side,
      a.group_ids,
      g.group_id AS interchange_group_id,
      jsonb_build_object(
        'vehicle_oe_number_id', a.vehicle_oe_number_id,
        'oe_number_norm', a.oe_number_norm,
        'group_ids', to_jsonb(a.group_ids),
        'position', a.position,
        'side', a.side
      ) AS detail
    FROM ambiguous a
    CROSS JOIN LATERAL unnest(a.group_ids) AS g(group_id)
  )
  UPDATE public.part_match_conflict c
  SET status = 'open',
      resolved_at = NULL,
      resolved_by = NULL,
      resolution_note = NULL,
      engine_version = v_engine,
      matched_key = src.oe_number_norm,
      vehicle_oe_number_id = src.vehicle_oe_number_id,
      detail = src.detail,
      computed_at = now()
  FROM per_group src
  WHERE c.status = 'superseded'
    AND c.conflict_type = 'oe_ambiguous'
    AND c.interchange_group_id = src.interchange_group_id
    AND c.vehicle_catalog_id = src.vehicle_catalog_id
    AND c.vehicle_oe_number_id = src.vehicle_oe_number_id
    AND c.detail ? 'vehicle_oe_number_id'
    AND c.detail ? 'oe_number_norm'
    AND c.detail ? 'position'
    AND c.detail ? 'side'
    AND NOT EXISTS (
      SELECT 1 FROM public.part_listing pl
      WHERE pl.vehicle_catalog_id = src.vehicle_catalog_id
        AND pl.interchange_group_id = src.interchange_group_id
        AND pl.origin IN ('manual', 'import')
    )
    AND EXISTS (
      SELECT 1 FROM public.vehicle_oe_number von
      WHERE von.id = c.vehicle_oe_number_id
        AND (
          von.oe_number_norm IS DISTINCT FROM c.detail->>'oe_number_norm'
          OR von.id::text IS DISTINCT FROM c.detail->>'vehicle_oe_number_id'
          OR von.position IS DISTINCT FROM c.detail->>'position'
          OR von.side IS DISTINCT FROM c.detail->>'side'
        )
    );

  UPDATE public.part_match_conflict c
  SET status = 'open',
      resolved_at = NULL,
      resolved_by = NULL,
      resolution_note = NULL,
      engine_version = v_engine,
      computed_at = now()
  WHERE c.status = 'superseded'
    AND c.conflict_type = 'oe_ambiguous'
    AND (p_vehicle_id IS NULL OR c.vehicle_catalog_id = p_vehicle_id)
    AND (p_group_id IS NULL OR c.interchange_group_id = p_group_id)
    AND c.detail ? 'vehicle_oe_number_id'
    AND c.detail ? 'oe_number_norm'
    AND c.detail ? 'position'
    AND c.detail ? 'side'
    AND NOT EXISTS (
      SELECT 1 FROM public.vehicle_oe_number von
      WHERE von.id = (c.detail->>'vehicle_oe_number_id')::uuid
    );

  UPDATE public.part_match_conflict c
  SET status = 'open',
      resolved_at = NULL,
      resolved_by = NULL,
      resolution_note = NULL,
      engine_version = v_engine,
      matched_key = pcl.scope || ':' || pcl.maintenance_component_id::text,
      detail = jsonb_build_object(
        'platform_component_link_id', pcl.id,
        'scope', pcl.scope,
        'maintenance_component_id', pcl.maintenance_component_id,
        'position', pcl.position,
        'side', pcl.side
      ),
      computed_at = now()
  FROM public.platform_component_link pcl
  WHERE c.status = 'superseded'
    AND c.conflict_type = 'system_link'
    AND c.platform_component_link_id = pcl.id
    AND (p_vehicle_id IS NULL)
    AND (p_group_id IS NULL)
    AND c.detail ? 'platform_component_link_id'
    AND (
      pcl.id::text IS DISTINCT FROM c.detail->>'platform_component_link_id'
      OR (pcl.scope || ':' || pcl.maintenance_component_id::text) IS DISTINCT FROM c.matched_key
      OR pcl.position IS DISTINCT FROM c.detail->>'position'
      OR pcl.side IS DISTINCT FROM c.detail->>'side'
    );

  INSERT INTO public.part_match_conflict (
    conflict_type, interchange_group_id, vehicle_catalog_id, vehicle_oe_number_id,
    matched_key, detail, status, engine_version
  )
  WITH ambiguous AS (
    SELECT
      von.vehicle_catalog_id,
      von.id AS vehicle_oe_number_id,
      von.oe_number_norm,
      von.position,
      von.side,
      array_agg(DISTINCT gn.interchange_group_id ORDER BY gn.interchange_group_id) AS group_ids
    FROM public.vehicle_oe_number von
    JOIN LATERAL public.part_match_oe_chain(von.id) ch ON true
    JOIN LATERAL public.part_match_group_numbers(NULL) gn
      ON gn.norm = ch.norm AND gn.brand = ch.brand
    WHERE (p_vehicle_id IS NULL OR von.vehicle_catalog_id = p_vehicle_id)
    GROUP BY von.vehicle_catalog_id, von.id, von.oe_number_norm, von.position, von.side
    HAVING count(DISTINCT gn.interchange_group_id) > 1
  ),
  per_group AS (
    SELECT
      a.vehicle_catalog_id,
      a.vehicle_oe_number_id,
      a.oe_number_norm,
      g.group_id AS interchange_group_id,
      jsonb_build_object(
        'vehicle_oe_number_id', a.vehicle_oe_number_id,
        'oe_number_norm', a.oe_number_norm,
        'group_ids', to_jsonb(a.group_ids),
        'position', a.position,
        'side', a.side
      ) AS detail
    FROM ambiguous a
    CROSS JOIN LATERAL unnest(a.group_ids) AS g(group_id)
  )
  SELECT
    'oe_ambiguous',
    pg.interchange_group_id,
    pg.vehicle_catalog_id,
    pg.vehicle_oe_number_id,
    pg.oe_number_norm,
    pg.detail,
    'open',
    v_engine
  FROM per_group pg
  WHERE NOT EXISTS (
    SELECT 1 FROM public.part_match_conflict c
    WHERE c.conflict_type = 'oe_ambiguous'
      AND c.interchange_group_id IS NOT DISTINCT FROM pg.interchange_group_id
      AND c.vehicle_catalog_id = pg.vehicle_catalog_id
      AND c.vehicle_oe_number_id = pg.vehicle_oe_number_id
      AND c.matched_key IS NOT DISTINCT FROM pg.oe_number_norm
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.part_match_conflict (
    conflict_type, platform_component_link_id, matched_key, detail, status, engine_version
  )
  SELECT
    'system_link',
    pcl.id,
    pcl.scope || ':' || pcl.maintenance_component_id::text,
    jsonb_build_object(
      'platform_component_link_id', pcl.id,
      'scope', pcl.scope,
      'maintenance_component_id', pcl.maintenance_component_id,
      'position', pcl.position,
      'side', pcl.side
    ),
    'open',
    v_engine
  FROM public.platform_component_link pcl
  WHERE pcl.scope = 'system'
    AND NOT EXISTS (
      SELECT 1 FROM public.part_match_conflict c
      WHERE c.conflict_type = 'system_link'
        AND c.platform_component_link_id = pcl.id
        AND c.matched_key IS NOT DISTINCT FROM (pcl.scope || ':' || pcl.maintenance_component_id::text)
    )
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_sync_conflicts(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_sync_conflicts(uuid, uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.part_match_trg_oe_supersession()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_brands text[];
  v_norms text[];
BEGIN
  IF pg_trigger_depth() > 1 OR current_setting('part_match.busy', true) = 'on' THEN
    RETURN NULL;
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  IF TG_OP = 'DELETE' THEN
    SELECT coalesce(array_agg(DISTINCT upper(o.oe_brand)), ARRAY[]::text[]),
           coalesce(array_agg(DISTINCT x.norm), ARRAY[]::text[])
    INTO v_brands, v_norms
    FROM old_rows o
    CROSS JOIN LATERAL (
      SELECT o.from_norm AS norm
      UNION ALL
      SELECT o.to_norm
    ) x;
  ELSIF TG_OP = 'INSERT' THEN
    -- The INSERT trigger only has new_rows (no OLD TABLE transition relation).
    SELECT coalesce(array_agg(DISTINCT upper(n.oe_brand)), ARRAY[]::text[]),
           coalesce(array_agg(DISTINCT x.norm), ARRAY[]::text[])
    INTO v_brands, v_norms
    FROM new_rows n
    CROSS JOIN LATERAL (
      SELECT n.from_norm AS norm
      UNION ALL
      SELECT n.to_norm
    ) x;
  ELSE
    SELECT coalesce(array_agg(DISTINCT upper(r.oe_brand)), ARRAY[]::text[]),
           coalesce(array_agg(DISTINCT x.norm), ARRAY[]::text[])
    INTO v_brands, v_norms
    FROM (
      SELECT n.oe_brand, n.from_norm, n.to_norm FROM new_rows n
      UNION ALL
      SELECT o.oe_brand, o.from_norm, o.to_norm FROM old_rows o
    ) r
    CROSS JOIN LATERAL (
      SELECT r.from_norm AS norm
      UNION ALL
      SELECT r.to_norm
    ) x;
  END IF;
  IF coalesce(array_length(v_norms, 1), 0) = 0 THEN
    RETURN NULL;
  END IF;
  INSERT INTO _pm_batch_scope (group_id, vehicle_id)
  SELECT DISTINCT gn.interchange_group_id, von.vehicle_catalog_id
  FROM public.vehicle_oe_number von
  JOIN LATERAL public.part_match_oe_chain(von.id) ch ON true
  JOIN public.part_match_group_numbers(NULL) gn
    ON gn.norm = ch.norm AND gn.brand = ch.brand
  WHERE EXISTS (
    SELECT 1
    FROM unnest(v_brands) AS b(brand)
    JOIN LATERAL public.part_match_supersession_norm_closure(b.brand, v_norms) cl
      ON cl.brand = ch.brand AND cl.norm = ch.norm
  )
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END; $$;

REVOKE ALL ON FUNCTION public.part_match_trg_oe_supersession() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_trg_oe_supersession() TO service_role;


CREATE OR REPLACE FUNCTION public.part_match_trg_part_supersession()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_part_ids uuid[];
BEGIN
  IF pg_trigger_depth() > 1 OR current_setting('part_match.busy', true) = 'on' THEN
    RETURN NULL;
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  IF TG_OP = 'DELETE' THEN
    SELECT coalesce(array_agg(DISTINCT x.part_id), ARRAY[]::uuid[])
    INTO v_part_ids
    FROM (
      SELECT o.old_part_id AS part_id FROM old_rows o
      UNION
      SELECT o.new_part_id FROM old_rows o
    ) x;
  ELSIF TG_OP = 'INSERT' THEN
    -- The INSERT trigger only has new_rows (no OLD TABLE transition relation).
    SELECT coalesce(array_agg(DISTINCT x.part_id), ARRAY[]::uuid[])
    INTO v_part_ids
    FROM (
      SELECT n.old_part_id AS part_id FROM new_rows n
      UNION
      SELECT n.new_part_id FROM new_rows n
    ) x;
  ELSE
    SELECT coalesce(array_agg(DISTINCT x.part_id), ARRAY[]::uuid[])
    INTO v_part_ids
    FROM (
      SELECT n.old_part_id AS part_id FROM new_rows n
      UNION
      SELECT n.new_part_id FROM new_rows n
      UNION
      SELECT o.old_part_id FROM old_rows o
      UNION
      SELECT o.new_part_id FROM old_rows o
    ) x;
  END IF;
  IF coalesce(array_length(v_part_ids, 1), 0) = 0 THEN
    RETURN NULL;
  END IF;
  INSERT INTO _pm_batch_scope (group_id, vehicle_id)
  SELECT DISTINCT g.gid, sp.vehicle_id
  FROM (
    SELECT pm.interchange_group_id AS gid
    FROM public.part_match_part_supersession_closure(v_part_ids) ch
    JOIN public.part_master pm ON pm.id = ch.part_id
    WHERE pm.interchange_group_id IS NOT NULL
  ) g
  CROSS JOIN LATERAL (
    SELECT DISTINCT von.vehicle_catalog_id AS vehicle_id
    FROM public.vehicle_oe_number von
    JOIN LATERAL public.part_match_oe_chain(von.id) ch ON true
    JOIN public.part_match_group_numbers(g.gid) gn
      ON gn.interchange_group_id = g.gid AND gn.norm = ch.norm AND gn.brand = ch.brand
    UNION
    SELECT d.vehicle_catalog_id
    FROM public.part_fit_derived d
    WHERE d.interchange_group_id = g.gid
  ) sp
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END; $$;

REVOKE ALL ON FUNCTION public.part_match_trg_part_supersession() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_trg_part_supersession() TO service_role;


CREATE OR REPLACE FUNCTION public.part_match_health(p_vehicle_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'engineVersion', public.part_match_engine_version(),
    'normVersion', public.part_norm_position_version(),
    'enabled', public.parts_auto_match_enabled(),
    'derived', jsonb_build_object(
      'live', (SELECT count(*) FROM public.part_fit_derived d WHERE d.status = 'live' AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id)),
      'needsChecking', (SELECT count(*) FROM public.part_fit_derived d WHERE d.status = 'needs_checking' AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id)),
      'suppressed', (SELECT count(*) FROM public.part_fit_derived d WHERE d.status = 'suppressed' AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id))
    ),
    'tierBreakdown', (
      SELECT coalesce(jsonb_object_agg(t.tier::text, t.cnt), '{}'::jsonb)
      FROM (
        SELECT pf.tier, count(*) AS cnt
        FROM public.vehicle_catalog vc
        CROSS JOIN LATERAL public.parts_for_vehicle(vc.id, NULL, vc.production_start_year) pf
        WHERE p_vehicle_id IS NULL OR vc.id = p_vehicle_id
        GROUP BY pf.tier
      ) t
    ),
    'openConflicts', (
      SELECT coalesce(jsonb_object_agg(conflict_type, cnt), '{}'::jsonb)
      FROM (
        SELECT c.conflict_type, count(*) AS cnt
        FROM public.part_match_conflict c
        WHERE c.status = 'open'
          AND (p_vehicle_id IS NULL OR c.vehicle_catalog_id = p_vehicle_id)
        GROUP BY c.conflict_type
      ) x
    ),
    'lastRun', (
      SELECT to_jsonb(l) FROM (
        SELECT run_id, kind, started_at, finished_at, error, duration_ms, rows_scanned
        FROM public.part_match_recompute_log
        ORDER BY started_at DESC
        LIMIT 1
      ) l
    ),
    'errorCount24h', (
      SELECT count(*) FROM public.part_match_recompute_log l
      WHERE l.error IS NOT NULL AND l.started_at > now() - interval '24 hours'
    ),
    'unresolvedPositionReports', (
      SELECT count(*) FROM public.part_norm_position_backfill_report r WHERE r.resolved_at IS NULL
    )
  );
$$;

REVOKE ALL ON FUNCTION public.part_match_health(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_health(uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.part_match_trg_listing_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_setting('part_match.busy', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Statement-level trigger: OLD/NEW are NULL, so compare the transition tables.
    UPDATE public.part_norm_position_backfill_report r
    SET resolved_at = now(),
        resolved_by = n.verified_by,
        resolution_source = 'listing_edit'
    FROM new_rows n
    JOIN old_rows o ON o.id = n.id
    WHERE r.resolved_at IS NULL
      AND r.table_name = 'part_listing'
      AND r.row_id = n.id
      AND (o.position IS DISTINCT FROM n.position OR o.side IS DISTINCT FROM n.side);
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO _pm_batch_scope (group_id, vehicle_id)
    SELECT DISTINCT s.gid, s.vid
    FROM (
      SELECT n.interchange_group_id AS gid, n.vehicle_catalog_id AS vid FROM new_rows n
    ) s
    WHERE s.gid IS NOT NULL AND s.vid IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    INSERT INTO _pm_batch_scope (group_id, vehicle_id)
    SELECT DISTINCT s.gid, s.vid
    FROM (
      SELECT o.interchange_group_id AS gid, o.vehicle_catalog_id AS vid FROM old_rows o
    ) s
    WHERE s.gid IS NOT NULL AND s.vid IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END; $$;

REVOKE ALL ON FUNCTION public.part_match_trg_listing_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_trg_listing_scope() TO service_role;


CREATE OR REPLACE FUNCTION public.part_match_derived_keep_batch(
  p_derived_ids uuid[],
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_found integer;
  v_prev_busy text;
BEGIN
  IF p_derived_ids IS NULL OR array_length(p_derived_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Pick at least one fit.';
  END IF;
  SELECT count(*) INTO v_found
  FROM public.part_fit_derived d
  WHERE d.id = ANY (p_derived_ids);
  IF v_found <> array_length(p_derived_ids, 1) THEN
    RAISE EXCEPTION 'Unknown derived fit';
  END IF;

  -- Hold the listing trigger off: this function scopes and recomputes once below.
  v_prev_busy := coalesce(current_setting('part_match.busy', true), 'off');
  PERFORM set_config('part_match.busy', 'on', true);
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
  WHERE d.id = ANY (p_derived_ids)
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side) DO UPDATE
    SET origin = EXCLUDED.origin,
        derived_fit_id = EXCLUDED.derived_fit_id
    WHERE public.part_listing.origin IS DISTINCT FROM 'manual'
      AND public.part_listing.origin IS DISTINCT FROM 'import';
  PERFORM set_config('part_match.busy', v_prev_busy, true);

  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  DELETE FROM _pm_batch_scope;
  INSERT INTO _pm_batch_scope (group_id, vehicle_id)
  SELECT DISTINCT d.interchange_group_id, d.vehicle_catalog_id
  FROM public.part_fit_derived d
  WHERE d.id = ANY (p_derived_ids)
  ON CONFLICT DO NOTHING;

  PERFORM public.part_match_recompute_buffered();
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_derived_keep_batch(uuid[], uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_derived_keep_batch(uuid[], uuid, text) TO service_role;


-- Triggered (buffered) runs hold part_match.busy while they work, like part_match_recompute.
-- Without it, part moves made during the run (index_rules) fire triggers at depth 1 and
-- start nested runs, so one keep / edit logged several recomputes.
CREATE OR REPLACE FUNCTION public.part_match_recompute_buffered()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run_id uuid := gen_random_uuid();
  v_engine integer := public.part_match_engine_version();
  v_log_id uuid;
  v_started timestamptz := clock_timestamp();
  lock_rec record;
  v_stats record;
  v_group uuid;
  v_prev_busy text;
BEGIN
  IF pg_trigger_depth() > 1 OR current_setting('part_match.busy', true) = 'on' THEN
    RETURN;
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;

  IF NOT EXISTS (SELECT 1 FROM _pm_batch_scope LIMIT 1) THEN
    DELETE FROM _pm_batch_scope;
    RETURN;
  END IF;

  v_prev_busy := coalesce(current_setting('part_match.busy', true), 'off');
  PERFORM set_config('part_match.busy', 'on', true);

  FOR lock_rec IN
    SELECT bs.group_id, bs.vehicle_id
    FROM _pm_batch_scope bs
    ORDER BY bs.group_id, bs.vehicle_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('part_match:' || lock_rec.group_id::text || ':' || lock_rec.vehicle_id::text)
    );
  END LOOP;

  INSERT INTO public.part_match_recompute_log (
    run_id, kind, engine_version, started_at
  )
  VALUES (v_run_id, 'scoped', v_engine, v_started)
  RETURNING id INTO v_log_id;

  BEGIN
    SELECT * INTO v_stats FROM public.part_match_recompute_pairs(NULL, NULL);
    FOR v_group IN SELECT DISTINCT bs.group_id FROM _pm_batch_scope bs LOOP
      PERFORM public.part_match_index_rules(v_group);
    END LOOP;
    PERFORM public.part_match_sync_conflicts(NULL, NULL);

    UPDATE public.part_match_recompute_log
    SET finished_at = clock_timestamp(),
        duration_ms = (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer,
        rows_added = v_stats.rows_added,
        rows_changed = v_stats.rows_changed,
        rows_removed = v_stats.rows_removed,
        rows_scanned = v_stats.rows_scanned
    WHERE id = v_log_id;
  EXCEPTION WHEN OTHERS THEN
    DELETE FROM _pm_batch_scope;
    UPDATE public.part_match_recompute_log
    SET finished_at = clock_timestamp(),
        error = SQLERRM,
        duration_ms = (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer
    WHERE id = v_log_id;
    PERFORM set_config('part_match.busy', v_prev_busy, true);
    RAISE;
  END;

  DELETE FROM _pm_batch_scope;
  PERFORM set_config('part_match.busy', v_prev_busy, true);
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_recompute_buffered() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_recompute_buffered() TO service_role;

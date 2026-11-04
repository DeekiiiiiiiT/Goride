-- part_match_sync_conflicts: manual/import listing supersede note includes group code
-- Depends on 20261107190000_part_match_scope_delete_cleanup.sql

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
      detail = src.detail,
      computed_at = now()
  FROM per_group src
  WHERE c.status = 'superseded'
    AND c.conflict_type = 'oe_ambiguous'
    AND c.interchange_group_id = src.interchange_group_id
    AND c.vehicle_catalog_id = src.vehicle_catalog_id
    AND c.vehicle_oe_number_id = src.vehicle_oe_number_id
    AND c.matched_key IS NOT DISTINCT FROM src.oe_number_norm
    AND NOT EXISTS (
      SELECT 1 FROM public.part_listing pl
      WHERE pl.vehicle_catalog_id = src.vehicle_catalog_id
        AND pl.interchange_group_id = src.interchange_group_id
        AND pl.origin IN ('manual', 'import')
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
  );

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
    );
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_sync_conflicts(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_sync_conflicts(uuid, uuid) TO service_role;


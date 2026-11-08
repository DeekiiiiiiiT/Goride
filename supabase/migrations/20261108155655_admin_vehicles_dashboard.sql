-- Vehicles home dashboard (Dominion): catalogue completeness, most complete cars,
-- and recent edits to cars and their specs. Database-only numbers; nothing from the apps.
-- Read-only. Server (service_role) only.

CREATE OR REPLACE FUNCTION public.admin_vehicles_dashboard(p_car_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH vc AS (
    SELECT c.id, c.platform_id, c.engine_family_id, p.parent_id AS platform_parent_id
    FROM public.vehicle_catalog c
    LEFT JOIN public.vehicle_platform p ON p.id = c.platform_id
    WHERE c.status IS DISTINCT FROM 'retired'
  ),
  ready AS (
    SELECT vc.id, coalesce(r.components_ready, 0) AS key_parts
    FROM vc
    LEFT JOIN public.variant_parts_readiness r ON r.variant_id = vc.id
  ),
  specs AS (
    SELECT vc.id, count(DISTINCT sv.spec_key)::int AS spec_count
    FROM vc
    JOIN public.catalog_spec_value sv
      ON (sv.scope = 'variant' AND sv.vehicle_catalog_id = vc.id)
      OR (sv.scope = 'platform' AND (sv.platform_id = vc.platform_id OR sv.platform_id = vc.platform_parent_id))
      OR (sv.scope = 'engine_family' AND sv.engine_family_id = vc.engine_family_id)
    GROUP BY vc.id
  ),
  per_car AS (
    SELECT r.id, r.key_parts, coalesce(s.spec_count, 0) AS spec_count
    FROM ready r
    LEFT JOIN specs s ON s.id = r.id
  ),
  changes AS (
    SELECT
      pr.id,
      pr.created_at,
      pr.entity_table,
      CASE
        WHEN pr.entity_table = 'vehicle_catalog' THEN pr.entity_id
        ELSE nullif(coalesce(pr.new_row, pr.old_row) ->> 'vehicle_catalog_id', '')::uuid
      END AS car_id,
      coalesce(pr.new_row, pr.old_row) ->> 'spec_key' AS spec_key,
      CASE
        WHEN pr.old_row IS NULL THEN 'added'
        WHEN pr.new_row IS NULL THEN 'removed'
        ELSE 'edited'
      END AS action,
      CASE
        WHEN pr.entity_table = 'vehicle_catalog' AND pr.old_row IS NOT NULL AND pr.new_row IS NOT NULL THEN (
          SELECT coalesce(jsonb_agg(k ORDER BY k), '[]'::jsonb)
          FROM jsonb_object_keys(pr.new_row) k
          WHERE k NOT IN ('id', 'updated_at', 'created_at', 'created_by', 'updated_by', 'search_text', 'fts')
            AND (pr.old_row -> k) IS DISTINCT FROM (pr.new_row -> k)
        )
        ELSE '[]'::jsonb
      END AS fields,
      coalesce(
        nullif(u.raw_user_meta_data ->> 'name', ''),
        nullif(u.raw_user_meta_data ->> 'full_name', ''),
        split_part(u.email, '@', 1)
      ) AS actor_name
    FROM public.platform_revision pr
    LEFT JOIN auth.users u ON u.id = coalesce(pr.actor, pr.created_by)
    WHERE pr.entity_table IN ('vehicle_catalog', 'catalog_spec_value')
    ORDER BY pr.created_at DESC
    LIMIT 200
  ),
  recent AS (
    SELECT ch.*, sk.label AS spec_label
    FROM changes ch
    JOIN vc ON vc.id = ch.car_id
    LEFT JOIN public.spec_key sk ON sk.key = ch.spec_key
    ORDER BY ch.created_at DESC
    LIMIT 5
  )
  SELECT jsonb_build_object(
    'versions', (SELECT count(*) FROM vc),
    'completeness', jsonb_build_object(
      'high', (SELECT count(*) FROM per_car WHERE key_parts >= 8),
      'mid',  (SELECT count(*) FROM per_car WHERE key_parts BETWEEN 4 AND 7),
      'low',  (SELECT count(*) FROM per_car WHERE key_parts BETWEEN 1 AND 3),
      'none', (SELECT count(*) FROM per_car WHERE key_parts = 0)
    ),
    'withSpecs', (SELECT count(*) FROM per_car WHERE spec_count > 0),
    'withoutSpecs', (SELECT count(*) FROM per_car WHERE spec_count = 0),
    'mostComplete', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'keyParts', t.key_parts, 'specCount', t.spec_count)
                       ORDER BY t.key_parts DESC, t.spec_count DESC)
      FROM (
        SELECT * FROM per_car
        WHERE key_parts > 0 OR spec_count > 0
        ORDER BY key_parts DESC, spec_count DESC, id
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    'cars', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', pc.id, 'keyParts', pc.key_parts, 'specCount', pc.spec_count))
      FROM per_car pc
      WHERE pc.id = ANY (coalesce(p_car_ids, ARRAY[]::uuid[]))
    ), '[]'::jsonb),
    'pendingApproval', (
      SELECT count(*) FROM public.vehicle_catalog_pending_requests
      WHERE status IN ('pending', 'needs_info')
    ),
    'recentParts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'brand', p.manufacturer,
        'at', p.created_at,
        'cars', p.cars,
        'carCount', p.car_count
      ) ORDER BY p.created_at DESC)
      FROM (
        SELECT pm.id, pm.name, pm.manufacturer, pm.created_at,
          coalesce((
            SELECT jsonb_agg(m.label ORDER BY m.label)
            FROM (
              SELECT DISTINCT c.make || ' ' || c.model AS label
              FROM public.part_listing pl
              JOIN public.vehicle_catalog c ON c.id = pl.vehicle_catalog_id
              WHERE pl.interchange_group_id = pm.interchange_group_id
              ORDER BY 1
              LIMIT 3
            ) m
          ), '[]'::jsonb) AS cars,
          (
            SELECT count(DISTINCT c.make || ' ' || c.model)
            FROM public.part_listing pl
            JOIN public.vehicle_catalog c ON c.id = pl.vehicle_catalog_id
            WHERE pl.interchange_group_id = pm.interchange_group_id
          ) AS car_count
        FROM public.part_master pm
        WHERE pm.catalog_decision IS DISTINCT FROM 'rejected'
        ORDER BY pm.created_at DESC
        LIMIT 5
      ) p
    ), '[]'::jsonb),
    'recentChanges', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'carId', r.car_id,
        'at', r.created_at,
        'kind', CASE WHEN r.entity_table = 'vehicle_catalog' THEN 'car' ELSE 'spec' END,
        'action', r.action,
        'specLabel', r.spec_label,
        'fields', r.fields,
        'actor', r.actor_name
      ) ORDER BY r.created_at DESC)
      FROM recent r
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_vehicles_dashboard(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_vehicles_dashboard(uuid[]) TO service_role;

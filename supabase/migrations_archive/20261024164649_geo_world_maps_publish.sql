-- One database step. Pending coverage rows must already exist for markets that were rebuilt.
CREATE OR REPLACE FUNCTION geo.commit_boundary_publish(
  p_pcode text,
  p_version_id uuid,
  p_pending_generation integer,
  p_recompiled_markets uuid[],
  p_merchant_moves jsonb,
  p_actor uuid,
  p_impact jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, delivery, public
AS $$
DECLARE
  old_generation integer;
  place_name text;
  version_geom geometry;
  move jsonb;
BEGIN
  SELECT active_generation INTO old_generation
  FROM delivery.coverage_state
  WHERE id = 1
  FOR UPDATE;

  SELECT v.geom, b.name INTO version_geom, place_name
  FROM geo.boundary_versions v
  JOIN geo.boundaries b ON b.pcode = v.pcode
  WHERE v.id = p_version_id
    AND v.pcode = p_pcode;
  IF version_geom IS NULL THEN
    RAISE EXCEPTION 'version_not_found';
  END IF;

  UPDATE geo.boundaries
  SET current_version_id = p_version_id, updated_at = now()
  WHERE pcode = p_pcode;

  UPDATE geo.boundary_versions
  SET status = 'published'
  WHERE id = p_version_id;

  UPDATE delivery.service_parishes sp
  SET
    adopted_geom = version_geom,
    adopted_version_id = p_version_id,
    adopted_at = now(),
    border_notice = 'Border updated by Roam Dominion · ' || place_name || ' v' ||
      (SELECT version FROM geo.boundary_versions WHERE id = p_version_id) || ' · ' ||
      to_char(now() AT TIME ZONE 'America/Jamaica', 'DD Mon')
  WHERE sp.pcode = p_pcode;

  UPDATE delivery.admin_boundaries ab
  SET
    geom = version_geom,
    geom_display = delivery.simplify_boundary_display(version_geom),
    source = (SELECT source FROM geo.boundary_versions WHERE id = p_version_id),
    updated_at = now()
  WHERE ab.pcode = p_pcode;

  UPDATE delivery.service_zone_polygons z
  SET
    geom = version_geom,
    boundary_version_id = p_version_id,
    updated_at = now()
  WHERE z.boundary_pcode = p_pcode
    AND COALESCE(z.kind, 'include') = 'include';

  IF p_recompiled_markets IS NOT NULL AND array_length(p_recompiled_markets, 1) IS NOT NULL THEN
    INSERT INTO delivery.coverage_cells (market_id, h3_cell, h3_res, kind, generation)
    SELECT c.market_id, c.h3_cell, c.h3_res, c.kind, p_pending_generation
    FROM delivery.coverage_cells c
    WHERE c.generation = old_generation
      AND NOT (c.market_id = ANY (p_recompiled_markets))
    ON CONFLICT DO NOTHING;

    UPDATE delivery.coverage_state
    SET active_generation = p_pending_generation
    WHERE id = 1;

    DELETE FROM delivery.coverage_cells
    WHERE generation = old_generation;
  END IF;

  IF p_merchant_moves IS NOT NULL AND jsonb_typeof(p_merchant_moves) = 'array' THEN
    FOR move IN SELECT * FROM jsonb_array_elements(p_merchant_moves)
    LOOP
      UPDATE delivery.merchants
      SET market_id = (move->>'market_id')::uuid
      WHERE id = (move->>'merchant_id')::uuid
        AND (move->>'market_id') IS NOT NULL;
    END LOOP;
  END IF;

  INSERT INTO geo.publish_log (pcode, version_id, actor_id, impact, status)
  VALUES (p_pcode, p_version_id, p_actor, COALESCE(p_impact, '{}'::jsonb), 'published');

  RETURN jsonb_build_object('ok', true, 'pcode', p_pcode, 'name', place_name);
END;
$$;

REVOKE ALL ON FUNCTION geo.commit_boundary_publish(text, uuid, integer, uuid[], jsonb, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.commit_boundary_publish(text, uuid, integer, uuid[], jsonb, uuid, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION geo.list_shapes(p_levels int[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = geo, delivery, public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.admin_level, s.name), '[]'::jsonb)
  FROM (
    SELECT
      b.pcode,
      b.admin_level,
      b.parent_pcode,
      b.name,
      b.slug,
      b.status,
      v.version,
      v.source,
      v.source_version,
      v.valid_on,
      b.center_lat,
      b.center_lng,
      delivery.display_rings_json(COALESCE(v.geom_display, delivery.simplify_boundary_display(v.geom))) AS rings
    FROM geo.boundaries b
    JOIN geo.boundary_versions v ON v.id = b.current_version_id
    WHERE b.status = 'active'
      AND (p_levels IS NULL OR b.admin_level = ANY (p_levels))
  ) s;
$$;

REVOKE ALL ON FUNCTION geo.list_shapes(int[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.list_shapes(int[]) TO service_role;

INSERT INTO platform.permissions (key, display_name, description, category, product_key)
VALUES (
  'platform.geo.write',
  'Edit World Maps',
  'Publish borders and pins for every app',
  'system',
  NULL
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
JOIN platform.permissions p ON p.key = 'platform.geo.write'
WHERE r.name IN ('platform_owner', 'superadmin')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION delivery.point_in_parish_foundation(
  p_parish_id uuid,
  p_lat double precision,
  p_lng double precision
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT CASE
    WHEN adopted_geom IS NOT NULL THEN
      ST_Covers(adopted_geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
    WHEN foundation_geom IS NOT NULL THEN
      ST_Covers(foundation_geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
    WHEN foundation_polygon IS NOT NULL THEN
      ST_Covers(
        delivery.jsonb_ring_to_multipolygon(foundation_polygon),
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
      )
    ELSE true
  END
  FROM delivery.service_parishes
  WHERE id = p_parish_id;
$$;

CREATE OR REPLACE FUNCTION delivery.parish_foundation_parts(p_parish_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT COALESCE(
    delivery.geom_to_coverage_parts(COALESCE(adopted_geom, foundation_geom)),
    '[]'::jsonb
  )
  FROM delivery.service_parishes
  WHERE id = p_parish_id;
$$;

GRANT EXECUTE ON FUNCTION delivery.point_in_parish_foundation TO service_role;
GRANT EXECUTE ON FUNCTION delivery.parish_foundation_parts(uuid) TO service_role;

CREATE OR REPLACE FUNCTION delivery.overview_community_shapes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, geo, public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.name), '[]'::jsonb)
  FROM (
    SELECT
      b.pcode,
      b.name,
      b.parent_pcode,
      COALESCE(b.center_lat, ST_Y(ST_PointOnSurface(COALESCE(v.geom_display, v.geom)))) AS center_lat,
      COALESCE(b.center_lng, ST_X(ST_PointOnSurface(COALESCE(v.geom_display, v.geom)))) AS center_lng,
      delivery.display_rings_json(
        COALESCE(v.geom_display, delivery.simplify_boundary_display(v.geom))
      ) AS rings
    FROM geo.boundaries b
    JOIN geo.boundary_versions v ON v.id = b.current_version_id
    WHERE b.admin_level = 3
      AND b.status = 'active'
  ) s;
$$;

CREATE OR REPLACE FUNCTION delivery.overview_town_shapes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, geo, public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.parish_name NULLS LAST, s.name), '[]'::jsonb)
  FROM (
    SELECT
      m.id AS market_id,
      m.name,
      m.parish_id,
      p.name AS parish_name,
      m.is_active,
      m.pcode,
      COALESCE(b.center_lat, ST_Y(ST_PointOnSurface(COALESCE(v.geom_display, v.geom)))) AS center_lat,
      COALESCE(b.center_lng, ST_X(ST_PointOnSurface(COALESCE(v.geom_display, v.geom)))) AS center_lng,
      delivery.display_rings_json(
        COALESCE(v.geom_display, delivery.simplify_boundary_display(v.geom))
      ) AS rings
    FROM delivery.service_markets m
    LEFT JOIN delivery.service_parishes p ON p.id = m.parish_id
    LEFT JOIN geo.boundaries b ON b.admin_level = 2 AND b.pcode = m.pcode
    LEFT JOIN geo.boundary_versions v ON v.id = b.current_version_id
  ) s;
$$;

CREATE OR REPLACE FUNCTION delivery.overview_parish_shapes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, geo, public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.name), '[]'::jsonb)
  FROM (
    SELECT
      p.id AS parish_id,
      p.name,
      delivery.display_rings_json(
        COALESCE(v.geom_display, delivery.simplify_boundary_display(v.geom))
      ) AS rings
    FROM delivery.service_parishes p
    LEFT JOIN geo.boundaries b ON b.admin_level = 1 AND b.pcode = p.pcode
    LEFT JOIN geo.boundary_versions v ON v.id = b.current_version_id
  ) s;
$$;

REVOKE ALL ON FUNCTION delivery.overview_community_shapes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery.overview_community_shapes() TO service_role;
GRANT EXECUTE ON FUNCTION delivery.overview_town_shapes() TO service_role;
GRANT EXECUTE ON FUNCTION delivery.overview_parish_shapes() TO service_role;

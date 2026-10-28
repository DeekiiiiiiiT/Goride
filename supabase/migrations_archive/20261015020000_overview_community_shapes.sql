-- Island overview reference layer: admin3 community outlines.
-- Communities are not markets. Read the catalog directly.

CREATE OR REPLACE FUNCTION delivery.overview_community_shapes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.name), '[]'::jsonb)
  FROM (
    SELECT
      b.pcode,
      b.name,
      b.parent_pcode,
      COALESCE(
        b.center_lat,
        ST_Y(ST_PointOnSurface(COALESCE(b.geom_display, b.geom)))
      ) AS center_lat,
      COALESCE(
        b.center_lng,
        ST_X(ST_PointOnSurface(COALESCE(b.geom_display, b.geom)))
      ) AS center_lng,
      delivery.display_rings_json(
        COALESCE(b.geom_display, delivery.simplify_boundary_display(b.geom))
      ) AS rings
    FROM delivery.admin_boundaries b
    WHERE b.admin_level = 3
  ) s;
$$;

REVOKE ALL ON FUNCTION delivery.overview_community_shapes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery.overview_community_shapes() TO service_role;

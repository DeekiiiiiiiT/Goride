-- Catalog town create is one transaction: the town row and its official border
-- commit together. A failed border rolls the town back.
-- Island overview reads simplified catalog geometry, not the full official ring.

CREATE OR REPLACE FUNCTION delivery.display_rings_json(g geometry)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  poly geometry;
  ring geometry;
  hole geometry;
  i int;
  coords jsonb;
BEGIN
  IF g IS NULL OR ST_IsEmpty(g) THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR poly IN
    SELECT d.geom FROM ST_Dump(g) AS d
  LOOP
    IF ST_GeometryType(poly) <> 'ST_Polygon' THEN
      CONTINUE;
    END IF;

    ring := ST_ExteriorRing(poly);
    SELECT jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng) ORDER BY idx)
    INTO coords
    FROM (
      SELECT
        ST_Y(ST_PointN(ring, gs)) AS lat,
        ST_X(ST_PointN(ring, gs)) AS lng,
        gs AS idx
      FROM generate_series(1, GREATEST(ST_NPoints(ring) - 1, 0)) AS gs
    ) q;

    IF coords IS NOT NULL AND jsonb_array_length(coords) >= 3 THEN
      result := result || jsonb_build_array(
        jsonb_build_object('kind', 'include', 'polygon', coords)
      );
    END IF;

    FOR i IN 1..COALESCE(ST_NumInteriorRings(poly), 0) LOOP
      hole := ST_InteriorRingN(poly, i);
      SELECT jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng) ORDER BY idx)
      INTO coords
      FROM (
        SELECT
          ST_Y(ST_PointN(hole, gs)) AS lat,
          ST_X(ST_PointN(hole, gs)) AS lng,
          gs AS idx
        FROM generate_series(1, GREATEST(ST_NPoints(hole) - 1, 0)) AS gs
      ) q;

      IF coords IS NOT NULL AND jsonb_array_length(coords) >= 3 THEN
        result := result || jsonb_build_array(
          jsonb_build_object('kind', 'exclude', 'polygon', coords)
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION delivery.overview_town_shapes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
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
    FROM delivery.service_markets m
    LEFT JOIN delivery.service_parishes p ON p.id = m.parish_id
    LEFT JOIN delivery.admin_boundaries b
      ON b.admin_level = 2 AND b.pcode = m.pcode
  ) s;
$$;

CREATE OR REPLACE FUNCTION delivery.create_inactive_town_from_boundary(
  p_parish_id uuid,
  p_pcode text,
  p_slug text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, public
AS $$
DECLARE
  parish delivery.service_parishes%ROWTYPE;
  boundary delivery.admin_boundaries%ROWTYPE;
  market delivery.service_markets%ROWTYPE;
  existing_id uuid;
  zone_result jsonb;
BEGIN
  IF p_slug IS NULL OR btrim(p_slug) = '' THEN
    RAISE EXCEPTION 'SLUG_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO parish FROM delivery.service_parishes WHERE id = p_parish_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PARISH_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO boundary
  FROM delivery.admin_boundaries
  WHERE pcode = p_pcode AND admin_level = 2
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOUNDARY_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF parish.pcode IS NOT NULL
     AND boundary.parent_pcode IS NOT NULL
     AND boundary.parent_pcode <> parish.pcode THEN
    RAISE EXCEPTION 'PARENT_MISMATCH:% vs %', boundary.parent_pcode, parish.pcode
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO existing_id
  FROM delivery.service_markets
  WHERE pcode = p_pcode
  LIMIT 1;
  IF existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'TOWN_EXISTS:%', existing_id USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM delivery.service_markets WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'SLUG_EXISTS:%', p_slug USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO delivery.service_markets (
    name, slug, parish_id, is_active, waitlist_enabled,
    pcode, parent_pcode, boundary_source, draft_dirty
  ) VALUES (
    boundary.name,
    p_slug,
    p_parish_id,
    false,
    true,
    p_pcode,
    boundary.parent_pcode,
    boundary.source,
    true
  )
  RETURNING * INTO market;

  zone_result := delivery.promote_boundary_to_market_zone(market.id, p_pcode, boundary.name);

  RETURN jsonb_build_object(
    'market', to_jsonb(market),
    'zone', zone_result
  );
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM ILIKE '%pcode%' THEN
      RAISE EXCEPTION 'TOWN_EXISTS' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'SLUG_EXISTS:%', p_slug USING ERRCODE = 'P0001';
END;
$$;

GRANT EXECUTE ON FUNCTION delivery.display_rings_json(geometry) TO service_role;
GRANT EXECUTE ON FUNCTION delivery.overview_town_shapes() TO service_role;
GRANT EXECUTE ON FUNCTION delivery.create_inactive_town_from_boundary(uuid, text, text) TO service_role;

CREATE OR REPLACE VIEW delivery.coverage_health_summary AS
SELECT
  p.id AS parish_id,
  p.slug,
  p.name,
  p.coverage_mode,
  p.pcode,
  p.boundary_source,
  p.boundary_valid_on,
  (p.foundation_geom IS NOT NULL) AS has_foundation_geom,
  (p.foundation_polygon IS NOT NULL AND jsonb_typeof(p.foundation_polygon) = 'array') AS has_foundation_jsonb,
  CASE
    WHEN p.foundation_polygon IS NOT NULL AND jsonb_typeof(p.foundation_polygon) = 'array'
    THEN jsonb_array_length(p.foundation_polygon)
    ELSE 0
  END AS foundation_vertex_count,
  (
    SELECT COUNT(*) FROM delivery.service_markets m WHERE m.parish_id = p.id
  ) AS town_count,
  (
    SELECT COUNT(*) FROM delivery.service_markets m
    WHERE m.parish_id = p.id AND m.pcode IS NOT NULL
  ) AS towns_with_pcode,
  (
    SELECT COUNT(*) FROM delivery.admin_boundaries b
    WHERE b.admin_level = 2 AND b.parent_pcode = p.pcode
  ) AS catalog_admin2_count,
  (
    SELECT COUNT(*) FROM delivery.service_markets m
    WHERE m.parish_id = p.id AND m.is_active
  ) AS active_town_count,
  (
    SELECT COUNT(*) FROM delivery.service_markets m
    WHERE m.parish_id = p.id
      AND NOT EXISTS (
        SELECT 1 FROM delivery.service_zone_polygons z
        WHERE z.market_id = m.id AND z.kind = 'include'
      )
  ) AS towns_missing_border,
  (
    SELECT COALESCE(string_agg(m.name, ', ' ORDER BY m.name), '')
    FROM delivery.service_markets m
    WHERE m.parish_id = p.id
      AND NOT EXISTS (
        SELECT 1 FROM delivery.service_zone_polygons z
        WHERE z.market_id = m.id AND z.kind = 'include'
      )
  ) AS towns_missing_border_names
FROM delivery.service_parishes p
ORDER BY p.sort_order;

GRANT SELECT ON delivery.coverage_health_summary TO service_role;

NOTIFY pgrst, 'reload schema';

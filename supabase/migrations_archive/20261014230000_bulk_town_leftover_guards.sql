-- Bulk-town leftovers: the eight split borders are an expected inventory.
-- A flat {lat,lng}[] cannot hold every piece (BUG-4). Coverage reads geom.
-- Drift (a missing or extra truncated town) is the failure, not these eight rows.

CREATE TABLE IF NOT EXISTS delivery.legacy_jsonb_zone_inventory (
  pcode text PRIMARY KEY,
  name text NOT NULL,
  recorded_on date NOT NULL DEFAULT DATE '2026-10-14'
);

COMMENT ON TABLE delivery.legacy_jsonb_zone_inventory IS
  'Towns whose legacy polygon jsonb is the first ring only. These rows are expected. delivery.legacy_jsonb_zone_drift() fails when the live set changes.';

INSERT INTO delivery.legacy_jsonb_zone_inventory (pcode, name) VALUES
  ('JM1006', 'Junction'),
  ('JM0603', 'Downtown'),
  ('JM1005', 'Greater Montego Bay'),
  ('JM1406', 'Grange Hill'),
  ('JM0506', 'Port Antonio Urban Centre'),
  ('JM0203', 'Hopewell'),
  ('JM1106', 'Highgate'),
  ('JM0805', 'Portmore')
ON CONFLICT (pcode) DO UPDATE SET name = EXCLUDED.name;

ALTER TABLE delivery.legacy_jsonb_zone_inventory ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON delivery.legacy_jsonb_zone_inventory TO service_role;

CREATE OR REPLACE FUNCTION delivery.legacy_jsonb_zone_drift()
RETURNS TABLE (pcode text, name text, drift text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  WITH live AS (
    SELECT DISTINCT ON (m.pcode) m.pcode, m.name
    FROM delivery.service_zone_polygons z
    JOIN delivery.service_markets m ON m.id = z.market_id
    WHERE m.pcode IS NOT NULL
      AND COALESCE(z.kind, 'include') = 'include'
      AND z.geom IS NOT NULL
      AND ST_NumGeometries(z.geom) > 1
      AND jsonb_typeof(z.polygon) = 'array'
      AND jsonb_array_length(z.polygon) < ST_NPoints(z.geom) - 1
    ORDER BY m.pcode, ST_Area(z.geom::geography) DESC
  )
  SELECT
    COALESCE(l.pcode, i.pcode) AS pcode,
    COALESCE(l.name, i.name) AS name,
    CASE WHEN l.pcode IS NULL THEN 'missing' ELSE 'unexpected' END AS drift
  FROM live l
  FULL OUTER JOIN delivery.legacy_jsonb_zone_inventory i ON i.pcode = l.pcode
  WHERE l.pcode IS NULL OR i.pcode IS NULL;
$$;

COMMENT ON FUNCTION delivery.legacy_jsonb_zone_drift() IS
  'Empty result is healthy. missing = an inventory town is no longer truncated. unexpected = a new truncated town.';

CREATE OR REPLACE FUNCTION delivery.market_launch_facts(p_market_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
DECLARE
  zone delivery.service_zone_polygons%ROWTYPE;
  area_sqkm numeric;
  parts int;
  n int;
  lat float8;
  lng float8;
  full_covers boolean;
  short_covers boolean;
  failed boolean := false;
  tested int := 0;
  detail text;
BEGIN
  SELECT z.* INTO zone
  FROM delivery.service_zone_polygons z
  WHERE z.market_id = p_market_id
    AND COALESCE(z.kind, 'include') = 'include'
    AND z.geom IS NOT NULL
  ORDER BY ST_Area(z.geom::geography) DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'border_area_sqkm', NULL,
      'split_border', false,
      'split_border_ok', true,
      'split_border_detail', NULL
    );
  END IF;

  area_sqkm := round((ST_Area(zone.geom::geography) / 1000000)::numeric, 1);
  parts := ST_NumGeometries(zone.geom);

  IF parts <= 1
     OR zone.polygon IS NULL
     OR jsonb_typeof(zone.polygon) <> 'array'
     OR jsonb_array_length(zone.polygon) >= ST_NPoints(zone.geom) - 1 THEN
    RETURN jsonb_build_object(
      'border_area_sqkm', area_sqkm,
      'split_border', false,
      'split_border_ok', true,
      'split_border_detail', NULL
    );
  END IF;

  FOR n IN 2..parts LOOP
    tested := tested + 1;
    lat := ST_Y(ST_PointOnSurface(ST_GeometryN(zone.geom, n)));
    lng := ST_X(ST_PointOnSurface(ST_GeometryN(zone.geom, n)));
    full_covers := ST_Covers(zone.geom, ST_SetSRID(ST_MakePoint(lng, lat), 4326));
    short_covers := ST_Covers(
      delivery.jsonb_ring_to_multipolygon(zone.polygon),
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)
    );
    IF full_covers IS DISTINCT FROM true OR short_covers IS DISTINCT FROM false THEN
      failed := true;
    END IF;
  END LOOP;

  IF failed THEN
    detail := 'Coverage is still using the short border. This town stays off until every extra piece is inside the full border and outside the short ring.';
  ELSE
    detail := format('Checked %s extra piece(s). Customers use the full border.', tested);
  END IF;

  RETURN jsonb_build_object(
    'border_area_sqkm', area_sqkm,
    'split_border', true,
    'split_border_ok', NOT failed,
    'split_border_detail', detail
  );
END;
$$;

CREATE OR REPLACE FUNCTION delivery.inactive_waitlist_at_point(
  p_lat double precision,
  p_lng double precision
) RETURNS TABLE (market_id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT m.id, m.name
  FROM delivery.service_markets m
  JOIN delivery.service_zone_polygons z ON z.market_id = m.id
  WHERE m.is_active = false
    AND m.waitlist_enabled = true
    AND COALESCE(z.kind, 'include') = 'include'
    AND z.geom IS NOT NULL
    AND ST_Covers(z.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  ORDER BY ST_Area(z.geom::geography) ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION delivery.overview_parish_shapes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.name), '[]'::jsonb)
  FROM (
    SELECT
      p.id AS parish_id,
      p.name,
      delivery.display_rings_json(
        COALESCE(b.geom_display, delivery.simplify_boundary_display(b.geom))
      ) AS rings
    FROM delivery.service_parishes p
    LEFT JOIN delivery.admin_boundaries b
      ON b.admin_level = 1 AND b.pcode = p.pcode
  ) s;
$$;

GRANT EXECUTE ON FUNCTION delivery.legacy_jsonb_zone_drift() TO service_role;
GRANT EXECUTE ON FUNCTION delivery.market_launch_facts(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION delivery.inactive_waitlist_at_point(double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION delivery.overview_parish_shapes() TO service_role;

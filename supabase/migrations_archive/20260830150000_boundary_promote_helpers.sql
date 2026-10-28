-- Promote helpers: catalog geom → parish foundation / market zones

CREATE OR REPLACE FUNCTION delivery.promote_boundary_to_parish(
  p_parish_id uuid,
  p_pcode text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, public
AS $$
DECLARE
  b delivery.admin_boundaries%ROWTYPE;
  ring jsonb;
BEGIN
  SELECT * INTO b
  FROM delivery.admin_boundaries
  WHERE pcode = p_pcode AND admin_level = 1
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin1 boundary % not found', p_pcode;
  END IF;

  -- Dual-write: primary outer ring as legacy jsonb for clients still on flat rings
  SELECT COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object('lat', (pt).lat, 'lng', (pt).lng) ORDER BY ord)
      FROM (
        SELECT ST_Y(d.geom) AS lat, ST_X(d.geom) AS lng, d.path[1] AS ord
        FROM ST_DumpPoints(ST_GeometryN(b.geom, 1)) AS d(path, geom)
        WHERE d.path[1] IS NOT NULL
      ) pts
      WHERE ord IS NOT NULL
    ),
    '[]'::jsonb
  ) INTO ring;

  -- Prefer a cleaner ring extract from exterior ring of first polygon
  ring := (
    SELECT jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng) ORDER BY i)
    FROM (
      SELECT
        ST_Y(ST_PointN(r.ring, gs)) AS lat,
        ST_X(ST_PointN(r.ring, gs)) AS lng,
        gs AS i
      FROM (
        SELECT ST_ExteriorRing(ST_GeometryN(b.geom, 1)) AS ring
      ) r
      CROSS JOIN generate_series(1, GREATEST(ST_NPoints(r.ring) - 1, 0)) AS gs
    ) s
  );

  UPDATE delivery.service_parishes
  SET
    foundation_geom = b.geom,
    foundation_polygon = COALESCE(ring, foundation_polygon),
    foundation_boundary_pcode = b.pcode,
    pcode = b.pcode,
    parent_pcode = b.parent_pcode,
    admin_level = 1,
    boundary_source = b.source,
    boundary_source_version = b.source_version,
    boundary_valid_on = b.valid_on,
    center_lat = b.center_lat,
    center_lng = b.center_lng,
    foundation_updated_at = now()
  WHERE id = p_parish_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'parish % not found', p_parish_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION delivery.promote_boundary_to_market_zone(
  p_market_id uuid,
  p_pcode text,
  p_zone_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, public
AS $$
DECLARE
  b delivery.admin_boundaries%ROWTYPE;
  ring jsonb;
  zone_id uuid;
  exclude_ids uuid[] := ARRAY[]::uuid[];
  hole_geom geometry;
  hole_ring jsonb;
  i int;
  poly geometry;
  hole_n int;
BEGIN
  SELECT * INTO b
  FROM delivery.admin_boundaries
  WHERE pcode = p_pcode AND admin_level = 2
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin2 boundary % not found', p_pcode;
  END IF;

  ring := (
    SELECT jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng) ORDER BY idx)
    FROM (
      SELECT
        ST_Y(ST_PointN(r.ring, gs)) AS lat,
        ST_X(ST_PointN(r.ring, gs)) AS lng,
        gs AS idx
      FROM (
        SELECT ST_ExteriorRing(ST_GeometryN(b.geom, 1)) AS ring
      ) r
      CROSS JOIN generate_series(1, GREATEST(ST_NPoints(r.ring) - 1, 0)) AS gs
    ) s
  );

  -- Upsert primary include zone named after boundary
  SELECT id INTO zone_id
  FROM delivery.service_zone_polygons
  WHERE market_id = p_market_id
    AND boundary_pcode = p_pcode
    AND kind = 'include'
  LIMIT 1;

  IF zone_id IS NULL THEN
    INSERT INTO delivery.service_zone_polygons (
      market_id, name, polygon, geom, kind, source, priority, boundary_pcode, updated_at
    ) VALUES (
      p_market_id,
      COALESCE(p_zone_name, b.name),
      COALESCE(ring, '[]'::jsonb),
      b.geom,
      'include',
      'import',
      0,
      p_pcode,
      now()
    )
    RETURNING id INTO zone_id;
  ELSE
    UPDATE delivery.service_zone_polygons
    SET
      name = COALESCE(p_zone_name, b.name),
      polygon = COALESCE(ring, polygon),
      geom = b.geom,
      source = 'import',
      boundary_pcode = p_pcode,
      updated_at = now()
    WHERE id = zone_id;
  END IF;

  -- Materialise holes from first polygon as exclude zones
  poly := ST_GeometryN(b.geom, 1);
  hole_n := ST_NumInteriorRings(poly);
  FOR i IN 1..COALESCE(hole_n, 0) LOOP
    hole_geom := ST_MakePolygon(ST_InteriorRingN(poly, i));
    hole_ring := (
      SELECT jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng) ORDER BY idx)
      FROM (
        SELECT
          ST_Y(ST_PointN(ST_ExteriorRing(hole_geom), gs)) AS lat,
          ST_X(ST_PointN(ST_ExteriorRing(hole_geom), gs)) AS lng,
          gs AS idx
        FROM generate_series(1, GREATEST(ST_NPoints(ST_ExteriorRing(hole_geom)) - 1, 0)) AS gs
      ) s
    );
    INSERT INTO delivery.service_zone_polygons (
      market_id, name, polygon, geom, kind, source, priority, boundary_pcode, updated_at
    ) VALUES (
      p_market_id,
      COALESCE(p_zone_name, b.name) || ' hole ' || i,
      COALESCE(hole_ring, '[]'::jsonb),
      ST_Multi(hole_geom),
      'exclude',
      'import',
      10 + i,
      p_pcode || '-hole-' || i,
      now()
    )
    RETURNING id INTO zone_id;
    exclude_ids := array_append(exclude_ids, zone_id);
  END LOOP;

  UPDATE delivery.service_markets
  SET
    pcode = p_pcode,
    parent_pcode = b.parent_pcode,
    boundary_source = b.source,
    draft_dirty = true
  WHERE id = p_market_id;

  RETURN jsonb_build_object(
    'zone_id', (SELECT id FROM delivery.service_zone_polygons
                WHERE market_id = p_market_id AND boundary_pcode = p_pcode AND kind = 'include' LIMIT 1),
    'exclude_ids', to_jsonb(exclude_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION delivery.promote_boundary_to_parish TO service_role;
GRANT EXECUTE ON FUNCTION delivery.promote_boundary_to_market_zone TO service_role;

-- Union selected admin3 pcodes into a market include zone
CREATE OR REPLACE FUNCTION delivery.union_admin3_to_market_zone(
  p_market_id uuid,
  p_pcodes text[],
  p_zone_name text DEFAULT 'Community union'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, public
AS $$
DECLARE
  g geometry;
  ring jsonb;
  zone_id uuid;
BEGIN
  SELECT ST_Multi(ST_UnaryUnion(ST_Collect(geom))) INTO g
  FROM delivery.admin_boundaries
  WHERE admin_level = 3 AND pcode = ANY (p_pcodes);

  IF g IS NULL OR ST_IsEmpty(g) THEN
    RAISE EXCEPTION 'No admin3 geometries for provided pcodes';
  END IF;
  g := ST_MakeValid(g);

  ring := (
    SELECT jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng) ORDER BY idx)
    FROM (
      SELECT
        ST_Y(ST_PointN(r.ring, gs)) AS lat,
        ST_X(ST_PointN(r.ring, gs)) AS lng,
        gs AS idx
      FROM (
        SELECT ST_ExteriorRing(ST_GeometryN(g, 1)) AS ring
      ) r
      CROSS JOIN generate_series(1, GREATEST(ST_NPoints(r.ring) - 1, 0)) AS gs
    ) s
  );

  INSERT INTO delivery.service_zone_polygons (
    market_id, name, polygon, geom, kind, source, priority, updated_at
  ) VALUES (
    p_market_id, p_zone_name, COALESCE(ring, '[]'::jsonb), g, 'include', 'import', 0, now()
  )
  RETURNING id INTO zone_id;

  UPDATE delivery.service_markets SET draft_dirty = true WHERE id = p_market_id;
  RETURN zone_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delivery.union_admin3_to_market_zone TO service_role;

-- Dual-write trigger: when foundation_polygon jsonb updated without geom, backfill geom
CREATE OR REPLACE FUNCTION delivery.sync_foundation_geom_from_jsonb()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.foundation_polygon IS DISTINCT FROM OLD.foundation_polygon
     AND NEW.foundation_polygon IS NOT NULL
     AND jsonb_typeof(NEW.foundation_polygon) = 'array'
     AND jsonb_array_length(NEW.foundation_polygon) >= 3
     AND (NEW.foundation_geom IS NULL OR NEW.foundation_geom IS NOT DISTINCT FROM OLD.foundation_geom) THEN
    NEW.foundation_geom := delivery.jsonb_ring_to_multipolygon(NEW.foundation_polygon);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_foundation_geom ON delivery.service_parishes;
CREATE TRIGGER trg_sync_foundation_geom
  BEFORE UPDATE OF foundation_polygon ON delivery.service_parishes
  FOR EACH ROW
  EXECUTE FUNCTION delivery.sync_foundation_geom_from_jsonb();

CREATE OR REPLACE FUNCTION delivery.sync_zone_geom_from_jsonb()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.polygon IS DISTINCT FROM OLD.polygon
     AND NEW.polygon IS NOT NULL
     AND jsonb_typeof(NEW.polygon) = 'array'
     AND jsonb_array_length(NEW.polygon) >= 3
     AND (NEW.geom IS NULL OR NEW.geom IS NOT DISTINCT FROM OLD.geom) THEN
    NEW.geom := delivery.jsonb_ring_to_multipolygon(NEW.polygon);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_zone_geom ON delivery.service_zone_polygons;
CREATE TRIGGER trg_sync_zone_geom
  BEFORE UPDATE OF polygon ON delivery.service_zone_polygons
  FOR EACH ROW
  EXECUTE FUNCTION delivery.sync_zone_geom_from_jsonb();

CREATE OR REPLACE FUNCTION delivery.sync_zone_geom_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.geom IS NULL AND NEW.polygon IS NOT NULL
     AND jsonb_typeof(NEW.polygon) = 'array'
     AND jsonb_array_length(NEW.polygon) >= 3 THEN
    NEW.geom := delivery.jsonb_ring_to_multipolygon(NEW.polygon);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_zone_geom_insert ON delivery.service_zone_polygons;
CREATE TRIGGER trg_sync_zone_geom_insert
  BEFORE INSERT ON delivery.service_zone_polygons
  FOR EACH ROW
  EXECUTE FUNCTION delivery.sync_zone_geom_on_insert();

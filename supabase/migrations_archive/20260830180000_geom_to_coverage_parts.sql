-- OPEN-11: Materialise full MultiPolygon parts for coverage (not truncated jsonb rings).

CREATE OR REPLACE FUNCTION delivery.ring_to_latlng_jsonb(r geometry)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng) ORDER BY i)
      FROM (
        SELECT
          ST_Y(ST_PointN(r, gs)) AS lat,
          ST_X(ST_PointN(r, gs)) AS lng,
          gs AS i
        FROM generate_series(1, GREATEST(ST_NPoints(r) - 1, 0)) AS gs
      ) s
    ),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION delivery.geom_to_coverage_parts(g geometry)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts jsonb := '[]'::jsonb;
  n int;
  i int;
  poly geometry;
  outer_ring jsonb;
  holes jsonb;
  hole_n int;
  h int;
  hole_ring jsonb;
BEGIN
  IF g IS NULL OR ST_IsEmpty(g) THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Normalise to MultiPolygon
  IF ST_GeometryType(g) = 'ST_Polygon' THEN
    g := ST_Multi(g);
  ELSIF ST_GeometryType(g) <> 'ST_MultiPolygon' THEN
    g := ST_Multi(ST_CollectionExtract(g, 3));
  END IF;

  n := ST_NumGeometries(g);
  FOR i IN 1..COALESCE(n, 0) LOOP
    poly := ST_GeometryN(g, i);
    outer_ring := delivery.ring_to_latlng_jsonb(ST_ExteriorRing(poly));
    holes := '[]'::jsonb;
    hole_n := ST_NumInteriorRings(poly);
    FOR h IN 1..COALESCE(hole_n, 0) LOOP
      hole_ring := delivery.ring_to_latlng_jsonb(ST_InteriorRingN(poly, h));
      holes := holes || jsonb_build_array(hole_ring);
    END LOOP;
    parts := parts || jsonb_build_array(jsonb_build_object(
      'outer', outer_ring,
      'holes', holes
    ));
  END LOOP;

  RETURN parts;
END;
$$;

CREATE OR REPLACE FUNCTION delivery.parish_foundation_parts(p_parish_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT COALESCE(delivery.geom_to_coverage_parts(foundation_geom), '[]'::jsonb)
  FROM delivery.service_parishes
  WHERE id = p_parish_id;
$$;

CREATE OR REPLACE FUNCTION delivery.zone_geom_parts(p_zone_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT COALESCE(delivery.geom_to_coverage_parts(geom), '[]'::jsonb)
  FROM delivery.service_zone_polygons
  WHERE id = p_zone_id;
$$;

GRANT EXECUTE ON FUNCTION delivery.ring_to_latlng_jsonb TO service_role;
GRANT EXECUTE ON FUNCTION delivery.geom_to_coverage_parts TO service_role;
GRANT EXECUTE ON FUNCTION delivery.parish_foundation_parts TO service_role;
GRANT EXECUTE ON FUNCTION delivery.zone_geom_parts TO service_role;

-- Rebuild geometry from coverage parts (restore / dual-write)
CREATE OR REPLACE FUNCTION delivery.coverage_parts_to_geom(parts jsonb)
RETURNS geometry
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  polys geometry[] := ARRAY[]::geometry[];
  part jsonb;
  outer_coords text;
  hole_coords text;
  ring jsonb;
  pt jsonb;
  i int;
  poly geometry;
  hole_lines geometry[];
BEGIN
  IF parts IS NULL OR jsonb_typeof(parts) <> 'array' OR jsonb_array_length(parts) = 0 THEN
    RETURN NULL;
  END IF;

  FOR i IN 0..jsonb_array_length(parts) - 1 LOOP
    part := parts->i;
    outer_coords := '';
    FOR pt IN SELECT * FROM jsonb_array_elements(COALESCE(part->'outer', '[]'::jsonb))
    LOOP
      IF outer_coords <> '' THEN outer_coords := outer_coords || ','; END IF;
      outer_coords := outer_coords || (pt->>'lng') || ' ' || (pt->>'lat');
    END LOOP;
    IF outer_coords = '' THEN CONTINUE; END IF;
    pt := (part->'outer')->0;
    outer_coords := outer_coords || ',' || (pt->>'lng') || ' ' || (pt->>'lat');

    hole_lines := ARRAY[]::geometry[];
    FOR ring IN SELECT * FROM jsonb_array_elements(COALESCE(part->'holes', '[]'::jsonb))
    LOOP
      hole_coords := '';
      FOR pt IN SELECT * FROM jsonb_array_elements(ring)
      LOOP
        IF hole_coords <> '' THEN hole_coords := hole_coords || ','; END IF;
        hole_coords := hole_coords || (pt->>'lng') || ' ' || (pt->>'lat');
      END LOOP;
      IF hole_coords = '' THEN CONTINUE; END IF;
      pt := ring->0;
      hole_coords := hole_coords || ',' || (pt->>'lng') || ' ' || (pt->>'lat');
      hole_lines := array_append(hole_lines, ST_GeomFromText('LINESTRING(' || hole_coords || ')', 4326));
    END LOOP;

    IF array_length(hole_lines, 1) IS NULL THEN
      poly := ST_MakePolygon(ST_GeomFromText('LINESTRING(' || outer_coords || ')', 4326));
    ELSE
      poly := ST_MakePolygon(
        ST_GeomFromText('LINESTRING(' || outer_coords || ')', 4326),
        hole_lines
      );
    END IF;
    polys := array_append(polys, poly);
  END LOOP;

  IF array_length(polys, 1) IS NULL THEN RETURN NULL; END IF;
  RETURN ST_SetSRID(ST_Multi(ST_Collect(polys)), 4326);
END;
$$;

GRANT EXECUTE ON FUNCTION delivery.coverage_parts_to_geom TO service_role;

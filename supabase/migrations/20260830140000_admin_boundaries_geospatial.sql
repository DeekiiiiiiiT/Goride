-- COD-AB official boundaries catalog + MultiPolygon PostGIS columns (dual-write with jsonb).
-- Polygons remain admin SoT; H3 remains derived cache (ADR 0013).

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Official immutable catalog (admin0–admin3)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery.admin_boundaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_level smallint NOT NULL CHECK (admin_level BETWEEN 0 AND 3),
  pcode text NOT NULL,
  parent_pcode text,
  name text NOT NULL,
  slug text NOT NULL,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  geom_display geometry(MultiPolygon, 4326),
  area_sqkm numeric,
  center_lat numeric,
  center_lng numeric,
  source text NOT NULL DEFAULT 'cod-ab',
  source_version text,
  valid_on date,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_level, pcode)
);

CREATE INDEX IF NOT EXISTS idx_admin_boundaries_geom
  ON delivery.admin_boundaries USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_admin_boundaries_geom_display
  ON delivery.admin_boundaries USING GIST (geom_display);
CREATE INDEX IF NOT EXISTS idx_admin_boundaries_parent
  ON delivery.admin_boundaries (parent_pcode);
CREATE INDEX IF NOT EXISTS idx_admin_boundaries_slug_level
  ON delivery.admin_boundaries (admin_level, slug);

ALTER TABLE delivery.admin_boundaries ENABLE ROW LEVEL SECURITY;
GRANT ALL ON delivery.admin_boundaries TO service_role;

COMMENT ON TABLE delivery.admin_boundaries IS
  'Immutable COD-AB (and future) official admin boundaries. Operational delivery zones reference by pcode.';

-- ---------------------------------------------------------------------------
-- Operational dual-write columns
-- ---------------------------------------------------------------------------
ALTER TABLE delivery.service_parishes
  ADD COLUMN IF NOT EXISTS foundation_geom geometry(MultiPolygon, 4326),
  ADD COLUMN IF NOT EXISTS foundation_boundary_pcode text,
  ADD COLUMN IF NOT EXISTS admin_level smallint,
  ADD COLUMN IF NOT EXISTS pcode text,
  ADD COLUMN IF NOT EXISTS parent_pcode text,
  ADD COLUMN IF NOT EXISTS boundary_source text,
  ADD COLUMN IF NOT EXISTS boundary_source_version text,
  ADD COLUMN IF NOT EXISTS boundary_valid_on date,
  ADD COLUMN IF NOT EXISTS center_lat numeric,
  ADD COLUMN IF NOT EXISTS center_lng numeric;

CREATE INDEX IF NOT EXISTS idx_service_parishes_foundation_geom
  ON delivery.service_parishes USING GIST (foundation_geom);
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_parishes_pcode
  ON delivery.service_parishes (pcode) WHERE pcode IS NOT NULL;

ALTER TABLE delivery.service_zone_polygons
  ADD COLUMN IF NOT EXISTS geom geometry(MultiPolygon, 4326),
  ADD COLUMN IF NOT EXISTS boundary_pcode text;

CREATE INDEX IF NOT EXISTS idx_service_zone_polygons_geom
  ON delivery.service_zone_polygons USING GIST (geom);

ALTER TABLE delivery.service_markets
  ADD COLUMN IF NOT EXISTS pcode text,
  ADD COLUMN IF NOT EXISTS parent_pcode text,
  ADD COLUMN IF NOT EXISTS boundary_source text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_markets_pcode
  ON delivery.service_markets (pcode) WHERE pcode IS NOT NULL;

-- Parish outline version history (mirrors town coverage versions at parish level)
CREATE TABLE IF NOT EXISTS delivery.parish_outline_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parish_id uuid NOT NULL REFERENCES delivery.service_parishes(id) ON DELETE CASCADE,
  version integer NOT NULL,
  label text,
  notes text,
  foundation_polygon jsonb,
  foundation_geom geometry(MultiPolygon, 4326),
  foundation_boundary_pcode text,
  boundary_source text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parish_id, version)
);

ALTER TABLE delivery.parish_outline_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON delivery.parish_outline_versions TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers: GeoJSON MultiPolygon ↔ geometry; jsonb ring ↔ geometry
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION delivery.ring_jsonb_to_geom(ring jsonb)
RETURNS geometry
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  pts text := '';
  el jsonb;
  lat double precision;
  lng double precision;
  n int := 0;
  first_lng double precision;
  first_lat double precision;
BEGIN
  IF ring IS NULL OR jsonb_typeof(ring) <> 'array' OR jsonb_array_length(ring) < 3 THEN
    RETURN NULL;
  END IF;
  FOR el IN SELECT * FROM jsonb_array_elements(ring)
  LOOP
    lat := (el->>'lat')::double precision;
    lng := (el->>'lng')::double precision;
    IF lat IS NULL OR lng IS NULL THEN
      CONTINUE;
    END IF;
    IF n = 0 THEN
      first_lng := lng;
      first_lat := lat;
      pts := format('%s %s', lng, lat);
    ELSE
      pts := pts || ', ' || format('%s %s', lng, lat);
    END IF;
    n := n + 1;
  END LOOP;
  IF n < 3 THEN
    RETURN NULL;
  END IF;
  -- Close ring if needed
  IF first_lng IS DISTINCT FROM ((ring->(jsonb_array_length(ring)-1)->>'lng')::double precision)
     OR first_lat IS DISTINCT FROM ((ring->(jsonb_array_length(ring)-1)->>'lat')::double precision) THEN
    pts := pts || ', ' || format('%s %s', first_lng, first_lat);
  END IF;
  RETURN ST_SetSRID(ST_GeomFromText('POLYGON((' || pts || '))'), 4326);
END;
$$;

CREATE OR REPLACE FUNCTION delivery.jsonb_ring_to_multipolygon(ring jsonb)
RETURNS geometry
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN g IS NULL THEN NULL
    ELSE ST_Multi(ST_CollectionExtract(ST_MakeValid(g), 3))
  END
  FROM (SELECT delivery.ring_jsonb_to_geom(ring) AS g) s;
$$;

CREATE OR REPLACE FUNCTION delivery.geojson_to_multipolygon(gj jsonb)
RETURNS geometry
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  g geometry;
BEGIN
  IF gj IS NULL THEN
    RETURN NULL;
  END IF;
  g := ST_SetSRID(ST_GeomFromGeoJSON(gj::text), 4326);
  IF g IS NULL THEN
    RETURN NULL;
  END IF;
  g := ST_MakeValid(g);
  IF ST_GeometryType(g) = 'ST_Polygon' THEN
    RETURN ST_Multi(g);
  ELSIF ST_GeometryType(g) = 'ST_MultiPolygon' THEN
    RETURN g;
  ELSE
    RETURN ST_Multi(ST_CollectionExtract(g, 3));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION delivery.simplify_boundary_display(g geometry)
RETURNS geometry
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN g IS NULL THEN NULL
    ELSE ST_Multi(ST_CollectionExtract(
      ST_MakeValid(ST_SimplifyPreserveTopology(g, 0.00015)),
      3
    ))
  END;
$$;

-- Point-in-coverage using PostGIS when geom present
CREATE OR REPLACE FUNCTION delivery.point_covers_geom(
  lat double precision,
  lng double precision,
  g geometry
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT g IS NOT NULL
    AND ST_Covers(g, ST_SetSRID(ST_MakePoint(lng, lat), 4326));
$$;

CREATE OR REPLACE FUNCTION delivery.upsert_admin_boundary(
  p_admin_level smallint,
  p_pcode text,
  p_parent_pcode text,
  p_name text,
  p_slug text,
  p_geojson jsonb,
  p_area_sqkm numeric DEFAULT NULL,
  p_center_lat numeric DEFAULT NULL,
  p_center_lng numeric DEFAULT NULL,
  p_source text DEFAULT 'cod-ab',
  p_source_version text DEFAULT NULL,
  p_valid_on date DEFAULT NULL,
  p_properties jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, public
AS $$
DECLARE
  g geometry;
  gd geometry;
  rid uuid;
  clat numeric;
  clng numeric;
BEGIN
  g := delivery.geojson_to_multipolygon(p_geojson);
  IF g IS NULL OR ST_IsEmpty(g) THEN
    RAISE EXCEPTION 'Invalid MultiPolygon GeoJSON for pcode %', p_pcode;
  END IF;
  gd := delivery.simplify_boundary_display(g);
  clat := COALESCE(p_center_lat, ST_Y(ST_PointOnSurface(g)));
  clng := COALESCE(p_center_lng, ST_X(ST_PointOnSurface(g)));

  INSERT INTO delivery.admin_boundaries AS ab (
    admin_level, pcode, parent_pcode, name, slug,
    geom, geom_display, area_sqkm, center_lat, center_lng,
    source, source_version, valid_on, properties, updated_at
  ) VALUES (
    p_admin_level, p_pcode, p_parent_pcode, p_name, p_slug,
    g, gd,
    COALESCE(p_area_sqkm, ROUND((ST_Area(g::geography) / 1000000.0)::numeric, 4)),
    clat, clng,
    COALESCE(p_source, 'cod-ab'), p_source_version, p_valid_on,
    COALESCE(p_properties, '{}'::jsonb), now()
  )
  ON CONFLICT (admin_level, pcode) DO UPDATE SET
    parent_pcode = EXCLUDED.parent_pcode,
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    geom = EXCLUDED.geom,
    geom_display = EXCLUDED.geom_display,
    area_sqkm = EXCLUDED.area_sqkm,
    center_lat = EXCLUDED.center_lat,
    center_lng = EXCLUDED.center_lng,
    source = EXCLUDED.source,
    source_version = EXCLUDED.source_version,
    valid_on = EXCLUDED.valid_on,
    properties = EXCLUDED.properties,
    updated_at = now()
  RETURNING id INTO rid;

  RETURN rid;
END;
$$;

GRANT EXECUTE ON FUNCTION delivery.upsert_admin_boundary TO service_role;
GRANT EXECUTE ON FUNCTION delivery.point_covers_geom TO service_role;
GRANT EXECUTE ON FUNCTION delivery.geojson_to_multipolygon TO service_role;
GRANT EXECUTE ON FUNCTION delivery.jsonb_ring_to_multipolygon TO service_role;
GRANT EXECUTE ON FUNCTION delivery.simplify_boundary_display TO service_role;

-- Backfill foundation_geom from existing single-ring jsonb where possible
UPDATE delivery.service_parishes
SET foundation_geom = delivery.jsonb_ring_to_multipolygon(foundation_polygon)
WHERE foundation_polygon IS NOT NULL
  AND jsonb_typeof(foundation_polygon) = 'array'
  AND jsonb_array_length(foundation_polygon) >= 3
  AND foundation_geom IS NULL;

UPDATE delivery.service_zone_polygons
SET geom = delivery.jsonb_ring_to_multipolygon(polygon)
WHERE polygon IS NOT NULL
  AND jsonb_typeof(polygon) = 'array'
  AND jsonb_array_length(polygon) >= 3
  AND geom IS NULL;

-- Coverage health helper view
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
  ) AS catalog_admin2_count
FROM delivery.service_parishes p
ORDER BY p.sort_order;

GRANT SELECT ON delivery.coverage_health_summary TO service_role;

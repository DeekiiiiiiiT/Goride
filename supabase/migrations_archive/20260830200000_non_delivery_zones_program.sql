-- Non-Delivery Zones program: operational columns, schedules, scoped exclusions,
-- net coverage materialization, zone policies, PostGIS containment RPC.

-- Phase 1: operational columns on market-local zones
ALTER TABLE delivery.service_zone_polygons
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS effective_from timestamptz,
  ADD COLUMN IF NOT EXISTS effective_to timestamptz,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS zone_policy jsonb NOT NULL DEFAULT '{"action":"block"}'::jsonb;

ALTER TABLE delivery.service_zone_polygons
  DROP CONSTRAINT IF EXISTS service_zone_polygons_category_check;

ALTER TABLE delivery.service_zone_polygons
  ADD CONSTRAINT service_zone_polygons_category_check CHECK (
    category IS NULL OR category IN (
      'safety', 'access', 'legal', 'operational', 'temporary', 'geographic'
    )
  );

CREATE TABLE IF NOT EXISTS delivery.zone_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES delivery.service_zone_polygons(id) ON DELETE CASCADE,
  dow smallint[] NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Jamaica',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zone_schedules_zone
  ON delivery.zone_schedules(zone_id);

ALTER TABLE delivery.zone_schedules ENABLE ROW LEVEL SECURITY;
GRANT ALL ON delivery.zone_schedules TO service_role;

-- Phase 2: scoped exclusions (global / parish / market)
CREATE TABLE IF NOT EXISTS delivery.scoped_exclusion_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global', 'parish', 'market')),
  parish_id uuid REFERENCES delivery.service_parishes(id) ON DELETE CASCADE,
  market_id uuid REFERENCES delivery.service_markets(id) ON DELETE CASCADE,
  name text NOT NULL,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  polygon jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz,
  effective_to timestamptz,
  category text CHECK (
    category IS NULL OR category IN (
      'safety', 'access', 'legal', 'operational', 'temporary', 'geographic'
    )
  ),
  reason text,
  zone_policy jsonb NOT NULL DEFAULT '{"action":"block"}'::jsonb,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT scoped_exclusion_zones_scope_fk CHECK (
    (scope = 'global' AND parish_id IS NULL AND market_id IS NULL) OR
    (scope = 'parish' AND parish_id IS NOT NULL AND market_id IS NULL) OR
    (scope = 'market' AND market_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_scoped_exclusion_geom
  ON delivery.scoped_exclusion_zones USING GIST(geom);

CREATE INDEX IF NOT EXISTS idx_scoped_exclusion_scope
  ON delivery.scoped_exclusion_zones(scope, is_active);

CREATE TABLE IF NOT EXISTS delivery.scoped_zone_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES delivery.scoped_exclusion_zones(id) ON DELETE CASCADE,
  dow smallint[] NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Jamaica',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scoped_zone_schedules_zone
  ON delivery.scoped_zone_schedules(zone_id);

ALTER TABLE delivery.scoped_exclusion_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.scoped_zone_schedules ENABLE ROW LEVEL SECURITY;
GRANT ALL ON delivery.scoped_exclusion_zones TO service_role;
GRANT ALL ON delivery.scoped_zone_schedules TO service_role;

-- Phase 4: materialised net coverage per market
ALTER TABLE delivery.service_markets
  ADD COLUMN IF NOT EXISTS net_coverage_geom geometry(MultiPolygon, 4326),
  ADD COLUMN IF NOT EXISTS net_coverage_stats jsonb;

CREATE INDEX IF NOT EXISTS idx_service_markets_net_coverage_geom
  ON delivery.service_markets USING GIST(net_coverage_geom);

-- Refresh net coverage for a market (include union minus all applicable excludes)
CREATE OR REPLACE FUNCTION delivery.refresh_market_net_coverage(p_market_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, public
AS $$
DECLARE
  v_parish_id uuid;
  v_include_geom geometry;
  v_exclude_geom geometry;
  v_net geometry;
  v_sqkm numeric;
  v_stats jsonb;
BEGIN
  SELECT parish_id INTO v_parish_id
  FROM delivery.service_markets WHERE id = p_market_id;

  SELECT ST_Union(geom) INTO v_include_geom
  FROM delivery.service_zone_polygons
  WHERE market_id = p_market_id
    AND kind = 'include'
    AND is_active
    AND geom IS NOT NULL;

  SELECT ST_Union(u.geom) INTO v_exclude_geom
  FROM (
    SELECT geom FROM delivery.service_zone_polygons
    WHERE market_id = p_market_id AND kind = 'exclude' AND is_active AND geom IS NOT NULL
    UNION ALL
    SELECT geom FROM delivery.scoped_exclusion_zones
    WHERE is_active AND geom IS NOT NULL
      AND (
        scope = 'global'
        OR (scope = 'parish' AND parish_id = v_parish_id)
        OR (scope = 'market' AND market_id = p_market_id)
      )
  ) u;

  IF v_include_geom IS NULL THEN
    UPDATE delivery.service_markets
    SET net_coverage_geom = NULL, net_coverage_stats = NULL
    WHERE id = p_market_id;
    RETURN NULL;
  END IF;

  v_net := ST_Difference(
    v_include_geom,
    COALESCE(v_exclude_geom, ST_GeomFromText('MULTIPOLYGON EMPTY', 4326))
  );

  v_sqkm := round((ST_Area(v_net::geography) / 1000000)::numeric, 4);

  v_stats := jsonb_build_object(
    'net_sqkm', v_sqkm,
    'refreshed_at', now()
  );

  UPDATE delivery.service_markets
  SET net_coverage_geom = v_net, net_coverage_stats = v_stats
  WHERE id = p_market_id;

  RETURN v_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION delivery.refresh_market_net_coverage TO service_role;

-- Phase 3: indexed containment lookup
CREATE OR REPLACE FUNCTION delivery.resolve_containing_zones(
  p_lat double precision,
  p_lng double precision,
  p_market_id uuid DEFAULT NULL,
  p_parish_id uuid DEFAULT NULL
)
RETURNS TABLE (
  zone_id uuid,
  zone_name text,
  zone_kind text,
  zone_priority integer,
  zone_source text,
  market_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  WITH pt AS (
    SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326) AS g
  ),
  market_zones AS (
    SELECT
      z.id AS zone_id,
      z.name AS zone_name,
      z.kind AS zone_kind,
      z.priority AS zone_priority,
      'market'::text AS zone_source,
      z.market_id
    FROM delivery.service_zone_polygons z, pt
    WHERE z.is_active
      AND z.geom IS NOT NULL
      AND ST_Covers(z.geom, pt.g)
      AND (p_market_id IS NULL OR z.market_id = p_market_id)
  ),
  scoped AS (
    SELECT
      s.id AS zone_id,
      s.name AS zone_name,
      'exclude'::text AS zone_kind,
      s.priority AS zone_priority,
      'scoped'::text AS zone_source,
      s.market_id
    FROM delivery.scoped_exclusion_zones s, pt
    WHERE s.is_active
      AND s.geom IS NOT NULL
      AND ST_Covers(s.geom, pt.g)
      AND (
        s.scope = 'global'
        OR (s.scope = 'parish' AND p_parish_id IS NOT NULL AND s.parish_id = p_parish_id)
        OR (s.scope = 'market' AND p_market_id IS NOT NULL AND s.market_id = p_market_id)
      )
  )
  SELECT * FROM market_zones
  UNION ALL
  SELECT * FROM scoped
  ORDER BY zone_priority DESC, zone_kind ASC, zone_id ASC;
$$;

GRANT EXECUTE ON FUNCTION delivery.resolve_containing_zones TO service_role;

-- Hygiene: expired exclusions still active
CREATE OR REPLACE VIEW delivery.v_expired_active_exclusions AS
SELECT id, name, effective_to, 'market'::text AS scope
FROM delivery.service_zone_polygons
WHERE kind = 'exclude'
  AND is_active
  AND effective_to IS NOT NULL
  AND effective_to < now()
UNION ALL
SELECT id, name, effective_to, scope
FROM delivery.scoped_exclusion_zones
WHERE is_active
  AND effective_to IS NOT NULL
  AND effective_to < now();

GRANT SELECT ON delivery.v_expired_active_exclusions TO service_role;

NOTIFY pgrst, 'reload schema';

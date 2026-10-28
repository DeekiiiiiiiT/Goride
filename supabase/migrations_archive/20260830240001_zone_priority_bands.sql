-- TIE-BREAK-1 / priority bands: exclusions default to 100; equal-priority ties favour exclude.
-- Includes stay low (service areas at 10). Safe islands use include priority > overlapping exclude
-- (no hard CHECK — overlapping bands remain legal for islands).

ALTER TABLE delivery.service_zone_polygons
  ALTER COLUMN priority SET DEFAULT 100;

UPDATE delivery.service_zone_polygons
SET priority = 100
WHERE kind = 'exclude' AND priority < 100;

ALTER TABLE delivery.scoped_exclusion_zones
  ALTER COLUMN priority SET DEFAULT 100;

UPDATE delivery.scoped_exclusion_zones
SET priority = 100
WHERE priority < 100;

-- Align candidate order with pickWinningMatch: priority DESC, exclude before include, id ASC.
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
  ),
  combined AS (
    SELECT * FROM market_zones
    UNION ALL
    SELECT * FROM scoped
  )
  SELECT
    zone_id,
    zone_name,
    zone_kind,
    zone_priority,
    zone_source,
    market_id
  FROM combined
  ORDER BY
    zone_priority DESC,
    CASE WHEN zone_kind = 'exclude' THEN 0 ELSE 1 END,
    zone_id ASC;
$$;

GRANT EXECUTE ON FUNCTION delivery.resolve_containing_zones TO service_role;

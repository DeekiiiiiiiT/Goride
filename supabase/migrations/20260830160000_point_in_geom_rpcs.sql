-- PostGIS point-in-polygon RPCs for parish foundation + zone geom

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

CREATE OR REPLACE FUNCTION delivery.point_in_zone_geom(
  p_zone_id uuid,
  p_lat double precision,
  p_lng double precision
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT CASE
    WHEN geom IS NOT NULL THEN
      ST_Covers(geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
    ELSE
      ST_Covers(
        delivery.jsonb_ring_to_multipolygon(polygon),
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
      )
  END
  FROM delivery.service_zone_polygons
  WHERE id = p_zone_id;
$$;

GRANT EXECUTE ON FUNCTION delivery.point_in_parish_foundation TO service_role;
GRANT EXECUTE ON FUNCTION delivery.point_in_zone_geom TO service_role;

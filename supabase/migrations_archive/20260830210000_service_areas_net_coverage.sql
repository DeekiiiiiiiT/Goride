-- ADR-0018: net coverage unions live service areas when present; else official imports.

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
  v_has_service boolean;
BEGIN
  SELECT parish_id INTO v_parish_id
  FROM delivery.service_markets WHERE id = p_market_id;

  SELECT EXISTS (
    SELECT 1 FROM delivery.service_zone_polygons
    WHERE market_id = p_market_id
      AND kind = 'include'
      AND is_active
      AND COALESCE(source, 'manual') IN ('manual', 'radius', 'auto_outline')
      AND geom IS NOT NULL
  ) INTO v_has_service;

  IF v_has_service THEN
    SELECT ST_Union(geom) INTO v_include_geom
    FROM delivery.service_zone_polygons
    WHERE market_id = p_market_id
      AND kind = 'include'
      AND is_active
      AND COALESCE(source, 'manual') IN ('manual', 'radius', 'auto_outline')
      AND geom IS NOT NULL;
  ELSE
    SELECT ST_Union(geom) INTO v_include_geom
    FROM delivery.service_zone_polygons
    WHERE market_id = p_market_id
      AND kind = 'include'
      AND is_active
      AND geom IS NOT NULL;
  END IF;

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
    'service_areas_mode', v_has_service,
    'refreshed_at', now()
  );

  UPDATE delivery.service_markets
  SET net_coverage_geom = v_net, net_coverage_stats = v_stats
  WHERE id = p_market_id;

  RETURN v_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION delivery.refresh_market_net_coverage TO service_role;

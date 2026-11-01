CREATE OR REPLACE FUNCTION geo.check_import(p_features jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = geo, delivery, public
AS $$
DECLARE
  feature jsonb;
  result jsonb := '[]'::jsonb;
  feature_code text;
  feature_name text;
  g geometry;
  live geometry;
  parent_geom geometry;
  area numeric;
  outside_pct numeric;
  overlap_pct numeric;
  change_pct numeric;
  matched boolean;
  level smallint;
  valid boolean;
BEGIN
  IF p_features IS NULL OR jsonb_typeof(p_features) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR feature IN SELECT value FROM jsonb_array_elements(p_features)
  LOOP
    feature_code := btrim(COALESCE(feature->>'pcode', feature#>>'{properties,pcode}', feature#>>'{properties,PCODE}', ''));
    feature_name := COALESCE(feature->>'name', feature#>>'{properties,name}', feature_code);
    matched := false;
    level := NULL;
    valid := false;
    outside_pct := NULL;
    overlap_pct := NULL;
    change_pct := NULL;
    g := NULL;
    SELECT b.admin_level, v.geom INTO level, live
    FROM geo.boundaries b
    LEFT JOIN geo.boundary_versions v ON v.id = b.current_version_id
    WHERE b.pcode = feature_code;
    matched := FOUND AND level IS NOT NULL;
    BEGIN
      g := delivery.geojson_to_multipolygon(COALESCE(feature->'geometry', feature->'geojson'));
    EXCEPTION WHEN OTHERS THEN
      g := NULL;
    END;
    valid := g IS NOT NULL AND NOT ST_IsEmpty(g) AND ST_IsValid(g);
    IF valid THEN
      g := ST_SimplifyPreserveTopology(g, 0.0005);
      area := ST_Area(g::geography);
      IF live IS NOT NULL AND ST_Area(live::geography) > 0 THEN
        change_pct := round((ST_Area(ST_SymDifference(ST_SimplifyPreserveTopology(live, 0.0005), g)::geography) / ST_Area(live::geography) * 100)::numeric, 1);
      END IF;
      SELECT p.geom INTO parent_geom
      FROM geo.boundaries b
      JOIN geo.boundary_versions p ON p.id = (
        SELECT parent.current_version_id FROM geo.boundaries parent WHERE parent.pcode = b.parent_pcode
      )
      WHERE b.pcode = feature_code;
      IF parent_geom IS NOT NULL AND area > 0 THEN
        outside_pct := round((ST_Area(ST_Difference(g, ST_SimplifyPreserveTopology(parent_geom, 0.0005))::geography) / area * 100)::numeric, 1);
      END IF;
      SELECT round((ST_Area(ST_Intersection(g, ST_SimplifyPreserveTopology(sv.geom, 0.0005))::geography) / NULLIF(area, 0) * 100)::numeric, 1)
      INTO overlap_pct
      FROM geo.boundaries b
      JOIN geo.boundaries s ON s.parent_pcode IS NOT DISTINCT FROM b.parent_pcode
        AND s.admin_level = b.admin_level
        AND s.pcode <> b.pcode
      JOIN geo.boundary_versions sv ON sv.id = s.current_version_id
      WHERE b.pcode = feature_code
        AND sv.geom && g
      ORDER BY 1 DESC NULLS LAST
      LIMIT 1;
    END IF;
    result := result || jsonb_build_array(jsonb_build_object(
      'pcode', feature_code,
      'name', feature_name,
      'matched', matched,
      'level', level,
      'valid', valid,
      'area_change_pct', change_pct,
      'outside_parent_pct', outside_pct,
      'overlap_pct', overlap_pct
    ));
  END LOOP;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION geo.check_import(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.check_import(jsonb) TO service_role;;

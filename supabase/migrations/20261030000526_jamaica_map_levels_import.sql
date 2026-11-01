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
  pcode text;
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
    pcode := btrim(COALESCE(feature->>'pcode', feature#>>'{properties,pcode}', feature#>>'{properties,PCODE}', ''));
    feature_name := COALESCE(feature->>'name', feature#>>'{properties,name}', pcode);
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
    WHERE b.pcode = pcode;
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
        SELECT current_version_id FROM geo.boundaries WHERE pcode = b.parent_pcode
      )
      WHERE b.pcode = pcode;
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
      WHERE b.pcode = pcode
        AND sv.geom && g
      ORDER BY 1 DESC NULLS LAST
      LIMIT 1;
    END IF;
    result := result || jsonb_build_array(jsonb_build_object(
      'pcode', pcode,
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
GRANT EXECUTE ON FUNCTION geo.check_import(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION geo.save_import_drafts(p_run_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, public
AS $$
DECLARE
  feature jsonb;
  saved jsonb := '[]'::jsonb;
  broken integer;
  new_id uuid;
BEGIN
  SELECT COALESCE((counts->>'broken')::int, 0) INTO broken
  FROM geo.import_runs
  WHERE id = p_run_id;
  IF broken IS NULL THEN
    RAISE EXCEPTION 'run_not_found';
  END IF;
  IF broken > 0 THEN
    RAISE EXCEPTION 'import_has_broken_rows';
  END IF;
  FOR feature IN
    SELECT value FROM geo.import_runs r, jsonb_array_elements(COALESCE(r.features, '[]'::jsonb))
    WHERE r.id = p_run_id
  LOOP
    IF COALESCE(feature->>'pcode', feature#>>'{properties,pcode}', '') = '' THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM geo.boundaries
      WHERE pcode = btrim(COALESCE(feature->>'pcode', feature#>>'{properties,pcode}', feature#>>'{properties,PCODE}'))
    ) THEN
      CONTINUE;
    END IF;
    new_id := geo.save_draft_border(
      btrim(COALESCE(feature->>'pcode', feature#>>'{properties,pcode}', feature#>>'{properties,PCODE}')),
      COALESCE(feature->'geometry', feature->'geojson'),
      'Draft from import ' || p_run_id::text,
      p_actor
    );
    saved := saved || jsonb_build_array(jsonb_build_object(
      'pcode', btrim(COALESCE(feature->>'pcode', feature#>>'{properties,pcode}', feature#>>'{properties,PCODE}')),
      'version_id', new_id
    ));
  END LOOP;
  UPDATE geo.import_runs
  SET counts = counts || jsonb_build_object('drafts_saved', jsonb_array_length(saved))
  WHERE id = p_run_id;
  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION geo.save_import_drafts(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.save_import_drafts(uuid, uuid) TO service_role;;

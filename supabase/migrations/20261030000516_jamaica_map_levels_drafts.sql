CREATE OR REPLACE FUNCTION geo.save_draft_border(
  p_pcode text,
  p_geojson jsonb,
  p_notes text,
  p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, delivery, public
AS $$
DECLARE
  next_version integer;
  new_id uuid;
  g geometry;
  parent_geom geometry;
  parent_name text;
  area numeric;
  outside_pct numeric := 0;
  overlap_pct numeric := 0;
  overlap_name text;
  change_pct numeric := 0;
  points integer;
  warnings jsonb := '[]'::jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM geo.boundaries WHERE pcode = p_pcode) THEN
    RAISE EXCEPTION 'place_not_found';
  END IF;
  g := delivery.geojson_to_multipolygon(p_geojson);
  IF g IS NULL OR ST_IsEmpty(g) OR NOT ST_IsValid(g) THEN
    RAISE EXCEPTION 'invalid_shape';
  END IF;
  g := ST_Multi(ST_MakeValid(g));
  area := ST_Area(g::geography);
  points := ST_NPoints(g);

  SELECT p.geom, pb.name INTO parent_geom, parent_name
  FROM geo.boundaries b
  JOIN geo.boundaries pb ON pb.pcode = b.parent_pcode
  JOIN geo.boundary_versions p ON p.id = pb.current_version_id
  WHERE b.pcode = p_pcode;

  IF parent_geom IS NOT NULL AND area > 0 THEN
    outside_pct := round((ST_Area(ST_Difference(g, parent_geom)::geography) / area * 100)::numeric, 1);
    IF outside_pct > 2 THEN
      warnings := warnings || jsonb_build_array('outside_parent');
    END IF;
  END IF;

  SELECT round((ST_Area(ST_Intersection(g, sv.geom)::geography) / NULLIF(area, 0) * 100)::numeric, 1), s.name
  INTO overlap_pct, overlap_name
  FROM geo.boundaries b
  JOIN geo.boundaries s ON s.parent_pcode IS NOT DISTINCT FROM b.parent_pcode
    AND s.admin_level = b.admin_level
    AND s.pcode <> b.pcode
    AND s.status = 'active'
  JOIN geo.boundary_versions sv ON sv.id = s.current_version_id
  WHERE b.pcode = p_pcode
    AND sv.geom && g
  ORDER BY ST_Area(ST_Intersection(g, sv.geom)::geography) DESC
  LIMIT 1;
  overlap_pct := COALESCE(overlap_pct, 0);
  IF overlap_pct > 1 THEN
    warnings := warnings || jsonb_build_array('sibling_overlap');
  END IF;

  SELECT CASE
    WHEN live.geom IS NULL OR ST_Area(live.geom::geography) = 0 THEN 0
    ELSE round((ST_Area(ST_SymDifference(live.geom, g)::geography) / ST_Area(live.geom::geography) * 100)::numeric, 1)
  END
  INTO change_pct
  FROM geo.boundaries b
  LEFT JOIN geo.boundary_versions live ON live.id = b.current_version_id
  WHERE b.pcode = p_pcode;

  IF points > 8000 THEN
    warnings := warnings || jsonb_build_array('too_many_points');
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
  FROM geo.boundary_versions
  WHERE pcode = p_pcode;

  INSERT INTO geo.boundary_versions (pcode, version, geom, geom_display, source, notes, status, created_by, checks)
  VALUES (
    p_pcode,
    next_version,
    g,
    delivery.simplify_boundary_display(g),
    'manual',
    COALESCE(p_notes, 'Drawn in World Maps'),
    'draft',
    p_actor,
    jsonb_build_object(
      'valid', true,
      'outside_parent_pct', outside_pct,
      'outside_parent_name', parent_name,
      'overlap_pct', overlap_pct,
      'overlap_with', overlap_name,
      'area_change_pct', COALESCE(change_pct, 0),
      'vertex_count', points,
      'warnings', warnings
    )
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION geo.save_draft_border(text, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.save_draft_border(text, jsonb, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION geo.discard_draft_border(p_pcode text, p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, public
AS $$
DECLARE
  current_status text;
BEGIN
  SELECT status INTO current_status
  FROM geo.boundary_versions
  WHERE id = p_version_id AND pcode = p_pcode;
  IF current_status IS NULL THEN
    RAISE EXCEPTION 'version_not_found';
  END IF;
  IF current_status <> 'draft' THEN
    RAISE EXCEPTION 'not_a_draft';
  END IF;
  UPDATE geo.boundary_versions
  SET status = 'discarded'
  WHERE id = p_version_id AND pcode = p_pcode;
END;
$$;

REVOKE ALL ON FUNCTION geo.discard_draft_border(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.discard_draft_border(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION geo.places_fill_pcode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, public
AS $$
DECLARE
  found text;
BEGIN
  IF NEW.lat IS NULL OR NEW.lng IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.lat < 17.6 OR NEW.lat > 18.6 OR NEW.lng < -78.5 OR NEW.lng > -76.1 THEN
    RAISE EXCEPTION 'That point is outside Jamaica.';
  END IF;
  SELECT b.pcode INTO found
  FROM geo.boundaries b
  JOIN geo.boundary_versions v ON v.id = b.current_version_id
  WHERE b.status = 'active'
    AND b.admin_level BETWEEN 1 AND 3
    AND ST_Covers(v.geom, ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326))
  ORDER BY b.admin_level DESC
  LIMIT 1;
  IF found IS NOT NULL THEN
    NEW.pcode := found;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS places_fill_pcode ON geo.places;
CREATE TRIGGER places_fill_pcode
  BEFORE INSERT OR UPDATE OF lat, lng ON geo.places
  FOR EACH ROW
  EXECUTE FUNCTION geo.places_fill_pcode();

UPDATE geo.places SET lat = lat;;

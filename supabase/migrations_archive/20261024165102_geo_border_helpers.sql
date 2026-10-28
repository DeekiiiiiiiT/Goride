CREATE OR REPLACE VIEW geo.quality_issues AS
SELECT b.pcode, b.name, b.admin_level, 'invalid_shape'::text AS issue
FROM geo.boundaries b
JOIN geo.boundary_versions v ON v.id = b.current_version_id
WHERE NOT ST_IsValid(v.geom)
UNION ALL
SELECT b.pcode, b.name, b.admin_level, 'missing_parent'
FROM geo.boundaries b
WHERE b.admin_level > 0 AND (b.parent_pcode IS NULL OR NOT EXISTS (SELECT 1 FROM geo.boundaries p WHERE p.pcode = b.parent_pcode))
UNION ALL
SELECT b.pcode, b.name, b.admin_level, 'too_many_vertices'
FROM geo.boundaries b
JOIN geo.boundary_versions v ON v.id = b.current_version_id
WHERE b.admin_level > 0 AND ST_NPoints(v.geom) > 8000;

CREATE OR REPLACE FUNCTION geo.border_area_change_pct(p_pcode text, p_version_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = geo, public AS $$
  SELECT CASE
    WHEN old.geom IS NULL OR ST_Area(old.geom::geography) = 0 THEN 0
    ELSE round((ST_Area(ST_SymDifference(old.geom, neu.geom)::geography) / ST_Area(old.geom::geography) * 100)::numeric, 1)
  END
  FROM geo.boundary_versions neu
  JOIN geo.boundaries b ON b.pcode = neu.pcode
  JOIN geo.boundary_versions old ON old.id = b.current_version_id
  WHERE neu.id = p_version_id AND neu.pcode = p_pcode;
$$;
REVOKE ALL ON FUNCTION geo.border_area_change_pct(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.border_area_change_pct(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION geo.save_draft_border(p_pcode text, p_geojson jsonb, p_notes text, p_actor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = geo, delivery, public AS $$
DECLARE
  next_version integer;
  new_id uuid;
  g geometry;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM geo.boundaries WHERE pcode = p_pcode) THEN
    RAISE EXCEPTION 'place_not_found';
  END IF;
  g := delivery.geojson_to_multipolygon(p_geojson);
  IF g IS NULL OR ST_IsEmpty(g) THEN RAISE EXCEPTION 'invalid_shape'; END IF;
  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version FROM geo.boundary_versions WHERE pcode = p_pcode;
  INSERT INTO geo.boundary_versions (pcode, version, geom, geom_display, source, notes, status, created_by)
  VALUES (p_pcode, next_version, g, delivery.simplify_boundary_display(g), 'manual', COALESCE(p_notes, 'Drawn in World Maps'), 'draft', p_actor)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION geo.save_draft_border(text, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.save_draft_border(text, jsonb, text, uuid) TO service_role;

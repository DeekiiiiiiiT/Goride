-- Keep the pre-migration parish border so checkout can be pointed back during the soak.
-- Preview merchant moves against the border being published, not the live one.

CREATE OR REPLACE FUNCTION geo.commit_boundary_publish(
  p_pcode text,
  p_version_id uuid,
  p_pending_generation integer,
  p_recompiled_markets uuid[],
  p_merchant_moves jsonb,
  p_actor uuid,
  p_impact jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, delivery, public
AS $$
DECLARE
  old_generation integer;
  place_name text;
  version_geom geometry;
  move jsonb;
BEGIN
  SELECT active_generation INTO old_generation
  FROM delivery.coverage_state
  WHERE id = 1
  FOR UPDATE;

  SELECT v.geom, b.name INTO version_geom, place_name
  FROM geo.boundary_versions v
  JOIN geo.boundaries b ON b.pcode = v.pcode
  WHERE v.id = p_version_id
    AND v.pcode = p_pcode;
  IF version_geom IS NULL THEN
    RAISE EXCEPTION 'version_not_found';
  END IF;

  UPDATE geo.boundaries
  SET current_version_id = p_version_id, updated_at = now()
  WHERE pcode = p_pcode;

  UPDATE geo.boundary_versions
  SET status = 'published'
  WHERE id = p_version_id;

  UPDATE delivery.service_parishes sp
  SET
    adopted_geom = version_geom,
    adopted_version_id = p_version_id,
    adopted_at = now(),
    border_notice = 'Border updated by Roam Dominion · ' || place_name || ' v' ||
      (SELECT version FROM geo.boundary_versions WHERE id = p_version_id) || ' · ' ||
      to_char(now() AT TIME ZONE 'America/Jamaica', 'DD Mon')
  WHERE sp.pcode = p_pcode;

  UPDATE delivery.admin_boundaries ab
  SET
    geom = version_geom,
    geom_display = delivery.simplify_boundary_display(version_geom),
    source = (SELECT source FROM geo.boundary_versions WHERE id = p_version_id),
    updated_at = now()
  WHERE ab.pcode = p_pcode;

  UPDATE delivery.service_zone_polygons z
  SET
    geom = version_geom,
    boundary_version_id = p_version_id,
    updated_at = now()
  WHERE z.boundary_pcode = p_pcode
    AND COALESCE(z.kind, 'include') = 'include';

  IF p_recompiled_markets IS NOT NULL AND array_length(p_recompiled_markets, 1) IS NOT NULL THEN
    INSERT INTO delivery.coverage_cells (market_id, h3_cell, h3_res, kind, generation)
    SELECT c.market_id, c.h3_cell, c.h3_res, c.kind, p_pending_generation
    FROM delivery.coverage_cells c
    WHERE c.generation = old_generation
      AND NOT (c.market_id = ANY (p_recompiled_markets))
    ON CONFLICT DO NOTHING;

    UPDATE delivery.coverage_state
    SET active_generation = p_pending_generation
    WHERE id = 1;

    DELETE FROM delivery.coverage_cells
    WHERE generation = old_generation;
  END IF;

  IF p_merchant_moves IS NOT NULL AND jsonb_typeof(p_merchant_moves) = 'array' THEN
    FOR move IN SELECT * FROM jsonb_array_elements(p_merchant_moves)
    LOOP
      UPDATE delivery.merchants
      SET market_id = (move->>'market_id')::uuid
      WHERE id = (move->>'merchant_id')::uuid
        AND (move->>'market_id') IS NOT NULL;
    END LOOP;
  END IF;

  INSERT INTO geo.publish_log (pcode, version_id, actor_id, impact, status)
  VALUES (p_pcode, p_version_id, p_actor, COALESCE(p_impact, '{}'::jsonb), 'published');

  RETURN jsonb_build_object('ok', true, 'pcode', p_pcode, 'name', place_name);
END;
$$;

CREATE OR REPLACE FUNCTION geo.border_area_change_pct(p_pcode text, p_version_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = geo, public
AS $$
  SELECT CASE
    WHEN old.geom IS NULL OR ST_Area(old.geom::geography) = 0 THEN 0
    ELSE round((ST_Area(ST_SymDifference(old.geom, neu.geom)::geography) / ST_Area(old.geom::geography) * 100)::numeric, 1)
  END
  FROM geo.boundary_versions neu
  JOIN geo.boundaries b ON b.pcode = neu.pcode
  JOIN geo.boundary_versions old ON old.id = b.current_version_id
  WHERE neu.id = p_version_id AND neu.pcode = p_pcode;
$$;

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
BEGIN
  IF NOT EXISTS (SELECT 1 FROM geo.boundaries WHERE pcode = p_pcode) THEN
    RAISE EXCEPTION 'place_not_found';
  END IF;
  g := delivery.geojson_to_multipolygon(p_geojson);
  IF g IS NULL OR ST_IsEmpty(g) THEN
    RAISE EXCEPTION 'invalid_shape';
  END IF;
  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
  FROM geo.boundary_versions
  WHERE pcode = p_pcode;
  INSERT INTO geo.boundary_versions (pcode, version, geom, geom_display, source, notes, status, created_by)
  VALUES (
    p_pcode,
    next_version,
    g,
    delivery.simplify_boundary_display(g),
    'manual',
    COALESCE(p_notes, 'Drawn in World Maps'),
    'draft',
    p_actor
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- Pins whose containing parish market changes if this version becomes the live border.
CREATE OR REPLACE FUNCTION geo.preview_merchant_moves(p_pcode text, p_version_id uuid)
RETURNS TABLE (merchant_id uuid, market_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = geo, delivery, public
AS $$
  SELECT m.id, dest.market_id
  FROM delivery.merchants m
  JOIN LATERAL (
    SELECT sm.id AS market_id
    FROM delivery.service_markets sm
    JOIN delivery.service_parishes sp ON sp.id = sm.parish_id
    JOIN geo.boundaries b ON b.pcode = sp.pcode
    JOIN geo.boundary_versions v
      ON v.id = CASE WHEN sp.pcode = p_pcode THEN p_version_id ELSE b.current_version_id END
    WHERE m.lat IS NOT NULL
      AND m.lng IS NOT NULL
      AND ST_Covers(v.geom, ST_SetSRID(ST_MakePoint(m.lng, m.lat), 4326))
    ORDER BY sm.is_active DESC, sm.name
    LIMIT 1
  ) dest ON true
  WHERE m.market_id IS DISTINCT FROM dest.market_id
  LIMIT 300;
$$;

REVOKE ALL ON FUNCTION geo.border_area_change_pct(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION geo.save_draft_border(text, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION geo.preview_merchant_moves(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.border_area_change_pct(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION geo.save_draft_border(text, jsonb, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION geo.preview_merchant_moves(text, uuid) TO service_role;

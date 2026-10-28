-- Point Rush border helpers at Dominion. Do not drop delivery.admin_boundaries here.

CREATE OR REPLACE FUNCTION geo.current_boundary(p_pcode text, p_level smallint)
RETURNS TABLE (
  pcode text,
  admin_level smallint,
  parent_pcode text,
  name text,
  slug text,
  center_lat double precision,
  center_lng double precision,
  geom geometry,
  source text,
  source_version text,
  valid_on date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = geo, public
AS $$
  SELECT b.pcode, b.admin_level, b.parent_pcode, b.name, b.slug,
    b.center_lat, b.center_lng, v.geom, v.source, v.source_version, v.valid_on
  FROM geo.boundaries b
  JOIN geo.boundary_versions v ON v.id = b.current_version_id
  WHERE b.pcode = p_pcode
    AND (p_level IS NULL OR b.admin_level = p_level)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION geo.current_boundary(text, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.current_boundary(text, smallint) TO service_role;

CREATE OR REPLACE FUNCTION delivery.geo_catalog_boundary_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = geo, public
AS $$
  SELECT COUNT(*)::integer FROM geo.boundaries;
$$;
REVOKE ALL ON FUNCTION delivery.geo_catalog_boundary_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery.geo_catalog_boundary_count() TO service_role;

CREATE OR REPLACE FUNCTION delivery.promote_boundary_to_parish(
  p_parish_id uuid,
  p_pcode text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, delivery, public
AS $$
DECLARE
  b record;
  parish delivery.service_parishes%ROWTYPE;
  ring jsonb;
  next_ver integer;
BEGIN
  SELECT * INTO b FROM geo.current_boundary(p_pcode, 1);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin1 boundary % not found', p_pcode;
  END IF;

  SELECT * INTO parish
  FROM delivery.service_parishes
  WHERE id = p_parish_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'parish % not found', p_parish_id;
  END IF;

  -- Snapshot existing foundation before destructive overwrite (OPEN-3)
  IF parish.foundation_polygon IS NOT NULL
     OR parish.foundation_geom IS NOT NULL THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO next_ver
    FROM delivery.parish_outline_versions
    WHERE parish_id = p_parish_id;

    INSERT INTO delivery.parish_outline_versions (
      parish_id, version, label, notes,
      foundation_polygon, foundation_geom,
      foundation_boundary_pcode, boundary_source
    ) VALUES (
      p_parish_id,
      next_ver,
      'Pre-promote snapshot',
      'Auto snapshot inside promote_boundary_to_parish',
      parish.foundation_polygon,
      parish.foundation_geom,
      parish.foundation_boundary_pcode,
      parish.boundary_source
    );
  END IF;

  ring := (
    SELECT jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng) ORDER BY i)
    FROM (
      SELECT
        ST_Y(ST_PointN(r.ring, gs)) AS lat,
        ST_X(ST_PointN(r.ring, gs)) AS lng,
        gs AS i
      FROM (
        SELECT ST_ExteriorRing(ST_GeometryN(b.geom, 1)) AS ring
      ) r
      CROSS JOIN generate_series(1, GREATEST(ST_NPoints(r.ring) - 1, 0)) AS gs
    ) s
  );

  UPDATE delivery.service_parishes
  SET
    foundation_geom = b.geom,
    foundation_polygon = COALESCE(ring, foundation_polygon),
    foundation_boundary_pcode = b.pcode,
    pcode = b.pcode,
    parent_pcode = b.parent_pcode,
    admin_level = 1,
    boundary_source = b.source,
    boundary_source_version = b.source_version,
    boundary_valid_on = b.valid_on,
    center_lat = b.center_lat,
    center_lng = b.center_lng,
    foundation_updated_at = now()
  WHERE id = p_parish_id;
END;
$$;


CREATE OR REPLACE FUNCTION delivery.promote_boundary_to_market_zone(
  p_market_id uuid,
  p_pcode text,
  p_zone_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, delivery, public
AS $$
DECLARE
  b record;
  ring jsonb;
  zone_id uuid;
  include_id uuid;
  exclude_ids uuid[] := ARRAY[]::uuid[];
  hole_geom geometry;
  hole_ring jsonb;
  i int;
  poly geometry;
  hole_n int;
  existing_count integer;
  next_ver integer;
  zones_snap jsonb;
BEGIN
  SELECT * INTO b FROM geo.current_boundary(p_pcode, 2);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin2 boundary % not found', p_pcode;
  END IF;

  -- Snapshot current zones into coverage versions before overwrite (OPEN-3)
  SELECT COUNT(*) INTO existing_count
  FROM delivery.service_zone_polygons
  WHERE market_id = p_market_id;

  IF existing_count > 0 THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO next_ver
    FROM delivery.service_coverage_versions
    WHERE market_id = p_market_id;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', z.id,
        'name', z.name,
        'kind', z.kind,
        'polygon', z.polygon,
        'source', z.source,
        'priority', z.priority,
        'boundary_pcode', z.boundary_pcode,
        'center_lat', z.center_lat,
        'center_lng', z.center_lng,
        'radius_m', z.radius_m
      ) ORDER BY z.priority DESC NULLS LAST, z.name
    ), '[]'::jsonb)
    INTO zones_snap
    FROM delivery.service_zone_polygons z
    WHERE z.market_id = p_market_id;

    INSERT INTO delivery.service_coverage_versions (
      market_id, version, label, notes, zones_json
    ) VALUES (
      p_market_id,
      next_ver,
      'Pre-promote snapshot',
      'Auto snapshot inside promote_boundary_to_market_zone for pcode ' || p_pcode,
      zones_snap
    );
  END IF;

  ring := (
    SELECT jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng) ORDER BY idx)
    FROM (
      SELECT
        ST_Y(ST_PointN(r.ring, gs)) AS lat,
        ST_X(ST_PointN(r.ring, gs)) AS lng,
        gs AS idx
      FROM (
        SELECT ST_ExteriorRing(ST_GeometryN(b.geom, 1)) AS ring
      ) r
      CROSS JOIN generate_series(1, GREATEST(ST_NPoints(r.ring) - 1, 0)) AS gs
    ) s
  );

  SELECT id INTO zone_id
  FROM delivery.service_zone_polygons
  WHERE market_id = p_market_id
    AND boundary_pcode = p_pcode
    AND kind = 'include'
  LIMIT 1;

  IF zone_id IS NULL THEN
    INSERT INTO delivery.service_zone_polygons (
      market_id, name, polygon, geom, kind, source, priority, boundary_pcode, updated_at
    ) VALUES (
      p_market_id,
      COALESCE(p_zone_name, b.name),
      COALESCE(ring, '[]'::jsonb),
      b.geom,
      'include',
      'import',
      0,
      p_pcode,
      now()
    )
    RETURNING id INTO zone_id;
  ELSE
    UPDATE delivery.service_zone_polygons
    SET
      name = COALESCE(p_zone_name, b.name),
      polygon = COALESCE(ring, polygon),
      geom = b.geom,
      source = 'import',
      boundary_pcode = p_pcode,
      updated_at = now()
    WHERE id = zone_id;
  END IF;
  include_id := zone_id;

  -- Remove prior hole excludes for this pcode before re-materialising
  DELETE FROM delivery.service_zone_polygons
  WHERE market_id = p_market_id
    AND kind = 'exclude'
    AND boundary_pcode LIKE p_pcode || '-hole-%';

  poly := ST_GeometryN(b.geom, 1);
  hole_n := ST_NumInteriorRings(poly);
  FOR i IN 1..COALESCE(hole_n, 0) LOOP
    hole_geom := ST_MakePolygon(ST_InteriorRingN(poly, i));
    hole_ring := (
      SELECT jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng) ORDER BY idx)
      FROM (
        SELECT
          ST_Y(ST_PointN(ST_ExteriorRing(hole_geom), gs)) AS lat,
          ST_X(ST_PointN(ST_ExteriorRing(hole_geom), gs)) AS lng,
          gs AS idx
        FROM generate_series(1, GREATEST(ST_NPoints(ST_ExteriorRing(hole_geom)) - 1, 0)) AS gs
      ) s
    );
    INSERT INTO delivery.service_zone_polygons (
      market_id, name, polygon, geom, kind, source, priority, boundary_pcode, updated_at
    ) VALUES (
      p_market_id,
      COALESCE(p_zone_name, b.name) || ' hole ' || i,
      COALESCE(hole_ring, '[]'::jsonb),
      ST_Multi(hole_geom),
      'exclude',
      'import',
      10 + i,
      p_pcode || '-hole-' || i,
      now()
    )
    RETURNING id INTO zone_id;
    exclude_ids := array_append(exclude_ids, zone_id);
  END LOOP;

  UPDATE delivery.service_markets
  SET
    pcode = p_pcode,
    parent_pcode = b.parent_pcode,
    boundary_source = b.source,
    draft_dirty = true
  WHERE id = p_market_id;

  RETURN jsonb_build_object(
    'zone_id', include_id,
    'exclude_ids', to_jsonb(exclude_ids),
    'snapshot_version', next_ver
  );
END;
$$;

GRANT EXECUTE ON FUNCTION delivery.promote_boundary_to_parish TO service_role;

CREATE OR REPLACE FUNCTION delivery.union_admin3_to_market_zone(
  p_market_id uuid,
  p_pcodes text[],
  p_zone_name text DEFAULT 'Community union'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, delivery, public
AS $$
DECLARE
  g geometry;
  ring jsonb;
  zone_id uuid;
BEGIN
  SELECT ST_Multi(ST_UnaryUnion(ST_Collect(v.geom))) INTO g
  FROM geo.boundaries b
  JOIN geo.boundary_versions v ON v.id = b.current_version_id
  WHERE b.admin_level = 3 AND b.pcode = ANY (p_pcodes);

  IF g IS NULL OR ST_IsEmpty(g) THEN
    RAISE EXCEPTION 'No admin3 geometries for provided pcodes';
  END IF;
  g := ST_MakeValid(g);

  ring := (
    SELECT jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng) ORDER BY idx)
    FROM (
      SELECT
        ST_Y(ST_PointN(r.ring, gs)) AS lat,
        ST_X(ST_PointN(r.ring, gs)) AS lng,
        gs AS idx
      FROM (
        SELECT ST_ExteriorRing(ST_GeometryN(g, 1)) AS ring
      ) r
      CROSS JOIN generate_series(1, GREATEST(ST_NPoints(r.ring) - 1, 0)) AS gs
    ) s
  );

  INSERT INTO delivery.service_zone_polygons (
    market_id, name, polygon, geom, kind, source, priority, updated_at
  ) VALUES (
    p_market_id, p_zone_name, COALESCE(ring, '[]'::jsonb), g, 'include', 'import', 0, now()
  )
  RETURNING id INTO zone_id;

  UPDATE delivery.service_markets SET draft_dirty = true WHERE id = p_market_id;
  RETURN zone_id;
END;
$$;


CREATE OR REPLACE FUNCTION delivery.create_inactive_town_from_boundary(
  p_parish_id uuid,
  p_pcode text,
  p_slug text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, delivery, public
AS $$
DECLARE
  parish delivery.service_parishes%ROWTYPE;
  boundary record;
  market delivery.service_markets%ROWTYPE;
  existing_id uuid;
  zone_result jsonb;
BEGIN
  IF p_slug IS NULL OR btrim(p_slug) = '' THEN
    RAISE EXCEPTION 'SLUG_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO parish FROM delivery.service_parishes WHERE id = p_parish_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PARISH_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO boundary FROM geo.current_boundary(p_pcode, 2);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOUNDARY_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF parish.pcode IS NOT NULL
     AND boundary.parent_pcode IS NOT NULL
     AND boundary.parent_pcode <> parish.pcode THEN
    RAISE EXCEPTION 'PARENT_MISMATCH:% vs %', boundary.parent_pcode, parish.pcode
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO existing_id
  FROM delivery.service_markets
  WHERE pcode = p_pcode
  LIMIT 1;
  IF existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'TOWN_EXISTS:%', existing_id USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM delivery.service_markets WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'SLUG_EXISTS:%', p_slug USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO delivery.service_markets (
    name, slug, parish_id, is_active, waitlist_enabled,
    pcode, parent_pcode, boundary_source, draft_dirty
  ) VALUES (
    boundary.name,
    p_slug,
    p_parish_id,
    false,
    true,
    p_pcode,
    boundary.parent_pcode,
    boundary.source,
    true
  )
  RETURNING * INTO market;

  zone_result := delivery.promote_boundary_to_market_zone(market.id, p_pcode, boundary.name);

  RETURN jsonb_build_object(
    'market', to_jsonb(market),
    'zone', zone_result
  );
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM ILIKE '%pcode%' THEN
      RAISE EXCEPTION 'TOWN_EXISTS' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'SLUG_EXISTS:%', p_slug USING ERRCODE = 'P0001';
END;
$$;


CREATE OR REPLACE FUNCTION delivery.reconcile_market_pcodes(
  p_promote_inactive boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, delivery, public
AS $$
DECLARE
  m record;
  parish_pcode text;
  matches text[];
  chosen text;
  matched int := 0;
  ambiguous int := 0;
  unmatched int := 0;
  skipped_active int := 0;
  report jsonb := '[]'::jsonb;
  promote_result jsonb;
BEGIN
  FOR m IN
    SELECT mk.id, mk.name, mk.is_active, mk.pcode AS existing_pcode, mk.parish_id, p.pcode AS parish_pcode
    FROM delivery.service_markets mk
    JOIN delivery.service_parishes p ON p.id = mk.parish_id
    WHERE p.pcode IS NOT NULL
  LOOP
    parish_pcode := m.parish_pcode;

    SELECT array_agg(b.pcode ORDER BY b.name)
    INTO matches
    FROM geo.boundaries b
    WHERE b.admin_level = 2
      AND b.parent_pcode = parish_pcode
      AND delivery.normalize_place_name(b.name) = delivery.normalize_place_name(m.name);

    IF matches IS NULL OR array_length(matches, 1) IS NULL THEN
      unmatched := unmatched + 1;
      report := report || jsonb_build_array(jsonb_build_object(
        'market_id', m.id, 'name', m.name, 'status', 'unmatched'
      ));
      CONTINUE;
    END IF;

    IF array_length(matches, 1) > 1 THEN
      ambiguous := ambiguous + 1;
      report := report || jsonb_build_array(jsonb_build_object(
        'market_id', m.id, 'name', m.name, 'status', 'ambiguous', 'candidates', to_jsonb(matches)
      ));
      CONTINUE;
    END IF;

    chosen := matches[1];
    matched := matched + 1;

    UPDATE delivery.service_markets
    SET
      pcode = chosen,
      parent_pcode = parish_pcode,
      boundary_source = 'cod-ab'
    WHERE id = m.id;

    IF m.is_active IS TRUE THEN
      skipped_active := skipped_active + 1;
      report := report || jsonb_build_array(jsonb_build_object(
        'market_id', m.id, 'name', m.name, 'status', 'matched_metadata_only', 'pcode', chosen
      ));
    ELSIF p_promote_inactive THEN
      SELECT delivery.promote_boundary_to_market_zone(m.id, chosen, m.name) INTO promote_result;
      report := report || jsonb_build_array(jsonb_build_object(
        'market_id', m.id, 'name', m.name, 'status', 'matched_promoted', 'pcode', chosen, 'promote', promote_result
      ));
    ELSE
      report := report || jsonb_build_array(jsonb_build_object(
        'market_id', m.id, 'name', m.name, 'status', 'matched_metadata_only', 'pcode', chosen
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'matched', matched,
    'ambiguous', ambiguous,
    'unmatched', unmatched,
    'skipped_active_promote', skipped_active,
    'details', report
  );
END;
$$;


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
    SELECT COUNT(*) FROM geo.boundaries b
    WHERE b.admin_level = 2 AND b.parent_pcode = p.pcode
  ) AS catalog_admin2_count,
  (
    SELECT COUNT(*) FROM delivery.service_markets m
    WHERE m.parish_id = p.id AND m.is_active
  ) AS active_town_count,
  (
    SELECT COUNT(*) FROM delivery.service_markets m
    WHERE m.parish_id = p.id
      AND NOT EXISTS (
        SELECT 1 FROM delivery.service_zone_polygons z
        WHERE z.market_id = m.id AND z.kind = 'include'
      )
  ) AS towns_missing_border,
  (
    SELECT COALESCE(string_agg(m.name, ', ' ORDER BY m.name), '')
    FROM delivery.service_markets m
    WHERE m.parish_id = p.id
      AND NOT EXISTS (
        SELECT 1 FROM delivery.service_zone_polygons z
        WHERE z.market_id = m.id AND z.kind = 'include'
      )
  ) AS towns_missing_border_names
FROM delivery.service_parishes p
ORDER BY p.sort_order;


GRANT SELECT ON delivery.coverage_health_summary TO service_role;

DROP FUNCTION IF EXISTS delivery.upsert_admin_boundary(
  smallint, text, text, text, text, jsonb, numeric, numeric, numeric, text, text, date, jsonb
);

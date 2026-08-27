-- OPEN-3: Snapshot inside promote RPCs so SQL/console callers cannot clobber without history.

CREATE OR REPLACE FUNCTION delivery.promote_boundary_to_parish(
  p_parish_id uuid,
  p_pcode text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, public
AS $$
DECLARE
  b delivery.admin_boundaries%ROWTYPE;
  parish delivery.service_parishes%ROWTYPE;
  ring jsonb;
  next_ver integer;
BEGIN
  SELECT * INTO b
  FROM delivery.admin_boundaries
  WHERE pcode = p_pcode AND admin_level = 1
  LIMIT 1;
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
SET search_path = delivery, public
AS $$
DECLARE
  b delivery.admin_boundaries%ROWTYPE;
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
  SELECT * INTO b
  FROM delivery.admin_boundaries
  WHERE pcode = p_pcode AND admin_level = 2
  LIMIT 1;
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
GRANT EXECUTE ON FUNCTION delivery.promote_boundary_to_market_zone TO service_role;

-- Name-normalized reconcile helper for OPEN-5
CREATE OR REPLACE FUNCTION delivery.normalize_place_name(n text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    regexp_replace(upper(coalesce(n, '')), '[^A-Z0-9]+', '', 'g'),
    '^THE', ''
  );
$$;

CREATE OR REPLACE FUNCTION delivery.reconcile_market_pcodes(
  p_promote_inactive boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, public
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
    FROM delivery.admin_boundaries b
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

GRANT EXECUTE ON FUNCTION delivery.normalize_place_name TO service_role;
GRANT EXECUTE ON FUNCTION delivery.reconcile_market_pcodes TO service_role;

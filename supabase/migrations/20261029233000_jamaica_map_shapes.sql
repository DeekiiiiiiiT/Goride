-- Jamaica map: simpler borders by zoom, search, a publish history, and parish code refill.
-- Place codes stored today are 4 characters (parish). Refill only moves a place when its parish changes.

DROP FUNCTION IF EXISTS geo.list_shapes(int[]);

CREATE OR REPLACE FUNCTION geo.list_shapes(
  p_levels int[],
  p_tolerance double precision DEFAULT NULL,
  p_bbox double precision[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = geo, delivery, public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.admin_level, s.name), '[]'::jsonb)
  FROM (
    SELECT
      b.pcode,
      b.admin_level,
      b.parent_pcode,
      b.name,
      b.slug,
      b.status,
      v.version,
      v.source,
      v.source_version,
      v.valid_on,
      b.center_lat,
      b.center_lng,
      delivery.display_rings_json(
        CASE
          WHEN p_tolerance IS NULL THEN COALESCE(v.geom_display, delivery.simplify_boundary_display(v.geom))
          ELSE ST_MakeValid(ST_SimplifyPreserveTopology(v.geom, p_tolerance))
        END
      ) AS rings
    FROM geo.boundaries b
    JOIN geo.boundary_versions v ON v.id = b.current_version_id
    WHERE b.status = 'active'
      AND (p_levels IS NULL OR b.admin_level = ANY (p_levels))
      AND (
        p_bbox IS NULL
        OR cardinality(p_bbox) < 4
        OR ST_Intersects(
          v.geom,
          ST_MakeEnvelope(p_bbox[1], p_bbox[2], p_bbox[3], p_bbox[4], 4326)
        )
      )
  ) s;
$$;

REVOKE ALL ON FUNCTION geo.list_shapes(int[], double precision, double precision[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.list_shapes(int[], double precision, double precision[]) TO service_role;

CREATE INDEX IF NOT EXISTS boundaries_name_trgm
  ON geo.boundaries USING gin (name public.gin_trgm_ops);

CREATE OR REPLACE FUNCTION geo.search_areas(p_query text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = geo, public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.rank, s.admin_level, s.name), '[]'::jsonb)
  FROM (
    SELECT
      b.pcode,
      b.name,
      b.admin_level,
      parent.name AS parent_name,
      b.center_lat,
      b.center_lng,
      CASE
        WHEN b.name ILIKE btrim(p_query) || '%' THEN 0
        WHEN b.pcode ILIKE btrim(p_query) || '%' THEN 1
        ELSE 2
      END AS rank
    FROM geo.boundaries b
    LEFT JOIN geo.boundaries parent ON parent.pcode = b.parent_pcode
    WHERE b.status = 'active'
      AND length(btrim(p_query)) >= 2
      AND (
        b.name ILIKE '%' || btrim(p_query) || '%'
        OR b.pcode ILIKE btrim(p_query) || '%'
      )
    ORDER BY
      CASE
        WHEN b.name ILIKE btrim(p_query) || '%' THEN 0
        WHEN b.pcode ILIKE btrim(p_query) || '%' THEN 1
        ELSE 2
      END,
      similarity(b.name, btrim(p_query)) DESC,
      b.admin_level,
      b.name
    LIMIT 10
  ) s;
$$;

REVOKE ALL ON FUNCTION geo.search_areas(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.search_areas(text) TO service_role;

CREATE OR REPLACE FUNCTION geo.map_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = geo, public
AS $$
  SELECT jsonb_build_object(
    'parishes', (SELECT count(*) FROM geo.boundaries WHERE status = 'active' AND admin_level = 1),
    'towns', (SELECT count(*) FROM geo.boundaries WHERE status = 'active' AND admin_level = 2),
    'communities', (SELECT count(*) FROM geo.boundaries WHERE status = 'active' AND admin_level = 3),
    'drafts', (SELECT count(*) FROM geo.boundary_versions WHERE status = 'draft'),
    'published_versions', (SELECT count(*) FROM geo.boundary_versions WHERE status = 'published'),
    'quality_issues', (SELECT count(*) FROM geo.quality_issues),
    'pins', (SELECT count(*) FROM geo.places),
    'last_publish_at', (SELECT max(created_at) FROM geo.publish_log WHERE status = 'published'),
    'parishes_list', (
      SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.name), '[]'::jsonb)
      FROM (
        SELECT
          b.pcode,
          b.name,
          (SELECT count(*) FROM geo.boundaries t WHERE t.status = 'active' AND t.admin_level = 2 AND t.parent_pcode = b.pcode) AS towns,
          (SELECT count(*) FROM geo.boundaries c WHERE c.status = 'active' AND c.admin_level = 3 AND c.pcode LIKE b.pcode || '%') AS communities
        FROM geo.boundaries b
        WHERE b.status = 'active' AND b.admin_level = 1
      ) p
    ),
    'recent', (
      SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT
          l.pcode,
          b.name,
          b.admin_level,
          v.version,
          v.source,
          l.created_at,
          l.actor_id
        FROM geo.publish_log l
        JOIN geo.boundaries b ON b.pcode = l.pcode
        LEFT JOIN geo.boundary_versions v ON v.id = l.version_id
        WHERE l.status = 'published'
        ORDER BY l.created_at DESC
        LIMIT 5
      ) r
    )
  );
$$;

REVOKE ALL ON FUNCTION geo.map_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.map_summary() TO service_role;

CREATE OR REPLACE FUNCTION geo.boundary_metrics(p_pcode text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = geo, public
AS $$
  SELECT jsonb_build_object(
    'area_sqkm', v.area_sqkm,
    'vertex_count', ST_NPoints(v.geom),
    'version', v.version,
    'source', v.source,
    'status', v.status,
    'created_at', v.created_at
  )
  FROM geo.boundaries b
  JOIN geo.boundary_versions v ON v.id = b.current_version_id
  WHERE b.pcode = p_pcode;
$$;

REVOKE ALL ON FUNCTION geo.boundary_metrics(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.boundary_metrics(text) TO service_role;

-- Parish code at a point. When a parish border is being published, that parish uses the new ring.
CREATE OR REPLACE FUNCTION geo.parish_pcode_at(
  p_lat double precision,
  p_lng double precision,
  p_override_pcode text DEFAULT NULL,
  p_override_geom geometry DEFAULT NULL
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = geo, public
AS $$
  SELECT b.pcode
  FROM geo.boundaries b
  JOIN geo.boundary_versions v ON v.id = b.current_version_id
  WHERE b.status = 'active'
    AND b.admin_level = 1
    AND p_lat IS NOT NULL
    AND p_lng IS NOT NULL
    AND ST_Covers(
      CASE
        WHEN p_override_pcode IS NOT NULL AND b.pcode = p_override_pcode AND p_override_geom IS NOT NULL
          THEN p_override_geom
        ELSE v.geom
      END,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
    )
  ORDER BY b.pcode
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION geo.parish_pcode_at(double precision, double precision, text, geometry) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.parish_pcode_at(double precision, double precision, text, geometry) TO service_role;

CREATE OR REPLACE FUNCTION geo.preview_places_moving(p_pcode text, p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = geo, places, public
AS $$
DECLARE
  level int;
  old_geom geometry;
  new_geom geometry;
  names jsonb;
  total int;
BEGIN
  SELECT admin_level INTO level FROM geo.boundaries WHERE pcode = p_pcode;
  IF level IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('count', 0, 'sample', '[]'::jsonb);
  END IF;

  SELECT v.geom INTO old_geom
  FROM geo.boundaries b
  JOIN geo.boundary_versions v ON v.id = b.current_version_id
  WHERE b.pcode = p_pcode;

  SELECT geom INTO new_geom FROM geo.boundary_versions WHERE id = p_version_id AND pcode = p_pcode;

  SELECT COALESCE(jsonb_agg(name), '[]'::jsonb), count(*)::int
  INTO names, total
  FROM (
    SELECT p.name
    FROM places.place p
    WHERE p.lat IS NOT NULL
      AND p.lng IS NOT NULL
      AND (
        (old_geom IS NOT NULL AND ST_Covers(old_geom, ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)))
        OR (new_geom IS NOT NULL AND ST_Covers(new_geom, ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)))
      )
      AND geo.parish_pcode_at(p.lat, p.lng, p_pcode, new_geom) IS DISTINCT FROM p.pcode
    ORDER BY p.name
    LIMIT 10
  ) sample;

  SELECT count(*)::int INTO total
  FROM places.place p
  WHERE p.lat IS NOT NULL
    AND p.lng IS NOT NULL
    AND (
      (old_geom IS NOT NULL AND ST_Covers(old_geom, ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)))
      OR (new_geom IS NOT NULL AND ST_Covers(new_geom, ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)))
    )
    AND geo.parish_pcode_at(p.lat, p.lng, p_pcode, new_geom) IS DISTINCT FROM p.pcode;

  RETURN jsonb_build_object('count', COALESCE(total, 0), 'sample', COALESCE(names, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION geo.preview_places_moving(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.preview_places_moving(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION geo.refill_place_pcodes(
  p_old geometry,
  p_new geometry,
  p_override_pcode text,
  p_override_geom geometry
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, places, public
AS $$
BEGIN
  UPDATE places.place AS p
  SET pcode = next.pcode
  FROM (
    SELECT
      place.id,
      geo.parish_pcode_at(place.lat, place.lng, p_override_pcode, p_override_geom) AS pcode
    FROM places.place AS place
    WHERE place.lat IS NOT NULL
      AND place.lng IS NOT NULL
      AND (
        (p_old IS NOT NULL AND ST_Covers(p_old, ST_SetSRID(ST_MakePoint(place.lng, place.lat), 4326)))
        OR (p_new IS NOT NULL AND ST_Covers(p_new, ST_SetSRID(ST_MakePoint(place.lng, place.lat), 4326)))
      )
  ) AS next
  WHERE p.id = next.id
    AND next.pcode IS NOT NULL
    AND next.pcode IS DISTINCT FROM p.pcode;
END;
$$;

REVOKE ALL ON FUNCTION geo.refill_place_pcodes(geometry, geometry, text, geometry) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.refill_place_pcodes(geometry, geometry, text, geometry) TO service_role;

CREATE OR REPLACE FUNCTION geo.log_boundary_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, public
AS $$
DECLARE
  claim text;
  actor uuid;
  old_geom geometry;
  new_geom geometry;
BEGIN
  IF NEW.current_version_id IS NOT DISTINCT FROM OLD.current_version_id THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM geo.publish_log WHERE version_id = NEW.current_version_id
  ) THEN
    claim := current_setting('request.jwt.claim.sub', true);
    IF claim ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      actor := claim::uuid;
    END IF;
    INSERT INTO geo.publish_log (pcode, version_id, actor_id, impact, status)
    VALUES (NEW.pcode, NEW.current_version_id, actor, '{"via":"direct"}'::jsonb, 'published');
  END IF;

  IF NEW.admin_level = 1 THEN
    SELECT geom INTO old_geom FROM geo.boundary_versions WHERE id = OLD.current_version_id;
    SELECT geom INTO new_geom FROM geo.boundary_versions WHERE id = NEW.current_version_id;
    PERFORM geo.refill_place_pcodes(old_geom, new_geom, NEW.pcode, new_geom);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_boundary_change ON geo.boundaries;
CREATE TRIGGER log_boundary_change
  AFTER UPDATE OF current_version_id ON geo.boundaries
  FOR EACH ROW
  EXECUTE FUNCTION geo.log_boundary_change();

-- The publish route writes its own log row first, so this trigger does not add a second one.
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
  market_id uuid;
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

  INSERT INTO geo.publish_log (pcode, version_id, actor_id, impact, status)
  VALUES (p_pcode, p_version_id, p_actor, COALESCE(p_impact, '{}'::jsonb), 'published');

  UPDATE geo.boundaries
  SET current_version_id = p_version_id, updated_at = now()
  WHERE pcode = p_pcode;

  UPDATE geo.boundary_versions
  SET status = 'retired'
  WHERE pcode = p_pcode
    AND id <> p_version_id
    AND status = 'published';

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

  UPDATE delivery.service_zone_polygons z
  SET
    geom = version_geom,
    polygon = CASE
      WHEN z.geom IS NOT NULL AND ST_Equals(z.geom, version_geom) THEN z.polygon
      ELSE delivery.geom_to_coverage_parts(version_geom)
    END,
    boundary_version_id = p_version_id,
    updated_at = now()
  WHERE z.boundary_pcode = p_pcode
    AND COALESCE(z.kind, 'include') = 'include';

  IF p_recompiled_markets IS NOT NULL THEN
    FOREACH market_id IN ARRAY p_recompiled_markets LOOP
      PERFORM delivery.refresh_market_net_coverage(market_id);
    END LOOP;
  END IF;

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

  RETURN jsonb_build_object('ok', true, 'pcode', p_pcode, 'name', place_name);
END;
$$;

REVOKE ALL ON FUNCTION geo.commit_boundary_publish(text, uuid, integer, uuid[], jsonb, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.commit_boundary_publish(text, uuid, integer, uuid[], jsonb, uuid, jsonb)
  TO service_role;

INSERT INTO geo.publish_log (pcode, version_id, actor_id, impact, status, created_at)
SELECT b.pcode, v.id, NULL, '{"via":"backfill"}'::jsonb, 'published', v.created_at
FROM geo.boundaries b
JOIN geo.boundary_versions v ON v.id = b.current_version_id
WHERE b.name IN ('Kingston', 'Saint Andrew', 'Saint Catherine', 'Spanish Town')
  AND v.created_at >= timestamptz '2026-10-24 00:00:00+00'
  AND v.created_at < timestamptz '2026-10-25 00:00:00+00'
  AND NOT EXISTS (
    SELECT 1 FROM geo.publish_log l WHERE l.version_id = v.id
  );

NOTIFY pgrst, 'reload schema';

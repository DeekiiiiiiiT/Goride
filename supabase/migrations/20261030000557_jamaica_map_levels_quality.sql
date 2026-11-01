DROP MATERIALIZED VIEW IF EXISTS geo.quality_issues_mv;

CREATE MATERIALIZED VIEW geo.quality_issues_mv AS
WITH live AS (
  SELECT
    b.pcode,
    b.name,
    b.admin_level,
    b.parent_pcode,
    v.geom AS raw_geom,
    ST_MakeValid(ST_SimplifyPreserveTopology(v.geom, 0.0008)) AS geom
  FROM geo.boundaries b
  JOIN geo.boundary_versions v ON v.id = b.current_version_id
  WHERE b.status = 'active'
)
SELECT b.pcode, b.name, b.admin_level, 'invalid_shape'::text AS issue, 'error'::text AS severity
FROM live b
WHERE b.admin_level >= 0 AND NOT ST_IsValid(b.raw_geom)
UNION ALL
SELECT b.pcode, b.name, b.admin_level, 'missing_parent', 'error'
FROM geo.boundaries b
WHERE b.status = 'active'
  AND b.admin_level > 0
  AND (b.parent_pcode IS NULL OR NOT EXISTS (SELECT 1 FROM geo.boundaries p WHERE p.pcode = b.parent_pcode))
UNION ALL
SELECT b.pcode, b.name, b.admin_level, 'too_many_vertices', 'warning'
FROM live b
WHERE b.admin_level > 0 AND ST_NPoints(b.raw_geom) > 8000
UNION ALL
SELECT b.pcode, b.name, b.admin_level, 'outside_parent', 'warning'
FROM live b
JOIN live parent ON parent.pcode = b.parent_pcode
WHERE b.admin_level > 0
  AND ST_Area(b.geom::geography) > 0
  AND ST_Area(ST_Difference(b.geom, parent.geom)::geography) > ST_Area(b.geom::geography) * 0.02
UNION ALL
SELECT b.pcode, b.name, b.admin_level, 'sibling_overlap', 'warning'
FROM live b
WHERE b.admin_level > 0
  AND ST_Area(b.geom::geography) > 0
  AND EXISTS (
    SELECT 1
    FROM live s
    WHERE s.parent_pcode IS NOT DISTINCT FROM b.parent_pcode
      AND s.admin_level = b.admin_level
      AND s.pcode <> b.pcode
      AND b.geom && s.geom
      AND ST_Area(ST_Intersection(b.geom, s.geom)::geography) > ST_Area(b.geom::geography) * 0.01
  )
UNION ALL
SELECT b.pcode, b.name, b.admin_level, 'same_name', 'info'
FROM geo.boundaries b
WHERE b.status = 'active'
  AND EXISTS (
    SELECT 1 FROM geo.boundaries o
    WHERE o.status = 'active'
      AND o.admin_level = b.admin_level
      AND lower(o.name) = lower(b.name)
      AND o.pcode <> b.pcode
  );

CREATE UNIQUE INDEX IF NOT EXISTS quality_issues_mv_pkey ON geo.quality_issues_mv (pcode, issue);
GRANT SELECT ON geo.quality_issues_mv TO service_role;

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
    'quality_issues', (SELECT count(*) FROM geo.quality_issues_mv WHERE severity <> 'info'),
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

  BEGIN
    REFRESH MATERIALIZED VIEW geo.quality_issues_mv;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'quality refresh skipped: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('geo-quality-refresh');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    PERFORM cron.schedule(
      'geo-quality-refresh',
      '20 6 * * *',
      $job$REFRESH MATERIALIZED VIEW CONCURRENTLY geo.quality_issues_mv$job$
    );
  END IF;
END
$cron$;

NOTIFY pgrst, 'reload schema';;

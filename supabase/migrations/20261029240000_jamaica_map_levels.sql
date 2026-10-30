-- Jamaica map part 2: level table, draft checks, pin codes, import check, quality list.
-- Nightly quality refresh is concurrent. A publish refreshes inside its transaction, which cannot use CONCURRENTLY.

ALTER TABLE geo.boundary_versions ADD COLUMN IF NOT EXISTS checks jsonb;
ALTER TABLE geo.import_runs ADD COLUMN IF NOT EXISTS features jsonb;
ALTER TABLE geo.import_runs ADD COLUMN IF NOT EXISTS file_hash text;
ALTER TABLE geo.import_runs ADD COLUMN IF NOT EXISTS report jsonb;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'geo.boundary_versions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE geo.boundary_versions DROP CONSTRAINT %I', r.conname);
  END LOOP;
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'geo.places'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE geo.places DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE geo.boundary_versions
  ADD CONSTRAINT boundary_versions_status_check
  CHECK (status IN ('draft', 'published', 'retired', 'discarded'));

ALTER TABLE geo.places
  ADD CONSTRAINT geo_places_kind_check
  CHECK (kind IN ('town_centre', 'landmark', 'poi', 'junction'));

CREATE TABLE IF NOT EXISTS geo.pin_change (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id uuid NOT NULL REFERENCES geo.places(id),
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  actor_id uuid,
  reason text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE geo.pin_change ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geo_pin_change_no_direct ON geo.pin_change;
CREATE POLICY geo_pin_change_no_direct ON geo.pin_change FOR ALL TO authenticated USING (false) WITH CHECK (false);
GRANT SELECT, INSERT ON geo.pin_change TO service_role;

CREATE OR REPLACE FUNCTION geo.list_boundaries_admin(p_level int, p_parent text DEFAULT NULL)
RETURNS TABLE (
  pcode text,
  admin_level smallint,
  parent_pcode text,
  name text,
  parent_name text,
  parish_pcode text,
  town_pcode text,
  area_sqkm numeric,
  vertex_count integer,
  children integer,
  version integer,
  published_at timestamptz,
  has_draft boolean,
  same_name_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = geo, public
AS $$
  SELECT
    b.pcode,
    b.admin_level,
    b.parent_pcode,
    b.name,
    CASE
      WHEN b.admin_level = 3 THEN COALESCE(town.name, '') || ' › ' || COALESCE(parish.name, '')
      WHEN b.admin_level = 2 THEN parish.name
      WHEN b.admin_level = 1 THEN 'Jamaica'
      ELSE NULL
    END,
    CASE
      WHEN b.admin_level = 1 THEN b.pcode
      WHEN b.admin_level = 2 THEN b.parent_pcode
      ELSE town.parent_pcode
    END,
    CASE WHEN b.admin_level = 3 THEN b.parent_pcode ELSE NULL END,
    ROUND(COALESCE(v.area_sqkm, ST_Area(v.geom::geography) / 1000000.0)::numeric, 2),
    COALESCE(ST_NPoints(v.geom), 0)::integer,
    (SELECT count(*)::integer FROM geo.boundaries c WHERE c.parent_pcode = b.pcode AND c.status = 'active'),
    v.version,
    v.created_at,
    EXISTS (SELECT 1 FROM geo.boundary_versions d WHERE d.pcode = b.pcode AND d.status = 'draft'),
    (SELECT count(*)::integer FROM geo.boundaries o WHERE o.admin_level = b.admin_level AND lower(o.name) = lower(b.name) AND o.status = 'active')
  FROM geo.boundaries b
  LEFT JOIN geo.boundaries town ON town.pcode = b.parent_pcode
  LEFT JOIN geo.boundaries parish ON parish.pcode = CASE
    WHEN b.admin_level = 2 THEN b.parent_pcode
    WHEN b.admin_level = 3 THEN town.parent_pcode
    ELSE NULL
  END
  LEFT JOIN geo.boundary_versions v ON v.id = b.current_version_id
  WHERE b.status = 'active'
    AND (p_level IS NULL OR b.admin_level = p_level)
    AND (
      p_parent IS NULL OR btrim(p_parent) = ''
      OR b.parent_pcode = p_parent
      OR (b.admin_level = 3 AND town.parent_pcode = p_parent)
    )
  ORDER BY b.name;
$$;

REVOKE ALL ON FUNCTION geo.list_boundaries_admin(int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.list_boundaries_admin(int, text) TO service_role;

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

UPDATE geo.places SET lat = lat;

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
GRANT EXECUTE ON FUNCTION geo.check_import(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION geo.save_import_drafts(p_run_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, public
AS $$
DECLARE
  feature jsonb;
  row jsonb;
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
    row := feature;
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
GRANT EXECUTE ON FUNCTION geo.save_import_drafts(uuid, uuid) TO service_role;

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

NOTIFY pgrst, 'reload schema';

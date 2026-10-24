-- World Maps: Dominion owns Jamaica. Rush keeps a local copy for checkout.
-- Idempotent so a replay of this file does not duplicate places.

CREATE SCHEMA IF NOT EXISTS geo;

CREATE TABLE IF NOT EXISTS geo.boundaries (
  pcode text PRIMARY KEY,
  admin_level smallint NOT NULL CHECK (admin_level BETWEEN 0 AND 3),
  parent_pcode text,
  name text NOT NULL,
  slug text NOT NULL,
  current_version_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  center_lat double precision,
  center_lng double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS geo.boundary_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pcode text NOT NULL REFERENCES geo.boundaries(pcode),
  version integer NOT NULL,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  geom_display geometry(MultiPolygon, 4326),
  area_sqkm numeric,
  source text NOT NULL,
  source_version text,
  valid_on date,
  notes text,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'retired')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pcode, version)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boundaries_current_version_fk'
  ) THEN
    ALTER TABLE geo.boundaries
      ADD CONSTRAINT boundaries_current_version_fk
      FOREIGN KEY (current_version_id) REFERENCES geo.boundary_versions(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boundaries_parent_fk'
  ) THEN
    ALTER TABLE geo.boundaries
      ADD CONSTRAINT boundaries_parent_fk
      FOREIGN KEY (parent_pcode) REFERENCES geo.boundaries(pcode);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_geo_boundaries_level ON geo.boundaries (admin_level, name);
CREATE INDEX IF NOT EXISTS idx_geo_boundaries_parent ON geo.boundaries (parent_pcode);
CREATE INDEX IF NOT EXISTS idx_geo_versions_pcode ON geo.boundary_versions (pcode, version);
CREATE INDEX IF NOT EXISTS idx_geo_versions_geom ON geo.boundary_versions USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_geo_versions_display ON geo.boundary_versions USING GIST (geom_display);

CREATE TABLE IF NOT EXISTS geo.places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('town_centre', 'landmark', 'poi')),
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  pcode text REFERENCES geo.boundaries(pcode),
  source text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geo_places_pcode ON geo.places (pcode, kind);

CREATE TABLE IF NOT EXISTS geo.place_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pcode text REFERENCES geo.boundaries(pcode),
  alias_kind text NOT NULL,
  alias_value text NOT NULL,
  UNIQUE (pcode, alias_kind, alias_value)
);

CREATE INDEX IF NOT EXISTS idx_geo_aliases_lookup ON geo.place_aliases (alias_kind, alias_value);

CREATE TABLE IF NOT EXISTS geo.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  file_name text,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  dry_run boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS geo.subscribers (
  app_key text PRIMARY KEY,
  impact_path text NOT NULL,
  apply_path text NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS geo.publish_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pcode text NOT NULL,
  version_id uuid,
  actor_id uuid,
  impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('published', 'failed', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geo_publish_log_pcode ON geo.publish_log (pcode, created_at DESC);

INSERT INTO geo.boundaries (pcode, admin_level, parent_pcode, name, slug, center_lat, center_lng, status)
SELECT
  ab.pcode,
  ab.admin_level,
  NULL,
  ab.name,
  COALESCE(NULLIF(btrim(ab.slug), ''), ab.pcode),
  ab.center_lat,
  ab.center_lng,
  'active'
FROM delivery.admin_boundaries ab
ON CONFLICT (pcode) DO NOTHING;

UPDATE geo.boundaries b
SET parent_pcode = ab.parent_pcode
FROM delivery.admin_boundaries ab
WHERE b.pcode = ab.pcode
  AND ab.parent_pcode IS NOT NULL
  AND btrim(ab.parent_pcode) <> ''
  AND EXISTS (SELECT 1 FROM geo.boundaries p WHERE p.pcode = ab.parent_pcode)
  AND b.parent_pcode IS NULL;

INSERT INTO geo.boundary_versions (
  pcode, version, geom, geom_display, area_sqkm, source, source_version, valid_on, status, notes
)
SELECT
  ab.pcode,
  1,
  ab.geom,
  ab.geom_display,
  ab.area_sqkm,
  COALESCE(NULLIF(btrim(ab.source), ''), 'cod-ab'),
  ab.source_version,
  ab.valid_on,
  'published',
  'COD-AB import'
FROM delivery.admin_boundaries ab
ON CONFLICT (pcode, version) DO NOTHING;

UPDATE geo.boundaries b
SET current_version_id = v.id
FROM geo.boundary_versions v
WHERE v.pcode = b.pcode
  AND v.version = 1
  AND b.current_version_id IS NULL;

-- Parish border history. Current borders already match COD-AB, so these stay retired.
INSERT INTO geo.boundary_versions (
  pcode, version, geom, geom_display, area_sqkm, source, notes, status, created_by, created_at
)
SELECT
  sp.pcode,
  1 + ROW_NUMBER() OVER (PARTITION BY sp.pcode ORDER BY ov.version),
  COALESCE(ov.foundation_geom, delivery.jsonb_ring_to_multipolygon(ov.foundation_polygon)),
  delivery.simplify_boundary_display(
    COALESCE(ov.foundation_geom, delivery.jsonb_ring_to_multipolygon(ov.foundation_polygon))
  ),
  NULL,
  COALESCE(NULLIF(btrim(ov.boundary_source), ''), 'manual'),
  COALESCE(ov.label, 'Parish border history'),
  'retired',
  ov.created_by,
  ov.created_at
FROM delivery.parish_outline_versions ov
JOIN delivery.service_parishes sp ON sp.id = ov.parish_id
WHERE sp.pcode IS NOT NULL
  AND COALESCE(ov.foundation_geom, delivery.jsonb_ring_to_multipolygon(ov.foundation_polygon)) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM geo.boundary_versions existing
    WHERE existing.pcode = sp.pcode
      AND existing.notes = COALESCE(ov.label, 'Parish border history')
      AND existing.created_at = ov.created_at
  );

-- Hand-drawn templates, kept only as retired history when the slug matches a place.
INSERT INTO geo.boundary_versions (
  pcode, version, geom, geom_display, source, notes, status
)
SELECT
  b.pcode,
  (SELECT COALESCE(MAX(v.version), 1) + 1 FROM geo.boundary_versions v WHERE v.pcode = b.pcode),
  delivery.jsonb_ring_to_multipolygon(t.polygon),
  delivery.simplify_boundary_display(delivery.jsonb_ring_to_multipolygon(t.polygon)),
  'manual',
  'Retired parish template ' || t.slug,
  'retired'
FROM delivery.parish_outline_templates t
JOIN geo.boundaries b ON b.slug = t.slug AND b.admin_level = 1
WHERE t.polygon IS NOT NULL
  AND jsonb_typeof(t.polygon) = 'array'
  AND jsonb_array_length(t.polygon) >= 3
  AND NOT EXISTS (
    SELECT 1 FROM geo.boundary_versions v
    WHERE v.pcode = b.pcode AND v.notes = 'Retired parish template ' || t.slug
  );

INSERT INTO geo.boundary_versions (
  pcode, version, geom, geom_display, source, notes, status
)
SELECT
  b.pcode,
  (SELECT COALESCE(MAX(v.version), 1) + 1 FROM geo.boundary_versions v WHERE v.pcode = b.pcode),
  delivery.jsonb_ring_to_multipolygon(t.polygon),
  delivery.simplify_boundary_display(delivery.jsonb_ring_to_multipolygon(t.polygon)),
  'manual',
  'Retired town template ' || t.slug,
  'retired'
FROM delivery.town_outline_templates t
JOIN geo.boundaries b ON b.slug = t.slug AND b.admin_level = 2
WHERE t.polygon IS NOT NULL
  AND jsonb_typeof(t.polygon) = 'array'
  AND jsonb_array_length(t.polygon) >= 3
  AND NOT EXISTS (
    SELECT 1 FROM geo.boundary_versions v
    WHERE v.pcode = b.pcode AND v.notes = 'Retired town template ' || t.slug
  );

INSERT INTO geo.places (kind, name, lat, lng, pcode, source, status)
SELECT
  'town_centre',
  COALESCE(NULLIF(btrim(pin->>'name'), ''), 'Pin'),
  (pin->>'lat')::double precision,
  (pin->>'lng')::double precision,
  sp.pcode,
  'town_pins',
  'active'
FROM delivery.service_parishes sp
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(sp.town_pins, '[]'::jsonb)) pin
WHERE sp.pcode IS NOT NULL
  AND (pin->>'lat') ~ '^-?[0-9]'
  AND (pin->>'lng') ~ '^-?[0-9]'
  AND NOT EXISTS (
    SELECT 1 FROM geo.places pl
    WHERE pl.pcode = sp.pcode
      AND pl.kind = 'town_centre'
      AND pl.name = COALESCE(NULLIF(btrim(pin->>'name'), ''), 'Pin')
      AND pl.lat = (pin->>'lat')::double precision
      AND pl.lng = (pin->>'lng')::double precision
  );

INSERT INTO geo.place_aliases (pcode, alias_kind, alias_value)
SELECT b.pcode, 'rush_slug', b.slug
FROM geo.boundaries b
ON CONFLICT DO NOTHING;

INSERT INTO geo.place_aliases (pcode, alias_kind, alias_value)
SELECT
  b.pcode,
  'fare_parish',
  CASE b.slug
    WHEN 'st-elizabeth' THEN 'saint-elizabeth'
    WHEN 'st-james' THEN 'saint-james'
    WHEN 'st-ann' THEN 'saint-ann'
    WHEN 'st-catherine' THEN 'saint-catherine'
    WHEN 'st-mary' THEN 'saint-mary'
    WHEN 'st-andrew' THEN 'saint-andrew'
    WHEN 'st-thomas' THEN 'saint-thomas'
    ELSE b.slug
  END
FROM geo.boundaries b
WHERE b.admin_level = 1
ON CONFLICT DO NOTHING;

INSERT INTO geo.place_aliases (pcode, alias_kind, alias_value)
SELECT
  b.pcode,
  'county',
  CASE b.slug
    WHEN 'hanover' THEN 'cornwall'
    WHEN 'st-elizabeth' THEN 'cornwall'
    WHEN 'st-james' THEN 'cornwall'
    WHEN 'trelawny' THEN 'cornwall'
    WHEN 'westmoreland' THEN 'cornwall'
    WHEN 'st-ann' THEN 'middlesex'
    WHEN 'st-mary' THEN 'middlesex'
    WHEN 'manchester' THEN 'middlesex'
    WHEN 'clarendon' THEN 'middlesex'
    WHEN 'st-catherine' THEN 'middlesex'
    ELSE 'surrey'
  END
FROM geo.boundaries b
WHERE b.admin_level = 1
ON CONFLICT DO NOTHING;

INSERT INTO geo.place_aliases (pcode, alias_kind, alias_value)
SELECT b.pcode, 'fare_locality', b.slug
FROM geo.boundaries b
WHERE b.admin_level = 2
ON CONFLICT DO NOTHING;

INSERT INTO geo.subscribers (app_key, impact_path, apply_path, enabled)
VALUES ('rush', '/internal/geo/impact', '/internal/geo/apply', true)
ON CONFLICT (app_key) DO UPDATE
SET impact_path = EXCLUDED.impact_path, apply_path = EXCLUDED.apply_path;

CREATE OR REPLACE VIEW geo.quality_issues AS
SELECT b.pcode, b.name, b.admin_level, 'invalid_shape'::text AS issue
FROM geo.boundaries b
JOIN geo.boundary_versions v ON v.id = b.current_version_id
WHERE NOT ST_IsValid(v.geom)
UNION ALL
SELECT b.pcode, b.name, b.admin_level, 'missing_parent'
FROM geo.boundaries b
WHERE b.admin_level > 0
  AND (b.parent_pcode IS NULL OR NOT EXISTS (
    SELECT 1 FROM geo.boundaries p WHERE p.pcode = b.parent_pcode
  ))
UNION ALL
SELECT b.pcode, b.name, b.admin_level, 'too_many_vertices'
FROM geo.boundaries b
JOIN geo.boundary_versions v ON v.id = b.current_version_id
WHERE b.admin_level > 0 AND ST_NPoints(v.geom) > 8000;

ALTER TABLE geo.boundaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.boundary_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.place_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.publish_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS geo_boundaries_no_direct ON geo.boundaries;
CREATE POLICY geo_boundaries_no_direct ON geo.boundaries FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS geo_versions_no_direct ON geo.boundary_versions;
CREATE POLICY geo_versions_no_direct ON geo.boundary_versions FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS geo_places_no_direct ON geo.places;
CREATE POLICY geo_places_no_direct ON geo.places FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS geo_aliases_no_direct ON geo.place_aliases;
CREATE POLICY geo_aliases_no_direct ON geo.place_aliases FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS geo_imports_no_direct ON geo.import_runs;
CREATE POLICY geo_imports_no_direct ON geo.import_runs FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS geo_subscribers_no_direct ON geo.subscribers;
CREATE POLICY geo_subscribers_no_direct ON geo.subscribers FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS geo_publish_no_direct ON geo.publish_log;
CREATE POLICY geo_publish_no_direct ON geo.publish_log FOR ALL TO authenticated USING (false) WITH CHECK (false);

GRANT USAGE ON SCHEMA geo TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA geo TO service_role;
GRANT SELECT ON geo.quality_issues TO service_role;
REVOKE ALL ON SCHEMA geo FROM anon, authenticated;

ALTER ROLE authenticator SET pgrst.db_schemas TO
  'public, graphql_public, delivery, payments, rides, freight, logistics, platform, rush_money, risk, rush_config, recon, geo';
NOTIFY pgrst, 'reload config';

-- Rush local copy. Checkout reads adopted_geom, filled as an exact copy of today.
ALTER TABLE delivery.service_parishes
  ADD COLUMN IF NOT EXISTS adopted_version_id uuid,
  ADD COLUMN IF NOT EXISTS adopted_geom geometry(MultiPolygon, 4326),
  ADD COLUMN IF NOT EXISTS adopted_at timestamptz,
  ADD COLUMN IF NOT EXISTS border_notice text;

UPDATE delivery.service_parishes sp
SET
  adopted_geom = sp.foundation_geom,
  adopted_at = COALESCE(sp.adopted_at, now())
WHERE sp.adopted_geom IS NULL
  AND sp.foundation_geom IS NOT NULL;

UPDATE delivery.service_parishes sp
SET adopted_version_id = b.current_version_id
FROM geo.boundaries b
WHERE sp.pcode = b.pcode
  AND sp.adopted_version_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_parishes_pcode_geo_fk'
  ) THEN
    ALTER TABLE delivery.service_parishes
      ADD CONSTRAINT service_parishes_pcode_geo_fk
      FOREIGN KEY (pcode) REFERENCES geo.boundaries(pcode);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_markets_pcode_geo_fk'
  ) THEN
    ALTER TABLE delivery.service_markets
      ADD CONSTRAINT service_markets_pcode_geo_fk
      FOREIGN KEY (pcode) REFERENCES geo.boundaries(pcode);
  END IF;
END $$;

ALTER TABLE delivery.service_zone_polygons
  ADD COLUMN IF NOT EXISTS boundary_version_id uuid;

UPDATE delivery.service_zone_polygons z
SET boundary_version_id = b.current_version_id
FROM geo.boundaries b
WHERE z.boundary_pcode = b.pcode
  AND z.boundary_version_id IS NULL;

CREATE TABLE IF NOT EXISTS delivery.coverage_state (
  id integer PRIMARY KEY CHECK (id = 1),
  active_generation integer NOT NULL DEFAULT 1
);

INSERT INTO delivery.coverage_state (id, active_generation)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE delivery.coverage_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coverage_state_no_direct ON delivery.coverage_state;
CREATE POLICY coverage_state_no_direct ON delivery.coverage_state
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
GRANT ALL ON delivery.coverage_state TO service_role;

ALTER TABLE delivery.coverage_cells
  ADD COLUMN IF NOT EXISTS generation integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coverage_cells_pkey'
      AND conrelid = 'delivery.coverage_cells'::regclass
      AND pg_get_constraintdef(oid) NOT LIKE '%generation%'
  ) THEN
    ALTER TABLE delivery.coverage_cells DROP CONSTRAINT coverage_cells_pkey;
    ALTER TABLE delivery.coverage_cells
      ADD PRIMARY KEY (market_id, h3_res, h3_cell, kind, generation);
  END IF;
END $$;

CREATE OR REPLACE VIEW public.delivery_coverage_cells AS
  SELECT c.market_id, c.h3_cell, c.h3_res, c.kind
  FROM delivery.coverage_cells c
  JOIN delivery.coverage_state s ON s.id = 1 AND c.generation = s.active_generation;

GRANT SELECT ON public.delivery_coverage_cells TO authenticated, service_role;

CREATE OR REPLACE FUNCTION delivery.point_in_parish_foundation(
  p_parish_id uuid,
  p_lat double precision,
  p_lng double precision
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT CASE
    WHEN adopted_geom IS NOT NULL THEN
      ST_Covers(adopted_geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
    WHEN foundation_geom IS NOT NULL THEN
      ST_Covers(foundation_geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
    WHEN foundation_polygon IS NOT NULL THEN
      ST_Covers(
        delivery.jsonb_ring_to_multipolygon(foundation_polygon),
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
      )
    ELSE true
  END
  FROM delivery.service_parishes
  WHERE id = p_parish_id;
$$;

CREATE OR REPLACE FUNCTION delivery.parish_foundation_parts(p_parish_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT COALESCE(
    delivery.geom_to_coverage_parts(COALESCE(adopted_geom, foundation_geom)),
    '[]'::jsonb
  )
  FROM delivery.service_parishes
  WHERE id = p_parish_id;
$$;

GRANT EXECUTE ON FUNCTION delivery.point_in_parish_foundation TO service_role;
GRANT EXECUTE ON FUNCTION delivery.parish_foundation_parts(uuid) TO service_role;

CREATE OR REPLACE FUNCTION delivery.overview_community_shapes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, geo, public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.name), '[]'::jsonb)
  FROM (
    SELECT
      b.pcode,
      b.name,
      b.parent_pcode,
      COALESCE(b.center_lat, ST_Y(ST_PointOnSurface(COALESCE(v.geom_display, v.geom)))) AS center_lat,
      COALESCE(b.center_lng, ST_X(ST_PointOnSurface(COALESCE(v.geom_display, v.geom)))) AS center_lng,
      delivery.display_rings_json(
        COALESCE(v.geom_display, delivery.simplify_boundary_display(v.geom))
      ) AS rings
    FROM geo.boundaries b
    JOIN geo.boundary_versions v ON v.id = b.current_version_id
    WHERE b.admin_level = 3
      AND b.status = 'active'
  ) s;
$$;

CREATE OR REPLACE FUNCTION delivery.overview_town_shapes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, geo, public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.parish_name NULLS LAST, s.name), '[]'::jsonb)
  FROM (
    SELECT
      m.id AS market_id,
      m.name,
      m.parish_id,
      p.name AS parish_name,
      m.is_active,
      m.pcode,
      COALESCE(b.center_lat, ST_Y(ST_PointOnSurface(COALESCE(v.geom_display, v.geom)))) AS center_lat,
      COALESCE(b.center_lng, ST_X(ST_PointOnSurface(COALESCE(v.geom_display, v.geom)))) AS center_lng,
      delivery.display_rings_json(
        COALESCE(v.geom_display, delivery.simplify_boundary_display(v.geom))
      ) AS rings
    FROM delivery.service_markets m
    LEFT JOIN delivery.service_parishes p ON p.id = m.parish_id
    LEFT JOIN geo.boundaries b ON b.admin_level = 2 AND b.pcode = m.pcode
    LEFT JOIN geo.boundary_versions v ON v.id = b.current_version_id
  ) s;
$$;

CREATE OR REPLACE FUNCTION delivery.overview_parish_shapes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, geo, public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.name), '[]'::jsonb)
  FROM (
    SELECT
      p.id AS parish_id,
      p.name,
      delivery.display_rings_json(
        COALESCE(v.geom_display, delivery.simplify_boundary_display(v.geom))
      ) AS rings
    FROM delivery.service_parishes p
    LEFT JOIN geo.boundaries b ON b.admin_level = 1 AND b.pcode = p.pcode
    LEFT JOIN geo.boundary_versions v ON v.id = b.current_version_id
  ) s;
$$;

REVOKE ALL ON FUNCTION delivery.overview_community_shapes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery.overview_community_shapes() TO service_role;
GRANT EXECUTE ON FUNCTION delivery.overview_town_shapes() TO service_role;
GRANT EXECUTE ON FUNCTION delivery.overview_parish_shapes() TO service_role;

-- One database step. Pending coverage rows must already exist for markets that were rebuilt.
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

REVOKE ALL ON FUNCTION geo.commit_boundary_publish(text, uuid, integer, uuid[], jsonb, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.commit_boundary_publish(text, uuid, integer, uuid[], jsonb, uuid, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION geo.list_shapes(p_levels int[])
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
      delivery.display_rings_json(COALESCE(v.geom_display, delivery.simplify_boundary_display(v.geom))) AS rings
    FROM geo.boundaries b
    JOIN geo.boundary_versions v ON v.id = b.current_version_id
    WHERE b.status = 'active'
      AND (p_levels IS NULL OR b.admin_level = ANY (p_levels))
  ) s;
$$;

REVOKE ALL ON FUNCTION geo.list_shapes(int[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.list_shapes(int[]) TO service_role;

CREATE OR REPLACE FUNCTION geo.resolve_fare_location(p_lat double precision, p_lng double precision)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = geo, public
AS $$
DECLARE
  parish record;
  town record;
  county_slug text;
  fare_parish text;
  locality text;
BEGIN
  SELECT b.pcode, b.name, b.slug, ST_Area(v.geom::geography) AS area
  INTO parish
  FROM geo.boundaries b
  JOIN geo.boundary_versions v ON v.id = b.current_version_id
  WHERE b.admin_level = 1
    AND b.status = 'active'
    AND ST_Covers(v.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  ORDER BY ST_Area(v.geom::geography) ASC
  LIMIT 1;

  IF parish.pcode IS NULL THEN
    RETURN jsonb_build_object('location_key', 'jamaica', 'fallback_keys', jsonb_build_array('jamaica'));
  END IF;

  SELECT alias_value INTO county_slug
  FROM geo.place_aliases
  WHERE pcode = parish.pcode AND alias_kind = 'county'
  LIMIT 1;

  SELECT alias_value INTO fare_parish
  FROM geo.place_aliases
  WHERE pcode = parish.pcode AND alias_kind = 'fare_parish'
  LIMIT 1;
  fare_parish := COALESCE(fare_parish, parish.slug);

  SELECT b.slug INTO locality
  FROM geo.boundaries b
  JOIN geo.boundary_versions v ON v.id = b.current_version_id
  WHERE b.admin_level = 2
    AND b.parent_pcode = parish.pcode
    AND b.status = 'active'
    AND ST_Covers(v.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  ORDER BY ST_Area(v.geom::geography) ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'county', county_slug,
    'parish', fare_parish,
    'locality', locality,
    'location_key',
      'jamaica/' || COALESCE(county_slug, 'surrey') || '/' || fare_parish ||
      CASE WHEN locality IS NULL THEN '' ELSE '/' || locality END
  );
END;
$$;

REVOKE ALL ON FUNCTION geo.resolve_fare_location(double precision, double precision)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.resolve_fare_location(double precision, double precision) TO service_role;

CREATE OR REPLACE FUNCTION geo.fare_tree()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = geo, public
AS $$
  SELECT COALESCE(jsonb_agg(county_row ORDER BY county_row->>'slug'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'slug', c.alias_value,
      'label', initcap(c.alias_value),
      'parishes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'slug', fp.alias_value,
          'label', b.name,
          'pcode', b.pcode,
          'localities', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('slug', t.slug, 'label', t.name) ORDER BY t.name)
            FROM geo.boundaries t
            WHERE t.parent_pcode = b.pcode AND t.admin_level = 2 AND t.status = 'active'
          ), '[]'::jsonb)
        ) ORDER BY b.name)
        FROM geo.boundaries b
        JOIN geo.place_aliases fp ON fp.pcode = b.pcode AND fp.alias_kind = 'fare_parish'
        JOIN geo.place_aliases c2 ON c2.pcode = b.pcode AND c2.alias_kind = 'county' AND c2.alias_value = c.alias_value
        WHERE b.admin_level = 1
      ), '[]'::jsonb)
    ) AS county_row
    FROM (
      SELECT DISTINCT alias_value FROM geo.place_aliases WHERE alias_kind = 'county'
    ) c
  ) counties;
$$;

REVOKE ALL ON FUNCTION geo.fare_tree() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.fare_tree() TO service_role;

INSERT INTO platform.permissions (key, display_name, description, category, product_key)
VALUES (
  'platform.geo.write',
  'Edit World Maps',
  'Publish borders and pins for every app',
  'system',
  NULL
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
JOIN platform.permissions p ON p.key = 'platform.geo.write'
WHERE r.name IN ('platform_owner', 'superadmin')
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'geo-adopted-reconcile',
      '15 6 * * *',
      $job$SELECT private.invoke_rush_delivery('/internal/geo/reconcile');$job$
    );
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    NULL;
  WHEN undefined_function THEN
    NULL;
  WHEN undefined_table THEN
    NULL;
END $$;

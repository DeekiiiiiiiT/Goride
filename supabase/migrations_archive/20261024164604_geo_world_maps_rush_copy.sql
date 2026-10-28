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

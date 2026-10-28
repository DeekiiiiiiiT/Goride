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

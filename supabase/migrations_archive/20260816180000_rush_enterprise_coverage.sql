-- Enterprise Markets coverage: zone metadata, draft/publish versions, outline templates.

-- Zone metadata for radius tools + provenance
ALTER TABLE delivery.service_zone_polygons
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS center_lat double precision,
  ADD COLUMN IF NOT EXISTS center_lng double precision,
  ADD COLUMN IF NOT EXISTS radius_m double precision,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_zone_polygons_source_check'
  ) THEN
    ALTER TABLE delivery.service_zone_polygons
      ADD CONSTRAINT service_zone_polygons_source_check
      CHECK (source IN ('manual', 'radius', 'auto_outline', 'import'));
  END IF;
END $$;

COMMENT ON COLUMN delivery.service_zone_polygons.source IS
  'manual | radius | auto_outline | import — how the polygon was created.';

-- Draft/publish flags on markets
ALTER TABLE delivery.service_markets
  ADD COLUMN IF NOT EXISTS draft_dirty boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_version_id uuid,
  ADD COLUMN IF NOT EXISTS readiness_merchants_min integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS readiness_couriers_min integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS delivery.service_coverage_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES delivery.service_markets(id) ON DELETE CASCADE,
  version integer NOT NULL,
  label text,
  notes text,
  zones_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (market_id, version)
);

CREATE INDEX IF NOT EXISTS idx_service_coverage_versions_market
  ON delivery.service_coverage_versions(market_id, version DESC);

ALTER TABLE delivery.service_markets
  DROP CONSTRAINT IF EXISTS service_markets_published_version_id_fkey;

ALTER TABLE delivery.service_markets
  ADD CONSTRAINT service_markets_published_version_id_fkey
  FOREIGN KEY (published_version_id)
  REFERENCES delivery.service_coverage_versions(id)
  ON DELETE SET NULL;

ALTER TABLE delivery.service_coverage_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON delivery.service_coverage_versions TO service_role;

COMMENT ON TABLE delivery.service_coverage_versions IS
  'Immutable published snapshots of town coverage zones for customer apps.';

-- Outline templates for new towns
CREATE TABLE IF NOT EXISTS delivery.town_outline_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  polygon jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE delivery.town_outline_templates ENABLE ROW LEVEL SECURITY;
GRANT ALL ON delivery.town_outline_templates TO service_role;

-- Mark existing auto-seeded includes
UPDATE delivery.service_zone_polygons
SET source = 'auto_outline'
WHERE kind = 'include'
  AND source = 'manual'
  AND name ILIKE '%delivery area%';

-- Backfill: publish current draft for every market that has a valid include
DO $$
DECLARE
  m RECORD;
  zjson jsonb;
  vid uuid;
  ver integer;
BEGIN
  FOR m IN SELECT id, name FROM delivery.service_markets LOOP
    SELECT COALESCE(jsonb_agg(row_to_json(z)::jsonb ORDER BY z.priority DESC), '[]'::jsonb)
    INTO zjson
    FROM delivery.service_zone_polygons z
    WHERE z.market_id = m.id;

    IF zjson = '[]'::jsonb THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM delivery.service_coverage_versions v WHERE v.market_id = m.id
    ) THEN
      CONTINUE;
    END IF;

    ver := 1;
    INSERT INTO delivery.service_coverage_versions (market_id, version, label, zones_json, notes)
    VALUES (m.id, ver, 'Initial publish', zjson, 'Backfill from live zones')
    RETURNING id INTO vid;

    UPDATE delivery.service_markets
    SET published_version_id = vid, draft_dirty = false
    WHERE id = m.id;
  END LOOP;
END $$;

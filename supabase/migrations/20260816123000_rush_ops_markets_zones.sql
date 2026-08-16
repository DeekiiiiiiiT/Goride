-- Rush Ops: service markets, delivery zone polygons, and notify-me waitlist.
-- Polygons are stored as a jsonb array of { "lat": number, "lng": number } vertices.

CREATE TABLE IF NOT EXISTS delivery.service_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  waitlist_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery.service_zone_polygons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES delivery.service_markets(id) ON DELETE CASCADE,
  name text NOT NULL,
  polygon jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_zone_polygons_market
  ON delivery.service_zone_polygons(market_id);

CREATE TABLE IF NOT EXISTS delivery.zone_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  market_id uuid REFERENCES delivery.service_markets(id) ON DELETE SET NULL,
  attempted_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zone_waitlist_created
  ON delivery.zone_waitlist(created_at DESC);

ALTER TABLE delivery.service_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.service_zone_polygons ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.zone_waitlist ENABLE ROW LEVEL SECURITY;

-- Edge functions read/write these tables with the service role; no public policies needed.
GRANT ALL ON delivery.service_markets TO service_role;
GRANT ALL ON delivery.service_zone_polygons TO service_role;
GRANT ALL ON delivery.zone_waitlist TO service_role;

COMMENT ON TABLE delivery.service_markets IS 'Rush serviceable markets (city/metro) with launch + waitlist flags.';
COMMENT ON TABLE delivery.service_zone_polygons IS 'Delivery coverage polygons per market; polygon = jsonb array of {lat,lng} vertices.';
COMMENT ON TABLE delivery.zone_waitlist IS 'Notify-me signups from addresses outside active coverage.';

-- ---------------------------------------------------------------------------
-- Seed markets + polygons (idempotent on slug / market+zone name)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  kingston_id uuid;
  spanish_town_id uuid;
BEGIN
  -- Kingston (soft-launch coverage around New Kingston / Half Way Tree / Hope Rd)
  INSERT INTO delivery.service_markets (slug, name, is_active, waitlist_enabled)
  VALUES ('kingston', 'Kingston', true, false)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, is_active = true
  RETURNING id INTO kingston_id;

  IF kingston_id IS NULL THEN
    SELECT id INTO kingston_id FROM delivery.service_markets WHERE slug = 'kingston';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM delivery.service_zone_polygons
    WHERE market_id = kingston_id AND name = 'Kingston Metro'
  ) THEN
    INSERT INTO delivery.service_zone_polygons (market_id, name, priority, polygon)
    VALUES (
      kingston_id,
      'Kingston Metro',
      10,
      '[
        {"lat": 18.12, "lng": -76.88},
        {"lat": 18.1, "lng": -76.72},
        {"lat": 18.02, "lng": -76.68},
        {"lat": 17.94, "lng": -76.7},
        {"lat": 17.92, "lng": -76.82},
        {"lat": 17.96, "lng": -76.92},
        {"lat": 18.06, "lng": -76.92},
        {"lat": 18.12, "lng": -76.88}
      ]'::jsonb
    );
  END IF;

  -- Spanish Town (approximate coverage over Spanish Town / Magil area)
  INSERT INTO delivery.service_markets (slug, name, is_active, waitlist_enabled)
  VALUES ('spanish-town', 'Spanish Town', true, false)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, is_active = true
  RETURNING id INTO spanish_town_id;

  IF spanish_town_id IS NULL THEN
    SELECT id INTO spanish_town_id FROM delivery.service_markets WHERE slug = 'spanish-town';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM delivery.service_zone_polygons
    WHERE market_id = spanish_town_id AND name = 'Spanish Town'
  ) THEN
    INSERT INTO delivery.service_zone_polygons (market_id, name, priority, polygon)
    VALUES (
      spanish_town_id,
      'Spanish Town',
      10,
      '[
        {"lat": 18.020, "lng": -76.990},
        {"lat": 18.020, "lng": -76.920},
        {"lat": 17.960, "lng": -76.920},
        {"lat": 17.960, "lng": -76.990}
      ]'::jsonb
    );
  END IF;
END $$;

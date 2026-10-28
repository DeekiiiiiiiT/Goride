-- Rush Ops: group service towns (markets) under Jamaica parishes.

CREATE TABLE IF NOT EXISTS delivery.service_parishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE delivery.service_markets
  ADD COLUMN IF NOT EXISTS parish_id uuid REFERENCES delivery.service_parishes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_markets_parish
  ON delivery.service_markets(parish_id);

ALTER TABLE delivery.service_parishes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON delivery.service_parishes TO service_role;

COMMENT ON TABLE delivery.service_parishes IS 'Jamaica parish grouping for Rush Ops towns/markets.';
COMMENT ON COLUMN delivery.service_markets.parish_id IS 'Parent parish for this town/market (nullable for legacy/unassigned).';

-- Seed soft-launch parishes + assign existing towns
DO $$
DECLARE
  kingston_parish uuid;
  st_andrew_parish uuid;
  st_catherine_parish uuid;
BEGIN
  INSERT INTO delivery.service_parishes (slug, name, sort_order) VALUES
    ('kingston', 'Kingston', 10),
    ('st-andrew', 'St. Andrew', 20),
    ('st-catherine', 'St. Catherine', 30),
    ('st-thomas', 'St. Thomas', 40),
    ('portland', 'Portland', 50),
    ('st-mary', 'St. Mary', 60),
    ('st-ann', 'St. Ann', 70),
    ('trelawny', 'Trelawny', 80),
    ('st-james', 'St. James', 90),
    ('hanover', 'Hanover', 100),
    ('westmoreland', 'Westmoreland', 110),
    ('st-elizabeth', 'St. Elizabeth', 120),
    ('manchester', 'Manchester', 130),
    ('clarendon', 'Clarendon', 140)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

  SELECT id INTO kingston_parish FROM delivery.service_parishes WHERE slug = 'kingston';
  SELECT id INTO st_andrew_parish FROM delivery.service_parishes WHERE slug = 'st-andrew';
  SELECT id INTO st_catherine_parish FROM delivery.service_parishes WHERE slug = 'st-catherine';

  UPDATE delivery.service_markets
  SET parish_id = kingston_parish
  WHERE slug = 'kingston' AND parish_id IS NULL;

  UPDATE delivery.service_markets
  SET parish_id = st_catherine_parish
  WHERE slug = 'spanish-town' AND parish_id IS NULL;
END $$;

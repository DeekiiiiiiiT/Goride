-- Parish foundation borders (ops geography). Customer delivery still uses town include − exclude.

ALTER TABLE delivery.service_parishes
  ADD COLUMN IF NOT EXISTS foundation_polygon jsonb,
  ADD COLUMN IF NOT EXISTS foundation_updated_at timestamptz;

COMMENT ON COLUMN delivery.service_parishes.foundation_polygon IS
  'Ops parish foundation outline (>=3 {lat,lng}). Does not drive customer delivery coverage.';

CREATE TABLE IF NOT EXISTS delivery.parish_outline_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  polygon jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE delivery.parish_outline_templates ENABLE ROW LEVEL SECURITY;
GRANT ALL ON delivery.parish_outline_templates TO service_role;

COMMENT ON TABLE delivery.parish_outline_templates IS
  'Default parish foundation outlines by slug — used when seeding/resetting parish borders.';

-- Admin-managed merchant business type taxonomy for partner onboarding.

CREATE TABLE IF NOT EXISTS delivery.merchant_business_type_sections (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{0,40}$'),
  label TEXT NOT NULL CHECK (char_length(trim(label)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery.merchant_business_types (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{0,40}$'),
  section_id TEXT NOT NULL REFERENCES delivery.merchant_business_type_sections(id) ON DELETE RESTRICT,
  label TEXT NOT NULL CHECK (char_length(trim(label)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_business_types_section_sort
  ON delivery.merchant_business_types (section_id, sort_order, id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_merchant_business_type_sections_sort
  ON delivery.merchant_business_type_sections (sort_order, id)
  WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS update_merchant_business_type_sections_updated_at
  ON delivery.merchant_business_type_sections;
CREATE TRIGGER update_merchant_business_type_sections_updated_at
  BEFORE UPDATE ON delivery.merchant_business_type_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_merchant_business_types_updated_at
  ON delivery.merchant_business_types;
CREATE TRIGGER update_merchant_business_types_updated_at
  BEFORE UPDATE ON delivery.merchant_business_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO delivery.merchant_business_type_sections (id, label, sort_order)
VALUES
  ('food_service', 'Food Service', 0),
  ('specialty', 'Specialty & Other', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO delivery.merchant_business_types (id, section_id, label, sort_order)
VALUES
  ('restaurant', 'food_service', 'Restaurant', 0),
  ('cafe', 'food_service', 'Cafe / Coffee Shop', 1),
  ('bakery', 'food_service', 'Bakery', 2),
  ('fast_food', 'food_service', 'Fast Food', 3),
  ('other', 'specialty', 'Other', 0)
ON CONFLICT (id) DO NOTHING;

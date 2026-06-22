-- Multi-vertical merchant taxonomy metadata (additive, backward-compatible).

-- A: merchant_business_types vertical metadata
ALTER TABLE delivery.merchant_business_types
  ADD COLUMN IF NOT EXISTS vertical_type text NOT NULL DEFAULT 'restaurant'
    CHECK (vertical_type IN ('restaurant', 'grocery', 'pharmacy', 'alcohol', 'convenience', 'retail')),
  ADD COLUMN IF NOT EXISTS fulfillment_type text NOT NULL DEFAULT 'cook_to_order'
    CHECK (fulfillment_type IN ('cook_to_order', 'pick_and_pack')),
  ADD COLUMN IF NOT EXISTS required_document_types jsonb NOT NULL
    DEFAULT '["id_front", "id_back", "proof_of_business"]'::jsonb,
  ADD COLUMN IF NOT EXISTS category_taxonomy_key text NOT NULL DEFAULT 'cuisine'
    CHECK (category_taxonomy_key IN ('cuisine', 'inventory_category', 'none')),
  ADD COLUMN IF NOT EXISTS default_prep_time_mins integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS max_delivery_radius_km integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS compliance_tier text NOT NULL DEFAULT 'standard'
    CHECK (compliance_tier IN ('standard', 'regulated')),
  ADD COLUMN IF NOT EXISTS go_live_rule text NOT NULL DEFAULT 'menu_min_5'
    CHECK (go_live_rule IN ('menu_min_5', 'catalog_imported', 'pos_connected'));

UPDATE delivery.merchant_business_types
SET
  vertical_type = 'restaurant',
  fulfillment_type = 'cook_to_order',
  category_taxonomy_key = 'cuisine',
  compliance_tier = 'standard',
  go_live_rule = 'menu_min_5'
WHERE id IN ('restaurant', 'cafe', 'bakery', 'fast_food', 'other');

-- B: merchants snapshot columns (nullable for existing rows)
ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS vertical_type text
    CHECK (vertical_type IS NULL OR vertical_type IN (
      'restaurant', 'grocery', 'pharmacy', 'alcohol', 'convenience', 'retail'
    )),
  ADD COLUMN IF NOT EXISTS fulfillment_type text
    CHECK (fulfillment_type IS NULL OR fulfillment_type IN ('cook_to_order', 'pick_and_pack')),
  ADD COLUMN IF NOT EXISTS go_live_rule text
    CHECK (go_live_rule IS NULL OR go_live_rule IN ('menu_min_5', 'catalog_imported', 'pos_connected'));

-- C: extend document types for future regulated verticals
ALTER TABLE delivery.merchant_documents
  DROP CONSTRAINT IF EXISTS merchant_documents_doc_type_check;

ALTER TABLE delivery.merchant_documents
  ADD CONSTRAINT merchant_documents_doc_type_check
  CHECK (doc_type IN (
    'id_front', 'id_back', 'proof_of_business', 'liquor_license', 'pharmacy_permit'
  ));

-- D: merchant_settings table
CREATE TABLE IF NOT EXISTS delivery.merchant_settings (
  merchant_id uuid PRIMARY KEY REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  allows_pickup boolean NOT NULL DEFAULT true,
  allows_scheduled boolean NOT NULL DEFAULT true,
  allows_doubledash boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_merchant_settings_updated_at ON delivery.merchant_settings;
CREATE TRIGGER update_merchant_settings_updated_at
  BEFORE UPDATE ON delivery.merchant_settings
  FOR EACH ROW EXECUTE FUNCTION delivery.set_updated_at();

ALTER TABLE delivery.merchant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own settings"
  ON delivery.merchant_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_settings.merchant_id AND m.owner_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access merchant settings"
  ON delivery.merchant_settings FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

GRANT ALL ON delivery.merchant_settings TO authenticated, service_role;

-- E: retail sections + inactive types (enabled after consumer wiring)
INSERT INTO delivery.merchant_business_type_sections (id, label, sort_order)
VALUES ('retail', 'Retail', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO delivery.merchant_business_types (
  id, section_id, label, sort_order, is_active,
  vertical_type, fulfillment_type, category_taxonomy_key,
  default_prep_time_mins, max_delivery_radius_km, go_live_rule
)
VALUES
  (
    'grocery', 'retail', 'Grocery Store', 0, false,
    'grocery', 'pick_and_pack', 'inventory_category', 30, 15, 'catalog_imported'
  ),
  (
    'convenience', 'retail', 'Convenience Store', 1, false,
    'convenience', 'pick_and_pack', 'inventory_category', 20, 10, 'catalog_imported'
  )
ON CONFLICT (id) DO NOTHING;

-- F: catalog fields on menu_items (Phase 9 catalog support)
ALTER TABLE delivery.menu_items
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS upc text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS stock_qty integer;

CREATE INDEX IF NOT EXISTS idx_menu_items_sku
  ON delivery.menu_items (merchant_id, sku)
  WHERE sku IS NOT NULL;

COMMENT ON COLUMN delivery.merchants.vertical_type IS 'Snapshot of vertical at submit; null = restaurant default';
COMMENT ON TABLE delivery.merchant_settings IS 'Partner delivery preferences (pickup, scheduled, doubledash)';

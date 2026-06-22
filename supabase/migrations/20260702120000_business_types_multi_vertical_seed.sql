-- Idempotent multi-vertical business type seed (additive, safe for existing envs).

INSERT INTO delivery.merchant_business_type_sections (id, label, sort_order)
VALUES
  ('food_service', 'Food Service', 0),
  ('retail', 'Retail and Grocery', 1),
  ('regulated', 'Regulated', 2),
  ('specialty', 'Specialty and Other', 99)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE;

-- Backfill restaurant metadata on legacy food types (only when still default/null-ish)
UPDATE delivery.merchant_business_types
SET
  vertical_type = 'restaurant',
  fulfillment_type = 'cook_to_order',
  category_taxonomy_key = 'cuisine',
  compliance_tier = 'standard',
  go_live_rule = 'menu_min_5',
  default_prep_time_mins = COALESCE(NULLIF(default_prep_time_mins, 0), 15),
  max_delivery_radius_km = COALESCE(NULLIF(max_delivery_radius_km, 0), 5)
WHERE id IN ('restaurant', 'cafe', 'bakery', 'fast_food', 'cook_shop', 'sports_bar', 'other')
  AND (vertical_type IS NULL OR vertical_type = 'restaurant');

INSERT INTO delivery.merchant_business_types (
  id, section_id, label, sort_order, is_active,
  vertical_type, fulfillment_type, category_taxonomy_key,
  default_prep_time_mins, max_delivery_radius_km, compliance_tier, go_live_rule,
  required_document_types
)
VALUES
  (
    'grocery', 'retail', 'Grocery Store', 0, TRUE,
    'grocery', 'pick_and_pack', 'inventory_category',
    30, 15, 'standard', 'catalog_imported',
    '["id_front", "id_back", "proof_of_business"]'::jsonb
  ),
  (
    'convenience', 'retail', 'Convenience Store', 1, TRUE,
    'convenience', 'pick_and_pack', 'inventory_category',
    20, 10, 'standard', 'catalog_imported',
    '["id_front", "id_back", "proof_of_business"]'::jsonb
  ),
  (
    'pharmacy', 'regulated', 'Pharmacy', 0, TRUE,
    'pharmacy', 'pick_and_pack', 'inventory_category',
    30, 10, 'regulated', 'catalog_imported',
    '["id_front", "id_back", "proof_of_business", "pharmacy_permit"]'::jsonb
  ),
  (
    'alcohol', 'regulated', 'Alcohol Retail', 1, TRUE,
    'alcohol', 'pick_and_pack', 'inventory_category',
    25, 10, 'regulated', 'catalog_imported',
    '["id_front", "id_back", "proof_of_business", "liquor_license"]'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  section_id = EXCLUDED.section_id,
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  is_active = CASE
    WHEN delivery.merchant_business_types.is_active = FALSE THEN EXCLUDED.is_active
    ELSE delivery.merchant_business_types.is_active
  END,
  vertical_type = EXCLUDED.vertical_type,
  fulfillment_type = EXCLUDED.fulfillment_type,
  category_taxonomy_key = EXCLUDED.category_taxonomy_key,
  default_prep_time_mins = EXCLUDED.default_prep_time_mins,
  max_delivery_radius_km = EXCLUDED.max_delivery_radius_km,
  compliance_tier = EXCLUDED.compliance_tier,
  go_live_rule = EXCLUDED.go_live_rule,
  required_document_types = EXCLUDED.required_document_types
WHERE delivery.merchant_business_types.is_active = FALSE
   OR delivery.merchant_business_types.vertical_type = 'restaurant';

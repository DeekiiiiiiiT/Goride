-- Per-business-type category tags for partner onboarding (admin-editable).

ALTER TABLE delivery.merchant_business_types
  ADD COLUMN IF NOT EXISTS category_tags TEXT[] NOT NULL DEFAULT '{}';

-- Food Service — additional types
INSERT INTO delivery.merchant_business_types (
  id, section_id, label, sort_order, is_active,
  vertical_type, fulfillment_type, category_taxonomy_key,
  default_prep_time_mins, max_delivery_radius_km, compliance_tier, go_live_rule,
  required_document_types, category_tags
)
VALUES
  (
    'cook_shop', 'food_service', 'Cook Shop', 0, TRUE,
    'restaurant', 'cook_to_order', 'cuisine',
    15, 5, 'standard', 'menu_min_5',
    '["id_front", "id_back", "proof_of_business"]'::jsonb,
    ARRAY[
      'Box Food', 'Homestyle', 'Jerk', 'Oxtail', 'Curry Goat', 'Fry Chicken', 'Ital',
      'Local Soups', 'Ground Provisions', 'Breakfast (Ackee & Saltfish)'
    ]
  ),
  (
    'sports_bar', 'food_service', 'Sports Bar', 3, TRUE,
    'restaurant', 'cook_to_order', 'cuisine',
    15, 5, 'standard', 'menu_min_5',
    '["id_front", "id_back", "proof_of_business"]'::jsonb,
    ARRAY[
      'White Rum', 'Cold Beers (Red Stripe/Guinness)', 'Campari', 'Pan Chicken',
      'Escovitch Fish', 'Wings', 'Cocktails', 'Happy Hour', 'Chasers', 'Soup (Mannish Water)'
    ]
  )
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  category_tags = EXCLUDED.category_tags,
  vertical_type = EXCLUDED.vertical_type,
  fulfillment_type = EXCLUDED.fulfillment_type,
  category_taxonomy_key = EXCLUDED.category_taxonomy_key;

-- General Retail
INSERT INTO delivery.merchant_business_types (
  id, section_id, label, sort_order, is_active,
  vertical_type, fulfillment_type, category_taxonomy_key,
  default_prep_time_mins, max_delivery_radius_km, compliance_tier, go_live_rule,
  required_document_types, category_tags
)
VALUES
  (
    'general_retail', 'retail', 'General Retail', 2, TRUE,
    'retail', 'pick_and_pack', 'inventory_category',
    25, 10, 'standard', 'catalog_imported',
    '["id_front", "id_back", "proof_of_business"]'::jsonb,
    ARRAY[
      'Haberdashery', 'Electronics', 'Clothing', 'Home Goods',
      'Beauty Supplies', 'Hardware', 'Gifts', 'Stationery'
    ]
  )
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  category_tags = EXCLUDED.category_tags,
  vertical_type = EXCLUDED.vertical_type,
  fulfillment_type = EXCLUDED.fulfillment_type,
  category_taxonomy_key = EXCLUDED.category_taxonomy_key;

-- Resequence food service sort orders
UPDATE delivery.merchant_business_types SET sort_order = 0 WHERE id = 'cook_shop';
UPDATE delivery.merchant_business_types SET sort_order = 1 WHERE id = 'restaurant';
UPDATE delivery.merchant_business_types SET sort_order = 2 WHERE id = 'sports_bar';
UPDATE delivery.merchant_business_types SET sort_order = 3 WHERE id = 'cafe';
UPDATE delivery.merchant_business_types SET sort_order = 4 WHERE id = 'bakery';
UPDATE delivery.merchant_business_types SET sort_order = 5 WHERE id = 'fast_food';

-- Seed category tags per business type
UPDATE delivery.merchant_business_types SET
  label = 'Restaurant',
  category_tags = ARRAY[
    'Seafood (Escovitch/Hellshire-style)', 'Local Cuisine', 'Fine Dining', 'Casual Dining',
    'Family Style', 'Buffet', 'Late Night', 'Waterfront'
  ]
WHERE id = 'restaurant';

UPDATE delivery.merchant_business_types SET
  label = 'Cafe / Coffee Shop',
  category_tags = ARRAY[
    'Blue Mountain Coffee', 'Teas', 'Pastries', 'Breakfast', 'Sandwiches', 'Smoothies', 'Patties'
  ]
WHERE id = 'cafe';

UPDATE delivery.merchant_business_types SET
  label = 'Bakery',
  category_tags = ARRAY[
    'Hard Dough Bread', 'Patties', 'Coco Bread', 'Bullas & Tarts',
    'Local Sweets (Gizzada/Drops)', 'Custom Cakes', 'Pastries'
  ]
WHERE id = 'bakery';

UPDATE delivery.merchant_business_types SET
  label = 'Fast Food',
  category_tags = ARRAY[
    'Fried Chicken', 'Patties', 'Burgers', 'Pizza', 'Combos', 'Quick Bites', 'Late Night'
  ]
WHERE id = 'fast_food';

UPDATE delivery.merchant_business_types SET
  label = 'Convenience Store (Corner Shop)',
  category_tags = ARRAY[
    'Snacks', 'Cold Drinks', 'Phone Credit', 'Toiletries', 'Grocery Essentials', 'Sweets', 'Ice Cream'
  ]
WHERE id = 'convenience';

UPDATE delivery.merchant_business_types SET
  label = 'Grocery Store (Supermarket / Wholesale)',
  category_tags = ARRAY[
    'Fresh Produce', 'Ground Provisions', 'Meat & Poultry', 'Pantry Staples',
    'Bulk Items', 'Household', 'Frozen Foods'
  ]
WHERE id = 'grocery';

UPDATE delivery.merchant_business_types SET
  label = 'Liquor Store / Alcohol Retail (Wholesale Liquor)',
  category_tags = ARRAY[
    'White Rum', 'Beers & Stouts', 'Spirits', 'Campari', 'Wine',
    'Mixers & Chasers', 'Party Supplies', 'Premium Liquors'
  ]
WHERE id = 'alcohol';

UPDATE delivery.merchant_business_types SET
  label = 'Pharmacy',
  category_tags = ARRAY[
    'Prescriptions', 'Over-the-Counter', 'Vitamins', 'Personal Care',
    'First Aid', 'Skincare', 'Baby Care', 'Supplements'
  ]
WHERE id = 'pharmacy';

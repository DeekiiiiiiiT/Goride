-- Soft-launch Kingston seed: 4 restaurants + menus + 3 promos
-- Owners are auth users seed-*@roamrush.app (created via Auth Admin API).
-- Idempotent on merchant slug.

DO $$
DECLARE
  island_id uuid;
  marios_id uuid;
  burger_id uuid;
  green_id uuid;
  cat_id uuid;
  owner_island uuid := 'eb41f937-e819-4ee4-bfb5-e3094db8614b';
  owner_marios uuid := 'fe46536c-1b52-4b34-aabe-24d0f97eced0';
  owner_burger uuid := '440fa7d3-a749-4695-bfe8-3d33f0fe2b7e';
  owner_green uuid := 'd386ce4c-bd17-41af-862f-428ee13cd169';
BEGIN
  -- Island Grill
  SELECT id INTO island_id FROM delivery.merchants WHERE slug = 'island-grill';
  IF island_id IS NULL THEN
    INSERT INTO delivery.merchants (
      owner_id, name, slug, description, address, city, lat, lng,
      phone, cuisine_type, cuisine_types, business_type, vertical_type, fulfillment_type,
      avg_prep_time_mins, min_order_amount, delivery_fee, delivery_radius_km, commission_rate,
      rating, total_ratings, verification_status, operational_status, onboarding_status,
      submitted_at, is_accepting_orders, capabilities
    ) VALUES (
      owner_island,
      'Island Grill',
      'island-grill',
      'Jerk chicken, festival, and Kingston classics made fresh.',
      '12 Half Way Tree Rd, Kingston',
      'Kingston',
      18.013, -76.779,
      '+18765550101',
      'Jamaican • Grill',
      ARRAY['Jamaican','Grill'],
      'restaurant',
      'restaurant',
      'cook_to_order',
      25, 0, 150, 8, 0.15,
      4.8, 128,
      'approved', 'active', 'submitted',
      now(), true, ARRAY['roam_delivery']
    ) RETURNING id INTO island_id;
  ELSE
    UPDATE delivery.merchants SET
      name = 'Island Grill',
      description = 'Jerk chicken, festival, and Kingston classics made fresh.',
      address = '12 Half Way Tree Rd, Kingston',
      city = 'Kingston',
      lat = 18.013, lng = -76.779,
      cuisine_type = 'Jamaican • Grill',
      cuisine_types = ARRAY['Jamaican','Grill'],
      business_type = 'restaurant',
      vertical_type = 'restaurant',
      fulfillment_type = 'cook_to_order',
      avg_prep_time_mins = 25,
      delivery_fee = 150,
      delivery_radius_km = 8,
      commission_rate = COALESCE(commission_rate, 0.15),
      verification_status = 'approved',
      operational_status = 'active',
      onboarding_status = 'submitted',
      submitted_at = COALESCE(submitted_at, now()),
      is_accepting_orders = true
    WHERE id = island_id;
  END IF;

  -- Mario's Pizzeria
  SELECT id INTO marios_id FROM delivery.merchants WHERE slug = 'marios-pizza';
  IF marios_id IS NULL THEN
    INSERT INTO delivery.merchants (
      owner_id, name, slug, description, address, city, lat, lng,
      phone, cuisine_type, cuisine_types, business_type, vertical_type, fulfillment_type,
      avg_prep_time_mins, min_order_amount, delivery_fee, delivery_radius_km, commission_rate,
      rating, total_ratings, verification_status, operational_status, onboarding_status,
      submitted_at, is_accepting_orders, capabilities
    ) VALUES (
      owner_marios,
      'Mario''s Pizzeria',
      'marios-pizza',
      'Wood-fired pizza in New Kingston.',
      '22 Knutsford Blvd, New Kingston',
      'Kingston',
      18.007, -76.783,
      '+18765550102',
      'Italian • Pizza',
      ARRAY['Italian','Pizza'],
      'restaurant',
      'restaurant',
      'cook_to_order',
      30, 0, 150, 8, 0.15,
      4.6, 89,
      'approved', 'active', 'submitted',
      now(), true, ARRAY['roam_delivery']
    ) RETURNING id INTO marios_id;
  END IF;

  -- The Burger Spot
  SELECT id INTO burger_id FROM delivery.merchants WHERE slug = 'burger-spot';
  IF burger_id IS NULL THEN
    INSERT INTO delivery.merchants (
      owner_id, name, slug, description, address, city, lat, lng,
      phone, cuisine_type, cuisine_types, business_type, vertical_type, fulfillment_type,
      avg_prep_time_mins, min_order_amount, delivery_fee, delivery_radius_km, commission_rate,
      rating, total_ratings, verification_status, operational_status, onboarding_status,
      submitted_at, is_accepting_orders, capabilities
    ) VALUES (
      owner_burger,
      'The Burger Spot',
      'burger-spot',
      'Smash burgers and fries — fast and hot.',
      '5 Oxford Rd, New Kingston',
      'Kingston',
      18.005, -76.785,
      '+18765550103',
      'Burgers • Fast Food',
      ARRAY['Burgers','Fast Food'],
      'fast_food',
      'restaurant',
      'cook_to_order',
      20, 0, 0, 8, 0.15,
      4.7, 210,
      'approved', 'active', 'submitted',
      now(), true, ARRAY['roam_delivery']
    ) RETURNING id INTO burger_id;
  END IF;

  -- Green Life Bowls
  SELECT id INTO green_id FROM delivery.merchants WHERE slug = 'green-life';
  IF green_id IS NULL THEN
    INSERT INTO delivery.merchants (
      owner_id, name, slug, description, address, city, lat, lng,
      phone, cuisine_type, cuisine_types, business_type, vertical_type, fulfillment_type,
      avg_prep_time_mins, min_order_amount, delivery_fee, delivery_radius_km, commission_rate,
      rating, total_ratings, verification_status, operational_status, onboarding_status,
      submitted_at, is_accepting_orders, capabilities
    ) VALUES (
      owner_green,
      'Green Life Bowls',
      'green-life',
      'Fresh bowls, juices, and lighter Kingston eats.',
      '12 Hope Rd, Kingston 6',
      'Kingston',
      18.018, -76.75,
      '+18765550104',
      'Healthy • Salads',
      ARRAY['Healthy','Salads'],
      'cafe',
      'restaurant',
      'cook_to_order',
      20, 0, 100, 8, 0.15,
      4.9, 64,
      'approved', 'active', 'submitted',
      now(), true, ARRAY['roam_delivery']
    ) RETURNING id INTO green_id;
  END IF;

  -- Menus: only seed if merchant has no categories yet
  IF NOT EXISTS (SELECT 1 FROM delivery.menu_categories WHERE merchant_id = island_id) THEN
    INSERT INTO delivery.menu_categories (merchant_id, name, sort_order, is_active)
    VALUES (island_id, 'Popular', 10, true) RETURNING id INTO cat_id;
    INSERT INTO delivery.menu_items (merchant_id, category_id, name, description, price, is_available, is_featured, sort_order, prep_time_mins)
    VALUES
      (island_id, cat_id, 'Jerk Chicken Meal', 'Quarter chicken with festival and sauce', 1200, true, true, 10, 25),
      (island_id, cat_id, 'Festival (3)', 'Sweet fried dumplings', 350, true, false, 20, 10),
      (island_id, cat_id, 'Sorrel', 'House-made sorrel drink', 250, true, false, 30, 5);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM delivery.menu_categories WHERE merchant_id = marios_id) THEN
    INSERT INTO delivery.menu_categories (merchant_id, name, sort_order, is_active)
    VALUES (marios_id, 'Pizzas', 10, true) RETURNING id INTO cat_id;
    INSERT INTO delivery.menu_items (merchant_id, category_id, name, description, price, is_available, is_featured, sort_order, prep_time_mins)
    VALUES
      (marios_id, cat_id, 'Margherita Large', 'Tomato, mozzarella, basil', 2200, true, true, 10, 30),
      (marios_id, cat_id, 'Pepperoni Large', 'Classic pepperoni', 2500, true, false, 20, 30),
      (marios_id, cat_id, 'Garlic Bread', 'Buttery garlic loaf', 600, true, false, 30, 12);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM delivery.menu_categories WHERE merchant_id = burger_id) THEN
    INSERT INTO delivery.menu_categories (merchant_id, name, sort_order, is_active)
    VALUES (burger_id, 'Burgers', 10, true) RETURNING id INTO cat_id;
    INSERT INTO delivery.menu_items (merchant_id, category_id, name, description, price, is_available, is_featured, sort_order, prep_time_mins)
    VALUES
      (burger_id, cat_id, 'Classic Smash', 'Double smash patty, pickles, sauce', 1500, true, true, 10, 15),
      (burger_id, cat_id, 'Cheese Smash', 'Smash with cheddar', 1700, true, false, 20, 15),
      (burger_id, cat_id, 'Fries', 'Crispy salted fries', 500, true, false, 30, 8);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM delivery.menu_categories WHERE merchant_id = green_id) THEN
    INSERT INTO delivery.menu_categories (merchant_id, name, sort_order, is_active)
    VALUES (green_id, 'Bowls', 10, true) RETURNING id INTO cat_id;
    INSERT INTO delivery.menu_items (merchant_id, category_id, name, description, price, is_available, is_featured, sort_order, prep_time_mins)
    VALUES
      (green_id, cat_id, 'Green Goddess Bowl', 'Greens, grains, avocado', 1800, true, true, 10, 15),
      (green_id, cat_id, 'Acai Bowl', 'Acai, banana, granola', 1600, true, false, 20, 10),
      (green_id, cat_id, 'Fresh Juice', 'Daily pressed juice', 450, true, false, 30, 5);
  END IF;

  -- Promotions
  IF NOT EXISTS (SELECT 1 FROM delivery.merchant_promotions WHERE merchant_id = island_id AND upper(promo_code) = 'ISLAND20') THEN
    INSERT INTO delivery.merchant_promotions (
      merchant_id, type, title, discount_percent, min_order, applies_to, promo_code,
      customer_eligibility, date_start, date_end, status
    ) VALUES (
      island_id, 'percent_off', '20% off orders over J$2,500', 20, 2500, 'entire_order', 'ISLAND20',
      'all', CURRENT_DATE, CURRENT_DATE + 90, 'active'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM delivery.merchant_promotions WHERE merchant_id = burger_id AND upper(promo_code) = 'FREEDEL') THEN
    INSERT INTO delivery.merchant_promotions (
      merchant_id, type, title, min_order, applies_to, promo_code,
      customer_eligibility, date_start, date_end, status
    ) VALUES (
      burger_id, 'free_delivery', 'Free delivery over J$2,000', 2000, 'entire_order', 'FREEDEL',
      'all', CURRENT_DATE, CURRENT_DATE + 90, 'active'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM delivery.merchant_promotions WHERE merchant_id = marios_id AND upper(promo_code) = 'PIZZA300') THEN
    INSERT INTO delivery.merchant_promotions (
      merchant_id, type, title, discount_amount, min_order, applies_to, promo_code,
      customer_eligibility, date_start, date_end, status
    ) VALUES (
      marios_id, 'amount_off', 'J$300 off pizza orders', 300, 3000, 'entire_order', 'PIZZA300',
      'all', CURRENT_DATE, CURRENT_DATE + 90, 'active'
    );
  END IF;
END $$;

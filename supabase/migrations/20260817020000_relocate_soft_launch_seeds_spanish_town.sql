-- Soft-launch coverage is Spanish Town; relocate Kingston demo restaurants for smoke tests.
UPDATE delivery.merchants SET
  city = 'Spanish Town',
  address = CASE slug
    WHEN 'island-grill' THEN '12 Burke Rd, Spanish Town'
    WHEN 'marios-pizza' THEN '8 Adelaide St, Spanish Town'
    WHEN 'burger-spot' THEN '22 Young St, Spanish Town'
    WHEN 'green-life' THEN '5 Brunswick Ave, Spanish Town'
    ELSE address
  END,
  lat = CASE slug
    WHEN 'island-grill' THEN 18.015
    WHEN 'marios-pizza' THEN 18.010
    WHEN 'burger-spot' THEN 18.005
    WHEN 'green-life' THEN 18.012
    ELSE lat
  END,
  lng = CASE slug
    WHEN 'island-grill' THEN -76.955
    WHEN 'marios-pizza' THEN -76.960
    WHEN 'burger-spot' THEN -76.950
    WHEN 'green-life' THEN -76.945
    ELSE lng
  END,
  delivery_radius_km = GREATEST(COALESCE(delivery_radius_km, 8), 15),
  is_active = true,
  is_accepting_orders = true,
  operational_status = 'active',
  verification_status = 'approved',
  onboarding_status = 'submitted',
  description = CASE slug
    WHEN 'island-grill' THEN 'Jerk chicken, festival, and Spanish Town classics made fresh.'
    WHEN 'marios-pizza' THEN 'Wood-fired pizza in Spanish Town.'
    WHEN 'burger-spot' THEN 'Smash burgers and fries — fast and hot.'
    WHEN 'green-life' THEN 'Fresh bowls, juices, and lighter Spanish Town eats.'
    ELSE description
  END,
  updated_at = now()
WHERE slug IN ('island-grill', 'marios-pizza', 'burger-spot', 'green-life');

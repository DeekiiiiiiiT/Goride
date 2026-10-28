-- Couriers are Jamaica-first; correct seeded BShip'D from US warehouse address.
UPDATE public.intake_courier_catalog
SET
  country_code = 'JM',
  timezone = 'America/Jamaica',
  city = 'Kingston',
  state = '',
  postal_code = 'JM',
  updated_at = now()
WHERE code = 'BSHIPD';

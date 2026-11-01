-- Fleet maintenance logging audit R-04 (part 1): category default intervals
-- Production version: 20261101043001 — already applied; repo sync only.

UPDATE public.maintenance_service_categories c
SET
  default_interval_miles = v.miles,
  default_interval_months = v.months
FROM (VALUES
  ('air_filter', 10000::numeric, 6),
  ('cabin_filter', 10000::numeric, 6),
  ('tires', 40000::numeric, 36),
  ('rotate_tires', 10000::numeric, 6),
  ('brake_fluid', 40000::numeric, 24),
  ('coolant_flush', 100000::numeric, 60),
  ('fluids', 10000::numeric, 6),
  ('tire_pressure', 10000::numeric, 6)
) AS v(code, miles, months)
WHERE c.code = v.code
  AND c.default_interval_miles IS NULL
  AND c.default_interval_months IS NULL;

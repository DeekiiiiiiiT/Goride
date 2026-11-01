-- Fleet maintenance logging audit R-04: no_record status, recompute inserts, category intervals

UPDATE public.maintenance_service_categories c
SET
  default_interval_miles = v.miles,
  default_interval_months = v.months
FROM (VALUES
  ('air_filter', 10000::numeric, 6),
  ('cabin_filter', 10000::numeric, 6),
  ('tires', 5000::numeric, 3),
  ('rotate_tires', 10000::numeric, 6),
  ('brake_fluid', 40000::numeric, 24),
  ('coolant_flush', 100000::numeric, 60),
  ('fluids', 10000::numeric, 6),
  ('tire_pressure', 10000::numeric, 6)
) AS v(code, miles, months)
WHERE c.code = v.code
  AND c.default_interval_miles IS NULL
  AND c.default_interval_months IS NULL;;

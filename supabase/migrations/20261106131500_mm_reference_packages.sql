-- DX-01: Reference service packages + part links (copied from live). No-op when rows already exist.

DO $mm$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'maintenance_task_templates'
      AND column_name = 'interval_km'
  ) THEN
    INSERT INTO public.maintenance_task_templates (
      id, task_name, task_code, template_scope, component_id,
      interval_km, interval_months, due_kind, sort_order,
      status, source_type, confidence, applicable_vehicle_classes, frequency_kind
    )
    VALUES
      ('46488e8d-c3e2-4f5e-8943-70ad2da000f9'::uuid, 'Inspection', 'mm-inspection', 'global', NULL, 5000, 3, 'service_package', 0, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], 'recurring'),
      ('5efcdc04-17aa-400d-8155-612ebaf9b074'::uuid, 'Basic Service', 'mm-basic-service', 'global', NULL, 5000, 3, 'service_package', 0, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], 'recurring'),
      ('e5200c01-769c-4f32-8957-d39483211870'::uuid, 'Intermediate Service', 'mm-intermediate-service', 'global', NULL, 10000, 6, 'service_package', 1, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], 'recurring'),
      ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'Major Service', 'mm-major-service', 'global', NULL, 40000, 24, 'service_package', 2, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], 'recurring'),
      ('f05a0814-300b-4b40-878a-8d228ec9adba'::uuid, 'Long-Term Service', 'mm-long-term-service', 'global', NULL, 100000, 60, 'service_package', 3, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], 'recurring')
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO public.maintenance_task_templates (
      id, task_name, task_code, template_scope, component_id,
      interval_miles, interval_months, due_kind, sort_order,
      status, source_type, confidence, applicable_vehicle_classes, frequency_kind
    )
    VALUES
      ('46488e8d-c3e2-4f5e-8943-70ad2da000f9'::uuid, 'Inspection', 'mm-inspection', 'global', NULL, 5000, 3, 'service_package', 0, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], 'recurring'),
      ('5efcdc04-17aa-400d-8155-612ebaf9b074'::uuid, 'Basic Service', 'mm-basic-service', 'global', NULL, 5000, 3, 'service_package', 0, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], 'recurring'),
      ('e5200c01-769c-4f32-8957-d39483211870'::uuid, 'Intermediate Service', 'mm-intermediate-service', 'global', NULL, 10000, 6, 'service_package', 1, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], 'recurring'),
      ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'Major Service', 'mm-major-service', 'global', NULL, 40000, 24, 'service_package', 2, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], 'recurring'),
      ('f05a0814-300b-4b40-878a-8d228ec9adba'::uuid, 'Long-Term Service', 'mm-long-term-service', 'global', NULL, 100000, 60, 'service_package', 3, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], 'recurring')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$mm$;

INSERT INTO public.maintenance_package_categories (template_id, category_id, sort_order, required)
SELECT v.template_id, c.id, v.sort_order, v.required
FROM (
  VALUES
    ('46488e8d-c3e2-4f5e-8943-70ad2da000f9'::uuid, 'oil'::text, 0, true),
    ('46488e8d-c3e2-4f5e-8943-70ad2da000f9'::uuid, 'tires', 1, true),
    ('46488e8d-c3e2-4f5e-8943-70ad2da000f9'::uuid, 'tire_pressure', 2, true),
    ('46488e8d-c3e2-4f5e-8943-70ad2da000f9'::uuid, 'fluids', 3, true),
    ('46488e8d-c3e2-4f5e-8943-70ad2da000f9'::uuid, 'lights', 4, true),
    ('5efcdc04-17aa-400d-8155-612ebaf9b074'::uuid, 'oil', 0, true),
    ('5efcdc04-17aa-400d-8155-612ebaf9b074'::uuid, 'tire_pressure', 1, true),
    ('5efcdc04-17aa-400d-8155-612ebaf9b074'::uuid, 'fluids', 2, true),
    ('5efcdc04-17aa-400d-8155-612ebaf9b074'::uuid, 'brake_fluid', 3, true),
    ('5efcdc04-17aa-400d-8155-612ebaf9b074'::uuid, 'rotate_tires', 4, true),
    ('5efcdc04-17aa-400d-8155-612ebaf9b074'::uuid, 'coolant_flush', 5, true),
    ('e5200c01-769c-4f32-8957-d39483211870'::uuid, 'oil', 10, false),
    ('e5200c01-769c-4f32-8957-d39483211870'::uuid, 'tires', 15, false),
    ('e5200c01-769c-4f32-8957-d39483211870'::uuid, 'tire_pressure', 20, false),
    ('e5200c01-769c-4f32-8957-d39483211870'::uuid, 'fluids', 30, false),
    ('e5200c01-769c-4f32-8957-d39483211870'::uuid, 'lights', 40, false),
    ('e5200c01-769c-4f32-8957-d39483211870'::uuid, 'rotate_tires', 50, false),
    ('e5200c01-769c-4f32-8957-d39483211870'::uuid, 'air_filter', 60, false),
    ('e5200c01-769c-4f32-8957-d39483211870'::uuid, 'cabin_filter', 70, false),
    ('e5200c01-769c-4f32-8957-d39483211870'::uuid, 'wipers', 80, false),
    ('e5200c01-769c-4f32-8957-d39483211870'::uuid, 'brakes', 90, false),
    ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'oil', 10, false),
    ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'tires', 15, false),
    ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'tire_pressure', 20, false),
    ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'fluids', 30, false),
    ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'lights', 40, false),
    ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'rotate_tires', 50, false),
    ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'air_filter', 60, false),
    ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'cabin_filter', 70, false),
    ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'wipers', 80, false),
    ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'brakes', 90, false),
    ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'transmission', 100, false),
    ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'brake_fluid', 110, false),
    ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'belt', 120, false),
    ('c2bf7310-e29d-4fed-93aa-fbd003830f87'::uuid, 'suspension', 130, false),
    ('f05a0814-300b-4b40-878a-8d228ec9adba'::uuid, 'spark_plugs', 10, false),
    ('f05a0814-300b-4b40-878a-8d228ec9adba'::uuid, 'coolant_flush', 20, false)
) AS v(template_id, code, sort_order, required)
JOIN public.maintenance_service_categories c ON c.code = v.code
ON CONFLICT (template_id, category_id) DO NOTHING;

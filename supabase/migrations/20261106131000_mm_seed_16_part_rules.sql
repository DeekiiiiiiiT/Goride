-- Seed 16 global Roam policy part rules (Appendix) + governance flag (disabled).

INSERT INTO public.platform_feature_flags (name, enabled)
VALUES ('maintenance_master_governance', false)
ON CONFLICT (name) DO UPDATE SET enabled = EXCLUDED.enabled;

INSERT INTO public.maintenance_task_templates (
  task_name,
  task_code,
  template_scope,
  component_id,
  interval_km,
  interval_months,
  status,
  source_type,
  confidence,
  applicable_vehicle_classes
)
SELECT
  initcap(replace(r.code, '_', ' ')) || ' schedule',
  r.code,
  'global',
  c.id,
  r.km,
  r.mo,
  'active',
  'roam_policy',
  'uncertain',
  ARRAY['car']::text[]
FROM (
  VALUES
    ('oil', 5000, 3),
    ('lights', 5000, 3),
    ('air_filter', 10000, 6),
    ('cabin_filter', 10000, 6),
    ('fluids', 10000, 6),
    ('rotate_tires', 10000, 6),
    ('tire_pressure', 10000, 6),
    ('brakes', 10000, 6),
    ('wipers', 10000, 6),
    ('brake_fluid', 40000, 24),
    ('tires', 40000, 36),
    ('belt', 40000, 24),
    ('suspension', 40000, 24),
    ('transmission', 40000, 24),
    ('spark_plugs', 100000, 60),
    ('coolant_flush', 100000, 60)
) AS r(code, km, mo)
JOIN public.maintenance_service_categories c ON c.code = r.code
WHERE NOT EXISTS (
  SELECT 1
  FROM public.maintenance_task_templates t
  WHERE t.component_id = c.id
    AND t.template_scope = 'global'
    AND t.archived_at IS NULL
);

ALTER TABLE public.maintenance_service_categories
  DROP COLUMN IF EXISTS default_interval_km;

ALTER TABLE public.maintenance_service_categories
  DROP COLUMN IF EXISTS default_interval_months;

-- V-06: revoke direct table access from anon/authenticated on catalog + maintenance master tables.

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'vehicle_catalog',
    'vehicle_platform',
    'engine_family',
    'catalog_spec_value',
    'spec_key',
    'vehicle_oe_number',
    'maintenance_task_templates',
    'maintenance_package_categories',
    'maintenance_service_categories',
    'vehicle_component_schedule',
    'platform_revision'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', r);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', r);
  END LOOP;
END $$;

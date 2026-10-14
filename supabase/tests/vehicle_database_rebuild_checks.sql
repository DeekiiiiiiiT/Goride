-- Vehicle database rebuild checks. Rolls back. Run after migrations, not on production.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalog_task'
      AND column_name IN ('organization_id', 'organization_name', 'vehicle_id', 'fleet_vehicle_id', 'customer_name')
  ) THEN
    RAISE EXCEPTION 'catalog_task has a customer column';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name LIKE 'catalog_signal%'
      AND column_name IN ('organization_id', 'vehicle_id', 'fleet_vehicle_id', 'customer_name', 'org_name')
  ) THEN
    RAISE EXCEPTION 'a signal view exposes a customer column';
  END IF;
END $$;

INSERT INTO public.vehicle_catalog (id, make, model, chassis_code, production_start_year)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Vdb', 'Check', 'VDB-CH', 2020
WHERE NOT EXISTS (SELECT 1 FROM public.vehicle_catalog WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');

INSERT INTO public.maintenance_task_templates (
  id, template_scope, task_name, task_code, interval_miles
)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'global', 'VDB oil', 'VDB-OIL', 10000
WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_task_templates WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');

INSERT INTO public.maintenance_task_templates (
  id, template_scope, vehicle_catalog_id, task_name, task_code, interval_miles
)
SELECT
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'variant',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'VDB oil', 'VDB-OIL', 5000
WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_task_templates WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3');

DO $$
DECLARE
  won_scope text;
  won_miles numeric;
BEGIN
  SELECT template_scope, interval_miles INTO won_scope, won_miles
  FROM public.schedule_for_variant('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, 2020)
  WHERE task_code = 'VDB-OIL';
  IF won_scope IS DISTINCT FROM 'variant' OR won_miles IS DISTINCT FROM 5000 THEN
    RAISE EXCEPTION 'variant schedule did not beat the global schedule (% %)', won_scope, won_miles;
  END IF;
END $$;

ROLLBACK;

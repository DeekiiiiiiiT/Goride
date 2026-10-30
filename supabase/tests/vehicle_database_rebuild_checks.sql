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

INSERT INTO public.vehicle_catalog (id, make, model, chassis_code, production_start_year, vehicle_class)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'Vdb', 'Bike', 'VDB-BK', 2020, 'motorcycle'
WHERE NOT EXISTS (SELECT 1 FROM public.vehicle_catalog WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4');

INSERT INTO public.maintenance_task_templates (
  id, template_scope, task_name, task_code, interval_miles, applicable_vehicle_classes
)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'global', 'VDB chain', 'VDB-CHAIN', 3000, ARRAY['motorcycle']::text[]
WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_task_templates WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5');

DO $$
DECLARE
  car_chain int;
  bike_oil int;
  bike_chain int;
  source_check text;
  fit_def text;
  demand_def text;
BEGIN
  SELECT count(*) INTO car_chain
  FROM public.schedule_for_variant('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, 2020)
  WHERE task_code = 'VDB-CHAIN';
  IF car_chain <> 0 THEN
    RAISE EXCEPTION 'a car variant received a motorcycle schedule';
  END IF;

  SELECT count(*) INTO bike_oil
  FROM public.schedule_for_variant('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'::uuid, NULL)
  WHERE task_code = 'VDB-OIL';
  IF bike_oil <> 0 THEN
    RAISE EXCEPTION 'a motorcycle variant received a car schedule';
  END IF;

  SELECT count(*) INTO bike_chain
  FROM public.schedule_for_variant('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'::uuid, NULL)
  WHERE task_code = 'VDB-CHAIN';
  IF bike_chain <> 1 THEN
    RAISE EXCEPTION 'a motorcycle variant missed its own schedule';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO source_check
  FROM pg_constraint
  WHERE conname = 'interchange_fitment_rule_source_check';
  IF source_check NOT ILIKE '%listing%' THEN
    RAISE EXCEPTION 'listing source is not allowed';
  END IF;

  SELECT pg_get_viewdef('public.catalog_signal_fit'::regclass, true) INTO fit_def;
  SELECT pg_get_viewdef('public.catalog_signal_part_demand'::regclass, true) INTO demand_def;
  IF fit_def NOT ILIKE '%>= 2%' OR demand_def NOT ILIKE '%>= 2%' THEN
    RAISE EXCEPTION 'signals are not limited to two fleets';
  END IF;
  IF demand_def ILIKE '%need_text%' THEN
    RAISE EXCEPTION 'part demand still returns customer wording';
  END IF;
END $$;

ROLLBACK;

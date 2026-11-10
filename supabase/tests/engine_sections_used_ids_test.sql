-- D7: jobs only in a section are not "used"; jobs with a work-order line are.

BEGIN;

DO $$
DECLARE
  v_job uuid;
  v_used boolean;
  v_wo uuid := 'e1111111-1111-4111-8111-111111111101';
  v_line uuid := 'e2222222-2222-4222-8222-222222222202';
BEGIN
  SELECT id INTO v_job FROM public.maintenance_service_categories WHERE code = 'throttle_body_cleaning';
  IF v_job IS NULL THEN
    RAISE EXCEPTION 'throttle_body_cleaning missing';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.maintenance_job_used_ids() u WHERE u = v_job) INTO v_used;
  IF v_used THEN
    RAISE EXCEPTION 'section-only job must not be in maintenance_job_used_ids()';
  END IF;

  INSERT INTO public.maintenance_work_orders (id, organization_id, vehicle_id, status, closed_at, odometer)
  VALUES (v_wo, 'engine-sections-test', 'engine-sections-veh', 'completed', now(), 1000);

  INSERT INTO public.maintenance_work_order_lines (id, work_order_id, component_id, action)
  VALUES (v_line, v_wo, v_job, 'clean');

  SELECT EXISTS (SELECT 1 FROM public.maintenance_job_used_ids() u WHERE u = v_job) INTO v_used;
  IF NOT v_used THEN
    RAISE EXCEPTION 'job with a work-order line must be in maintenance_job_used_ids()';
  END IF;

  RAISE NOTICE 'engine_sections_used_ids_test: ok';
END $$;

ROLLBACK;

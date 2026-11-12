-- Maintenance discount: guard, void RPC, and CHECK constraints on made-up data.

BEGIN;

DO $$
DECLARE
  v_org text := 'maintenance-discount-db-test';
  v_veh text := 'md-discount-veh-never-real';
  v_wo uuid := 'd1111111-1111-4111-8111-111111111101';
  v_line_air uuid := 'd2222222-2222-4222-8222-222222222202';
  v_line_misc uuid := 'd3333333-3333-4333-8333-333333333303';
  v_line_labor uuid := 'd4444444-4444-4444-8444-444444444404';
  v_line_oil uuid := 'd5555555-5555-4555-8555-555555555505';
  v_cat uuid;
  v_total numeric;
  v_disc numeric;
  v_json jsonb;
  v_caught boolean;
BEGIN
  SELECT id INTO v_cat FROM public.maintenance_service_categories WHERE kind = 'component' LIMIT 1;
  IF v_cat IS NULL THEN
    SELECT id INTO v_cat FROM public.maintenance_service_categories LIMIT 1;
  END IF;
  IF v_cat IS NULL THEN
    RAISE EXCEPTION 'no maintenance_service_categories row for fixture';
  END IF;

  INSERT INTO public.maintenance_work_orders (
    id, organization_id, vehicle_id, status, closed_at, odometer,
    discount_amount, total_cost
  ) VALUES (
    v_wo, v_org, v_veh, 'completed', now(), 50000,
    1000, 16600
  );

  INSERT INTO public.maintenance_work_order_lines (id, work_order_id, component_id, action, line_total)
  VALUES
    (v_line_air, v_wo, v_cat, 'replace', 1000),
    (v_line_misc, v_wo, v_cat, 'replace', 600),
    (v_line_labor, v_wo, v_cat, 'other', 8000),
    (v_line_oil, v_wo, v_cat, 'replace', 8000);

  v_caught := false;
  BEGIN
    UPDATE public.maintenance_work_orders SET total_cost = 17600, updated_at = now() WHERE id = v_wo;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'guard must refuse total_cost 17600 on discounted completed service';
  END IF;

  v_json := public.fleet_void_work_order_line(v_org, v_line_labor, 'test void labor');
  IF (v_json->>'newTotal')::numeric IS DISTINCT FROM 8600::numeric THEN
    RAISE EXCEPTION 'after void labor expected total 8600, got %', v_json->>'newTotal';
  END IF;

  v_json := public.fleet_void_work_order_line(v_org, v_line_oil, 'test void oil');
  IF (v_json->>'newTotal')::numeric IS DISTINCT FROM 600::numeric THEN
    RAISE EXCEPTION 'after void oil expected total 600, got %', v_json->>'newTotal';
  END IF;

  v_json := public.fleet_void_work_order_line(v_org, v_line_air, 'test void air');
  SELECT total_cost, discount_amount INTO v_total, v_disc FROM public.maintenance_work_orders WHERE id = v_wo;
  IF v_disc IS DISTINCT FROM 600::numeric OR v_total IS DISTINCT FROM 0::numeric THEN
    RAISE EXCEPTION 'after void air expected discount 600 total 0, got % / %', v_disc, v_total;
  END IF;
  IF (v_json->>'newTotal')::numeric IS DISTINCT FROM 0::numeric THEN
    RAISE EXCEPTION 'after void air RPC newTotal expected 0, got %', v_json->>'newTotal';
  END IF;

  INSERT INTO public.maintenance_work_orders (
    id, organization_id, vehicle_id, status, odometer, discount_amount, total_cost
  ) VALUES (
    'd6666666-6666-4666-8666-666666666606', v_org, v_veh, 'in_progress', 1, 0, 0
  );

  v_caught := false;
  BEGIN
    UPDATE public.maintenance_work_orders
    SET discount_amount = -5, updated_at = now()
    WHERE id = 'd6666666-6666-4666-8666-666666666606';
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'discount_amount -5 must be refused by CHECK';
  END IF;

  v_caught := false;
  BEGIN
    UPDATE public.maintenance_work_orders
    SET total_cost = -1, updated_at = now()
    WHERE id = 'd6666666-6666-4666-8666-666666666606';
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'total_cost -1 must be refused by CHECK';
  END IF;

  RAISE NOTICE 'maintenance_discount_db_test: ok';
END $$;

ROLLBACK;

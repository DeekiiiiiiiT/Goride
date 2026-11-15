-- S3 completion idempotency: finalize, parts usage, ledger unique, claim cycle.

BEGIN;

DO $$
DECLARE
  v_org text := 'si-s3-test-org';
  v_veh text := 'si-s3-test-veh';
  v_actor uuid := 'a3333333-3333-4333-8333-333333333301';
  v_wo uuid := 'b3333333-3333-4333-8333-333333333301';
  v_rec uuid := 'c3333333-3333-4333-8333-333333333301';
  v_line uuid := 'd3333333-3333-4333-8333-333333333301';
  v_cat uuid;
  v_part uuid := 'f3333333-3333-4333-8333-333333333301';
  v_part_cat uuid;
  v_cnt bigint;
  v_claim jsonb;
BEGIN
  SELECT id INTO v_cat FROM public.maintenance_service_categories WHERE kind = 'component' LIMIT 1;
  IF v_cat IS NULL THEN RAISE EXCEPTION 'component fixture required'; END IF;

  SELECT id INTO v_part_cat FROM public.part_category LIMIT 1;
  IF v_part_cat IS NULL THEN RAISE EXCEPTION 'part_category fixture required'; END IF;

  INSERT INTO public.part_master (
    id, category_id, name, part_kind, maintenance_component_id
  ) VALUES (v_part, v_part_cat, 'si3-completion-test-part', 'oem', v_cat)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO fleet.inv_location (id, organization_id, code, name, kind)
  VALUES ('e3333333-3333-4333-8333-333333333331', v_org, 'SI3-SHELF', 'S3 shelf', 'warehouse')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO fleet.inv_item (id, organization_id, sku, name, part_master_id)
  VALUES ('e3333333-3333-4333-8333-333333333332', v_org, 'SI3-PART-1', 'S3 part', v_part)
  ON CONFLICT (id) DO NOTHING;
  PERFORM fleet.inv_opening_balance(v_org, jsonb_build_array(jsonb_build_object(
    'item_id', 'e3333333-3333-4333-8333-333333333332',
    'location_id', 'e3333333-3333-4333-8333-333333333331',
    'qty', 5, 'unit_cost', 100)), 'si3-opening');

  INSERT INTO public.maintenance_work_orders (
    id, organization_id, vehicle_id, status, closed_at, odometer, performed_at_date
  ) VALUES (v_wo, v_org, v_veh, 'completed', now(), 5000, current_date);

  INSERT INTO public.maintenance_work_order_lines (
    id, work_order_id, component_id, part_id, qty, action, line_total
  ) VALUES (v_line, v_wo, v_cat, v_part, 1, 'replace', 100);

  PERFORM fleet.log_service_finalize(v_org, v_veh, v_wo, v_rec);
  PERFORM fleet.log_service_finalize(v_org, v_veh, v_wo, v_rec);

  SELECT count(*) INTO v_cnt
  FROM fleet.maintenance_events e
  WHERE e.type = 'service.logged'
    AND e.payload ->> 'workOrderId' = v_wo::text
    AND e.payload ->> 'recordId' = v_rec::text;
  IF v_cnt IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'finalize twice must yield one service.logged event, got %', v_cnt;
  END IF;

  PERFORM public.apply_parts_usage_for_work_order(v_wo);
  PERFORM public.apply_parts_usage_for_work_order(v_wo);

  SELECT count(*) INTO v_cnt
  FROM public.maintenance_parts_usage u
  WHERE u.work_order_id = v_wo AND u.line_id = v_line;
  IF v_cnt IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'parts usage twice must yield one row per line, got %', v_cnt;
  END IF;

  BEGIN
    INSERT INTO public.maintenance_service_ledger (
      organization_id, vehicle_id, performed_at_date, performed_at_miles,
      category_id, category_code, category_name, position,
      work_order_id, work_order_line_id
    )
    SELECT v_org, v_veh, current_date, 5000,
      v_cat, 'x', 'x', NULL, v_wo, v_line;
    INSERT INTO public.maintenance_service_ledger (
      organization_id, vehicle_id, performed_at_date, performed_at_miles,
      category_id, category_code, category_name, position,
      work_order_id, work_order_line_id
    )
    SELECT v_org, v_veh, current_date, 5000,
      v_cat, 'x', 'x', NULL, v_wo, v_line;
    RAISE EXCEPTION 'duplicate ledger insert should have failed';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  UPDATE public.maintenance_work_orders
  SET status = 'in_progress', completing_since = NULL, closed_at = NULL
  WHERE id = v_wo;

  v_claim := public.fleet_claim_completion(v_org, v_wo, v_actor);
  IF coalesce(v_claim ->> 'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'first claim must succeed';
  END IF;

  PERFORM public.fleet_release_completion(v_org, v_wo);

  v_claim := public.fleet_claim_completion(v_org, v_wo, v_actor);
  IF coalesce(v_claim ->> 'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'second claim after release must succeed';
  END IF;

  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date,
    status, work_order_id
  ) VALUES (v_rec, v_org, v_veh, 5000, current_date, 'Completed', v_wo);

  PERFORM public.fleet_finish_completion(v_org, v_wo, v_actor, v_rec);

  v_claim := public.fleet_claim_completion(v_org, v_wo, v_actor);
  IF v_claim ->> 'reason' IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'claim after finish must return completed replay';
  END IF;

  RAISE NOTICE 'service_items_completion_db_test: ok';
END $$;

ROLLBACK;

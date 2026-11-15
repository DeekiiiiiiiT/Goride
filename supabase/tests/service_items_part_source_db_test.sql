-- Service items S6 — part_source column, constraints, save, multiset.

BEGIN;

DO $$
DECLARE
  v_org text := 'si-s6-part-src-org';
  v_veh text := 'si-s6-part-src-veh';
  v_actor uuid := 'a3333333-3333-4333-8333-333333333333';
  v_cat uuid;
  v_part_type uuid;
  v_job uuid;
  v_part_job_item uuid;
  v_wo uuid;
  v_line uuid;
  v_part uuid;
  v_caught boolean;
  v_eq boolean;
  v_json jsonb;
  v_ver int;
  v_cnt bigint;
  v_src text;
  v_items jsonb;
  v_supply uuid;
BEGIN
  SELECT id INTO v_cat FROM public.maintenance_service_categories WHERE kind = 'component' LIMIT 1;
  SELECT id INTO v_part_type FROM public.maintenance_service_categories WHERE code = 'intake_manifold_gasket';
  IF v_part_type IS NULL THEN
    SELECT id INTO v_part_type FROM public.maintenance_service_categories
    WHERE kind = 'component' AND is_part = true LIMIT 1;
  END IF;
  SELECT id INTO v_job FROM public.maintenance_service_categories WHERE code = 'throttle_body_cleaning';
  IF v_job IS NULL THEN
    SELECT id INTO v_job FROM public.maintenance_service_categories WHERE kind = 'component' LIMIT 1;
  END IF;

  IF v_cat IS NULL OR v_part_type IS NULL OR v_job IS NULL THEN
    RAISE EXCEPTION 'fixture categories missing';
  END IF;

  SELECT pm.id INTO v_part
  FROM public.part_master pm
  WHERE pm.maintenance_component_id = v_part_type
  LIMIT 1;

  INSERT INTO public.maintenance_job_item (job_id, part_type_id, need)
  VALUES (v_job, v_part_type, 'sometimes')
  RETURNING id INTO v_part_job_item;

  v_wo := 'd3333333-3333-4333-8333-333333333301';
  v_line := 'd4444444-4444-4444-8444-444444444402';
  INSERT INTO public.maintenance_work_orders (id, organization_id, vehicle_id, status)
  VALUES (v_wo, v_org, v_veh, 'draft');
  INSERT INTO public.maintenance_work_order_lines (
    id, work_order_id, component_id, action, line_total, items_amount
  ) VALUES (v_line, v_wo, v_job, 'replace', 0, 0);

  SELECT id INTO v_supply FROM public.maintenance_supply LIMIT 1;
  IF v_supply IS NULL THEN RAISE EXCEPTION 'need a supply fixture'; END IF;

  -- Constraint: invalid enum
  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_work_order_line_item (
      work_order_id, work_order_line_id, source, item_kind, part_type_id,
      item_name, unit_label, qty, part_source, updated_by
    ) VALUES (
      v_wo, v_line, 'other', 'part_type', v_part_type,
      'x', 'pc', 1, 'bogus', v_actor
    );
  EXCEPTION WHEN check_violation THEN v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected enum check on part_source'; END IF;

  -- Constraint: part_source on supply
  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_work_order_line_item (
      work_order_id, work_order_line_id, source, item_kind, supply_id,
      item_name, unit_label, qty, part_source, updated_by
    ) VALUES (
      v_wo, v_line, 'suggested', 'supply', v_supply,
      'x', 'pc', 1, 'typed', v_actor
    );
  EXCEPTION WHEN check_violation THEN v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected part_source on supply rejected'; END IF;

  -- Constraint: car without part_id
  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_work_order_line_item (
      work_order_id, work_order_line_id, source, item_kind, part_type_id,
      item_name, unit_label, qty, part_source, updated_by
    ) VALUES (
      v_wo, v_line, 'other', 'part_type', v_part_type,
      'x', 'pc', 1, 'car', v_actor
    );
  EXCEPTION WHEN check_violation THEN v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected car without part_id rejected'; END IF;

  -- Constraint: size with part_id
  IF v_part IS NOT NULL THEN
    v_caught := false;
    BEGIN
      INSERT INTO public.maintenance_work_order_line_item (
        work_order_id, work_order_line_id, source, item_kind, part_type_id, part_id,
        item_name, unit_label, qty, part_source, updated_by
      ) VALUES (
        v_wo, v_line, 'other', 'part_type', v_part_type, v_part,
        'x', 'pc', 1, 'size', v_actor
      );
    EXCEPTION WHEN check_violation THEN v_caught := true;
    END;
    IF NOT v_caught THEN RAISE EXCEPTION 'expected size with part_id rejected'; END IF;
  END IF;

  DELETE FROM public.maintenance_work_order_line_item WHERE work_order_line_id = v_line;

  -- Good rows: car / size / typed
  IF v_part IS NOT NULL THEN
    INSERT INTO public.maintenance_work_order_line_item (
      work_order_id, work_order_line_id, source, job_item_id, item_kind, part_type_id, part_id,
      item_name, unit_label, brand, part_number, qty, part_source, updated_by
    ) VALUES (
      v_wo, v_line, 'suggested', v_part_job_item, 'part_type', v_part_type, v_part,
      'Gasket', 'pc', 'OEM', 'PN-C', 1, 'car', v_actor
    );
  END IF;
  INSERT INTO public.maintenance_work_order_line_item (
    work_order_id, work_order_line_id, source, job_item_id, item_kind, part_type_id,
    item_name, unit_label, brand, part_number, qty, part_source, updated_by
  ) VALUES (
    v_wo, v_line, 'suggested', v_part_job_item, 'part_type', v_part_type,
    'Gasket', 'pc', 'Aftermarket', 'PN-S', 1, 'size', v_actor
  );
  INSERT INTO public.maintenance_work_order_line_item (
    work_order_id, work_order_line_id, source, job_item_id, item_kind, part_type_id,
    item_name, unit_label, brand, part_number, qty, part_source, updated_by
  ) VALUES (
    v_wo, v_line, 'suggested', v_part_job_item, 'part_type', v_part_type,
    'Gasket', 'pc', 'Typed', 'PN-T', 1, 'typed', v_actor
  );

  SELECT count(*) INTO v_cnt
  FROM public.maintenance_work_order_line_item
  WHERE work_order_line_id = v_line AND part_source IN ('car', 'size', 'typed');
  IF (v_part IS NULL AND v_cnt < 2) OR (v_part IS NOT NULL AND v_cnt < 3) THEN
    RAISE EXCEPTION 'expected good part_source rows, got %', v_cnt;
  END IF;

  -- Multiset: only part_source differs
  DELETE FROM public.maintenance_work_order_line_item WHERE work_order_line_id = v_line;
  INSERT INTO public.maintenance_work_order_line_item (
    work_order_id, work_order_line_id, source, job_item_id, item_kind, part_type_id,
    item_name, unit_label, brand, part_number, qty, part_source, updated_by
  ) VALUES (
    v_wo, v_line, 'suggested', v_part_job_item, 'part_type', v_part_type,
    'Gasket', 'pc', 'B', 'PN-1', 1, 'typed', v_actor
  );

  v_eq := fleet._mwoli_items_multiset_equal(
    v_line,
    jsonb_build_array(
      jsonb_build_object(
        'source', 'suggested',
        'job_item_id', v_part_job_item,
        'item_kind', 'part_type',
        'part_type_id', v_part_type,
        'supply_id', null,
        'part_id', null,
        'item_name', 'Gasket',
        'unit_label', 'pc',
        'brand', 'B',
        'part_number', 'PN-1',
        'part_source', 'typed',
        'qty', '1',
        'unit_cost', null
      )
    )
  );
  IF NOT v_eq THEN RAISE EXCEPTION 'multiset should match identical part_source'; END IF;

  v_eq := fleet._mwoli_items_multiset_equal(
    v_line,
    jsonb_build_array(
      jsonb_build_object(
        'source', 'suggested',
        'job_item_id', v_part_job_item,
        'item_kind', 'part_type',
        'part_type_id', v_part_type,
        'supply_id', null,
        'part_id', null,
        'item_name', 'Gasket',
        'unit_label', 'pc',
        'brand', 'B',
        'part_number', 'PN-1',
        'part_source', 'size',
        'qty', '1',
        'unit_cost', null
      )
    )
  );
  IF v_eq THEN RAISE EXCEPTION 'multiset must differ when only part_source changes'; END IF;

  -- fleet_save_work_order: prepareWorkOrderLines-shaped payload (three part items)
  v_items := jsonb_build_array(
    jsonb_build_object(
      'source', 'suggested',
      'job_item_id', v_part_job_item,
      'item_kind', 'part_type',
      'part_type_id', v_part_type,
      'supply_id', null,
      'part_id', null,
      'item_name', 'Gasket',
      'unit_label', 'pc',
      'brand', 'SizeCo',
      'part_number', 'SZ-1',
      'part_source', 'size',
      'qty', '1',
      'unit_cost', null
    ),
    jsonb_build_object(
      'source', 'suggested',
      'job_item_id', v_part_job_item,
      'item_kind', 'part_type',
      'part_type_id', v_part_type,
      'supply_id', null,
      'part_id', null,
      'item_name', 'Gasket',
      'unit_label', 'pc',
      'brand', 'TypedCo',
      'part_number', 'TY-1',
      'part_source', 'typed',
      'qty', '1',
      'unit_cost', null
    )
  );
  IF v_part IS NOT NULL THEN
    v_items := jsonb_build_array(
      jsonb_build_object(
        'source', 'suggested',
        'job_item_id', v_part_job_item,
        'item_kind', 'part_type',
        'part_type_id', v_part_type,
        'supply_id', null,
        'part_id', v_part,
        'item_name', 'Gasket',
        'unit_label', 'pc',
        'brand', null,
        'part_number', null,
        'part_source', 'car',
        'qty', '1',
        'unit_cost', null
      )
    ) || v_items;
  END IF;

  v_json := public.fleet_save_work_order(
    v_org,
    v_actor,
    'draft',
    jsonb_build_object('vehicle_id', v_veh),
    NULL,
    NULL,
    jsonb_build_array(
      jsonb_build_object(
        'sort_order', 0,
        'component_id', v_job,
        'action', 'replace',
        'line_total', 0,
        'items_amount', 0,
        'items', v_items
      )
    )
  );

  v_line := (v_json -> 'lines' -> 0 ->> 'id')::uuid;
  v_wo := (v_json -> 'work_order' ->> 'id')::uuid;

  SELECT part_source INTO v_src
  FROM public.maintenance_work_order_line_item
  WHERE work_order_line_id = v_line AND brand = 'TypedCo';
  IF v_src IS DISTINCT FROM 'typed' THEN
    RAISE EXCEPTION 'save expected typed part_source, got %', v_src;
  END IF;

  SELECT part_source INTO v_src
  FROM public.maintenance_work_order_line_item
  WHERE work_order_line_id = v_line AND brand = 'SizeCo';
  IF v_src IS DISTINCT FROM 'size' THEN
    RAISE EXCEPTION 'save expected size part_source, got %', v_src;
  END IF;

  IF v_part IS NOT NULL THEN
    SELECT part_source INTO v_src
    FROM public.maintenance_work_order_line_item
    WHERE work_order_line_id = v_line AND part_id = v_part;
    IF v_src IS DISTINCT FROM 'car' THEN
      RAISE EXCEPTION 'save expected car part_source, got %', v_src;
    END IF;
  END IF;

  -- Completed log still immutable
  UPDATE public.maintenance_work_orders
  SET status = 'completed', closed_at = now()
  WHERE id = v_wo;
  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;

  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'draft', jsonb_build_object('notes', 'nope'),
      v_wo, v_ver,
      jsonb_build_array(
        jsonb_build_object(
          'id', v_line,
          'line_total', 0,
          'items_amount', 0,
          'items', jsonb_build_array(
            jsonb_build_object(
              'source', 'suggested',
              'job_item_id', v_part_job_item,
              'item_kind', 'part_type',
              'part_type_id', v_part_type,
              'item_name', 'Gasket',
              'unit_label', 'pc',
              'brand', 'TypedCo',
              'part_number', 'TY-1',
              'part_source', 'size',
              'qty', '1'
            )
          )
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'immutable' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'completed save must stay immutable'; END IF;

  RAISE NOTICE 'service_items_part_source_db_test: ok';
END $$;

ROLLBACK;
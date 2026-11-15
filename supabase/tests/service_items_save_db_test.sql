-- Service items D2 save/claim tests (done-tests 4–14 + claim/integrity).

BEGIN;

DO $$
DECLARE
  v_org text := 'si-d2-test-org';
  v_veh text := 'si-d2-test-veh-never-real';
  v_actor uuid := 'a1111111-1111-4111-8111-111111111111';
  v_actor2 uuid := 'a2222222-2222-4222-8222-222222222222';
  v_cat uuid;
  v_part_type uuid;
  v_supply uuid;
  v_unit uuid;
  v_job uuid;
  v_job_item uuid;
  v_part_job_item uuid;
  v_wo uuid;
  v_line uuid;
  v_line2 uuid;
  v_part uuid;
  v_wrong_part uuid;
  v_rec uuid;
  v_json jsonb;
  v_ver int;
  v_ver2 int;
  v_caught boolean;
  v_amt numeric;
  v_cnt bigint;
  v_ts timestamptz;
  v_audit bigint;
  v_pos_job uuid;
  v_status text;
  v_provider text;
  v_inv text;
  v_brand text;
  v_pnum text;
  v_price numeric;
  v_wo_done uuid;
  v_offer uuid;
  v_saved_offer uuid;
BEGIN
  SELECT id INTO v_cat FROM public.maintenance_service_categories WHERE kind = 'component' LIMIT 1;
  SELECT id INTO v_part_type FROM public.maintenance_service_categories WHERE code = 'spark_plugs';
  SELECT id INTO v_job FROM public.maintenance_service_categories WHERE code = 'air_filter';
  SELECT id INTO v_unit FROM public.maintenance_unit WHERE code = 'piece';
  IF v_cat IS NULL OR v_part_type IS NULL OR v_unit IS NULL THEN
    RAISE EXCEPTION 'fixture categories/units missing';
  END IF;

  INSERT INTO public.maintenance_supply (name, unit_id)
  VALUES ('si-d2-never-real-supply', v_unit)
  RETURNING id INTO v_supply;

  INSERT INTO public.maintenance_job_item (job_id, supply_id, need)
  VALUES (v_job, v_supply, 'usually')
  RETURNING id INTO v_job_item;

  SELECT pm.id INTO v_part
  FROM public.part_master pm
  WHERE pm.maintenance_component_id = v_part_type
  LIMIT 1;

  SELECT id INTO v_wrong_part FROM public.part_master
  WHERE maintenance_component_id IS NOT NULL
    AND maintenance_component_id IS DISTINCT FROM v_part_type
  LIMIT 1;

  -- Done-test 4: generated amounts
  v_wo := 'c1111111-1111-4111-8111-111111111101';
  v_line := 'c2222222-2222-4222-8222-222222222202';
  INSERT INTO public.maintenance_work_orders (id, organization_id, vehicle_id, status)
  VALUES (v_wo, v_org, v_veh, 'draft');

  INSERT INTO public.maintenance_work_order_lines (
    id, work_order_id, component_id, action, line_total, items_amount
  ) VALUES (v_line, v_wo, v_cat, 'replace', 0, 0);

  INSERT INTO public.maintenance_work_order_line_item (
    work_order_id, work_order_line_id, source, job_item_id, item_kind, supply_id,
    item_name, unit_label, qty, unit_cost, updated_by
  ) VALUES
    (v_wo, v_line, 'suggested', v_job_item, 'supply', v_supply, 'cleaner', 'can', 2, 600.50, v_actor);
  SELECT amount INTO v_amt FROM public.maintenance_work_order_line_item WHERE work_order_line_id = v_line LIMIT 1;
  IF v_amt IS DISTINCT FROM 1201.00::numeric THEN
    RAISE EXCEPTION 'amount 2x600.50 expected 1201.00 got %', v_amt;
  END IF;

  DELETE FROM public.maintenance_work_order_line_item WHERE work_order_line_id = v_line;
  INSERT INTO public.maintenance_work_order_line_item (
    work_order_id, work_order_line_id, source, job_item_id, item_kind, supply_id,
    item_name, unit_label, qty, unit_cost, updated_by
  ) VALUES (v_wo, v_line, 'suggested', v_job_item, 'supply', v_supply, 'x', 'pc', 1.5, 0.33, v_actor);
  SELECT amount INTO v_amt FROM public.maintenance_work_order_line_item WHERE work_order_line_id = v_line LIMIT 1;
  IF v_amt IS DISTINCT FROM 0.50::numeric THEN
    RAISE EXCEPTION 'amount 1.5x0.33 expected 0.50 got %', v_amt;
  END IF;

  DELETE FROM public.maintenance_work_order_line_item WHERE work_order_line_id = v_line;
  INSERT INTO public.maintenance_work_order_line_item (
    work_order_id, work_order_line_id, source, job_item_id, item_kind, supply_id,
    item_name, unit_label, qty, unit_cost, updated_by
  ) VALUES (v_wo, v_line, 'suggested', v_job_item, 'supply', v_supply, 'x', 'pc', 1.005, 2.00, v_actor);
  SELECT amount INTO v_amt FROM public.maintenance_work_order_line_item WHERE work_order_line_id = v_line LIMIT 1;
  IF v_amt IS DISTINCT FROM 2.01::numeric THEN
    RAISE EXCEPTION 'amount 1.005x2 expected 2.01 got %', v_amt;
  END IF;

  DELETE FROM public.maintenance_work_order_line_item WHERE work_order_line_id = v_line;
  INSERT INTO public.maintenance_work_order_line_item (
    work_order_id, work_order_line_id, source, job_item_id, item_kind, supply_id,
    item_name, unit_label, qty, unit_cost, updated_by
  ) VALUES (v_wo, v_line, 'suggested', v_job_item, 'supply', v_supply, 'x', 'pc', 1.005, NULL, v_actor);
  SELECT amount INTO v_amt FROM public.maintenance_work_order_line_item WHERE work_order_line_id = v_line LIMIT 1;
  IF v_amt IS DISTINCT FROM 0.00::numeric THEN
    RAISE EXCEPTION 'amount 1.005xNULL expected 0.00 got %', v_amt;
  END IF;

  -- Done-test 5: part_number on supply + part mismatch
  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_work_order_line_item (
      work_order_id, work_order_line_id, source, job_item_id, item_kind, supply_id,
      item_name, unit_label, qty, part_number, updated_by
    ) VALUES (
      v_wo, v_line, 'suggested', v_job_item, 'supply', v_supply, 'x', 'pc', 1, 'PN-1', v_actor
    );
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'expected check_violation for part_number on supply';
  END IF;

  INSERT INTO public.maintenance_job_item (job_id, part_type_id, need)
  VALUES (v_job, v_part_type, 'usually')
  RETURNING id INTO v_part_job_item;

  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_work_order_line_item (
      work_order_id, work_order_line_id, source, job_item_id, item_kind, part_type_id, part_id,
      item_name, unit_label, qty, updated_by
    ) VALUES (
      v_wo, v_line, 'suggested', v_part_job_item, 'part_type', v_part_type, v_wrong_part,
      'x', 'pc', 1, v_actor
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'line_item_part_mismatch' THEN
      v_caught := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF v_wrong_part IS NOT NULL AND NOT v_caught THEN
    RAISE EXCEPTION 'expected line_item_part_mismatch for wrong part';
  END IF;

  -- Done-test 6: cascade delete line -> items
  INSERT INTO public.maintenance_work_order_line_item (
    work_order_id, work_order_line_id, source, job_item_id, item_kind, supply_id,
    item_name, unit_label, qty, updated_by
  ) VALUES (v_wo, v_line, 'suggested', v_job_item, 'supply', v_supply, 'x', 'pc', 1, v_actor);
  DELETE FROM public.maintenance_work_order_lines WHERE id = v_line;
  SELECT count(*) INTO v_cnt FROM public.maintenance_work_order_line_item WHERE work_order_line_id = v_line;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'expected items cascade-deleted with line';
  END IF;
  DELETE FROM public.maintenance_work_orders WHERE id = v_wo;

  v_caught := false;
  BEGIN
    DELETE FROM public.maintenance_supply WHERE id = v_supply;
  EXCEPTION WHEN foreign_key_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'expected FK when deleting supply in use on job_item';
  END IF;

  -- Done-test 9: create validation
  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, NULL, 'draft', '{}'::jsonb, NULL, NULL, '[]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'actor_required' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected actor_required'; END IF;

  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'draft', jsonb_build_object('vehicle_id', v_veh),
      NULL, 1, '[]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'version_on_create' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected version_on_create'; END IF;

  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'completed', jsonb_build_object('vehicle_id', v_veh),
      NULL, NULL, '[]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'status_invalid' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected status_invalid'; END IF;

  v_wo := 'd1111111-1111-4111-8111-111111111101';
  INSERT INTO public.maintenance_work_orders (id, organization_id, vehicle_id, status)
  VALUES (v_wo, v_org, v_veh, 'draft');

  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'draft',
      jsonb_build_object('id', v_wo, 'vehicle_id', v_veh),
      NULL, NULL, '[]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'work_order_id_taken' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected work_order_id_taken'; END IF;

  -- D2-fix: clear nullable work order and line fields on save
  v_wo := 'b1111111-1111-4111-8111-111111111101';
  v_json := public.fleet_save_work_order(
    v_org,
    v_actor,
    'draft',
    jsonb_build_object(
      'id', v_wo,
      'vehicle_id', v_veh,
      'provider', 'Shop A',
      'invoice_url', 'https://inv.example/1'
    ),
    NULL,
    NULL,
    jsonb_build_array(
      jsonb_build_object(
        'component_id', v_cat,
        'action', 'replace',
        'part_id', v_part,
        'brand', 'OEM',
        'part_number', 'PN-99',
        'unit_price', 4000,
        'line_total', 4000,
        'items_amount', 0,
        'items', '[]'::jsonb
      )
    )
  );
  v_line := (v_json -> 'lines' -> 0 ->> 'id')::uuid;
  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;

  v_json := public.fleet_save_work_order(
    v_org,
    v_actor,
    'draft',
    jsonb_build_object(
      'provider', null,
      'invoice_url', null
    ),
    v_wo,
    v_ver,
    jsonb_build_array(
      jsonb_build_object(
        'id', v_line,
        'part_id', null,
        'brand', null,
        'part_number', null,
        'unit_price', null,
        'line_total', 0,
        'items_amount', 0,
        'items', '[]'::jsonb
      )
    )
  );
  SELECT provider, invoice_url INTO v_provider, v_inv
  FROM public.maintenance_work_orders WHERE id = v_wo;
  SELECT brand, part_number, unit_price
  INTO v_brand, v_pnum, v_price
  FROM public.maintenance_work_order_lines WHERE id = v_line;
  IF v_provider IS NOT NULL OR v_inv IS NOT NULL
     OR v_brand IS NOT NULL OR v_pnum IS NOT NULL OR v_price IS NOT NULL THEN
    RAISE EXCEPTION 'clear-field save must null provider/invoice/part fields';
  END IF;
  IF (SELECT part_id FROM public.maintenance_work_order_lines WHERE id = v_line) IS NOT NULL THEN
    RAISE EXCEPTION 'clear-field save must null part_id';
  END IF;

  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  PERFORM public.fleet_save_work_order(
    v_org,
    v_actor,
    'draft',
    jsonb_build_object('discount_amount', 0),
    v_wo,
    v_ver,
    jsonb_build_array(
      jsonb_build_object(
        'id', v_line,
        'line_total', 0,
        'items_amount', 0,
        'items', '[]'::jsonb
      )
    )
  );
  SELECT provider, invoice_url INTO v_provider, v_inv
  FROM public.maintenance_work_orders WHERE id = v_wo;
  SELECT brand, part_number, unit_price
  INTO v_brand, v_pnum, v_price
  FROM public.maintenance_work_order_lines WHERE id = v_line;
  IF v_provider IS NOT NULL OR v_inv IS NOT NULL
     OR v_brand IS NOT NULL OR v_pnum IS NOT NULL OR v_price IS NOT NULL THEN
    RAISE EXCEPTION 'omitted keys must keep cleared fields null';
  END IF;

  -- S2-fix: prepareWorkOrderLines-shaped lines (JSON null positions / values_json)
  v_wo := 'f2111111-1111-4111-8111-111111111101';
  v_json := public.fleet_save_work_order(
    v_org,
    v_actor,
    'draft',
    jsonb_build_object('id', v_wo, 'vehicle_id', v_veh),
    NULL,
    NULL,
    jsonb_build_array(
      jsonb_build_object(
        'sort_order', 0,
        'component_id', v_cat,
        'action', 'other',
        'line_total', 0,
        'items_amount', 0,
        'items', '[]'::jsonb
      ) || '{
        "positions": null,
        "values_json": null,
        "brand": null,
        "part_number": null,
        "part_id": null,
        "supplier_part_offer_id": null,
        "condition": null,
        "notes": null
      }'::jsonb,
      jsonb_build_object(
        'sort_order', 1,
        'component_id', v_cat,
        'action', 'other',
        'line_total', 0,
        'items_amount', 0,
        'items', '[]'::jsonb,
        'positions', jsonb_build_array('FL', 'FR')
      )
    )
  );
  v_line := (v_json -> 'lines' -> 0 ->> 'id')::uuid;
  v_line2 := (v_json -> 'lines' -> 1 ->> 'id')::uuid;
  IF (SELECT positions FROM public.maintenance_work_order_lines WHERE id = v_line) IS NOT NULL THEN
    RAISE EXCEPTION 'S2 create: positions must be SQL NULL';
  END IF;
  IF (SELECT values_json FROM public.maintenance_work_order_lines WHERE id = v_line) IS NOT NULL THEN
    RAISE EXCEPTION 'S2 create: values_json must be SQL NULL';
  END IF;
  IF (SELECT positions FROM public.maintenance_work_order_lines WHERE id = v_line2)
     IS DISTINCT FROM ARRAY['FL', 'FR']::text[] THEN
    RAISE EXCEPTION 'S2 create: positions FL FR array mismatch';
  END IF;

  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  PERFORM public.fleet_save_work_order(
    v_org,
    v_actor,
    'draft',
    jsonb_build_object('discount_amount', 0),
    v_wo,
    v_ver,
    jsonb_build_array(
      jsonb_build_object(
        'id', v_line,
        'sort_order', 0,
        'line_total', 0,
        'items_amount', 0,
        'items', '[]'::jsonb
      ) || '{
        "positions": null,
        "values_json": null,
        "brand": null,
        "part_number": null,
        "part_id": null,
        "supplier_part_offer_id": null,
        "condition": null,
        "notes": null
      }'::jsonb
    )
  );
  IF (SELECT positions FROM public.maintenance_work_order_lines WHERE id = v_line) IS NOT NULL THEN
    RAISE EXCEPTION 'S2 update: positions must stay SQL NULL';
  END IF;
  IF (SELECT values_json FROM public.maintenance_work_order_lines WHERE id = v_line) IS NOT NULL THEN
    RAISE EXCEPTION 'S2 update: values_json must stay SQL NULL';
  END IF;

  SELECT id INTO v_offer FROM public.supplier_part_offer LIMIT 1;
  IF v_offer IS NOT NULL THEN
    SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
    PERFORM public.fleet_save_work_order(
      v_org,
      v_actor,
      'draft',
      jsonb_build_object('discount_amount', 0),
      v_wo,
      v_ver,
      jsonb_build_array(
        jsonb_build_object(
          'id', v_line,
          'supplier_part_offer_id', v_offer,
          'line_total', 0,
          'items_amount', 0,
          'items', '[]'::jsonb
        )
      )
    );
    SELECT supplier_part_offer_id INTO v_saved_offer
    FROM public.maintenance_work_order_lines WHERE id = v_line;
    IF v_saved_offer IS DISTINCT FROM v_offer THEN
      RAISE EXCEPTION 'supplier_part_offer_id must be saved';
    END IF;

    SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
    PERFORM public.fleet_save_work_order(
      v_org,
      v_actor,
      'draft',
      jsonb_build_object('discount_amount', 0),
      v_wo,
      v_ver,
      jsonb_build_array(
        jsonb_build_object(
          'id', v_line,
          'line_total', 0,
          'items_amount', 0,
          'items', '[]'::jsonb
        )
      )
    );
    SELECT supplier_part_offer_id INTO v_saved_offer
    FROM public.maintenance_work_order_lines WHERE id = v_line;
    IF v_saved_offer IS DISTINCT FROM v_offer THEN
      RAISE EXCEPTION 'omitted supplier_part_offer_id must keep prior value';
    END IF;

    SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
    PERFORM public.fleet_save_work_order(
      v_org,
      v_actor,
      'draft',
      jsonb_build_object('discount_amount', 0),
      v_wo,
      v_ver,
      jsonb_build_array(
        jsonb_build_object(
          'id', v_line,
          'supplier_part_offer_id', null,
          'line_total', 0,
          'items_amount', 0,
          'items', '[]'::jsonb
        )
      )
    );
    SELECT supplier_part_offer_id INTO v_saved_offer
    FROM public.maintenance_work_order_lines WHERE id = v_line;
    IF v_saved_offer IS NOT NULL THEN
      RAISE EXCEPTION 'null supplier_part_offer_id must clear the column';
    END IF;
  END IF;

  SELECT id INTO v_part
  FROM public.part_master pm
  WHERE pm.maintenance_component_id = v_part_type
  LIMIT 1;

  -- Create + save with items (tests 10–14 base)
  v_json := public.fleet_save_work_order(
    v_org,
    v_actor,
    'in_progress',
    jsonb_build_object(
      'vehicle_id', v_veh,
      'discount_amount', 0
    ),
    NULL,
    NULL,
    jsonb_build_array(
      jsonb_build_object(
        'component_id', v_cat,
        'action', 'replace',
        'line_total', 5000,
        'items_amount', 1201,
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'suggested',
            'job_item_id', v_job_item,
            'item_kind', 'supply',
            'supply_id', v_supply,
            'item_name', 'cleaner',
            'unit_label', 'cans',
            'qty', 2,
            'unit_cost', 600.50
          )
        )
      )
    )
  );
  v_wo := (v_json -> 'work_order' ->> 'id')::uuid;
  v_line := (v_json -> 'lines' -> 0 ->> 'id')::uuid;
  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  IF (v_json -> 'work_order' ->> 'total_cost')::numeric IS DISTINCT FROM 5000::numeric THEN
    RAISE EXCEPTION 'total_cost expected 5000 got %', v_json -> 'work_order' ->> 'total_cost';
  END IF;

  -- Done-test 8: version_required
  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'in_progress', jsonb_build_object('discount_amount', 0),
      v_wo, NULL, '[]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'version_required' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected version_required'; END IF;

  -- stale_edit
  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'in_progress', jsonb_build_object('discount_amount', 0),
      v_wo, v_ver - 1, '[]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'stale_edit' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected stale_edit'; END IF;

  -- line_work_order_mismatch foreign line id
  v_line2 := 'e2222222-2222-4222-8222-222222222202';
  INSERT INTO public.maintenance_work_orders (id, organization_id, vehicle_id, status)
  VALUES ('e1111111-1111-4111-8111-111111111101', 'other-org', v_veh, 'draft');
  INSERT INTO public.maintenance_work_order_lines (id, work_order_id, component_id, action, line_total)
  VALUES (v_line2, 'e1111111-1111-4111-8111-111111111101', v_cat, 'replace', 1);

  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'in_progress', jsonb_build_object('discount_amount', 0),
      v_wo, v_ver,
      jsonb_build_array(jsonb_build_object('id', v_line2, 'line_total', 1, 'items_amount', 0, 'items', '[]'::jsonb))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'line_work_order_mismatch' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected line_work_order_mismatch'; END IF;

  -- declined + items
  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'in_progress', jsonb_build_object('discount_amount', 0),
      v_wo, v_ver,
      jsonb_build_array(
        jsonb_build_object(
          'id', v_line,
          'declined', true,
          'line_total', 0,
          'items_amount', 0,
          'items', jsonb_build_array(
            jsonb_build_object(
              'source', 'suggested', 'job_item_id', v_job_item, 'item_kind', 'supply', 'supply_id', v_supply,
              'item_name', 'x', 'unit_label', 'pc', 'qty', 1
            )
          )
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'line_items_on_declined' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected line_items_on_declined'; END IF;

  -- items_amount mismatch
  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'in_progress', jsonb_build_object('discount_amount', 0),
      v_wo, v_ver,
      jsonb_build_array(
        jsonb_build_object(
          'id', v_line,
          'line_total', 5000,
          'items_amount', 999,
          'items', jsonb_build_array(
            jsonb_build_object(
              'source', 'suggested', 'job_item_id', v_job_item, 'item_kind', 'supply', 'supply_id', v_supply,
              'item_name', 'cleaner', 'unit_label', 'cans', 'qty', 2, 'unit_cost', 600.50
            )
          )
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'line_items_amount_mismatch' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected line_items_amount_mismatch'; END IF;

  -- Done-test 11–12: version bump + audit on real change
  SELECT version, updated_at INTO v_ver, v_ts
  FROM public.maintenance_work_orders WHERE id = v_wo;

  v_json := public.fleet_save_work_order(
    v_org, v_actor, 'in_progress', jsonb_build_object('discount_amount', 0),
    v_wo, v_ver,
    jsonb_build_array(
      jsonb_build_object(
        'id', v_line,
        'line_total', 5000,
        'items_amount', 1201,
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'suggested', 'job_item_id', v_job_item, 'item_kind', 'supply', 'supply_id', v_supply,
            'item_name', 'cleaner', 'unit_label', 'cans', 'qty', 2, 'unit_cost', 600.50
          )
        )
      )
    )
  );
  SELECT version INTO v_ver2 FROM public.maintenance_work_orders WHERE id = v_wo;
  IF v_ver2 <= v_ver THEN
    RAISE EXCEPTION 'expected version to bump after save';
  END IF;

  SELECT count(*) INTO v_audit
  FROM fleet.maintenance_audit_log
  WHERE organization_id = v_org
    AND entity_id = v_line::text
    AND actor_id = v_actor;
  IF v_audit < 1 THEN
    RAISE EXCEPTION 'expected audit row for line save';
  END IF;

  -- identical items -> no new item audit (test 12)
  SELECT count(*) INTO v_cnt FROM fleet.maintenance_audit_log WHERE entity_type = 'maintenance_work_order_line_item';
  v_ver := v_ver2;
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'in_progress', jsonb_build_object('discount_amount', 0),
    v_wo, v_ver,
    jsonb_build_array(
      jsonb_build_object(
        'id', v_line,
        'line_total', 5000,
        'items_amount', 1201,
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'suggested', 'job_item_id', v_job_item, 'item_kind', 'supply', 'supply_id', v_supply,
            'item_name', 'cleaner', 'unit_label', 'cans', 'qty', 2, 'unit_cost', 600.50
          )
        )
      )
    )
  );
  SELECT count(*) INTO v_audit
  FROM fleet.maintenance_audit_log
  WHERE entity_type = 'maintenance_work_order_line_item'
    AND actor_id = v_actor;
  IF v_audit <> v_cnt THEN
    RAISE EXCEPTION 'identical items should not write item audit rows';
  END IF;

  -- change one item field -> item audit
  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'in_progress', jsonb_build_object('discount_amount', 0),
    v_wo, v_ver,
    jsonb_build_array(
      jsonb_build_object(
        'id', v_line,
        'line_total', 5000,
        'items_amount', 1201,
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'suggested', 'job_item_id', v_job_item, 'item_kind', 'supply', 'supply_id', v_supply,
            'item_name', 'cleaner-renamed', 'unit_label', 'cans', 'qty', 2, 'unit_cost', 600.50
          )
        )
      )
    )
  );
  SELECT count(*) INTO v_audit
  FROM fleet.maintenance_audit_log
  WHERE entity_type = 'maintenance_work_order_line_item'
    AND actor_id = v_actor
    AND (before_json ->> 'item_name' = 'cleaner' OR after_json ->> 'item_name' = 'cleaner-renamed');
  IF v_audit < 1 THEN
    RAISE EXCEPTION 'expected item delete/insert audit when item changes';
  END IF;

  -- Done-test 14: two saves same version -> one stale
  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'in_progress', jsonb_build_object('discount_amount', 0),
    v_wo, v_ver,
    jsonb_build_array(
      jsonb_build_object(
        'id', v_line, 'line_total', 5100, 'items_amount', 1201,
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'suggested', 'job_item_id', v_job_item, 'item_kind', 'supply', 'supply_id', v_supply,
            'item_name', 'cleaner-renamed', 'unit_label', 'cans', 'qty', 2, 'unit_cost', 600.50
          )
        )
      )
    )
  );
  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor2, 'in_progress', jsonb_build_object('discount_amount', 0),
      v_wo, v_ver,
      jsonb_build_array(
        jsonb_build_object(
          'id', v_line, 'line_total', 5200, 'items_amount', 1201,
          'items', jsonb_build_array(
            jsonb_build_object(
              'source', 'suggested', 'job_item_id', v_job_item, 'item_kind', 'supply', 'supply_id', v_supply,
              'item_name', 'cleaner-renamed', 'unit_label', 'cans', 'qty', 2, 'unit_cost', 600.50
            )
          )
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'stale_edit' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected stale_edit on concurrent version'; END IF;

  -- Claim / finish / completion_in_progress
  v_json := public.fleet_claim_completion(v_org, v_wo, v_actor);
  IF coalesce(v_json ->> 'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'expected claim success, got %', v_json;
  END IF;

  v_json := public.fleet_claim_completion(v_org, v_wo, v_actor2);
  IF v_json ->> 'reason' IS DISTINCT FROM 'in_progress_elsewhere' THEN
    RAISE EXCEPTION 'expected in_progress_elsewhere got %', v_json;
  END IF;

  PERFORM public.fleet_release_completion(v_org, v_wo);

  UPDATE public.maintenance_work_orders
  SET completing_since = now() - interval '11 minutes'
  WHERE id = v_wo;

  v_json := public.fleet_claim_completion(v_org, v_wo, v_actor);
  IF coalesce(v_json ->> 'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'expected stale claim takeover';
  END IF;

  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'in_progress', jsonb_build_object('discount_amount', 0),
      v_wo, (SELECT version FROM public.maintenance_work_orders WHERE id = v_wo),
      '[]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'completion_in_progress' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected completion_in_progress on save while claimed'; END IF;

  PERFORM public.fleet_release_completion(v_org, v_wo);

  v_caught := false;
  BEGIN
    v_rec := gen_random_uuid();
    PERFORM public.fleet_finish_completion(v_org, v_wo, v_actor, v_rec);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'completion_not_claimed' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected completion_not_claimed'; END IF;

  v_json := public.fleet_claim_completion(v_org, v_wo, v_actor);
  v_rec := gen_random_uuid();
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (
    v_rec, v_org, v_veh, 1, current_date, 5000, 'completed'
  );
  v_json := public.fleet_finish_completion(v_org, v_wo, v_actor, v_rec);
  IF (v_json ->> 'status') IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'finish expected completed status';
  END IF;
  v_wo_done := v_wo;

  -- D2-fix: completed log cannot be re-saved via fleet_save_work_order
  SELECT version, status INTO v_ver, v_status FROM public.maintenance_work_orders WHERE id = v_wo;
  SELECT line_total INTO v_amt FROM public.maintenance_work_order_lines WHERE id = v_line LIMIT 1;
  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'in_progress', jsonb_build_object('discount_amount', 0),
      v_wo, v_ver,
      jsonb_build_array(
        jsonb_build_object(
          'id', v_line, 'line_total', v_amt + 100, 'items_amount', 0, 'items', '[]'::jsonb
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'immutable' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected immutable on completed fleet_save_work_order'; END IF;
  IF (SELECT status FROM public.maintenance_work_orders WHERE id = v_wo) IS DISTINCT FROM v_status THEN
    RAISE EXCEPTION 'immutable save must not change status';
  END IF;
  IF (SELECT version FROM public.maintenance_work_orders WHERE id = v_wo) IS DISTINCT FROM v_ver THEN
    RAISE EXCEPTION 'immutable save must not bump version';
  END IF;
  IF (SELECT line_total FROM public.maintenance_work_order_lines WHERE id = v_line) IS DISTINCT FROM v_amt THEN
    RAISE EXCEPTION 'immutable save must not change lines';
  END IF;

  -- D2-fix: voided draft cannot be saved
  v_wo := 'c3333333-3333-4333-8333-333333333303';
  INSERT INTO public.maintenance_work_orders (id, organization_id, vehicle_id, status, version)
  VALUES (v_wo, v_org, v_veh, 'draft', 1);
  UPDATE public.maintenance_work_orders
  SET voided_at = now(), void_reason = 'si-d2-fix voided draft'
  WHERE id = v_wo;
  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'draft', jsonb_build_object('notes', 'retry'),
      v_wo, v_ver, '[]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'immutable' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected immutable on voided draft save'; END IF;

  v_wo := v_wo_done;

  -- Completed log edit refused (version unchanged)
  SELECT version, updated_at INTO v_ver, v_ts FROM public.maintenance_work_orders WHERE id = v_wo;
  v_caught := false;
  BEGIN
    UPDATE public.maintenance_work_orders SET notes = 'hacked' WHERE id = v_wo;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'completed wo edit must be refused'; END IF;
  IF (SELECT version FROM public.maintenance_work_orders WHERE id = v_wo) IS DISTINCT FROM v_ver THEN
    RAISE EXCEPTION 'refused completed edit must not bump version';
  END IF;

  -- Void-style update on completed allowed
  UPDATE public.maintenance_work_orders
  SET voided_at = now(), void_reason = 'si-d2 test'
  WHERE id = v_wo;
  IF (SELECT version FROM public.maintenance_work_orders WHERE id = v_wo) <= v_ver THEN
    RAISE EXCEPTION 'void update should bump version';
  END IF;

  -- D2-fix: completed_missing_service_ledger skip rules
  SELECT id INTO v_pos_job
  FROM public.maintenance_service_categories
  WHERE position_aware IS TRUE AND kind = 'component'
  LIMIT 1;
  IF v_pos_job IS NULL THEN
    RAISE EXCEPTION 'position_aware component fixture required';
  END IF;

  v_wo := 'f2222222-2222-4222-8222-222222222202';
  INSERT INTO public.maintenance_work_orders (
    id, organization_id, vehicle_id, status, closed_at
  ) VALUES (v_wo, v_org, v_veh, 'completed', now());

  v_line := 'f3333333-3333-4333-8333-333333333301';
  INSERT INTO public.maintenance_work_order_lines (
    id, work_order_id, component_id, action, declined, line_total
  ) VALUES (v_line, v_wo, v_cat, 'replace', true, 0);

  v_line2 := 'f3333333-3333-4333-8333-333333333302';
  INSERT INTO public.maintenance_work_order_lines (
    id, work_order_id, component_id, action, line_total
  ) VALUES (v_line2, v_wo, NULL, 'replace', 0);

  INSERT INTO public.maintenance_work_order_lines (
    id, work_order_id, component_id, action, positions, line_total
  ) VALUES (
    'f3333333-3333-4333-8333-333333333303',
    v_wo, v_pos_job, 'replace', NULL, 0
  );

  v_line2 := 'f3333333-3333-4333-8333-333333333304';
  INSERT INTO public.maintenance_work_order_lines (
    id, work_order_id, component_id, action, line_total
  ) VALUES (v_line2, v_wo, v_cat, 'replace', 100);

  SELECT count(*) INTO v_cnt
  FROM fleet.maintenance_integrity_report(v_org) r
  WHERE r.check_name = 'completed_missing_service_ledger'
    AND r.detail ->> 'work_order_id' = v_wo::text;
  IF v_cnt IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'integrity ledger arm expected 2 rows (pos-aware + normal), got %', v_cnt;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM fleet.maintenance_integrity_report(v_org) r
    WHERE r.check_name = 'completed_missing_service_ledger'
      AND r.detail ->> 'work_order_line_id' = 'f3333333-3333-4333-8333-333333333303'
  ) THEN
    RAISE EXCEPTION 'integrity ledger arm must flag position-aware line without ledger';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM fleet.maintenance_integrity_report(v_org) r
    WHERE r.check_name = 'completed_missing_service_ledger'
      AND r.detail ->> 'work_order_line_id' = v_line2::text
  ) THEN
    RAISE EXCEPTION 'integrity ledger arm must flag normal line without ledger';
  END IF;
  IF EXISTS (
    SELECT 1 FROM fleet.maintenance_integrity_report(v_org) r
    WHERE r.check_name = 'completed_missing_service_ledger'
      AND r.detail ->> 'work_order_line_id' = v_line::text
  ) THEN
    RAISE EXCEPTION 'integrity ledger arm must not flag declined line';
  END IF;

  -- Integrity arms: plant + detect
  v_wo := 'f1111111-1111-4111-8111-111111111101';
  INSERT INTO public.maintenance_work_orders (
    id, organization_id, vehicle_id, status, completing_since
  ) VALUES (v_wo, v_org, v_veh, 'in_progress', now() - interval '15 minutes');

  SELECT count(*) INTO v_cnt
  FROM fleet.maintenance_integrity_report(v_org) r
  WHERE r.check_name = 'completion_stuck'
    AND r.detail ->> 'work_order_id' = v_wo::text;
  IF v_cnt < 1 THEN RAISE EXCEPTION 'integrity completion_stuck'; END IF;

  DELETE FROM public.maintenance_work_orders WHERE id = v_wo;

  RAISE NOTICE 'service_items_save_db_test: ok';
END $$;

ROLLBACK;

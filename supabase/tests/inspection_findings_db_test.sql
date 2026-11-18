-- Inspection findings D1 behaviour (audit gates 1–12, IF-7).

BEGIN;

DO $$
DECLARE
  v_org text := 'if-d1-test-org-never-real';
  v_veh text := 'if-d1-veh-never-real';
  v_veh2 text := 'if-d1-veh2-never-real';
  v_actor uuid := 'a1111111-1111-4111-8111-111111111111';
  v_insp uuid;
  v_wiper uuid;
  v_rotor uuid;
  v_shock uuid;
  v_unit uuid;
  v_supply uuid;
  v_job_item uuid;
  v_json jsonb;
  v_ver int;
  v_wo uuid;
  v_line_insp uuid;
  v_line_wiper uuid;
  v_line_rotor uuid;
  v_line_shock uuid;
  v_wo2 uuid;
  v_wo3 uuid;
  v_wo4 uuid;
  v_line_do uuid;
  v_rec uuid;
  v_total numeric;
  v_amt numeric;
  v_open jsonb;
  v_counts jsonb;
  v_caught boolean;
  v_closed jsonb;
  v_alert_count int;
  v_wo_ctrl1 uuid;
  v_wo_ctrl2 uuid;
  v_line_ctrl1 uuid;
  v_line_ctrl2 uuid;
  v_wo_if18_ctrl1 uuid;
  v_wo_if18_ctrl2 uuid;
  v_wo_if18_b uuid;
  v_wo_if18_c uuid;
  v_wo_if19 uuid;
  v_wo_if26 uuid;
  v_line_if26 uuid;
  v_line_keys jsonb := '{
    "system_id": null,
    "system_code": null,
    "system_name": null,
    "component_code": null,
    "condition": null,
    "positions": null,
    "brand": null,
    "part_number": null,
    "part_id": null,
    "supplier_part_offer_id": null,
    "qty": null,
    "unit_price": null,
    "labor_hours": null,
    "labor_rate": null,
    "warranty": false,
    "complimentary": false,
    "declined": false,
    "values_json": null,
    "from_found_line_id": null
  }'::jsonb;
BEGIN
  SELECT id INTO v_insp FROM public.maintenance_service_categories
  WHERE code = 'inspection_diagnostic_fee';
  IF v_insp IS NULL THEN
    INSERT INTO public.maintenance_service_categories (
      code, name, kind, is_part, quick_job_eligible, status, records_findings
    ) VALUES (
      'inspection_diagnostic_fee', 'Inspection / diagnostic fee', 'component',
      false, true, 'active', true
    ) RETURNING id INTO v_insp;
  ELSE
    UPDATE public.maintenance_service_categories
    SET records_findings = true,
        name = 'Inspection / diagnostic fee'
    WHERE id = v_insp;
  END IF;

  SELECT id INTO v_wiper FROM public.maintenance_service_categories WHERE code = 'wipers';
  SELECT id INTO v_rotor FROM public.maintenance_service_categories WHERE code = 'brake_rotor';
  SELECT id INTO v_shock FROM public.maintenance_service_categories WHERE code = 'shock_absorber';
  SELECT id INTO v_unit FROM public.maintenance_unit WHERE code = 'piece';
  IF v_wiper IS NULL OR v_rotor IS NULL OR v_shock IS NULL OR v_unit IS NULL THEN
    RAISE EXCEPTION 'fixture jobs/units missing';
  END IF;

  SELECT id INTO v_supply FROM public.maintenance_supply
  WHERE lower(name) = lower('if-d1-never-real-supply') AND status = 'active' LIMIT 1;
  IF v_supply IS NULL THEN
    INSERT INTO public.maintenance_supply (name, unit_id)
    VALUES ('if-d1-never-real-supply', v_unit)
    RETURNING id INTO v_supply;
  END IF;

  SELECT id INTO v_job_item
  FROM public.maintenance_job_item
  WHERE job_id = v_wiper AND supply_id = v_supply AND removed_at IS NULL
  LIMIT 1;
  IF v_job_item IS NULL THEN
    INSERT INTO public.maintenance_job_item (job_id, supply_id, need)
    VALUES (v_wiper, v_supply, 'usually')
    RETURNING id INTO v_job_item;
  END IF;
  -- Inspection service (4 lines)
  v_wo := 'f1111111-1111-4111-8111-111111111101';
  v_json := public.fleet_save_work_order(
    v_org,
    v_actor,
    'draft',
    jsonb_build_object(
      'id', v_wo,
      'vehicle_id', v_veh,
      'provider', 'Northside Auto',
      'performed_at_date', current_date
    ),
    NULL,
    NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'sort_order', 0,
        'component_id', v_insp,
        'component_name', 'Inspection / diagnostic fee',
        'action', 'inspect',
        'labor_amount', 8000,
        'line_total', 8000,
        'items_amount', 0,
        'recommended', false,
        'items', '[]'::jsonb
      ),
      v_line_keys || jsonb_build_object(
        'sort_order', 1,
        'component_id', v_wiper,
        'component_name', 'Wiper Blades',
        'action', 'replace',
        'labor_amount', 1500,
        'line_total', 3300,
        'items_amount', 1800,
        'recommended', false,
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'suggested',
            'job_item_id', v_job_item,
            'item_kind', 'supply',
            'supply_id', v_supply,
            'part_type_id', null,
            'part_id', null,
            'item_name', 'Wiper blade 22 in',
            'unit_label', 'pc',
            'brand', null,
            'part_number', null,
            'part_source', null,
            'qty', '2',
            'unit_cost', '900'
          )
        )
      ),
      v_line_keys || jsonb_build_object(
        'sort_order', 2,
        'component_id', v_rotor,
        'component_name', 'Brake rotor',
        'action', 'replace',
        'labor_amount', 5000,
        'line_total', 5000,
        'items_amount', 0,
        'recommended', true,
        'part_number', 'IF-D1-FAKE-PN-999',
        'notes', 'Front rotors worn',
        'items', '[]'::jsonb
      ),
      v_line_keys || jsonb_build_object(
        'sort_order', 3,
        'component_id', v_shock,
        'component_name', 'Shock absorber',
        'action', 'replace',
        'recommended', true,
        'line_total', 0,
        'items_amount', 0,
        'notes', 'Rear left leaking',
        'items', '[]'::jsonb
      )
    )
  );

  SELECT total_cost INTO v_total FROM public.maintenance_work_orders WHERE id = v_wo;
  IF v_total IS DISTINCT FROM 11300::numeric THEN
    RAISE EXCEPTION 'Gate 1: expected total 11300 got %', v_total;
  END IF;

  v_line_rotor := (
    SELECT l.id FROM public.maintenance_work_order_lines l
    WHERE l.work_order_id = v_wo AND l.component_id = v_rotor LIMIT 1
  );
  SELECT line_total INTO v_amt FROM public.maintenance_work_order_lines WHERE id = v_line_rotor;
  IF v_amt IS DISTINCT FROM 0::numeric THEN
    RAISE EXCEPTION 'Gate 1: brake rotor line_total expected 0 got %', v_amt;
  END IF;

  -- Gate 3
  v_caught := false;
  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'draft', jsonb_build_object('discount_amount', 0),
      v_wo, v_ver,
      jsonb_build_array(
        v_line_keys || jsonb_build_object(
          'id', v_line_rotor,
          'sort_order', 2,
          'component_id', v_rotor,
          'line_total', 0,
          'items_amount', 1800,
          'recommended', true,
          'items', jsonb_build_array(
            jsonb_build_object(
              'source', 'extra',
              'job_item_id', null,
              'item_kind', 'supply',
              'supply_id', v_supply,
              'item_name', 'x',
              'unit_label', 'pc',
              'qty', '1',
              'unit_cost', '1800'
            )
          )
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'line_items_on_found_job' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'Gate 3: expected line_items_on_found_job'; END IF;

  -- Gate 12 before completion
  v_open := public.fleet_open_found_work(v_org, v_veh);
  IF jsonb_array_length(v_open) <> 0 THEN
    RAISE EXCEPTION 'Gate 12: expected no open found before completion, got %', v_open;
  END IF;

  UPDATE public.maintenance_work_orders
  SET status = 'in_progress', updated_by = v_actor
  WHERE id = v_wo;
  v_json := public.fleet_claim_completion(v_org, v_wo, v_actor);
  IF coalesce(v_json ->> 'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'completion claim failed: %', v_json;
  END IF;
  v_rec := gen_random_uuid();
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (v_rec, v_org, v_veh, 1000, current_date, 11300, 'completed');
  v_json := public.fleet_finish_completion(v_org, v_wo, v_actor, v_rec);

  v_open := public.fleet_open_found_work(v_org, v_veh);
  IF jsonb_array_length(v_open) <> 2 THEN
    RAISE EXCEPTION 'Gate 12: expected 2 open found after completion, got %', v_open;
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(v_open) e
      WHERE e->>'inspectionJobName' = 'Inspection / diagnostic fee'
        AND e->>'garage' = 'Northside Auto') <> 2 THEN
    RAISE EXCEPTION 'Gate 12: inspectionJobName/garage mismatch %', v_open;
  END IF;

  v_counts := public.fleet_found_work_counts(v_org);
  IF (v_counts->>'total')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Gate 12: counts.total expected 2 got %', v_counts;
  END IF;

  v_line_shock := (
    SELECT l.id FROM public.maintenance_work_order_lines l
    WHERE l.work_order_id = v_wo AND l.component_id = v_shock LIMIT 1
  );

  -- Gate 4: second service closes Brake rotor
  v_wo2 := 'f2222222-2222-4222-8222-222222222202';
  v_json := public.fleet_save_work_order(
    v_org,
    v_actor,
    'in_progress',
    jsonb_build_object('id', v_wo2, 'vehicle_id', v_veh),
    NULL,
    NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'sort_order', 0,
        'component_id', v_rotor,
        'component_name', 'Brake rotor',
        'action', 'replace',
        'labor_amount', 4000,
        'line_total', 4000,
        'items_amount', 0,
        'from_found_line_id', v_line_rotor::text,
        'items', '[]'::jsonb
      )
    )
  );
  IF NOT public.maintenance_found_line_is_open(v_line_rotor) THEN
    RAISE EXCEPTION 'Gate 4: brake rotor should stay open until service completes';
  END IF;

  v_json := public.fleet_claim_completion(v_org, v_wo2, v_actor);
  IF coalesce(v_json ->> 'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'wo2 claim failed: %', v_json;
  END IF;
  v_rec := gen_random_uuid();
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (v_rec, v_org, v_veh, 2000, current_date, 4000, 'completed');
  PERFORM public.fleet_finish_completion(v_org, v_wo2, v_actor, v_rec);
  IF public.maintenance_found_line_is_open(v_line_rotor) THEN
    RAISE EXCEPTION 'Gate 4: brake rotor should be closed after service completes';
  END IF;

  -- Gate 13a (IF-11): found rotor + done rotor must not raise repeat-part alert
  PERFORM public.refresh_repeat_part_alerts(10000, 90, v_veh);
  SELECT count(*) INTO v_alert_count FROM public.part_repeat_alert
  WHERE vehicle_id = v_veh AND component_id = v_rotor AND status = 'open' AND kind = 'component';
  IF v_alert_count <> 0 THEN
    RAISE EXCEPTION 'Gate 13a: expected no open repeat alert for found-then-done rotor, got %', v_alert_count;
  END IF;

  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'draft',
      jsonb_build_object('vehicle_id', v_veh),
      NULL, NULL,
      jsonb_build_array(
        v_line_keys || jsonb_build_object(
          'component_id', v_rotor,
          'line_total', 1,
          'items_amount', 0,
          'fromFoundLineId', v_line_rotor::text,
          'items', '[]'::jsonb
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'found_line_not_open' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'Gate 4: expected found_line_not_open on reuse'; END IF;

  -- Gate 5 wrong car
  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'draft',
      jsonb_build_object('vehicle_id', v_veh2),
      NULL, NULL,
      jsonb_build_array(
        v_line_keys || jsonb_build_object(
          'component_id', v_shock,
          'line_total', 1,
          'items_amount', 0,
          'from_found_line_id', v_line_shock::text,
          'items', '[]'::jsonb
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'found_line_wrong_car' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'Gate 5: expected found_line_wrong_car'; END IF;

  -- Gate 11: void second service reopens brake rotor
  UPDATE public.maintenance_work_orders
  SET voided_at = now(), void_reason = 'if-d1 test void wo2'
  WHERE id = v_wo2;
  IF NOT public.maintenance_found_line_is_open(v_line_rotor) THEN
    RAISE EXCEPTION 'Gate 11: brake rotor should be open again after void';
  END IF;

  -- IF-18 control: two live services both trying to close the same found job
  v_wo_if18_ctrl1 := 'f1818181-1818-4181-8181-181818181811';
  v_wo_if18_ctrl2 := 'f1818181-1818-4181-8181-181818181812';
  PERFORM public.fleet_save_work_order(
    v_org,
    v_actor,
    'in_progress',
    jsonb_build_object('id', v_wo_if18_ctrl1, 'vehicle_id', v_veh),
    NULL,
    NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'sort_order', 0,
        'component_id', v_shock,
        'component_name', 'Shock absorber',
        'action', 'replace',
        'line_total', 1,
        'items_amount', 0,
        'from_found_line_id', v_line_shock::text,
        'items', '[]'::jsonb
      )
    )
  );
  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org,
      v_actor,
      'in_progress',
      jsonb_build_object('id', v_wo_if18_ctrl2, 'vehicle_id', v_veh),
      NULL,
      NULL,
      jsonb_build_array(
        v_line_keys || jsonb_build_object(
          'sort_order', 0,
          'component_id', v_shock,
          'line_total', 1,
          'items_amount', 0,
          'from_found_line_id', v_line_shock::text,
          'items', '[]'::jsonb
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'found_line_not_open' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'IF-18 control: expected found_line_not_open on second live link';
  END IF;
  UPDATE public.maintenance_work_orders
  SET voided_at = now(), void_reason = 'if-r1 test void ctrl1'
  WHERE id = v_wo_if18_ctrl1;

  -- IF-18: voided service frees the found job; another service can close it
  v_wo_if18_b := 'f1818181-1818-4181-8181-181818181821';
  PERFORM public.fleet_save_work_order(
    v_org,
    v_actor,
    'in_progress',
    jsonb_build_object('id', v_wo_if18_b, 'vehicle_id', v_veh),
    NULL,
    NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'sort_order', 0,
        'component_id', v_rotor,
        'component_name', 'Brake rotor',
        'action', 'replace',
        'line_total', 4000,
        'items_amount', 0,
        'from_found_line_id', v_line_rotor::text,
        'items', '[]'::jsonb
      )
    )
  );
  v_json := public.fleet_claim_completion(v_org, v_wo_if18_b, v_actor);
  IF coalesce(v_json ->> 'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'IF-18: wo B claim failed: %', v_json;
  END IF;
  v_rec := gen_random_uuid();
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (v_rec, v_org, v_veh, 2500, current_date, 4000, 'completed');
  PERFORM public.fleet_finish_completion(v_org, v_wo_if18_b, v_actor, v_rec);
  IF public.maintenance_found_line_is_open(v_line_rotor) THEN
    RAISE EXCEPTION 'IF-18: rotor should be closed after service B completes';
  END IF;

  UPDATE public.maintenance_work_orders
  SET voided_at = now(), void_reason = 'if-r1 test void wo B'
  WHERE id = v_wo_if18_b;
  IF NOT public.maintenance_found_line_is_open(v_line_rotor) THEN
    RAISE EXCEPTION 'IF-18: rotor should be open again after voiding service B';
  END IF;

  v_wo_if18_c := 'f1818181-1818-4181-8181-181818181822';
  PERFORM public.fleet_save_work_order(
    v_org,
    v_actor,
    'in_progress',
    jsonb_build_object('id', v_wo_if18_c, 'vehicle_id', v_veh),
    NULL,
    NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'sort_order', 0,
        'component_id', v_rotor,
        'line_total', 4000,
        'items_amount', 0,
        'from_found_line_id', v_line_rotor::text,
        'items', '[]'::jsonb
      )
    )
  );
  v_json := public.fleet_claim_completion(v_org, v_wo_if18_c, v_actor);
  IF coalesce(v_json ->> 'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'IF-18: wo C claim failed: %', v_json;
  END IF;
  v_rec := gen_random_uuid();
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (v_rec, v_org, v_veh, 2600, current_date, 4000, 'completed');
  PERFORM public.fleet_finish_completion(v_org, v_wo_if18_c, v_actor, v_rec);
  IF public.maintenance_found_line_is_open(v_line_rotor) THEN
    RAISE EXCEPTION 'IF-18: rotor should be closed after service C';
  END IF;

  UPDATE public.maintenance_work_orders
  SET voided_at = now(), void_reason = 'if-r1 reopen rotor for IF-19'
  WHERE id = v_wo_if18_c;
  IF NOT public.maintenance_found_line_is_open(v_line_rotor) THEN
    RAISE EXCEPTION 'IF-19 setup: rotor should reopen after voiding service C';
  END IF;

  -- Gate 10: not needed on shock
  v_closed := public.fleet_close_found_work(v_org, v_actor, v_line_shock);
  IF public.maintenance_found_line_is_open(v_line_shock) THEN
    RAISE EXCEPTION 'Gate 10: shock should be closed';
  END IF;
  IF (SELECT closed_reason FROM public.maintenance_work_order_lines WHERE id = v_line_shock)
      IS DISTINCT FROM 'not_needed' THEN
    RAISE EXCEPTION 'Gate 10: closed_reason expected not_needed';
  END IF;
  IF (SELECT closed_by FROM public.maintenance_work_order_lines WHERE id = v_line_shock)
      IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Gate 10: closed_by mismatch';
  END IF;

  v_caught := false;
  BEGIN
    PERFORM public.fleet_close_found_work(v_org, v_actor, v_line_shock);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'found_line_not_open' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'Gate 10: second close expected found_line_not_open'; END IF;

  v_caught := false;
  BEGIN
    UPDATE public.maintenance_work_order_lines
    SET notes = 'edited after close'
    WHERE id = v_line_shock;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'completed work order lines cannot be edited' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'Gate 10: note edit should be blocked'; END IF;

  -- IF-19: draft link does not close found job until service completes
  v_wo_if19 := 'f1919191-1919-4191-8191-191919191901';
  PERFORM public.fleet_save_work_order(
    v_org,
    v_actor,
    'draft',
    jsonb_build_object('id', v_wo_if19, 'vehicle_id', v_veh),
    NULL,
    NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'sort_order', 0,
        'component_id', v_rotor,
        'line_total', 1,
        'items_amount', 0,
        'from_found_line_id', v_line_rotor::text,
        'items', '[]'::jsonb
      )
    )
  );
  IF NOT public.maintenance_found_line_is_open(v_line_rotor) THEN
    RAISE EXCEPTION 'IF-19: rotor should stay open on draft link save';
  END IF;
  v_counts := public.fleet_found_work_counts(v_org);
  IF (v_counts->>'total')::int < 1 THEN
    RAISE EXCEPTION 'IF-19: draft link should still count rotor in totals, got %', v_counts;
  END IF;
  UPDATE public.maintenance_work_orders
  SET status = 'in_progress', updated_by = v_actor
  WHERE id = v_wo_if19;
  v_json := public.fleet_claim_completion(v_org, v_wo_if19, v_actor);
  IF coalesce(v_json ->> 'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'IF-19: draft completion claim failed: %', v_json;
  END IF;
  v_rec := gen_random_uuid();
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (v_rec, v_org, v_veh, 2700, current_date, 1, 'completed');
  PERFORM public.fleet_finish_completion(v_org, v_wo_if19, v_actor, v_rec);
  IF public.maintenance_found_line_is_open(v_line_rotor) THEN
    RAISE EXCEPTION 'IF-19: rotor should close after completing linked service';
  END IF;

  -- Gate 7: cannot edit finished inspection
  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  v_caught := false;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'in_progress',
      jsonb_build_object('discount_amount', 0),
      v_wo, v_ver,
      jsonb_build_array(
        v_line_keys || jsonb_build_object(
          'sort_order', 0,
          'component_id', v_insp,
          'line_total', 8000,
          'items_amount', 0,
          'items', '[]'::jsonb
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'immutable' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'Gate 7: expected immutable on completed inspection'; END IF;

  -- Gate 6: void inspection closes remaining open found on new inspection
  v_wo4 := 'f4444444-4444-4444-8444-444444444404';
  v_json := public.fleet_save_work_order(
    v_org,
    v_actor,
    'in_progress',
    jsonb_build_object('id', v_wo4, 'vehicle_id', v_veh),
    NULL,
    NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'sort_order', 0,
        'component_id', v_insp,
        'component_name', 'Inspection / diagnostic fee',
        'labor_amount', 1000,
        'line_total', 1000,
        'items_amount', 0,
        'recommended', false,
        'items', '[]'::jsonb
      ),
      v_line_keys || jsonb_build_object(
        'sort_order', 1,
        'component_id', v_rotor,
        'recommended', true,
        'line_total', 0,
        'items_amount', 0,
        'items', '[]'::jsonb
      )
    )
  );
  v_line_do := (
    SELECT l.id FROM public.maintenance_work_order_lines l
    WHERE l.work_order_id = v_wo4 AND l.recommended = true LIMIT 1
  );
  v_json := public.fleet_claim_completion(v_org, v_wo4, v_actor);
  IF coalesce(v_json ->> 'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'wo4 claim failed: %', v_json;
  END IF;
  v_rec := gen_random_uuid();
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (v_rec, v_org, v_veh, 3000, current_date, 1000, 'completed');
  PERFORM public.fleet_finish_completion(v_org, v_wo4, v_actor, v_rec);

  IF NOT public.maintenance_found_line_is_open(v_line_do) THEN
    RAISE EXCEPTION 'Gate 6 setup: expected open found on wo4';
  END IF;

  UPDATE public.maintenance_work_orders
  SET voided_at = now(), void_reason = 'if-d1 test void wo4'
  WHERE id = v_wo4;

  IF public.maintenance_found_line_is_open(v_line_do) THEN
    RAISE EXCEPTION 'Gate 6: found should be closed after void';
  END IF;
  IF (SELECT closed_reason FROM public.maintenance_work_order_lines WHERE id = v_line_do)
      IS DISTINCT FROM 'service_deleted' THEN
    RAISE EXCEPTION 'Gate 6: expected service_deleted';
  END IF;

  -- Gate 8: wiper saved normally
  v_line_wiper := (
    SELECT l.id FROM public.maintenance_work_order_lines l
    WHERE l.work_order_id = v_wo AND l.component_id = v_wiper LIMIT 1
  );
  SELECT line_total, items_amount INTO v_total, v_amt
  FROM public.maintenance_work_order_lines WHERE id = v_line_wiper;
  IF v_total IS DISTINCT FROM 3300::numeric OR v_amt IS DISTINCT FROM 1800::numeric THEN
    RAISE EXCEPTION 'Gate 8: wiper expected 3300/1800 got %/%', v_total, v_amt;
  END IF;
  IF (SELECT count(*) FROM public.maintenance_work_order_line_item WHERE work_order_line_id = v_line_wiper) <> 1 THEN
    RAISE EXCEPTION 'Gate 8: wiper should have one item';
  END IF;

  -- Gate 13b (IF-11): two real replaces still raise the alert
  v_wo_ctrl1 := 'f1313131-1313-4313-8313-131313131301';
  v_wo_ctrl2 := 'f1313131-1313-4313-8313-131313131302';
  v_line_ctrl1 := 'f1313131-1313-4313-8313-131313131311';
  v_line_ctrl2 := 'f1313131-1313-4313-8313-131313131312';
  INSERT INTO public.maintenance_work_orders (id, organization_id, vehicle_id, status, closed_at, odometer)
  VALUES
    (v_wo_ctrl1, v_org, v_veh2, 'completed', now() - interval '1 day', 4000),
    (v_wo_ctrl2, v_org, v_veh2, 'completed', now() - interval '20 days', 1000);
  INSERT INTO public.maintenance_work_order_lines (id, work_order_id, component_id, action, recommended, declined)
  VALUES
    (v_line_ctrl1, v_wo_ctrl1, v_rotor, 'replace', false, false),
    (v_line_ctrl2, v_wo_ctrl2, v_rotor, 'replace', false, false);
  PERFORM public.refresh_repeat_part_alerts(10000, 90, v_veh2);
  SELECT count(*) INTO v_alert_count FROM public.part_repeat_alert
  WHERE vehicle_id = v_veh2 AND component_id = v_rotor AND status = 'open' AND kind = 'component';
  IF v_alert_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Gate 13b: expected one open repeat alert for two done rotors, got %', v_alert_count;
  END IF;

  -- Gate 13c (IF-11): found line saved with part_number must not create parts usage
  PERFORM public.apply_parts_usage_for_work_order(v_wo);
  IF EXISTS (SELECT 1 FROM public.maintenance_parts_usage WHERE line_id = v_line_rotor) THEN
    RAISE EXCEPTION 'Gate 13c: found line with part_number must not create maintenance_parts_usage';
  END IF;

  -- IF-26: counts return oldestVehicleId (longest-waiting open found job)
  v_wo_if26 := 'f2626262-2626-4262-8262-262626262601';
  PERFORM public.fleet_save_work_order(
    v_org,
    v_actor,
    'draft',
    jsonb_build_object(
      'id', v_wo_if26,
      'vehicle_id', v_veh2,
      'performed_at_date', (current_date - 60)
    ),
    NULL,
    NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'sort_order', 0,
        'component_id', v_insp,
        'line_total', 100,
        'items_amount', 0,
        'recommended', false,
        'items', '[]'::jsonb
      ),
      v_line_keys || jsonb_build_object(
        'sort_order', 1,
        'component_id', v_wiper,
        'line_total', 0,
        'items_amount', 0,
        'recommended', true,
        'items', '[]'::jsonb
      )
    )
  );
  v_line_if26 := (
    SELECT l.id FROM public.maintenance_work_order_lines l
    WHERE l.work_order_id = v_wo_if26 AND l.recommended = true LIMIT 1
  );
  UPDATE public.maintenance_work_orders
  SET status = 'in_progress', updated_by = v_actor
  WHERE id = v_wo_if26;
  v_json := public.fleet_claim_completion(v_org, v_wo_if26, v_actor);
  IF coalesce(v_json ->> 'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'IF-26: claim failed: %', v_json;
  END IF;
  v_rec := gen_random_uuid();
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (v_rec, v_org, v_veh2, 5000, current_date - 60, 100, 'completed');
  PERFORM public.fleet_finish_completion(v_org, v_wo_if26, v_actor, v_rec);

  v_wo_if26 := 'f2626262-2626-4262-8262-262626262602';
  PERFORM public.fleet_save_work_order(
    v_org,
    v_actor,
    'draft',
    jsonb_build_object(
      'id', v_wo_if26,
      'vehicle_id', v_veh,
      'performed_at_date', current_date
    ),
    NULL,
    NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'sort_order', 0,
        'component_id', v_insp,
        'line_total', 100,
        'items_amount', 0,
        'recommended', false,
        'items', '[]'::jsonb
      ),
      v_line_keys || jsonb_build_object(
        'sort_order', 1,
        'component_id', v_wiper,
        'line_total', 0,
        'items_amount', 0,
        'recommended', true,
        'items', '[]'::jsonb
      )
    )
  );
  UPDATE public.maintenance_work_orders
  SET status = 'in_progress', updated_by = v_actor
  WHERE id = v_wo_if26;
  v_json := public.fleet_claim_completion(v_org, v_wo_if26, v_actor);
  IF coalesce(v_json ->> 'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'IF-26: young WO claim failed: %', v_json;
  END IF;
  v_rec := gen_random_uuid();
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (v_rec, v_org, v_veh, 2800, current_date, 100, 'completed');
  PERFORM public.fleet_finish_completion(v_org, v_wo_if26, v_actor, v_rec);

  v_counts := public.fleet_found_work_counts(v_org);
  IF v_counts->>'oldestVehicleId' IS DISTINCT FROM v_veh2 THEN
    RAISE EXCEPTION 'IF-26: oldestVehicleId expected % got %', v_veh2, v_counts->>'oldestVehicleId';
  END IF;

  RAISE NOTICE 'inspection_findings_db_test: ok';
END $$;

ROLLBACK;
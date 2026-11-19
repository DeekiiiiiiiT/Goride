-- Log service parts outbox — invariants + behaviour (LS-09 … LS-18, gates, done-tests 8–21).

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.catalog_research_job j
  WHERE j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added')
    AND j.group_key NOT LIKE 'v2|%';
  IF v_cnt > 0 THEN RAISE EXCEPTION 'invariant open job key not v2: %', v_cnt; END IF;

  SELECT count(*) INTO v_cnt
  FROM public.parts_sourcing_requests r
  WHERE r.kind = 'add_part_info'
    AND r.status IN ('open', 'in_progress')
    AND coalesce(r.research_group_key, '') NOT LIKE 'v2|%';
  IF v_cnt > 0 THEN RAISE EXCEPTION 'invariant open request key not v2: %', v_cnt; END IF;

  SELECT count(*) INTO v_cnt
  FROM public.parts_sourcing_requests r
  JOIN public.catalog_research_job j ON j.id = r.catalog_research_job_id
  WHERE r.kind = 'add_part_info'
    AND r.status IN ('open', 'in_progress')
    AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added')
    AND r.research_group_key IS DISTINCT FROM j.group_key;
  IF v_cnt > 0 THEN RAISE EXCEPTION 'invariant request/job key mismatch: %', v_cnt; END IF;

  SELECT count(*) INTO v_cnt
  FROM public.parts_sourcing_outbox o
  JOIN public.maintenance_work_order_line_item i ON i.id = o.line_item_id
  WHERE i.item_kind = 'supply'
     OR (i.item_kind = 'part_type' AND i.part_id IS NOT NULL);
  IF v_cnt > 0 THEN RAISE EXCEPTION 'invariant outbox on ineligible item kind: %', v_cnt; END IF;

  SELECT count(*) INTO v_cnt
  FROM public.parts_sourcing_outbox o
  JOIN public.maintenance_work_order_line_item i ON i.id = o.line_item_id
  JOIN public.maintenance_work_order_lines l ON l.id = i.work_order_line_id
  WHERE coalesce(l.recommended, false) OR coalesce(l.declined, false) OR l.voided_at IS NOT NULL;
  IF v_cnt > 0 THEN RAISE EXCEPTION 'invariant outbox on declined/recommended/voided line: %', v_cnt; END IF;

  SELECT count(*) INTO v_cnt
  FROM public.maintenance_work_order_line_item i
  WHERE i.item_kind = 'other'
    AND i.part_number IS NOT NULL
    AND i.part_number !~ '^[A-Za-z0-9-]{1,80}$';
  IF v_cnt > 0 THEN RAISE EXCEPTION 'invariant other part_number format: %', v_cnt; END IF;
END $$;

BEGIN;

DO $$
DECLARE
  v_org_a text := 'lspo-org-a-never-real';
  v_org_b text := 'lspo-org-b-never-real';
  v_org_c text := 'lspo-org-c-never-real';
  v_org_d text := 'lspo-org-d-never-real';
  v_org_e text := 'lspo-org-e-never-real';
  v_veh_a text := 'lspo-veh-a-never-real';
  v_veh_b text := 'lspo-veh-b-never-real';
  v_veh_c text := 'lspo-veh-c-never-real';
  v_veh_d text := 'lspo-veh-d-never-real';
  v_veh_e text := 'lspo-veh-e-never-real';
  v_actor uuid := 'a2222222-2222-4222-8222-222222222222';
  v_vcat uuid := 'f3333333-3333-4333-8333-333333333301';
  v_plat uuid;
  v_eng uuid;
  v_o2 uuid := 'f3333333-3333-4333-8333-333333333302';
  v_supply uuid;
  v_unit uuid;
  v_other_pt uuid;
  v_job_item uuid;
  v_supply_job_item uuid;
  v_wo uuid;
  v_wo2 uuid;
  v_wo_nc uuid;
  v_line uuid;
  v_line_dec uuid;
  v_line_rec uuid;
  v_ver int;
  v_cnt bigint;
  v_ret int;
  v_key text;
  v_key2 text;
  v_parts text[];
  v_origins text[];
  v_ob record;
  v_ob2 record;
  v_ob_car uuid;
  v_json jsonb;
  v_caught boolean;
  v_err text;
  v_req uuid;
  v_job uuid;
  v_job_name text;
  v_job_pn text;
  v_job_fc int;
  v_rec uuid;
  v_origin text;
  v_next timestamptz;
  v_jm_next timestamptz;
  v_i int;
  v_p_row jsonb;
  v_line_keys jsonb := '{
    "system_id": null, "system_code": null, "system_name": null,
    "component_code": null, "condition": null, "brand": null, "part_number": null,
    "part_id": null, "supplier_part_offer_id": null, "qty": null, "unit_price": null,
    "labor_hours": null, "labor_rate": null, "warranty": false, "complimentary": false,
    "declined": false, "values_json": null, "from_found_line_id": null,
    "items": "[]", "items_amount": 0, "line_total": 0, "recommended": false
  }'::jsonb;
BEGIN
  SELECT id INTO v_plat FROM public.vehicle_platform LIMIT 1;
  IF v_plat IS NULL THEN
    INSERT INTO public.vehicle_platform (code, label)
    VALUES ('LSPO-PLAT-NEVER', 'LSPO plat never')
  RETURNING id INTO v_plat;
  END IF;
  SELECT id INTO v_eng FROM public.engine_family LIMIT 1;
  IF v_eng IS NULL THEN
    INSERT INTO public.engine_family (code)
    VALUES ('LSPO-ENG-NEVER')
    RETURNING id INTO v_eng;
  END IF;

  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year,
    platform_id, engine_family_id, engine_code
  ) VALUES (
    v_vcat, 'LSPO', 'NeverMatch', 'LSPO-NM', 2020, 2024, v_plat, v_eng, 'LSPO-ENG'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.maintenance_service_categories (
    id, code, name, kind, is_part, status, position_scheme, position_aware
  ) VALUES (
    v_o2, 'lspo_oxygen_never', 'LSP oxygen never', 'component', true, 'active', 'before_after_catalyst', false
  ) ON CONFLICT (id) DO UPDATE SET position_scheme = EXCLUDED.position_scheme;

  SELECT id INTO v_supply FROM public.maintenance_supply LIMIT 1;
  SELECT id INTO v_unit FROM public.maintenance_unit LIMIT 1;
  IF v_supply IS NULL OR v_unit IS NULL THEN RAISE EXCEPTION 'supply/unit fixture required'; END IF;

  SELECT id INTO v_other_pt FROM public.maintenance_service_categories
  WHERE kind = 'component' AND id <> v_o2 LIMIT 1;
  IF v_other_pt IS NULL THEN RAISE EXCEPTION 'second component fixture required'; END IF;

  SELECT id INTO v_job_item FROM public.maintenance_job_item
  WHERE job_id = v_o2 AND part_type_id = v_other_pt LIMIT 1;
  IF v_job_item IS NULL THEN
    INSERT INTO public.maintenance_job_item (job_id, part_type_id, need)
    VALUES (v_o2, v_other_pt, 'sometimes')
    RETURNING id INTO v_job_item;
  END IF;

  SELECT id INTO v_supply_job_item FROM public.maintenance_job_item
  WHERE job_id = v_o2 AND supply_id = v_supply LIMIT 1;
  IF v_supply_job_item IS NULL THEN
    INSERT INTO public.maintenance_job_item (job_id, supply_id, need)
    VALUES (v_o2, v_supply, 'usually')
    RETURNING id INTO v_supply_job_item;
  END IF;

  FOR v_i IN 1..5 LOOP
    INSERT INTO fleet.vehicles (id, organization_id, license_plate, legacy_kv_id, make, model, year, status, vehicle_catalog_id)
    VALUES (
      CASE v_i
        WHEN 1 THEN v_veh_a WHEN 2 THEN v_veh_b WHEN 3 THEN v_veh_c WHEN 4 THEN v_veh_d ELSE v_veh_e
      END,
      CASE v_i
        WHEN 1 THEN v_org_a WHEN 2 THEN v_org_b WHEN 3 THEN v_org_c WHEN 4 THEN v_org_d ELSE v_org_e
      END,
      'LSPO' || v_i,
      'lspo-leg-' || v_i,
      'LSPO', 'Car', 2020, 'active',
      v_vcat::text
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  v_wo := 'e4444444-4444-4444-8444-444444444401';
  PERFORM public.fleet_save_work_order(
    v_org_a, v_actor, 'draft',
    jsonb_build_object('id', v_wo, 'vehicle_id', v_veh_a),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_o2,
        'component_name', 'LSP oxygen',
        'action', 'replace',
        'positions', jsonb_build_array('before_cat'),
        'items_amount', 0,
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'other', 'item_kind', 'other',
            'item_name', 'Front oxygen sensor', 'unit_label', 'pc', 'qty', '1',
            'part_number', '89467-TEST1'
          )
        )
      )
    )
  );

  SELECT id INTO v_line FROM public.maintenance_work_order_lines WHERE work_order_id = v_wo AND component_id = v_o2 LIMIT 1;

  INSERT INTO public.maintenance_work_order_line_item (
    work_order_id, work_order_line_id, source, job_item_id, item_kind, part_type_id,
    item_name, unit_label, qty, updated_by
  ) VALUES (v_wo, v_line, 'suggested', v_job_item, 'part_type', v_other_pt, 'Typed sensor', 'pc', 1, v_actor);

  INSERT INTO public.maintenance_work_order_line_item (
    work_order_id, work_order_line_id, source, job_item_id, item_kind, supply_id,
    item_name, unit_label, qty, updated_by
  ) VALUES (v_wo, v_line, 'suggested', v_supply_job_item, 'supply', v_supply, 'Shop towel', 'pc', 1, v_actor);

  INSERT INTO public.maintenance_work_order_lines (
    id, work_order_id, component_id, action, declined, line_total, items_amount
  ) VALUES (
    'e4444444-4444-4444-8444-444444444402', v_wo, v_o2, 'replace', true, 0, 0
  );
  v_line_dec := 'e4444444-4444-4444-8444-444444444402';
  INSERT INTO public.maintenance_work_order_line_item (
    work_order_id, work_order_line_id, source, item_kind, item_name, unit_label, qty, updated_by
  ) VALUES (v_wo, v_line_dec, 'other', 'other', 'Declined other', 'pc', 1, v_actor);

  INSERT INTO public.maintenance_work_order_lines (
    id, work_order_id, component_id, action, recommended, line_total, items_amount
  ) VALUES (
    'e4444444-4444-4444-8444-444444444403', v_wo, v_o2, 'replace', true, 0, 0
  );
  v_line_rec := 'e4444444-4444-4444-8444-444444444403';
  INSERT INTO public.maintenance_work_order_line_item (
    work_order_id, work_order_line_id, source, item_kind, item_name, unit_label, qty, updated_by
  ) VALUES (v_wo, v_line_rec, 'other', 'other', 'Recommended other', 'pc', 1, v_actor);

  INSERT INTO public.maintenance_work_order_line_item (
    work_order_id, work_order_line_id, source, item_kind, part_type_id, part_id,
    item_name, unit_label, qty, updated_by
  )
  SELECT v_wo, v_line, 'extra', 'part_type', v_o2, pm.id, 'Found part', 'pc', 1, v_actor
  FROM public.part_master pm LIMIT 1;

  UPDATE public.maintenance_work_orders SET status = 'in_progress', updated_by = v_actor WHERE id = v_wo;
  v_json := public.fleet_claim_completion(v_org_a, v_wo, v_actor);
  IF coalesce(v_json ->> 'claimed', 'false') <> 'true' THEN RAISE EXCEPTION 'claim failed: %', v_json; END IF;
  v_rec := 'c4444444-4444-4444-8444-444444444401';
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (v_rec, v_org_a, v_veh_a, 1000, current_date, 0, 'completed');
  PERFORM public.fleet_finish_completion(v_org_a, v_wo, v_actor, v_rec);

  v_ret := public.parts_sourcing_outbox_queue(v_wo);
  IF v_ret <> 2 THEN RAISE EXCEPTION 'done-test 10: queue first call expected 2 got %', v_ret; END IF;
  SELECT count(*) INTO v_cnt FROM public.parts_sourcing_outbox WHERE work_order_id = v_wo;
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'done-test 10: expected 2 outbox rows got %', v_cnt; END IF;
  v_ret := public.parts_sourcing_outbox_queue(v_wo);
  IF v_ret <> 0 THEN RAISE EXCEPTION 'done-test 10: queue replay expected 0 got %', v_ret; END IF;

  -- LS-14 key checks
  v_key := public.catalog_research_research_group_key_v2(
    v_vcat, v_o2, NULL, NULL, 'AFTERMARKET', 'before_after_catalyst',
    ARRAY['before_cat']::text[], NULL, 'weird:name|with|pipes'
  );
  IF v_key NOT LIKE 'v2|%' THEN RAISE EXCEPTION 'LS-14: key must start v2|'; END IF;
  v_parts := string_to_array(v_key, '|');
  IF cardinality(v_parts) <> 8 THEN RAISE EXCEPTION 'LS-14: expected 8 segments got %', cardinality(v_parts); END IF;

  v_key2 := public.catalog_research_research_group_key_v2(
    v_vcat, v_o2, NULL, NULL, 'AFTERMARKET', 'before_after_catalyst',
    ARRAY['before_cat']::text[], NULL, 'weird:name|with|pipes'
  );
  IF v_key <> v_key2 THEN RAISE EXCEPTION 'LS-14: stable key'; END IF;

  v_key := public.catalog_research_research_group_key_v2(
    v_vcat, v_o2, NULL, NULL, 'AFTERMARKET', 'before_after_catalyst',
    ARRAY['before_cat']::text[], '89467-test1', NULL
  );
  v_key2 := public.catalog_research_research_group_key_v2(
    v_vcat, v_o2, NULL, NULL, 'AFTERMARKET', 'before_after_catalyst',
    ARRAY['before_cat']::text[], '89467-TEST1', NULL
  );
  IF v_key <> v_key2 THEN RAISE EXCEPTION 'LS-14: case-insensitive part number'; END IF;

  v_key2 := public.catalog_research_research_group_key_v2(
    v_vcat, v_o2, NULL, NULL, 'AFTERMARKET', 'before_after_catalyst',
    ARRAY['before_cat']::text[], NULL, 'Front oxygen sensor'
  );
  IF v_key = v_key2 THEN RAISE EXCEPTION 'done-test 18 neg: pn vs name must differ'; END IF;

  v_key := public.catalog_research_research_group_key_v2(
    v_vcat, v_o2, NULL, NULL, 'AFTERMARKET', 'before_after_catalyst',
    ARRAY['before_cat']::text[], NULL, 'Alpha sensor'
  );
  v_key2 := public.catalog_research_research_group_key_v2(
    v_vcat, v_o2, NULL, NULL, 'AFTERMARKET', 'before_after_catalyst',
    ARRAY['before_cat']::text[], NULL, 'Beta sensor'
  );
  IF v_key = v_key2 THEN RAISE EXCEPTION 'done-test 17: different names must differ'; END IF;

  v_key := public.catalog_research_research_group_key_v2(
    v_vcat, v_o2, NULL, NULL, 'AFTERMARKET', 'before_after_catalyst',
    ARRAY['after_cat', 'before_cat']::text[], '89467-TEST1', NULL
  );
  v_key2 := public.catalog_research_research_group_key_v2(
    v_vcat, v_o2, NULL, NULL, 'AFTERMARKET', 'before_after_catalyst',
    ARRAY['before_cat', 'after_cat']::text[], '89467-TEST1', NULL
  );
  IF v_key <> v_key2 THEN RAISE EXCEPTION 'LS-14: sorted codes'; END IF;

  v_p_row := jsonb_build_object(
    'organization_id', v_org_a, 'vehicle_id', v_veh_a,
    'need_text', 'Front oxygen sensor', 'created_by', v_actor::text,
    'maintenance_component_id', v_o2, 'vehicle_catalog_id', v_vcat,
    'platform_id', v_plat, 'engine_family_id', v_eng,
    'urgency', 'normal', 'reply_due_at', null, 'qty', 1,
    'photo_url', null, 'install_side', null, 'install_position', null,
    'fit_descriptor', null, 'match_type', 'AFTERMARKET', 'sent_at', null,
    'old_part_number', '89467-TEST1', 'position_scheme', 'before_after_catalyst',
    'position_codes', jsonb_build_array('before_cat'), 'item_name', 'Front oxygen sensor'
  );

  -- Claim
  SELECT count(*) INTO v_cnt
  FROM (SELECT * FROM public.parts_sourcing_outbox_claim(10)) q;
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'claim: expected 2 got %', v_cnt; END IF;
  SELECT count(*) INTO v_cnt
  FROM (SELECT * FROM public.parts_sourcing_outbox_claim(10)) q;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'claim second: expected 0 got %', v_cnt; END IF;

  SELECT o.* INTO v_ob
  FROM public.parts_sourcing_outbox o
  JOIN public.maintenance_work_order_line_item i ON i.id = o.line_item_id
  WHERE o.work_order_id = v_wo AND i.item_kind = 'other'
  LIMIT 1;

  v_json := public.parts_sourcing_outbox_send(v_ob.id, v_p_row);
  IF v_json ->> 'result' <> 'sent' THEN RAISE EXCEPTION 'done-test 8: send other expected sent got %', v_json; END IF;

  SELECT r.origin, r.research_group_key, r.position_codes, r.catalog_research_job_id
  INTO v_origin, v_key, v_parts, v_job
  FROM public.parts_sourcing_requests r WHERE r.id = (v_json ->> 'requestId')::uuid;
  IF v_origin <> 'service_log' OR v_key NOT LIKE 'v2|%' OR v_parts <> ARRAY['before_cat']::text[] THEN
    RAISE EXCEPTION 'done-test 8 request shape origin=% key=% codes=%', v_origin, v_key, v_parts;
  END IF;
  SELECT j.requested_name, j.requested_part_number, j.fleet_count
  INTO v_job_name, v_job_pn, v_job_fc
  FROM public.catalog_research_job j WHERE j.id = v_job;
  IF v_job_name <> 'Front oxygen sensor' OR v_job_pn <> '89467-TEST1' OR v_job_fc <> 1 THEN
    RAISE EXCEPTION 'done-test 8 job fields name=% pn=% fleet=%', v_job_name, v_job_pn, v_job_fc;
  END IF;

  v_json := public.parts_sourcing_outbox_send(v_ob.id, v_p_row);
  IF v_json ->> 'result' <> 'sent' THEN RAISE EXCEPTION 'gate 2: replay must be sent'; END IF;
  SELECT count(*) INTO v_cnt FROM public.parts_sourcing_requests
  WHERE organization_id = 'lspo-org-a-never-real' AND old_part_number = '89467-TEST1';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'gate 2: expected one request got %', v_cnt; END IF;

  -- Company B — done-tests 11+19
  v_wo2 := 'e4444444-4444-4444-8444-444444444411';
  PERFORM public.fleet_save_work_order(
    v_org_b, v_actor, 'draft',
    jsonb_build_object('id', v_wo2, 'vehicle_id', v_veh_b),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_o2, 'positions', jsonb_build_array('before_cat'),
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'other', 'item_kind', 'other',
            'item_name', 'Front oxygen sensor', 'unit_label', 'pc', 'qty', '1',
            'part_number', '89467-TEST1'
          )
        )
      )
    )
  );
  UPDATE public.maintenance_work_orders SET status = 'in_progress' WHERE id = v_wo2;
  PERFORM public.fleet_claim_completion(v_org_b, v_wo2, v_actor);
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (gen_random_uuid(), v_org_b, v_veh_b, 1000, current_date, 0, 'completed')
  RETURNING id INTO v_rec;
  PERFORM public.fleet_finish_completion(v_org_b, v_wo2, v_actor, v_rec);
  PERFORM public.parts_sourcing_outbox_queue(v_wo2);
  SELECT * INTO v_ob2 FROM public.parts_sourcing_outbox WHERE work_order_id = v_wo2 LIMIT 1;
  v_p_row := v_p_row || jsonb_build_object('organization_id', v_org_b, 'vehicle_id', v_veh_b);
  PERFORM public.parts_sourcing_outbox_claim(5);
  v_json := public.parts_sourcing_outbox_send(v_ob2.id, v_p_row);
  IF v_json ->> 'result' <> 'sent' THEN RAISE EXCEPTION 'company B send failed %', v_json; END IF;
  SELECT j.fleet_count, j.requested_name INTO v_cnt, v_err FROM public.catalog_research_job j WHERE j.id = (v_json ->> 'jobId')::uuid;
  IF v_cnt <> 2 OR v_err <> 'Front oxygen sensor' THEN
    RAISE EXCEPTION 'done-test 11: fleet_count=% requested_name=%', v_cnt, v_err;
  END IF;
  -- v_err holds requested_name from prior SELECT

  -- Company A merge on second WO
  PERFORM public.fleet_save_work_order(
    v_org_a, v_actor, 'draft',
    jsonb_build_object('id', 'e4444444-4444-4444-8444-444444444412', 'vehicle_id', v_veh_a),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_o2, 'positions', jsonb_build_array('before_cat'),
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'other', 'item_kind', 'other',
            'item_name', 'Front oxygen sensor', 'unit_label', 'pc', 'qty', '1',
            'part_number', '89467-TEST1'
          )
        )
      )
    )
  );
  v_wo2 := 'e4444444-4444-4444-8444-444444444412';
  UPDATE public.maintenance_work_orders SET status = 'in_progress' WHERE id = v_wo2;
  PERFORM public.fleet_claim_completion(v_org_a, v_wo2, v_actor);
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (gen_random_uuid(), v_org_a, v_veh_a, 1000, current_date, 0, 'completed')
  RETURNING id INTO v_rec;
  PERFORM public.fleet_finish_completion(v_org_a, v_wo2, v_actor, v_rec);
  PERFORM public.parts_sourcing_outbox_queue(v_wo2);
  SELECT * INTO v_ob2 FROM public.parts_sourcing_outbox WHERE work_order_id = v_wo2 LIMIT 1;
  v_p_row := v_p_row || jsonb_build_object('organization_id', v_org_a, 'vehicle_id', v_veh_a);
  PERFORM public.parts_sourcing_outbox_claim(5);
  v_json := public.parts_sourcing_outbox_send(v_ob2.id, v_p_row);
  IF v_json ->> 'result' <> 'merged' THEN RAISE EXCEPTION 'merge expected got %', v_json; END IF;
  SELECT fleet_count INTO v_cnt FROM public.catalog_research_job WHERE group_key = v_key LIMIT 1;
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'merge must not bump fleet_count'; END IF;

  -- done-test 18 both origins
  v_key := public.catalog_research_research_group_key_v2(
    v_vcat, v_o2, NULL, NULL, 'AFTERMARKET', 'before_after_catalyst',
    ARRAY['before_cat']::text[], '89467-TEST1', 'Front oxygen sensor'
  );
  INSERT INTO public.parts_sourcing_requests (
    organization_id, vehicle_id, need_text, status, kind, origin,
    maintenance_component_id, vehicle_catalog_id, platform_id,
    research_group_key, old_part_number, position_scheme, position_codes
  ) VALUES (
    v_org_c, v_veh_c, 'Find parts', 'open', 'add_part_info', 'find_parts',
    v_o2, v_vcat, v_plat, v_key, '89467-TEST1', 'before_after_catalyst', ARRAY['before_cat']::text[]
  );

  PERFORM public.fleet_save_work_order(
    v_org_d, v_actor, 'draft',
    jsonb_build_object('id', 'e4444444-4444-4444-8444-444444444413', 'vehicle_id', v_veh_d),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_o2, 'positions', jsonb_build_array('before_cat'),
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'other', 'item_kind', 'other',
            'item_name', 'Front oxygen sensor', 'unit_label', 'pc', 'qty', '1',
            'part_number', '89467-TEST1'
          )
        )
      )
    )
  );
  v_wo2 := 'e4444444-4444-4444-8444-444444444413';
  UPDATE public.maintenance_work_orders SET status = 'in_progress' WHERE id = v_wo2;
  PERFORM public.fleet_claim_completion(v_org_d, v_wo2, v_actor);
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (gen_random_uuid(), v_org_d, v_veh_d, 1000, current_date, 0, 'completed')
  RETURNING id INTO v_rec;
  PERFORM public.fleet_finish_completion(v_org_d, v_wo2, v_actor, v_rec);
  PERFORM public.parts_sourcing_outbox_queue(v_wo2);
  SELECT * INTO v_ob2 FROM public.parts_sourcing_outbox WHERE work_order_id = v_wo2 LIMIT 1;
  v_p_row := v_p_row || jsonb_build_object('organization_id', v_org_d, 'vehicle_id', v_veh_d);
  PERFORM public.parts_sourcing_outbox_claim(5);
  v_json := public.parts_sourcing_outbox_send(v_ob2.id, v_p_row);
  IF v_json ->> 'result' <> 'sent' THEN RAISE EXCEPTION 'company D send got %', v_json; END IF;
  SELECT count(DISTINCT j.id) INTO v_cnt
  FROM public.parts_sourcing_requests r
  JOIN public.catalog_research_job j ON j.id = r.catalog_research_job_id
  WHERE r.old_part_number = '89467-TEST1' AND r.research_group_key = v_key;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'done-test 18: expected one job got %', v_cnt; END IF;
  SELECT array_agg(DISTINCT origin ORDER BY origin) INTO v_origins
  FROM public.parts_sourcing_requests WHERE research_group_key = v_key;
  IF v_origins <> ARRAY['find_parts', 'service_log']::text[] THEN
    RAISE EXCEPTION 'done-test 18 origins %', v_origins;
  END IF;

  -- Voided done-test 14
  v_wo2 := 'e4444444-4444-4444-8444-444444444414';
  PERFORM public.fleet_save_work_order(
    v_org_a, v_actor, 'draft',
    jsonb_build_object('id', v_wo2, 'vehicle_id', v_veh_a),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_o2, 'positions', jsonb_build_array('before_cat'),
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'other', 'item_kind', 'other',
            'item_name', 'Void sensor', 'unit_label', 'pc', 'qty', '1'
          )
        )
      )
    )
  );
  UPDATE public.maintenance_work_orders SET status = 'in_progress' WHERE id = v_wo2;
  PERFORM public.fleet_claim_completion(v_org_a, v_wo2, v_actor);
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (gen_random_uuid(), v_org_a, v_veh_a, 1000, current_date, 0, 'completed')
  RETURNING id INTO v_rec;
  PERFORM public.fleet_finish_completion(v_org_a, v_wo2, v_actor, v_rec);
  PERFORM public.parts_sourcing_outbox_queue(v_wo2);
  UPDATE public.maintenance_work_orders SET voided_at = now() WHERE id = v_wo2;
  SELECT * INTO v_ob2 FROM public.parts_sourcing_outbox WHERE work_order_id = v_wo2 LIMIT 1;
  PERFORM public.parts_sourcing_outbox_claim(5);
  v_p_row := v_p_row || jsonb_build_object('organization_id', v_org_a, 'vehicle_id', v_veh_a, 'item_name', 'Void sensor', 'old_part_number', null);
  v_json := public.parts_sourcing_outbox_send(v_ob2.id, v_p_row);
  IF v_json ->> 'result' <> 'cancelled' THEN RAISE EXCEPTION 'void send expected cancelled got %', v_json; END IF;

  -- Revive cancelled on a completed (not voided) work order
  v_wo2 := 'e4444444-4444-4444-8444-444444444420';
  PERFORM public.fleet_save_work_order(
    v_org_a, v_actor, 'draft',
    jsonb_build_object('id', v_wo2, 'vehicle_id', v_veh_a),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_o2, 'positions', jsonb_build_array('before_cat'),
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'other', 'item_kind', 'other',
            'item_name', 'Revive sensor', 'unit_label', 'pc', 'qty', '1'
          )
        )
      )
    )
  );
  UPDATE public.maintenance_work_orders SET status = 'in_progress' WHERE id = v_wo2;
  PERFORM public.fleet_claim_completion(v_org_a, v_wo2, v_actor);
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (gen_random_uuid(), v_org_a, v_veh_a, 1000, current_date, 0, 'completed')
  RETURNING id INTO v_rec;
  PERFORM public.fleet_finish_completion(v_org_a, v_wo2, v_actor, v_rec);
  PERFORM public.parts_sourcing_outbox_queue(v_wo2);
  SELECT * INTO v_ob2 FROM public.parts_sourcing_outbox WHERE work_order_id = v_wo2 LIMIT 1;
  UPDATE public.parts_sourcing_outbox SET state = 'cancelled' WHERE id = v_ob2.id;
  v_ret := public.parts_sourcing_outbox_queue(v_wo2);
  IF v_ret <> 1 THEN RAISE EXCEPTION 'cancel revive expected 1 got %', v_ret; END IF;
  SELECT state INTO v_err FROM public.parts_sourcing_outbox WHERE id = v_ob2.id;
  IF v_err <> 'pending' THEN RAISE EXCEPTION 'cancelled must revive to pending'; END IF;

  -- Not completed done-test 15
  v_wo_nc := 'e4444444-4444-4444-8444-444444444415';
  PERFORM public.fleet_save_work_order(
    v_org_a, v_actor, 'draft',
    jsonb_build_object('id', v_wo_nc, 'vehicle_id', v_veh_a),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_o2, 'positions', jsonb_build_array('before_cat'),
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'other', 'item_kind', 'other',
            'item_name', 'Pending completion', 'unit_label', 'pc', 'qty', '1'
          )
        )
      )
    )
  );
  PERFORM public.parts_sourcing_outbox_queue(v_wo_nc);
  SELECT * INTO v_ob2 FROM public.parts_sourcing_outbox WHERE work_order_id = v_wo_nc LIMIT 1;
  PERFORM public.parts_sourcing_outbox_claim(5);
  v_json := public.parts_sourcing_outbox_send(v_ob2.id, v_p_row || jsonb_build_object('item_name', 'Pending completion'));
  IF v_json ->> 'result' <> 'not_completed' THEN RAISE EXCEPTION 'not_completed expected got %', v_json; END IF;
  SELECT claimed_at IS NULL, state INTO v_caught, v_err FROM public.parts_sourcing_outbox WHERE id = v_ob2.id;
  IF NOT v_caught OR v_err <> 'pending' THEN RAISE EXCEPTION 'not_completed must stay pending unclaimed'; END IF;

  UPDATE public.parts_sourcing_outbox SET created_at = now() - interval '8 days' WHERE id = v_ob2.id;
  PERFORM public.parts_sourcing_outbox_claim(5);
  UPDATE public.parts_sourcing_outbox SET claimed_at = now() WHERE id = v_ob2.id;
  v_json := public.parts_sourcing_outbox_send(v_ob2.id, v_p_row || jsonb_build_object('item_name', 'Pending completion'));
  IF v_json ->> 'result' <> 'cancelled' THEN RAISE EXCEPTION '8d stale expected cancelled got %', v_json; END IF;

  -- Daily limit done-test 13
  FOR v_i IN 1..30 LOOP
    INSERT INTO public.parts_sourcing_requests (
      organization_id, vehicle_id, need_text, status, kind, origin, maintenance_component_id
    ) VALUES (v_org_e, v_veh_e, 'cap ' || v_i, 'open', 'add_part_info', 'find_parts', v_o2);
  END LOOP;
  v_wo2 := 'e4444444-4444-4444-8444-444444444416';
  PERFORM public.fleet_save_work_order(
    v_org_e, v_actor, 'draft',
    jsonb_build_object('id', v_wo2, 'vehicle_id', v_veh_e),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_o2,
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'other', 'item_kind', 'other',
            'item_name', 'Daily cap item', 'unit_label', 'pc', 'qty', '1'
          )
        )
      )
    )
  );
  UPDATE public.maintenance_work_orders SET status = 'in_progress' WHERE id = v_wo2;
  PERFORM public.fleet_claim_completion(v_org_e, v_wo2, v_actor);
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (gen_random_uuid(), v_org_e, v_veh_e, 1000, current_date, 0, 'completed')
  RETURNING id INTO v_rec;
  PERFORM public.fleet_finish_completion(v_org_e, v_wo2, v_actor, v_rec);
  PERFORM public.parts_sourcing_outbox_queue(v_wo2);
  SELECT * INTO v_ob2 FROM public.parts_sourcing_outbox WHERE work_order_id = v_wo2 LIMIT 1;
  PERFORM public.parts_sourcing_outbox_claim(5);
  v_jm_next := (
    date_trunc('day', now() AT TIME ZONE 'America/Jamaica') + interval '1 day 5 minutes')
    AT TIME ZONE 'America/Jamaica';
  v_json := public.parts_sourcing_outbox_send(
    v_ob2.id,
    jsonb_build_object(
      'organization_id', v_org_e, 'vehicle_id', v_veh_e,
      'need_text', 'Daily cap item', 'created_by', v_actor::text,
      'maintenance_component_id', v_o2, 'vehicle_catalog_id', v_vcat,
      'platform_id', v_plat, 'engine_family_id', v_eng,
      'match_type', 'AFTERMARKET', 'item_name', 'Daily cap item'
    )
  );
  IF v_json ->> 'result' <> 'daily_limit' THEN RAISE EXCEPTION 'daily_limit expected got %', v_json; END IF;
  SELECT next_try_at INTO v_next FROM public.parts_sourcing_outbox WHERE id = v_ob2.id;
  IF v_next IS DISTINCT FROM v_jm_next THEN
    RAISE EXCEPTION 'daily_limit next_try_at expected % got %', v_jm_next, v_next;
  END IF;

  UPDATE public.parts_sourcing_requests
  SET created_at = now() - interval '2 days'
  WHERE organization_id = v_org_e AND kind = 'add_part_info';
  PERFORM public.parts_sourcing_outbox_claim(5);
  UPDATE public.parts_sourcing_outbox SET claimed_at = now(), next_try_at = now() WHERE id = v_ob2.id;
  v_json := public.parts_sourcing_outbox_send(
    v_ob2.id,
    jsonb_build_object(
      'organization_id', v_org_e, 'vehicle_id', v_veh_e,
      'need_text', 'Daily cap item', 'created_by', v_actor::text,
      'maintenance_component_id', v_o2, 'vehicle_catalog_id', v_vcat,
      'platform_id', v_plat, 'engine_family_id', v_eng,
      'match_type', 'AFTERMARKET', 'item_name', 'Daily cap item'
    )
  );
  IF v_json ->> 'result' <> 'sent' THEN RAISE EXCEPTION 'after backdate cap expected sent got %', v_json; END IF;

  -- Car not linked done-test 12
  v_wo2 := 'e4444444-4444-4444-8444-444444444417';
  PERFORM public.fleet_save_work_order(
    v_org_a, v_actor, 'draft',
    jsonb_build_object('id', v_wo2, 'vehicle_id', v_veh_a),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_o2,
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'other', 'item_kind', 'other',
            'item_name', 'No catalog', 'unit_label', 'pc', 'qty', '1'
          )
        )
      )
    )
  );
  UPDATE public.maintenance_work_orders SET status = 'completed', closed_at = now() WHERE id = v_wo2;
  v_ret := public.parts_sourcing_outbox_queue(v_wo2);
  IF v_ret <> 1 THEN RAISE EXCEPTION 'car queue expected 1 got %', v_ret; END IF;
  SELECT * INTO v_ob2 FROM public.parts_sourcing_outbox WHERE work_order_id = v_wo2 LIMIT 1;
  v_ob_car := v_ob2.id;
  PERFORM public.parts_sourcing_outbox_claim(5);
  v_json := public.parts_sourcing_outbox_send(
    v_ob_car,
    jsonb_build_object(
      'organization_id', v_org_a, 'vehicle_id', v_veh_a,
      'maintenance_component_id', v_o2, 'vehicle_catalog_id', null,
      'item_name', 'No catalog'
    )
  );
  IF v_json ->> 'result' <> 'car_not_linked' THEN RAISE EXCEPTION 'car_not_linked expected got %', v_json; END IF;
  SELECT reason_code, next_try_at > now() + interval '23 hours' INTO v_err, v_caught
  FROM public.parts_sourcing_outbox WHERE id = v_ob_car;
  IF v_err <> 'car_not_linked' OR NOT v_caught THEN RAISE EXCEPTION 'car_not_linked state'; END IF;

  SELECT o.id INTO v_ob_car
  FROM public.parts_sourcing_outbox o
  WHERE o.work_order_id = v_wo2 AND o.request_id IS NULL
  LIMIT 1;
  UPDATE public.parts_sourcing_outbox
  SET
    created_at = now() - interval '31 days',
    state = 'pending',
    reason_code = 'car_not_linked',
    claimed_at = NULL,
    next_try_at = now()
  WHERE id = v_ob_car;
  v_json := public.parts_sourcing_outbox_retry(v_ob_car, 'car_not_linked');
  IF v_json ->> 'state' <> 'not_sent' THEN RAISE EXCEPTION '31d car_not_linked expected not_sent got %', v_json; END IF;

  -- Error retries LS-13
  SELECT o.* INTO v_ob2
  FROM public.parts_sourcing_outbox o
  JOIN public.maintenance_work_order_line_item i ON i.id = o.line_item_id
  WHERE i.work_order_id = v_wo
    AND i.item_kind = 'part_type'
    AND i.part_id IS NULL
  LIMIT 1;

  v_next := now();
  FOR v_i IN 1..4 LOOP
    UPDATE public.parts_sourcing_outbox SET state = 'pending', tries = v_i - 1, reason_code = 'error', claimed_at = NULL WHERE id = v_ob2.id;
    v_json := public.parts_sourcing_outbox_retry(v_ob2.id, 'error');
    SELECT next_try_at INTO v_next FROM public.parts_sourcing_outbox WHERE id = v_ob2.id;
  END LOOP;
  UPDATE public.parts_sourcing_outbox SET state = 'pending', tries = 4, reason_code = 'error' WHERE id = v_ob2.id;
  v_json := public.parts_sourcing_outbox_retry(v_ob2.id, 'error');
  IF v_json ->> 'state' <> 'not_sent' OR (v_json ->> 'tries')::int <> 5 THEN
    RAISE EXCEPTION '5th error expected not_sent tries=5 got %', v_json;
  END IF;

  UPDATE public.parts_sourcing_outbox
  SET state = 'pending', tries = 0, reason_code = NULL, claimed_at = NULL
  WHERE id = v_ob2.id;
  v_caught := false;
  BEGIN
    PERFORM public.parts_sourcing_outbox_retry(v_ob2.id, 'bogus');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_caught := v_err LIKE '%retry_reason_invalid%';
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected retry_reason_invalid got %', v_err; END IF;

  -- Guards
  UPDATE public.parts_sourcing_outbox
  SET state = 'pending', claimed_at = now(), reason_code = NULL, request_id = NULL
  WHERE id = v_ob2.id;
  v_caught := false;
  BEGIN
    PERFORM public.parts_sourcing_outbox_send(v_ob2.id, v_p_row || jsonb_build_object('organization_id', v_org_b));
  EXCEPTION WHEN OTHERS THEN
    v_caught := SQLERRM LIKE '%outbox_org_mismatch%';
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected outbox_org_mismatch'; END IF;

  UPDATE public.parts_sourcing_outbox
  SET claimed_at = NULL, state = 'pending', request_id = NULL
  WHERE id = v_ob2.id;
  v_caught := false;
  BEGIN
    PERFORM public.parts_sourcing_outbox_send(v_ob2.id, v_p_row);
  EXCEPTION WHEN OTHERS THEN
    v_caught := SQLERRM LIKE '%outbox_not_claimed%';
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'expected outbox_not_claimed'; END IF;

  -- LS-09
  v_wo2 := 'e4444444-4444-4444-8444-444444444419';
  PERFORM public.fleet_save_work_order(
    v_org_a, v_actor, 'draft',
    jsonb_build_object('id', v_wo2, 'vehicle_id', v_veh_a),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_o2,
        'items', jsonb_build_array(
          jsonb_build_object(
            'source', 'other', 'item_kind', 'other',
            'item_name', 'Saved other', 'unit_label', 'pc', 'qty', '1',
            'part_number', '89467-TEST1'
          )
        )
      )
    )
  );
  SELECT i.part_number INTO v_err
  FROM public.maintenance_work_order_line_item i
  JOIN public.maintenance_work_order_lines l ON l.id = i.work_order_line_id
  WHERE l.work_order_id = v_wo2 AND i.item_kind = 'other' LIMIT 1;
  IF v_err <> '89467-TEST1' THEN RAISE EXCEPTION 'LS-09 save other pn'; END IF;

  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_work_order_line_item (
      work_order_id, work_order_line_id, source, item_kind,
      item_name, unit_label, qty, part_number, updated_by
    ) VALUES (v_wo2, v_line, 'other', 'other', 'bad', 'pc', 1, 'bad number!', v_actor);
  EXCEPTION WHEN check_violation THEN v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'LS-09 bad other check'; END IF;

  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_work_order_line_item (
      work_order_id, work_order_line_id, source, item_kind, supply_id,
      item_name, unit_label, qty, part_number, updated_by
    ) VALUES (v_wo2, v_line, 'extra', 'supply', v_supply, 'bad supply', 'pc', 1, 'X', v_actor);
  EXCEPTION WHEN check_violation THEN v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'LS-09 supply pn check'; END IF;

  -- catalog_research_join_or_create_job: same key twice → one job, fleet_count 2, name preserved
  v_key := public.catalog_research_research_group_key_v2(
    v_vcat, v_o2, '', '', '', 'before_after_catalyst', ARRAY['before_cat']::text[], 'PN-JOIN-1', 'Join name A'
  );
  v_json := public.catalog_research_join_or_create_job(
    v_key, v_vcat, v_o2, '', '', 'Join name A', 'PN-JOIN-1', 'service_log'
  );
  IF coalesce((v_json ->> 'newJob')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'join_or_create first newJob';
  END IF;
  v_job := nullif(v_json ->> 'jobId', '')::uuid;

  v_json := public.catalog_research_join_or_create_job(
    v_key, v_vcat, v_o2, '', '', 'Join name B', 'PN-JOIN-2', 'find_parts'
  );
  IF coalesce((v_json ->> 'newJob')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'join_or_create second newJob';
  END IF;
  IF nullif(v_json ->> 'jobId', '')::uuid IS DISTINCT FROM v_job THEN
    RAISE EXCEPTION 'join_or_create job id mismatch';
  END IF;

  SELECT fleet_count, requested_name, requested_part_number
  INTO v_job_fc, v_job_name, v_job_pn
  FROM public.catalog_research_job WHERE id = v_job;
  IF v_job_fc <> 2 THEN RAISE EXCEPTION 'join_or_create fleet_count %', v_job_fc; END IF;
  IF v_job_name <> 'Join name A' THEN RAISE EXCEPTION 'join_or_create name kept'; END IF;
  IF v_job_pn <> 'PN-JOIN-1' THEN RAISE EXCEPTION 'join_or_create pn kept'; END IF;

  RAISE NOTICE 'log_service_parts_outbox_checks: ok';
END $$;

ROLLBACK;
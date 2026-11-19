-- Log service parts that fit — Slice C data (LC-05 … LC-09).

BEGIN;

DO $$
DECLARE
  v_org_a text := 'lsptf-org-a-never-real';
  v_org_b text := 'lsptf-org-b-never-real';
  v_veh_a text := 'lsptf-veh-a-never-real';
  v_veh_b text := 'lsptf-veh-b-never-real';
  v_actor uuid := 'a4444444-4444-4444-8444-444444444401';
  v_catalyst uuid := 'f0000401-0000-4000-8000-000000000401';
  v_part uuid := 'f0000402-0000-4000-8000-000000000402';
  v_part_cat uuid;
  v_vcat uuid := 'f3333333-3333-4333-8333-333333333401';
  v_plat uuid;
  v_eng uuid;
  v_insp uuid;
  v_json jsonb;
  v_wo uuid;
  v_line uuid;
  v_line2 uuid;
  v_key text := 'v2|lsptf-never-real-group-key';
  v_job_id uuid;
  v_cnt int;
  v_a_before int;
  v_b_before int;
  v_caught boolean;
  v_open jsonb;
  v_elem jsonb;
  v_rec uuid;
  v_notice_a uuid;
  v_notice_b uuid;
  v_other_org_notice uuid;
  v_line_keys jsonb := '{
    "system_id": null,
    "system_code": null,
    "system_name": null,
    "component_code": null,
    "condition": null,
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
    "from_found_line_id": null,
    "items": "[]",
    "items_amount": 0,
    "line_total": 0,
    "recommended": false
  }'::jsonb;
BEGIN
  SELECT id INTO v_part_cat FROM public.part_category LIMIT 1;
  IF v_part_cat IS NULL THEN RAISE EXCEPTION 'part_category fixture required'; END IF;

  INSERT INTO public.maintenance_service_categories (
    id, code, name, kind, is_part, status, position_scheme, position_aware
  ) VALUES (
    v_catalyst, 'lsptf_oxygen_never', 'LSPTF oxygen never', 'component', true, 'active',
    'before_after_catalyst', false
  ) ON CONFLICT (id) DO UPDATE SET
    position_scheme = EXCLUDED.position_scheme,
    position_aware = EXCLUDED.position_aware;

  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, maintenance_component_id
  ) VALUES (
    v_part, v_part_cat, 'LSPTF catalyst test part', '89467-LSPTF', 'Denso', 'oem', v_catalyst
  ) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    oem_part_number = EXCLUDED.oem_part_number,
    manufacturer = EXCLUDED.manufacturer;

  SELECT id INTO v_plat FROM public.vehicle_platform LIMIT 1;
  SELECT id INTO v_eng FROM public.engine_family LIMIT 1;
  IF v_plat IS NULL OR v_eng IS NULL THEN RAISE EXCEPTION 'platform/engine fixture required'; END IF;

  INSERT INTO public.vehicle_catalog (
    id, make, model, production_start_year, production_end_year,
    platform_id, engine_family_id, engine_code
  ) VALUES (
    v_vcat, 'LSPTF', 'NeverMatch', 2020, 2024, v_plat, v_eng, 'LSPTF-ENG'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO fleet.vehicles (
    id, organization_id, license_plate, legacy_kv_id, make, model, year, status, vehicle_catalog_id
  ) VALUES
    (v_veh_a, v_org_a, 'LSPTFA', 'lsptf-leg-a', 'LSPTF', 'Car', 2020, 'active', v_vcat::text),
    (v_veh_b, v_org_b, 'LSPTFB', 'lsptf-leg-b', 'LSPTF', 'Car', 2020, 'active', v_vcat::text)
  ON CONFLICT (id) DO NOTHING;

  -- 1. Status check: planned ok, unknown refused (separate vehicle so planned counts stay clean)
  v_wo := gen_random_uuid();
  INSERT INTO public.maintenance_work_orders (
    id, organization_id, vehicle_id, status, version
  ) VALUES (v_wo, v_org_a, v_veh_b, 'planned', 1);

  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_work_orders (
      id, organization_id, vehicle_id, status, version
    ) VALUES (gen_random_uuid(), v_org_a, v_veh_b, 'not_a_status', 1);
  EXCEPTION WHEN check_violation THEN v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'proof 1: expected status check violation'; END IF;

  -- 2. fleet_plan_job catalyst + before_cat + part
  v_json := public.fleet_plan_job(
    v_org_a, v_actor, v_veh_a, v_catalyst, ARRAY['before_cat']::text[], v_part,
    'LSPTF plan note', 'lsptf-idem-key-1'
  );
  IF coalesce((v_json ->> 'created')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'proof 2: created expected true got %', v_json;
  END IF;
  v_wo := nullif(v_json ->> 'workOrderId', '')::uuid;
  v_line := nullif(v_json ->> 'lineId', '')::uuid;

  IF (SELECT status FROM public.maintenance_work_orders WHERE id = v_wo) <> 'planned' THEN
    RAISE EXCEPTION 'proof 2: wo status';
  END IF;
  IF (SELECT count(*) FROM public.maintenance_work_orders WHERE organization_id = v_org_a AND idempotency_key = 'lsptf-idem-key-1') <> 1 THEN
    RAISE EXCEPTION 'proof 2: one wo';
  END IF;
  IF (SELECT count(*) FROM public.maintenance_work_order_lines WHERE work_order_id = v_wo) <> 1 THEN
    RAISE EXCEPTION 'proof 2: one line';
  END IF;
  IF (SELECT recommended FROM public.maintenance_work_order_lines WHERE id = v_line) IS NOT TRUE THEN
    RAISE EXCEPTION 'proof 2: recommended';
  END IF;
  IF (SELECT line_total FROM public.maintenance_work_order_lines WHERE id = v_line) IS DISTINCT FROM 0::numeric THEN
    RAISE EXCEPTION 'proof 2: line_total';
  END IF;
  IF (SELECT positions FROM public.maintenance_work_order_lines WHERE id = v_line) IS DISTINCT FROM ARRAY['before_cat']::text[] THEN
    RAISE EXCEPTION 'proof 2: positions';
  END IF;
  IF (SELECT part_id FROM public.maintenance_work_order_lines WHERE id = v_line) IS DISTINCT FROM v_part THEN
    RAISE EXCEPTION 'proof 2: part_id';
  END IF;

  -- 3. Same idempotency key
  v_json := public.fleet_plan_job(
    v_org_a, v_actor, v_veh_a, v_catalyst, ARRAY['before_cat']::text[], v_part,
    'ignored', 'lsptf-idem-key-1'
  );
  IF coalesce((v_json ->> 'created')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'proof 3: created false';
  END IF;
  IF nullif(v_json ->> 'workOrderId', '')::uuid IS DISTINCT FROM v_wo
     OR nullif(v_json ->> 'lineId', '')::uuid IS DISTINCT FROM v_line THEN
    RAISE EXCEPTION 'proof 3: id mismatch %', v_json;
  END IF;
  IF (SELECT count(*) FROM public.maintenance_work_orders WHERE organization_id = v_org_a AND vehicle_id = v_veh_a AND status = 'planned') <> 1 THEN
    RAISE EXCEPTION 'proof 3: still one wo';
  END IF;

  -- 4. New key, same car/job/places → alreadyListed
  v_json := public.fleet_plan_job(
    v_org_a, v_actor, v_veh_a, v_catalyst, ARRAY['before_cat']::text[], v_part,
    NULL, 'lsptf-idem-key-2'
  );
  IF coalesce((v_json ->> 'alreadyListed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'proof 4: alreadyListed %', v_json;
  END IF;
  IF (SELECT count(*) FROM public.maintenance_work_orders
      WHERE organization_id = v_org_a AND vehicle_id = v_veh_a AND status = 'planned') <> 1 THEN
    RAISE EXCEPTION 'proof 4: no new wo';
  END IF;

  -- 5. position_invalid + vehicle_not_found + part_not_found
  v_caught := false;
  BEGIN
    PERFORM public.fleet_plan_job(
      v_org_a, v_actor, v_veh_a, v_catalyst, ARRAY['LF']::text[], v_part, NULL, 'lsptf-key-lf'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'position_invalid' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'proof 5a: LF invalid'; END IF;

  v_caught := false;
  BEGIN
    PERFORM public.fleet_plan_job(
      v_org_a, v_actor, v_veh_a, v_catalyst, ARRAY['unknown', 'before_cat']::text[], v_part, NULL, 'lsptf-key-unk'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'position_invalid' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'proof 5b: unknown+before_cat'; END IF;

  v_caught := false;
  BEGIN
    PERFORM public.fleet_plan_job(
      v_org_b, v_actor, v_veh_a, v_catalyst, ARRAY['before_cat']::text[], v_part, NULL, 'lsptf-key-wrong-veh'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'vehicle_not_found' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'proof 5c: vehicle_not_found'; END IF;

  v_caught := false;
  BEGIN
    PERFORM public.fleet_plan_job(
      v_org_a, v_actor, v_veh_a, v_catalyst, ARRAY['before_cat']::text[],
      '00000000-0000-4000-8000-000000000999', NULL, 'lsptf-key-bad-part'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'part_not_found' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'proof 5d: part_not_found'; END IF;

  -- 6. fleet_open_found_work planned + inspection
  v_open := public.fleet_open_found_work(v_org_a, v_veh_a);
  SELECT e INTO v_elem
  FROM jsonb_array_elements(v_open) e
  WHERE e->>'lineId' = v_line::text;
  IF v_elem IS NULL THEN RAISE EXCEPTION 'proof 6: planned line missing %', v_open; END IF;
  IF v_elem->>'source' <> 'planned' THEN RAISE EXCEPTION 'proof 6: source planned'; END IF;
  IF nullif(v_elem->>'partId', '')::uuid IS DISTINCT FROM v_part THEN RAISE EXCEPTION 'proof 6: partId'; END IF;
  IF v_elem->>'partName' <> 'LSPTF catalyst test part' THEN RAISE EXCEPTION 'proof 6: partName'; END IF;
  IF v_elem->>'partBrand' <> 'Denso' THEN RAISE EXCEPTION 'proof 6: partBrand'; END IF;
  IF v_elem->>'partNumber' <> '89467-LSPTF' THEN RAISE EXCEPTION 'proof 6: partNumber'; END IF;
  IF (v_elem->'positions')::text <> '["before_cat"]' THEN RAISE EXCEPTION 'proof 6: positions json %', v_elem->'positions'; END IF;
  IF v_elem ? 'inspectionJobName' AND v_elem->>'inspectionJobName' IS NOT NULL THEN
    RAISE EXCEPTION 'proof 6: planned inspectionJobName should be null';
  END IF;

  SELECT id INTO v_insp FROM public.maintenance_service_categories WHERE code = 'inspection_diagnostic_fee';
  IF v_insp IS NULL THEN
    INSERT INTO public.maintenance_service_categories (
      code, name, kind, is_part, quick_job_eligible, status, records_findings
    ) VALUES (
      'inspection_diagnostic_fee', 'Inspection / diagnostic fee', 'component',
      false, true, 'active', true
    ) RETURNING id INTO v_insp;
  END IF;

  v_wo := 'f2222222-2222-4222-8222-222222222501';
  PERFORM public.fleet_save_work_order(
    v_org_a, v_actor, 'draft',
    jsonb_build_object('id', v_wo, 'vehicle_id', v_veh_a, 'provider', 'LSPTF Garage'),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'sort_order', 0,
        'component_id', v_insp,
        'component_name', 'Inspection / diagnostic fee',
        'action', 'inspect',
        'line_total', 5000,
        'labor_amount', 5000
      ),
      v_line_keys || jsonb_build_object(
        'sort_order', 1,
        'component_id', v_catalyst,
        'component_name', 'LSPTF oxygen never',
        'action', 'replace',
        'recommended', true,
        'line_total', 0,
        'items_amount', 0
      )
    )
  );
  SELECT id INTO v_line2 FROM public.maintenance_work_order_lines
  WHERE work_order_id = v_wo AND recommended = true LIMIT 1;

  UPDATE public.maintenance_work_orders SET status = 'in_progress', updated_by = v_actor WHERE id = v_wo;
  PERFORM public.fleet_claim_completion(v_org_a, v_wo, v_actor);
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (gen_random_uuid(), v_org_a, v_veh_a, 1000, current_date, 5000, 'completed')
  RETURNING id INTO v_rec;
  PERFORM public.fleet_finish_completion(v_org_a, v_wo, v_actor, v_rec);

  v_open := public.fleet_open_found_work(v_org_a, v_veh_a);
  SELECT e INTO v_elem FROM jsonb_array_elements(v_open) e WHERE e->>'lineId' = v_line2::text;
  IF v_elem IS NULL THEN RAISE EXCEPTION 'proof 6: inspection line missing'; END IF;
  IF v_elem->>'source' <> 'inspection' THEN RAISE EXCEPTION 'proof 6: source inspection'; END IF;
  IF v_elem->>'inspectionJobName' <> 'Inspection / diagnostic fee' THEN
    RAISE EXCEPTION 'proof 6: inspectionJobName %', v_elem;
  END IF;
  IF NOT (v_elem ? 'lineId' AND v_elem ? 'workOrderId' AND v_elem ? 'vehicleId'
          AND v_elem ? 'jobId' AND v_elem ? 'jobName' AND v_elem ? 'foundDate'
          AND v_elem ? 'daysWaiting' AND v_elem ? 'positions'
          AND v_elem ? 'positionScheme' AND v_elem ? 'positionAware') THEN
    RAISE EXCEPTION 'proof 6: legacy keys missing';
  END IF;

  -- 7. fleet_claim_completion on planned wo → not_claimable
  SELECT w.id INTO v_wo
  FROM public.maintenance_work_orders w
  WHERE w.organization_id = v_org_a AND w.status = 'planned'
  LIMIT 1;
  v_json := public.fleet_claim_completion(v_org_a, v_wo, v_actor);
  IF coalesce(v_json ->> 'claimed', 'true') <> 'false'
     OR v_json ->> 'reason' <> 'not_claimable' THEN
    RAISE EXCEPTION 'proof 7: planned wo %', v_json;
  END IF;

  SELECT l.id INTO v_line
  FROM public.maintenance_work_order_lines l
  JOIN public.maintenance_work_orders w ON w.id = l.work_order_id
  WHERE w.status = 'planned' AND w.organization_id = v_org_a
  LIMIT 1;

  -- 8. Child completed service closes planned found line
  v_wo := 'f2222222-2222-4222-8222-222222222502';
  PERFORM public.fleet_save_work_order(
    v_org_a, v_actor, 'in_progress',
    jsonb_build_object('id', v_wo, 'vehicle_id', v_veh_a),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'sort_order', 0,
        'component_id', v_catalyst,
        'component_name', 'LSPTF oxygen never',
        'action', 'replace',
        'labor_amount', 4000,
        'line_total', 4000,
        'items_amount', 0,
        'from_found_line_id', v_line::text
      )
    )
  );
  IF NOT public.maintenance_found_line_is_open(v_line) THEN
    RAISE EXCEPTION 'proof 8: planned should stay open until child completes';
  END IF;
  PERFORM public.fleet_claim_completion(v_org_a, v_wo, v_actor);
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (gen_random_uuid(), v_org_a, v_veh_a, 2000, current_date, 4000, 'completed')
  RETURNING id INTO v_rec;
  PERFORM public.fleet_finish_completion(v_org_a, v_wo, v_actor, v_rec);
  IF public.maintenance_found_line_is_open(v_line) THEN
    RAISE EXCEPTION 'proof 8: planned line should close after child completes';
  END IF;
  v_open := public.fleet_open_found_work(v_org_a, v_veh_a);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_open) e WHERE e->>'lineId' = v_line::text
  ) THEN
    RAISE EXCEPTION 'proof 8: planned line still on list';
  END IF;

  -- 9. fleet_parts_notices_mark_read org scope
  INSERT INTO public.fleet_parts_notices (organization_id, kind, title, body)
  VALUES (v_org_a, 'catalog_added', 'Part on file', 'A notice')
  RETURNING id INTO v_notice_a;
  INSERT INTO public.fleet_parts_notices (organization_id, kind, title, body)
  VALUES (v_org_b, 'catalog_added', 'Part on file', 'B notice')
  RETURNING id INTO v_notice_b;

  v_cnt := public.fleet_parts_notices_mark_read(
    v_org_a, ARRAY[v_notice_a, v_notice_b]::uuid[]
  );
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'proof 9: mark_read count %', v_cnt; END IF;
  IF (SELECT read_at IS NOT NULL FROM public.fleet_parts_notices WHERE id = v_notice_a) IS NOT TRUE THEN
    RAISE EXCEPTION 'proof 9: org_a read';
  END IF;
  IF (SELECT read_at IS NOT NULL FROM public.fleet_parts_notices WHERE id = v_notice_b) IS NOT FALSE THEN
    RAISE EXCEPTION 'proof 9: org_b must stay unread';
  END IF;

  -- 10. catalog_resolve_request_group
  v_job_id := gen_random_uuid();
  INSERT INTO public.catalog_research_job (
    id, group_key, vehicle_catalog_id, maintenance_component_id, state
  ) VALUES (
    v_job_id, v_key, v_vcat, v_catalyst, 'queued'
  );

  INSERT INTO public.parts_sourcing_requests (
    organization_id, vehicle_id, need_text, status, kind, origin,
    maintenance_component_id, vehicle_catalog_id, platform_id,
    research_group_key, position_scheme, position_codes
  ) VALUES
    (v_org_a, v_veh_a, 'Ask A', 'open', 'add_part_info', 'find_parts',
     v_catalyst, v_vcat, v_plat, v_key, 'before_after_catalyst', ARRAY['before_cat']::text[]),
    (v_org_b, v_veh_b, 'Ask B', 'open', 'add_part_info', 'find_parts',
     v_catalyst, v_vcat, v_plat, v_key, 'before_after_catalyst', ARRAY['before_cat']::text[]);

  v_json := public.catalog_resolve_request_group(v_key, v_part, v_actor);
  IF (v_json ->> 'resolved')::int <> 2 THEN RAISE EXCEPTION 'proof 10: resolved %', v_json; END IF;
  IF (v_json ->> 'companies')::int <> 2 THEN RAISE EXCEPTION 'proof 10: companies'; END IF;
  IF (SELECT state FROM public.catalog_research_job WHERE id = v_job_id) <> 'added' THEN
    RAISE EXCEPTION 'proof 10: job state';
  END IF;
  SELECT count(*) INTO v_cnt FROM public.fleet_parts_notices
  WHERE kind = 'catalog_added'
    AND organization_id IN (v_org_a, v_org_b)
    AND vehicle_catalog_id = v_vcat
    AND maintenance_component_id = v_catalyst
    AND position_codes = ARRAY['before_cat']::text[];
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'proof 10: notice count %', v_cnt; END IF;

  v_json := public.catalog_resolve_request_group(v_key, v_part, v_actor);
  IF (v_json ->> 'resolved')::int <> 0 THEN RAISE EXCEPTION 'proof 10: second call %', v_json; END IF;
  SELECT count(*) INTO v_cnt FROM public.fleet_parts_notices
  WHERE kind = 'catalog_added' AND organization_id IN (v_org_a, v_org_b);
  IF v_cnt <> 4 THEN RAISE EXCEPTION 'proof 10: no duplicate notices %', v_cnt; END IF;

  -- 10b. A later ask in the same group (company B again) → only B is told; A's earlier answer is not repeated.
  INSERT INTO public.parts_sourcing_requests (
    organization_id, vehicle_id, need_text, status, kind, origin,
    maintenance_component_id, vehicle_catalog_id, platform_id,
    research_group_key, position_scheme, position_codes
  ) VALUES
    (v_org_b, v_veh_b, 'Ask B later', 'open', 'add_part_info', 'find_parts',
     v_catalyst, v_vcat, v_plat, v_key, 'before_after_catalyst', ARRAY['before_cat']::text[]);
  SELECT count(*) INTO v_a_before FROM public.fleet_parts_notices WHERE kind = 'catalog_added' AND organization_id = v_org_a;
  SELECT count(*) INTO v_b_before FROM public.fleet_parts_notices WHERE kind = 'catalog_added' AND organization_id = v_org_b;
  v_json := public.catalog_resolve_request_group(v_key, v_part, v_actor);
  IF (v_json ->> 'resolved')::int <> 1 OR (v_json ->> 'companies')::int <> 1 THEN
    RAISE EXCEPTION 'proof 10b: expected one request, one company %', v_json;
  END IF;
  IF (SELECT count(*) FROM public.fleet_parts_notices WHERE kind = 'catalog_added' AND organization_id = v_org_a) <> v_a_before
     OR (SELECT count(*) FROM public.fleet_parts_notices WHERE kind = 'catalog_added' AND organization_id = v_org_b) <> v_b_before + 1 THEN
    RAISE EXCEPTION 'proof 10b: only B gets one new notice';
  END IF;

  v_caught := false;
  BEGIN
    PERFORM public.catalog_resolve_request_group(v_key, '00000000-0000-4000-8000-000000000998', v_actor);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'part_not_found' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'proof 10: part_not_found'; END IF;

  -- 11. Grants
  IF has_function_privilege('authenticated', 'public.fleet_plan_job(text,uuid,text,uuid,text[],uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'proof 11: fleet_plan_job must not grant authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.fleet_parts_notices_mark_read(text,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'proof 11: fleet_parts_notices_mark_read anon';
  END IF;
  IF has_function_privilege('authenticated', 'public.catalog_resolve_request_group(text,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'proof 11: catalog_resolve_request_group authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.fleet_open_found_work(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'proof 11: fleet_open_found_work anon';
  END IF;

  RAISE NOTICE 'log_service_parts_that_fit_checks: ok';
END $$;

ROLLBACK;
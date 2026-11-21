-- Log service positions — invariants + fleet_save_work_order behaviour (LS-05 … LS-08).

DO $$
DECLARE
  v_fixture text[] := ARRAY[
    'none', 'axle', 'four_corners', 'driver_passenger_rear', 'low_high_beam',
    'before_after_catalyst', 'front_rear_side', 'axle_left_right',
    'axle_inner_outer', 'axle_numbered'
  ];
  v_cnt bigint;
  v_bad text;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM unnest(v_fixture) f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    WHERE r.relname = 'maintenance_service_categories'
      AND c.conname = 'maintenance_service_categories_position_scheme_check'
      AND pg_get_constraintdef(c.oid) LIKE '%' || f || '%'
  );
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'fixture scheme missing from position_scheme check: %', v_cnt;
  END IF;

  SELECT string_agg(DISTINCT position_scheme, ', ')
  INTO v_bad
  FROM public.maintenance_service_categories
  WHERE position_scheme IS NOT NULL
    AND NOT (position_scheme = ANY (v_fixture));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'unknown position_scheme values in table: %', v_bad;
  END IF;
END $$;

DO $$
DECLARE
  rec RECORD;
  v_got text[];
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('job', false, 'none', ARRAY[]::text[]),
      ('job', true, 'none', ARRAY['LF','RF','LR','RR']::text[]),
      ('job', false, 'axle', ARRAY['LF','RF','LR','RR','unknown']::text[]),
      ('job', true, 'axle', ARRAY['LF','RF','LR','RR']::text[]),
      ('job', false, 'four_corners', ARRAY['LF','RF','LR','RR','unknown']::text[]),
      ('job', true, 'four_corners', ARRAY['LF','RF','LR','RR']::text[]),
      ('job', false, 'driver_passenger_rear', ARRAY['driver','passenger','rear','unknown']::text[]),
      ('job', true, 'driver_passenger_rear', ARRAY['LF','RF','LR','RR']::text[]),
      ('job', false, 'low_high_beam', ARRAY['low','high','unknown']::text[]),
      ('job', true, 'low_high_beam', ARRAY['LF','RF','LR','RR']::text[]),
      ('job', false, 'before_after_catalyst', ARRAY['before_cat','after_cat','unknown']::text[]),
      ('job', true, 'before_after_catalyst', ARRAY['LF','RF','LR','RR']::text[]),
      ('job', false, 'front_rear_side', ARRAY['front','rear','side','unknown']::text[]),
      ('job', true, 'front_rear_side', ARRAY['LF','RF','LR','RR']::text[]),
      ('job', false, 'axle_left_right', ARRAY['LF','RF','LR','RR','unknown']::text[]),
      ('job', true, 'axle_left_right', ARRAY['LF','RF','LR','RR']::text[]),
      ('job', false, 'axle_inner_outer', ARRAY['LF','RF','LR','RR','unknown']::text[]),
      ('job', true, 'axle_inner_outer', ARRAY['LF','RF','LR','RR']::text[]),
      ('job', false, 'axle_numbered', ARRAY['front','rear','unknown']::text[]),
      ('job', true, 'axle_numbered', ARRAY['LF','RF','LR','RR']::text[]),
      ('front_stabilizer_link', false, 'none', ARRAY['LF','RF']::text[]),
      ('rear_stabilizer_link', false, 'four_corners', ARRAY['LR','RR']::text[])
    ) AS t(code, position_aware, position_scheme, expected)
  LOOP
    v_got := public.maintenance_position_codes_allowed(
      rec.code, rec.position_aware, rec.position_scheme
    );
    IF v_got IS DISTINCT FROM rec.expected THEN
      RAISE EXCEPTION 'SQL twin mismatch code=% aware=% scheme=% got=% expected=%',
        rec.code, rec.position_aware, rec.position_scheme, v_got, rec.expected;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_service_categories c
  WHERE c.kind = 'component'
    AND coalesce(c.position_aware, false) = false
    AND coalesce(c.position_scheme, 'none') = 'none'
    AND lower(c.code) NOT IN (
      'front_stabilizer_link', 'rear_stabilizer_link',
      'brake_fluid', 'brake_master_cylinder', 'tire_pressure', 'wheel_alignment'
    )
    AND c.op_code IS DISTINCT FROM 'LGT-TAIL'
    AND (
      c.code ~* 'tire|brake|wheel'
      OR c.name ~* 'tire|brake|wheel'
      OR c.icon_key ~* 'tire|brake|wheel'
    );
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'C6 guessed-job-left: % rows still on none with tire/brake/wheel match', v_cnt;
  END IF;
END $$;

BEGIN;

DO $$
DECLARE
  v_org text := 'lsp-test-org-never-real';
  v_veh text := 'lsp-test-veh-never-real';
  v_actor uuid := 'a1111111-1111-4111-8111-111111111111';
  v_catalyst uuid := 'f0000201-0000-4000-8000-000000000201';
  v_none uuid := 'f0000202-0000-4000-8000-000000000202';
  v_wheel uuid := 'f0000203-0000-4000-8000-000000000203';
  v_insp uuid;
  v_wo uuid;
  v_line uuid;
  v_ver int;
  v_pos text[];
  v_caught boolean;
  v_err text;
  v_open jsonb;
  v_rec uuid;
  v_json jsonb;
  v_elem jsonb;
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
  INSERT INTO fleet.vehicles (
    id, organization_id, license_plate, legacy_kv_id, make, model, year, status
  ) VALUES (
    v_veh, v_org, 'LSPTEST', 'lsp-legacy-kv-never-real', 'LSP', 'Test', 2020, 'active'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.maintenance_service_categories (
    id, code, name, kind, is_part, status, position_scheme, position_aware
  ) VALUES
    (v_catalyst, 'lsp_oxygen_never', 'LSP oxygen never', 'component', true, 'active', 'before_after_catalyst', false),
    (v_none, 'lsp_none_never', 'LSP none never', 'component', true, 'active', 'none', false),
    (v_wheel, 'lsp_tire_never', 'LSP tire never', 'component', true, 'active', 'four_corners', true)
  ON CONFLICT (id) DO UPDATE SET
    position_scheme = EXCLUDED.position_scheme,
    position_aware = EXCLUDED.position_aware;

  SELECT id INTO v_insp FROM public.maintenance_service_categories WHERE code = 'inspection_diagnostic_fee';
  IF v_insp IS NULL THEN
    INSERT INTO public.maintenance_service_categories (
      code, name, kind, is_part, quick_job_eligible, status, records_findings
    ) VALUES (
      'inspection_diagnostic_fee', 'Inspection / diagnostic fee', 'component',
      false, true, 'active', true
    ) RETURNING id INTO v_insp;
  END IF;

  v_wo := 'f2222222-2222-4222-8222-222222222201';

  -- 1. New line catalyst before_cat
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft',
    jsonb_build_object('id', v_wo, 'vehicle_id', v_veh),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_catalyst,
        'component_name', 'LSP oxygen',
        'action', 'replace',
        'positions', jsonb_build_array('before_cat')
      )
    )
  );
  SELECT positions INTO v_pos FROM public.maintenance_work_order_lines
  WHERE work_order_id = v_wo AND component_id = v_catalyst;
  IF v_pos IS DISTINCT FROM ARRAY['before_cat']::text[] THEN
    RAISE EXCEPTION 'case 1: expected {before_cat} got %', v_pos;
  END IF;

  -- 2. LF on catalyst → position_invalid
  v_caught := false;
  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'draft', jsonb_build_object('id', v_wo), v_wo, v_ver,
      jsonb_build_array(
        v_line_keys || jsonb_build_object(
          'component_id', v_catalyst,
          'component_name', 'LSP oxygen',
          'action', 'replace',
          'positions', jsonb_build_array('LF')
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
  v_caught := SQLERRM LIKE '%position_invalid%';
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'case 2: expected position_invalid'; END IF;

  -- 3. unknown + before_cat invalid; unknown alone ok
  v_caught := false;
  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'draft', jsonb_build_object('id', v_wo), v_wo, v_ver,
      jsonb_build_array(
        v_line_keys || jsonb_build_object(
          'component_id', v_catalyst,
          'positions', jsonb_build_array('unknown', 'before_cat')
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := SQLERRM LIKE '%position_invalid%';
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'case 3a: expected position_invalid for unknown+before_cat'; END IF;

  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft', jsonb_build_object('id', v_wo), v_wo, v_ver,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_catalyst,
        'positions', jsonb_build_array('unknown', 'unknown')
      )
    )
  );
  -- A doubled "Not sure" is still only "Not sure" (duplicates ignored, same as partPositions.ts).
  SELECT positions INTO v_pos FROM public.maintenance_work_order_lines
  WHERE work_order_id = v_wo AND component_id = v_catalyst;
  IF v_pos IS NULL OR cardinality(v_pos) = 0 OR NOT (v_pos <@ ARRAY['unknown']::text[]) THEN
    RAISE EXCEPTION 'case 3b: expected only unknown got %', v_pos;
  END IF;

  -- 4. position-aware: LF+RF ok; unknown invalid
  v_wo := 'f2222222-2222-4222-8222-222222222202';
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft',
    jsonb_build_object('id', v_wo, 'vehicle_id', v_veh),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_wheel,
        'positions', jsonb_build_array('LF', 'RF')
      )
    )
  );
  v_caught := false;
  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'draft', jsonb_build_object('id', v_wo), v_wo, v_ver,
      jsonb_build_array(
        v_line_keys || jsonb_build_object(
          'component_id', v_wheel,
          'positions', jsonb_build_array('unknown')
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := SQLERRM LIKE '%position_invalid%';
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'case 4: unknown on position-aware expected invalid'; END IF;

  -- 5. none job: [] ok; missing positions key keeps null on new line
  v_wo := 'f2222222-2222-4222-8222-222222222203';
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft',
    jsonb_build_object('id', v_wo, 'vehicle_id', v_veh),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_none,
        'positions', jsonb_build_array()
      )
    )
  );
  SELECT positions INTO v_pos FROM public.maintenance_work_order_lines
  WHERE work_order_id = v_wo AND component_id = v_none;
  IF coalesce(array_length(v_pos, 1), 0) <> 0 THEN
    RAISE EXCEPTION 'case 5a: expected empty positions got %', v_pos;
  END IF;

  v_wo := 'f2222222-2222-4222-8222-222222222204';
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft',
    jsonb_build_object('id', v_wo, 'vehicle_id', v_veh),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object('component_id', v_none)
    )
  );
  SELECT positions INTO v_pos FROM public.maintenance_work_order_lines
  WHERE work_order_id = v_wo AND component_id = v_none;
  IF v_pos IS NOT NULL THEN
    RAISE EXCEPTION 'case 5b: expected NULL positions got %', v_pos;
  END IF;

  -- 6–7. Old line on none with {LF}: re-save unchanged; absent key; clear; change fails
  v_wo := 'f2222222-2222-4222-8222-222222222205';
  v_line := 'f3333333-3333-4333-8333-333333333301';
  INSERT INTO public.maintenance_work_orders (id, organization_id, vehicle_id, status, version)
  VALUES (v_wo, v_org, v_veh, 'draft', 1);
  INSERT INTO public.maintenance_work_order_lines (
    id, work_order_id, component_id, action, positions, line_total
  ) VALUES (v_line, v_wo, v_none, 'replace', ARRAY['LF']::text[], 0);

  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft', jsonb_build_object('id', v_wo), v_wo, 1,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'id', v_line,
        'component_id', v_none,
        'positions', jsonb_build_array('LF')
      )
    )
  );
  SELECT positions INTO v_pos FROM public.maintenance_work_order_lines WHERE id = v_line;
  IF v_pos IS DISTINCT FROM ARRAY['LF']::text[] THEN
    RAISE EXCEPTION 'case 6a: expected LF unchanged got %', v_pos;
  END IF;

  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft', jsonb_build_object('id', v_wo), v_wo, v_ver,
    jsonb_build_array(
      v_line_keys || jsonb_build_object('id', v_line, 'component_id', v_none)
    )
  );
  SELECT positions INTO v_pos FROM public.maintenance_work_order_lines WHERE id = v_line;
  IF v_pos IS DISTINCT FROM ARRAY['LF']::text[] THEN
    RAISE EXCEPTION 'case 6b: absent key expected LF kept got %', v_pos;
  END IF;

  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft', jsonb_build_object('id', v_wo), v_wo, v_ver,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'id', v_line,
        'component_id', v_none,
        'positions', jsonb_build_array()
      )
    )
  );
  SELECT positions INTO v_pos FROM public.maintenance_work_order_lines WHERE id = v_line;
  IF coalesce(array_length(v_pos, 1), 0) <> 0 THEN
    RAISE EXCEPTION 'case 6c: cleared positions expected empty got %', v_pos;
  END IF;

  -- restore LF for change test
  UPDATE public.maintenance_work_order_lines SET positions = ARRAY['LF']::text[] WHERE id = v_line;

  v_caught := false;
  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'draft', jsonb_build_object('id', v_wo), v_wo, v_ver,
      jsonb_build_array(
        v_line_keys || jsonb_build_object(
          'id', v_line,
          'component_id', v_none,
          'positions', jsonb_build_array('RF')
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := SQLERRM LIKE '%position_invalid%';
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'case 6d: RF on none job should be invalid'; END IF;

  -- 6e. Code review #2: a saved line moved to another job never keeps positions the new job can't have.
  v_wo := 'f2222222-2222-4222-8222-222222222207';
  v_line := 'f3333333-3333-4333-8333-333333333302';
  INSERT INTO public.maintenance_work_orders (id, organization_id, vehicle_id, status, version)
  VALUES (v_wo, v_org, v_veh, 'draft', 1);
  INSERT INTO public.maintenance_work_order_lines (
    id, work_order_id, component_id, action, positions, line_total
  ) VALUES (v_line, v_wo, v_wheel, 'replace', ARRAY['LF', 'RF']::text[], 0);
  -- wheel → no-places job, no positions sent: they are dropped.
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft', jsonb_build_object('id', v_wo), v_wo, 1,
    jsonb_build_array(v_line_keys || jsonb_build_object('id', v_line, 'component_id', v_none))
  );
  SELECT positions INTO v_pos FROM public.maintenance_work_order_lines WHERE id = v_line;
  IF v_pos IS NOT NULL THEN
    RAISE EXCEPTION 'case 6e-1: job changed to none, expected NULL got %', v_pos;
  END IF;
  -- back to the wheel job with the same positions sent → checked against the wheel job, saved.
  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft', jsonb_build_object('id', v_wo), v_wo, v_ver,
    jsonb_build_array(v_line_keys || jsonb_build_object(
      'id', v_line, 'component_id', v_wheel, 'positions', jsonb_build_array('LF', 'RF')))
  );
  -- wheel → catalyst sending the same LF, RF (unchanged list): still checked, refused.
  v_caught := false;
  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  BEGIN
    PERFORM public.fleet_save_work_order(
      v_org, v_actor, 'draft', jsonb_build_object('id', v_wo), v_wo, v_ver,
      jsonb_build_array(v_line_keys || jsonb_build_object(
        'id', v_line, 'component_id', v_catalyst, 'positions', jsonb_build_array('LF', 'RF')))
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := SQLERRM LIKE '%position_invalid%';
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'case 6e-2: LF,RF kept on a catalyst job should be invalid'; END IF;

  -- 8. Inspection gate: recommended + before_cat at J$0
  v_wo := 'f2222222-2222-4222-8222-222222222206';
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft',
    jsonb_build_object('id', v_wo, 'vehicle_id', v_veh),
    NULL, NULL,
    jsonb_build_array(
      v_line_keys || jsonb_build_object(
        'component_id', v_catalyst,
        'recommended', true,
        'line_total', 0,
        'positions', jsonb_build_array('before_cat')
      )
    )
  );

  -- 9. Found work carries positions after inspection service completes
  UPDATE public.maintenance_work_orders
  SET status = 'in_progress', updated_by = v_actor
  WHERE id = v_wo;
  v_json := public.fleet_claim_completion(v_org, v_wo, v_actor);
  IF coalesce(v_json ->> 'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'case 9: completion claim failed: %', v_json;
  END IF;
  v_rec := gen_random_uuid();
  INSERT INTO public.maintenance_records (
    id, organization_id, vehicle_id, performed_at_miles, performed_at_date, cost, status
  ) VALUES (v_rec, v_org, v_veh, 1000, current_date, 0, 'completed');
  v_json := public.fleet_finish_completion(v_org, v_wo, v_actor, v_rec);

  v_open := public.fleet_open_found_work(v_org, v_veh);
  IF jsonb_array_length(v_open) < 1 THEN
    RAISE EXCEPTION 'case 9: expected open found work, got %', v_open;
  END IF;
  v_elem := v_open -> 0;
  IF v_elem -> 'positions' IS DISTINCT FROM to_jsonb(ARRAY['before_cat']::text[]) THEN
    RAISE EXCEPTION 'case 9: positions expected [before_cat] got %', v_elem -> 'positions';
  END IF;
  IF (v_elem ->> 'positionScheme') IS DISTINCT FROM 'before_after_catalyst' THEN
    RAISE EXCEPTION 'case 9: positionScheme expected before_after_catalyst got %', v_elem ->> 'positionScheme';
  END IF;
END $$;

ROLLBACK;

DO $$ BEGIN RAISE NOTICE 'log_service_positions_checks: ok'; END $$;
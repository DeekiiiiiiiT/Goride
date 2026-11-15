-- Service items D1 behaviour tests (done-tests 1, 2, 3, 7).

BEGIN;

DO $$
DECLARE
  v_unit uuid;
  v_job uuid;
  v_part uuid;
  v_non_part uuid;
  v_supply uuid;
  v_supply2 uuid;
  v_link uuid;
  v_code text;
  v_caught boolean;
  v_schema jsonb;
  v_cnt int;
  v_cat uuid;
  v_check jsonb;
  v_tbc uuid;
  v_img uuid;
  v_used boolean;
BEGIN
  SELECT id INTO v_unit FROM public.maintenance_unit WHERE code = 'piece';
  SELECT id INTO v_job FROM public.maintenance_service_categories WHERE code = 'air_filter';
  SELECT id INTO v_part FROM public.maintenance_service_categories WHERE code = 'spark_plugs';
  SELECT id INTO v_non_part FROM public.maintenance_service_categories WHERE code = 'throttle_body_cleaning';

  IF v_unit IS NULL OR v_job IS NULL OR v_part IS NULL OR v_non_part IS NULL THEN
    RAISE EXCEPTION 'fixture jobs or units missing';
  END IF;

  -- Done-test 1: both items set
  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_job_item (job_id, part_type_id, supply_id, need)
    VALUES (v_job, v_part, gen_random_uuid(), 'usually');
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'expected XOR check when both part_type_id and supply_id are set';
  END IF;

  -- Done-test 1: neither item
  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_job_item (job_id, need)
    VALUES (v_job, 'usually');
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'expected XOR check when neither item is set';
  END IF;

  -- Done-test 1: non-part part_type_id
  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_job_item (job_id, part_type_id, need)
    VALUES (v_job, v_non_part, 'usually');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'job_item_part_type_invalid' THEN
      v_caught := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'expected job_item_part_type_invalid for a non-part category';
  END IF;

  INSERT INTO public.maintenance_supply (name, unit_id)
  VALUES ('si-d1-never-real-supply-alpha', v_unit)
  RETURNING id, code INTO v_supply, v_code;

  INSERT INTO public.maintenance_job_item (job_id, supply_id, need)
  VALUES (v_job, v_supply, 'sometimes')
  RETURNING id INTO v_link;

  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_job_item (job_id, supply_id, need)
    VALUES (v_job, v_supply, 'sometimes');
  EXCEPTION WHEN unique_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'expected unique violation for duplicate active supply link';
  END IF;

  UPDATE public.maintenance_job_item SET removed_at = now() WHERE id = v_link;

  INSERT INTO public.maintenance_job_item (job_id, supply_id, need)
  VALUES (v_job, v_supply, 'sometimes')
  RETURNING id INTO v_link;

  -- Done-test 2: identity locked
  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_supply (name, unit_id)
    VALUES ('si-d1-never-real-supply-beta', v_unit)
    RETURNING id INTO v_supply2;
    UPDATE public.maintenance_job_item SET supply_id = v_supply2 WHERE id = v_link;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'job_item_identity_locked' THEN
      v_caught := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'expected job_item_identity_locked when changing supply_id';
  END IF;

  -- Done-test 3: May-need when Also-do already exists (timing_belt -> water_pump)
  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_job_item (job_id, part_type_id, need)
    SELECT j.id, w.id, 'sometimes'
    FROM public.maintenance_service_categories j
    CROSS JOIN public.maintenance_service_categories w
    WHERE j.code = 'timing_belt' AND w.code = 'water_pump';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'job_item_also_do_clash' THEN
      v_caught := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'expected job_item_also_do_clash when adding May-need that is already Also-do';
  END IF;

  -- Done-test 3: Also-do when May-need already exists
  DELETE FROM public.maintenance_job_item
  WHERE job_id = v_job AND part_type_id = v_part AND removed_at IS NULL;

  INSERT INTO public.maintenance_job_item (job_id, part_type_id, need)
  VALUES (v_job, v_part, 'sometimes');

  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_job_relations (from_category_id, to_category_id, relation_type, note)
    VALUES (v_job, v_part, 'recommended_with', 'si-d1 test relation');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'job_item_also_do_clash' THEN
      v_caught := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'expected job_item_also_do_clash when adding Also-do that is already May-need';
  END IF;

  -- Done-test 7: tidy name
  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_supply (name, unit_id)
    VALUES ('Brake  cleaner', v_unit);
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'expected check_violation for untidy supply name';
  END IF;

  INSERT INTO public.maintenance_supply (name, unit_id)
  VALUES ('Brake cleaner', v_unit);

  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_supply (name, unit_id)
    VALUES ('BRAKE CLEANER', v_unit);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'supply_name_taken' THEN
      v_caught := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'expected supply_name_taken for duplicate active name';
  END IF;

  v_caught := false;
  BEGIN
    INSERT INTO public.maintenance_supply (name, unit_id)
    VALUES (repeat('x', 121), v_unit);
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'expected check_violation for 121-character name';
  END IF;

  INSERT INTO public.maintenance_supply (name, unit_id)
  VALUES ('si-d1-never-real-supply-gamma', v_unit)
  RETURNING code INTO v_code;

  IF v_code !~ '^SUP-[0-9]{5}$' THEN
    RAISE EXCEPTION 'supply code expected SUP-#####, got %', v_code;
  END IF;

  -- Seed assertions
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_job_item i
  JOIN public.maintenance_service_categories j ON j.id = i.job_id
  JOIN public.maintenance_supply s ON s.id = i.supply_id
  WHERE j.code = 'throttle_body_cleaning'
    AND lower(s.name) = lower('Throttle body cleaner')
    AND i.removed_at IS NULL
    AND i.need = 'usually'
    AND i.qty_hint = 1;

  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'expected one throttle_body_cleaning usually link with qty_hint 1, got %', v_cnt;
  END IF;

  SELECT id INTO v_tbc FROM public.maintenance_service_categories WHERE code = 'throttle_body_cleaning';
  IF v_tbc IS NULL THEN
    RAISE EXCEPTION 'throttle_body_cleaning missing for used_ids test';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.maintenance_job_used_ids() u WHERE u = v_tbc) INTO v_used;
  IF v_used THEN
    RAISE EXCEPTION 'throttle_body_cleaning with May-need link must not be in maintenance_job_used_ids()';
  END IF;

  SELECT id INTO v_img FROM public.maintenance_service_categories WHERE code = 'intake_manifold_gasket';
  IF v_img IS NULL THEN
    RAISE EXCEPTION 'intake_manifold_gasket missing for used_ids test';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.maintenance_job_used_ids() u WHERE u = v_img) INTO v_used;
  IF v_used THEN
    RAISE EXCEPTION 'intake_manifold_gasket before May-need link must not be in maintenance_job_used_ids()';
  END IF;

  INSERT INTO public.maintenance_job_item (job_id, part_type_id, need)
  VALUES (v_tbc, v_img, 'sometimes');

  SELECT EXISTS (SELECT 1 FROM public.maintenance_job_used_ids() u WHERE u = v_img) INTO v_used;
  IF v_used THEN
    RAISE EXCEPTION 'intake_manifold_gasket after May-need link must not be in maintenance_job_used_ids()';
  END IF;

  SELECT field_schema INTO v_schema
  FROM public.maintenance_service_categories
  WHERE code = 'throttle_body_cleaning';

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_schema->'fields') f
    WHERE f->>'key' = 'material'
  ) THEN
    RAISE EXCEPTION 'throttle_body_cleaning field_schema must not include material';
  END IF;

  IF to_regclass('public.component_related_supply') IS NOT NULL THEN
    RAISE EXCEPTION 'component_related_supply should be dropped';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'save_related_supply'
  ) THEN
    RAISE EXCEPTION 'save_related_supply should be dropped';
  END IF;

  SELECT id INTO v_cat FROM public.vehicle_catalog LIMIT 1;
  IF v_cat IS NOT NULL THEN
    v_check := public.variant_parts_checklist(v_cat);
    IF v_check ? 'supplies' THEN
      RAISE EXCEPTION 'variant_parts_checklist must not include supplies key';
    END IF;
  END IF;

  RAISE NOTICE 'service_items_db_test: ok';
END $$;

ROLLBACK;

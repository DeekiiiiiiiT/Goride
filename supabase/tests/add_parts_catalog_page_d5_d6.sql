-- D5 + D6: sister cars and fluid car spec (local pg only — do not run on live without review)
INSERT INTO auth.users (id, email)
SELECT gen_random_uuid(), 'd5d6-local@test.local'
WHERE NOT EXISTS (SELECT 1 FROM auth.users LIMIT 1);

DO $d56$
DECLARE
  v_roomy uuid := '3cd9cbf3-a804-4817-82db-400cf6abf13a'::uuid;
  v_json jsonb;
  v_items jsonb;
  v_n int;
  v_labels text;
  v_lone uuid;
  v_actor uuid;
  v_bf_type uuid;
  v_save jsonb;
  v_batch uuid;
  v_val text;
BEGIN
  SELECT id INTO v_actor FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'D5/D6: no auth.users row — create a local user before running this test';
  END IF;

  -- D5: Roomy M900A sisters
  IF NOT EXISTS (SELECT 1 FROM public.vehicle_catalog WHERE id = v_roomy) THEN
    RAISE NOTICE 'D5 skipped: Roomy M900A not on file';
  ELSE
    v_json := public.self_serve_sister_vehicles(ARRAY[v_roomy]);
    v_items := coalesce(v_json->'items', '[]'::jsonb);
    v_n := jsonb_array_length(v_items);
    IF v_n <> 3 THEN
      RAISE EXCEPTION 'D5 failed: expected 3 sisters for Roomy M900A, got %: %', v_n, v_items;
    END IF;
    SELECT string_agg(lower(coalesce(x->>'make', '') || ' ' || coalesce(x->>'model', '') || ' ' || coalesce(x->>'chassis_code', '')), ', ')
    INTO v_labels
    FROM jsonb_array_elements(v_items) AS x;
    IF v_labels !~ 'tank' OR v_labels !~ 'm900a' OR v_labels !~ 'thor' OR v_labels !~ 'm900s'
       OR v_labels !~ 'justy' OR v_labels !~ 'm900f' THEN
      RAISE EXCEPTION 'D5 failed: expected Tank M900A, Thor M900S, Justy M900F; got %', v_labels;
    END IF;
    RAISE NOTICE 'D5 sister Roomy test passed';
  END IF;

  SELECT vc.id INTO v_lone
  FROM public.vehicle_catalog vc
  JOIN public.vehicle_platform vp ON vp.id = vc.platform_id
  WHERE vp.parent_id IS NULL
  GROUP BY vc.id, vc.platform_id
  HAVING (
    SELECT count(*)::int FROM public.vehicle_catalog vc2 WHERE vc2.platform_id = vc.platform_id
  ) = 1
  LIMIT 1;
  IF v_lone IS NULL THEN
    RAISE NOTICE 'D5 lone-car skipped';
  ELSE
    v_n := jsonb_array_length(coalesce(public.self_serve_sister_vehicles(ARRAY[v_lone])->'items', '[]'::jsonb));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'D5 failed: lone parentless car expected 0 sisters, got %', v_n;
    END IF;
    RAISE NOTICE 'D5 lone parentless car test passed';
  END IF;

  -- D6: fluid spec value
  IF NOT EXISTS (SELECT 1 FROM public.vehicle_catalog WHERE id = v_roomy) THEN
    RAISE NOTICE 'D6 skipped: Roomy not on file';
    RETURN;
  END IF;
  SELECT c.id INTO v_bf_type
  FROM public.maintenance_service_categories c
  JOIN public.part_type_spec_field f ON f.part_type_id = c.id AND f.spec_key = 'brake_fluid'
  WHERE c.is_part IS TRUE AND c.part_type_status = 'active'
  LIMIT 1;
  IF v_bf_type IS NULL THEN
    RAISE NOTICE 'D6 skipped: brake fluid type missing';
    RETURN;
  END IF;

  IF public.self_serve_catalog_spec_car_value('brake_fluid', 'Toyota', '2500H-A', 'DOT 3') IS DISTINCT FROM 'Toyota 2500H-A' THEN
    RAISE EXCEPTION 'D6 helper failed for product key';
  END IF;
  IF public.self_serve_catalog_spec_car_value('engine_oil_grade', '', '', '0W-20') IS DISTINCT FROM '0W-20' THEN
    RAISE EXCEPTION 'D6 helper failed for size key';
  END IF;

  v_save := public.save_self_serve_fluid_bundle(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_bf_type,
    'brand', 'Toyota',
    'partNumber', '2500H-A',
    'specKey', 'brake_fluid',
    'specValue', 'DOT 3',
    'evidenceUrl', 'https://example.com/d6-fluid-test',
    'sourceType', 'car_maker_catalogue',
    'partKind', 'oem',
    'fitMode', 'spec',
    'vehicleListings', jsonb_build_array(jsonb_build_object('vehicleId', v_roomy))
  ));
  v_batch := (v_save->>'batchId')::uuid;

  SELECT sv.value INTO v_val
  FROM public.catalog_spec_value sv
  WHERE sv.vehicle_catalog_id = v_roomy AND sv.spec_key = 'brake_fluid' AND sv.scope = 'variant';
  IF v_val IS DISTINCT FROM 'Toyota 2500H-A' THEN
    RAISE EXCEPTION 'D6 failed: expected Toyota 2500H-A, got %', v_val;
  END IF;

  v_save := public.save_self_serve_fluid_bundle(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_bf_type,
    'brand', 'Toyota',
    'partNumber', '2500H-A',
    'specKey', 'brake_fluid',
    'specValue', 'DOT 3',
    'evidenceUrl', 'https://example.com/d6-fluid-test-2',
    'sourceType', 'car_maker_catalogue',
    'partKind', 'oem',
    'fitMode', 'spec',
    'vehicleListings', jsonb_build_array(jsonb_build_object('vehicleId', v_roomy))
  ));
  v_batch := (v_save->>'batchId')::uuid;

  SELECT sv.value INTO v_val
  FROM public.catalog_spec_value sv
  WHERE sv.vehicle_catalog_id = v_roomy AND sv.spec_key = 'brake_fluid' AND sv.scope = 'variant';
  IF v_val IS DISTINCT FROM 'Toyota 2500H-A' THEN
    RAISE EXCEPTION 'D6 re-save failed: expected Toyota 2500H-A, got %', v_val;
  END IF;

  PERFORM public.part_import_undo(v_batch, v_actor);
  RAISE NOTICE 'D5 + D6 passed';
END;
$d56$;

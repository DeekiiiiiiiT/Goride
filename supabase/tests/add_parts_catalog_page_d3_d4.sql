-- D3 + D4: catalog page batch save (local pg only — do not run on live without review)
DO $d34$
DECLARE
  v_actor uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  v_frames text[];
  v_hints jsonb;
  v_cable uuid;
  v_roomy uuid;
  v_tank uuid;
  v_save jsonb;
  v_batch uuid;
  v_parts int;
  v_listings int;
  v_undo jsonb;
BEGIN
  -- D3: frame code from Partsouq-style URL
  v_frames := public.self_serve_link_frame_codes(
    'https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M900A-AGBGE/category/2/diagram/4601/illustration/461556B'
  );
  IF NOT ('M900A' = ANY (v_frames)) THEN
    RAISE EXCEPTION 'D3 failed: expected M900A in %', v_frames;
  END IF;

  v_hints := public.self_serve_link_hints(
    'https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M900A-AGBGE/category/2/diagram/4601/illustration/461556B'
  );
  IF coalesce(v_hints->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'D3 hints failed: %', v_hints;
  END IF;

  SELECT c.id INTO v_cable
  FROM public.maintenance_service_categories c
  WHERE c.is_part IS TRUE AND c.op_code = 'BRK-HB-CABL' AND c.part_type_status = 'active'
  LIMIT 1;
  IF v_cable IS NULL THEN
    RAISE EXCEPTION 'D4 setup: handbrake cable type missing';
  END IF;

  SELECT id INTO v_roomy FROM public.vehicle_catalog
  WHERE upper(coalesce(chassis_code, '')) LIKE '%M900A%' AND make ILIKE 'Toyota' AND model ILIKE '%Roomy%'
  ORDER BY production_start_year NULLS LAST LIMIT 1;
  SELECT id INTO v_tank FROM public.vehicle_catalog
  WHERE upper(coalesce(chassis_code, '')) LIKE '%M900A%' AND make ILIKE 'Toyota' AND model ILIKE '%Tank%'
  ORDER BY production_start_year NULLS LAST LIMIT 1;

  IF v_roomy IS NULL OR v_tank IS NULL THEN
    RAISE NOTICE 'D4 skipped: Roomy/Tank M900A variants not on file (ok on empty DB)';
    RETURN;
  END IF;

  v_save := public.save_self_serve_catalog_page(jsonb_build_object(
    'actorId', v_actor,
    'evidenceUrl', 'https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M900A-AGBGE/category/2/diagram/4601/illustration/461556B',
    'sourceType', 'car_maker_catalogue',
    'catalogCarMaker', 'Toyota',
    'partKind', 'oem',
    'vehicleListings', jsonb_build_array(
      jsonb_build_object('vehicleId', v_roomy, 'trust', 'confirmed'),
      jsonb_build_object('vehicleId', v_tank, 'trust', 'confirmed')
    ),
    'parts', jsonb_build_array(
      jsonb_build_object(
        'partTypeId', v_cable, 'brand', 'Toyota', 'partNumber', '46410-B1011-D34',
        'position', 'front', 'catalogueNumber', 1
      ),
      jsonb_build_object(
        'partTypeId', v_cable, 'brand', 'Toyota', 'partNumber', '46420-B1090-D34',
        'position', 'rear', 'catalogueNumber', 2
      ),
      jsonb_build_object(
        'partTypeId', v_cable, 'brand', 'Toyota', 'partNumber', '46430-B1090-D34',
        'position', 'rear', 'catalogueNumber', 3
      )
    )
  ));

  v_batch := (v_save->>'batchId')::uuid;
  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'D4 failed: no batch id';
  END IF;

  SELECT count(*)::int INTO v_parts
  FROM public.part_import_change pic
  WHERE pic.batch_id = v_batch AND pic.table_name = 'part_master' AND pic.op = 'insert';

  IF v_parts <> 3 THEN
    RAISE EXCEPTION 'D4 failed: expected 3 part_master inserts, got %', v_parts;
  END IF;

  SELECT count(*)::int INTO v_listings
  FROM public.part_import_change pic
  WHERE pic.batch_id = v_batch AND pic.table_name = 'part_listing' AND pic.op = 'insert';

  IF v_listings < 6 THEN
    RAISE EXCEPTION 'D4 failed: expected at least 6 listings, got %', v_listings;
  END IF;

  v_undo := public.part_import_undo(v_batch, v_actor);
  IF coalesce(v_undo->>'ok', 'false') <> 'true' AND v_undo->>'status' IS DISTINCT FROM 'undone' THEN
    -- undo may return ok or status depending on version
    IF NOT EXISTS (SELECT 1 FROM public.part_import_batch WHERE id = v_batch AND status = 'undone') THEN
      RAISE EXCEPTION 'D4 undo failed: %', v_undo;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.part_listing pl
    JOIN public.part_import_change pic ON pic.row_id = pl.id AND pic.batch_id = v_batch
    WHERE pic.table_name = 'part_listing'
  ) THEN
    RAISE EXCEPTION 'D4 undo failed: listings remain';
  END IF;

  RAISE NOTICE 'D3 + D4 passed';
END;
$d34$;

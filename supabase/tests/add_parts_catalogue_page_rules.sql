-- Add parts from a catalogue page: the three database rules from the redesign plan (§6, §7, F-01, F-07, F-09, F-10).
-- Runs on a migrated database (supabase/tests in CI). Creates nothing that survives: every save is undone,
-- every refusal is proved to have written nothing, and the whole file is rolled back at the end.
BEGIN;

-- 1) F-01: link hints re-check trust for the maker the person picked. -------------------------------------
--    With no maker the answer must stay exactly as it was (same keys, same trust).
DO $lh$
DECLARE
  -- No maker in the path: today this is a trusted site used for an unknown maker.
  v_url text := 'https://partsouq.com/en/search/all?q=89467-B1040';
  -- Amayama's Toyota page: the maker is in the path.
  v_amayama text := 'https://www.amayama.com/en/genuine-catalogs/epc/toyota-japan/tank-roomy/m900a/147983/electric/8401';
  v_plain jsonb;
  v_toyota jsonb;
  v_other jsonb;
  v_amayama_plain jsonb;
  v_amayama_subaru jsonb;
  v_blank jsonb;
BEGIN
  v_plain := public.self_serve_link_hints(v_url);
  IF coalesce(v_plain->>'sourceTrust', '') <> 'needs_checking' THEN
    RAISE EXCEPTION 'F-01 failed: no-maker answer changed, expected needs_checking, got %', v_plain;
  END IF;
  IF v_plain ? 'trustMaker' THEN
    RAISE EXCEPTION 'F-01 failed: the no-maker answer must not gain a trustMaker key: %', v_plain;
  END IF;

  -- Picking Toyota on a site trusted for Toyota turns trust to confirmed, and says which maker it was for.
  v_toyota := public.self_serve_link_hints(v_url, 'Toyota');
  IF coalesce(v_toyota->>'sourceTrust', '') <> 'confirmed'
     OR coalesce(v_toyota->>'trustedSite', '') <> 'true'
     OR coalesce(v_toyota->>'trustMaker', '') <> 'Toyota' THEN
    RAISE EXCEPTION 'F-01 failed: Toyota should be confirmed on a Toyota-trusted site: %', v_toyota;
  END IF;

  -- A maker that site is not trusted for stays Needs checking (trust is per maker, not per site).
  v_other := public.self_serve_link_hints(v_url, 'Lexus');
  IF coalesce(v_other->>'sourceTrust', '') <> 'needs_checking' THEN
    RAISE EXCEPTION 'F-01 failed: Lexus is not trusted on partsouq and must stay needs_checking: %', v_other;
  END IF;

  -- The maker picked on screen wins over the maker in the link.
  v_amayama_plain := public.self_serve_link_hints(v_amayama);
  IF coalesce(v_amayama_plain->>'sourceTrust', '') <> 'confirmed'
     OR coalesce(v_amayama_plain->>'catalogMaker', '') <> 'Toyota' THEN
    RAISE EXCEPTION 'F-01 failed: amayama Toyota page should be confirmed with no maker passed: %', v_amayama_plain;
  END IF;
  v_amayama_subaru := public.self_serve_link_hints(v_amayama, 'Subaru');
  IF coalesce(v_amayama_subaru->>'sourceTrust', '') <> 'needs_checking'
     OR coalesce(v_amayama_subaru->>'catalogMaker', '') <> 'Toyota' THEN
    RAISE EXCEPTION 'F-01 failed: a Subaru pick must be checked as Subaru, not Toyota: %', v_amayama_subaru;
  END IF;

  -- A blank maker is the same as no maker.
  v_blank := public.self_serve_link_hints(v_url, '   ');
  IF v_blank ? 'trustMaker' THEN
    RAISE EXCEPTION 'F-01 failed: a blank maker must behave like no maker: %', v_blank;
  END IF;
END
$lh$;

-- 2) F-07 / F-09 / F-10: names written, duplicate number, brand for another brand. --------------------------
DO $save$
DECLARE
  v_actor uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  v_type uuid;
  v_scheme text;
  v_pos text;
  v_side text;
  v_cat smallint;
  v_car_a uuid;
  v_car_b uuid;
  v_suffix text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_save jsonb;
  v_batch uuid;
  v_stored text;
  v_msg text;
  v_before bigint;
  v_after bigint;
  v_manufacturer text;
  i int;
BEGIN
  -- Any active part type that can be fitted to specific cars, so the rules run on a fresh database too.
  SELECT c.id, c.position_scheme INTO v_type, v_scheme
  FROM public.maintenance_service_categories c
  WHERE c.is_part IS TRUE AND c.kind = 'component' AND c.part_type_status = 'active'
    AND c.position_scheme IN ('axle', 'axle_inner_outer', 'axle_numbered', 'four_corners', 'axle_left_right', 'before_after_catalyst')
  ORDER BY (c.op_code = 'BRK-HB-CABL') DESC, c.op_code
  LIMIT 1;
  -- CR-05: a missing fixture fails the check; it never quietly skips the three rules.
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'save rules fixture missing: no active part type that fits specific cars';
  END IF;
  v_pos := CASE WHEN v_scheme = 'before_after_catalyst' THEN 'before_cat' ELSE 'front' END;
  v_side := CASE WHEN v_scheme IN ('four_corners', 'axle_left_right') THEN 'left' ELSE NULL END;
  v_cat := CASE WHEN v_scheme = 'axle_numbered' THEN 1::smallint ELSE NULL END;

  -- The real sample cars when they are on file; otherwise any two cars, so the rules still get tested.
  SELECT id INTO v_car_a FROM public.vehicle_catalog
  WHERE upper(coalesce(chassis_code, '')) LIKE '%M900A%' AND make ILIKE 'Toyota' AND model ILIKE '%Roomy%'
  ORDER BY production_start_year NULLS LAST LIMIT 1;
  SELECT id INTO v_car_b FROM public.vehicle_catalog
  WHERE upper(coalesce(chassis_code, '')) LIKE '%M900A%' AND make ILIKE 'Toyota' AND model ILIKE '%Tank%'
  ORDER BY production_start_year NULLS LAST LIMIT 1;
  IF v_car_a IS NULL OR v_car_b IS NULL THEN
    SELECT id INTO v_car_a FROM public.vehicle_catalog ORDER BY id LIMIT 1;
    SELECT id INTO v_car_b FROM public.vehicle_catalog WHERE id <> v_car_a ORDER BY id LIMIT 1;
  END IF;
  IF v_car_a IS NULL OR v_car_b IS NULL THEN
    -- A fresh database with no cars: add two test cars (rolled back at the end of this file).
    INSERT INTO public.engine_family (id, code)
    VALUES ('e3000001-0000-4000-8000-000000000001'::uuid, 'FX-CPR-ENG')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.vehicle_platform (id, code, maker, label)
    VALUES ('e3000002-0000-4000-8000-000000000001'::uuid, 'FX-CPR-M900A', 'FxToyota', 'Fx CPR M900A')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.vehicle_catalog (
      id, make, model, chassis_code, production_start_year, production_end_year,
      platform_id, engine_family_id, vehicle_class
    ) VALUES
      ('e3000005-0000-4000-8000-000000000001'::uuid, 'FxToyota', 'FxRoomy', 'FX-CPR-A', 2016, 2020,
       'e3000002-0000-4000-8000-000000000001'::uuid, 'e3000001-0000-4000-8000-000000000001'::uuid, 'car'),
      ('e3000005-0000-4000-8000-000000000002'::uuid, 'FxToyota', 'FxTank', 'FX-CPR-B', 2016, 2020,
       'e3000002-0000-4000-8000-000000000001'::uuid, 'e3000001-0000-4000-8000-000000000001'::uuid, 'car')
    ON CONFLICT (id) DO NOTHING;
    v_car_a := 'e3000005-0000-4000-8000-000000000001'::uuid;
    v_car_b := 'e3000005-0000-4000-8000-000000000002'::uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vehicle_catalog WHERE id = v_car_a)
     OR NOT EXISTS (SELECT 1 FROM public.vehicle_catalog WHERE id = v_car_b) THEN
    RAISE EXCEPTION 'save rules fixture missing: could not find or add two cars in vehicle_catalog';
  END IF;

  -- F-07: the save returns the names it wrote, in input order, and each one is the stored name.
  v_save := public.save_self_serve_catalog_page(jsonb_build_object(
    'actorId', v_actor,
    'evidenceUrl', 'https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M900A-AGBGE/x',
    'sourceType', 'car_maker_catalogue',
    'catalogCarMaker', 'Toyota',
    'partKind', 'oem',
    'vehicleListings', jsonb_build_array(
      jsonb_build_object('vehicleId', v_car_a, 'trust', 'confirmed'),
      jsonb_build_object('vehicleId', v_car_b, 'trust', 'confirmed')
    ),
    'parts', jsonb_build_array(
      jsonb_build_object(
        'partTypeId', v_type, 'brand', 'Toyota', 'partNumber', 'SAV-' || v_suffix || '-1',
        'name', 'Front oxygen sensor', 'position', v_pos, 'side', v_side, 'catalogueNumber', v_cat
      ),
      jsonb_build_object(
        'partTypeId', v_type, 'brand', 'Toyota', 'partNumber', 'SAV-' || v_suffix || '-2',
        'name', 'Rear oxygen sensor', 'position', v_pos, 'side', v_side, 'catalogueNumber', v_cat
      )
    )
  ));

  IF jsonb_typeof(v_save->'savedNames') <> 'array' OR jsonb_array_length(v_save->'savedNames') <> 2 THEN
    RAISE EXCEPTION 'F-07 failed: savedNames must list both parts: %', v_save;
  END IF;
  IF v_save->'savedNames'->>0 <> 'Front oxygen sensor' OR v_save->'savedNames'->>1 <> 'Rear oxygen sensor' THEN
    RAISE EXCEPTION 'F-07 failed: savedNames out of input order: %', v_save->'savedNames';
  END IF;
  IF jsonb_array_length(v_save->'partIds') <> 2 THEN
    RAISE EXCEPTION 'F-07 failed: expected two part ids: %', v_save;
  END IF;
  FOR i IN 0..1 LOOP
    SELECT pm.name INTO v_stored
    FROM public.part_master pm
    WHERE pm.id = (v_save->'partIds'->>i)::uuid;
    IF v_stored IS DISTINCT FROM (v_save->'savedNames'->>i) THEN
      RAISE EXCEPTION 'F-07 failed: part % stored as %, savedNames says %', i + 1, v_stored, v_save->'savedNames'->>i;
    END IF;
  END LOOP;
  v_batch := (v_save->>'batchId')::uuid;
  PERFORM public.part_import_undo(v_batch, v_actor);

  -- F-10: the same number twice on one page is refused, naming both rows, and writes nothing.
  --        The two rows are written differently (case and spaces) to prove the numbers are compared properly.
  SELECT count(*) INTO v_before FROM public.part_import_batch;
  v_msg := NULL;
  BEGIN
    PERFORM public.save_self_serve_catalog_page(jsonb_build_object(
      'actorId', v_actor,
      'evidenceUrl', 'https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M900A-AGBGE/x',
      'sourceType', 'car_maker_catalogue',
      'catalogCarMaker', 'Toyota',
      'partKind', 'oem',
      'vehicleListings', jsonb_build_array(jsonb_build_object('vehicleId', v_car_a, 'trust', 'confirmed')),
      'parts', jsonb_build_array(
        jsonb_build_object('partTypeId', v_type, 'brand', 'Toyota', 'partNumber', 'DUP-' || v_suffix || '-A', 'position', v_pos, 'side', v_side, 'catalogueNumber', v_cat),
        jsonb_build_object('partTypeId', v_type, 'brand', 'Toyota', 'partNumber', 'dup ' || v_suffix || ' a', 'position', v_pos, 'side', v_side, 'catalogueNumber', v_cat)
      )
    ));
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  IF v_msg IS NULL THEN
    RAISE EXCEPTION 'F-10 failed: a repeated part number was not refused';
  END IF;
  IF v_msg NOT LIKE '%same number as part%' OR v_msg NOT LIKE '%Part 2%' OR v_msg NOT LIKE '%part 1%' THEN
    RAISE EXCEPTION 'F-10 failed: the message must name both rows, got: %', v_msg;
  END IF;
  SELECT count(*) INTO v_after FROM public.part_import_batch;
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'F-10 failed: the refusal still wrote a batch row (% -> %)', v_before, v_after;
  END IF;

  -- F-09: "another brand" with no brand is refused, and the car maker is never used instead.
  SELECT count(*) INTO v_before FROM public.part_import_batch;
  v_msg := NULL;
  BEGIN
    PERFORM public.save_self_serve_catalog_page(jsonb_build_object(
      'actorId', v_actor,
      'evidenceUrl', 'https://jnbk-brakes.com/parts/xyz',
      'sourceType', 'part_maker_catalogue',
      'catalogCarMaker', 'Toyota',   -- the car maker is on the request; it must not become the brand
      'partKind', 'aftermarket',
      'vehicleListings', jsonb_build_array(jsonb_build_object('vehicleId', v_car_a, 'trust', 'needs_checking', 'reason', 'Seen in a shop''s list only')),
      'parts', jsonb_build_array(
        jsonb_build_object('partTypeId', v_type, 'partNumber', 'BRD-' || v_suffix || '-1', 'position', v_pos, 'side', v_side, 'catalogueNumber', v_cat)
      )
    ));
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  IF v_msg IS NULL THEN
    RAISE EXCEPTION 'F-09 failed: an another-brand part with no brand was saved';
  END IF;
  IF v_msg NOT LIKE '%Which brand made these parts%' THEN
    RAISE EXCEPTION 'F-09 failed: expected the brand message, got: %', v_msg;
  END IF;
  SELECT count(*) INTO v_after FROM public.part_import_batch;
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'F-09 failed: the refusal still wrote a batch row (% -> %)', v_before, v_after;
  END IF;

  -- ... and with a brand it saves, stored under that brand (never the car maker).
  v_save := public.save_self_serve_catalog_page(jsonb_build_object(
    'actorId', v_actor,
    'evidenceUrl', 'https://jnbk-brakes.com/parts/xyz',
    'sourceType', 'part_maker_catalogue',
    'catalogCarMaker', 'Toyota',
    'partKind', 'aftermarket',
    'brand', 'NiBK',
    'vehicleListings', jsonb_build_array(jsonb_build_object('vehicleId', v_car_a, 'trust', 'needs_checking', 'reason', 'Seen in a shop''s list only')),
    'parts', jsonb_build_array(
      jsonb_build_object('partTypeId', v_type, 'brand', 'NiBK', 'partNumber', 'BRD-' || v_suffix || '-2', 'position', v_pos, 'side', v_side, 'catalogueNumber', v_cat)
    )
  ));
  v_batch := (v_save->>'batchId')::uuid;
  SELECT pm.manufacturer INTO v_manufacturer
  FROM public.part_master pm
  WHERE pm.id = (v_save->'partIds'->>0)::uuid;
  IF upper(coalesce(v_manufacturer, '')) <> 'NIBK' THEN
    RAISE EXCEPTION 'F-09 failed: stored under % instead of NiBK', v_manufacturer;
  END IF;
  IF coalesce(v_save->'savedNames'->>0, '') = '' THEN
    RAISE EXCEPTION 'F-07 failed: another-brand save returned no name: %', v_save;
  END IF;
  PERFORM public.part_import_undo(v_batch, v_actor);
END
$save$;

ROLLBACK;

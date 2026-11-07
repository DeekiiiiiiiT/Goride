-- Phase 4 Fleet brakes e2e (Fx data only). Idempotent; COMMIT.
-- Links mm_f01_5179kz to FxToyota FxRoomy catalog + pad group with 5 brand numbers.

BEGIN;

DO $$
DECLARE
  v_brk_pads uuid;
  v_cat uuid;
  v_plat_toyota uuid := 'e2e0f006-0000-4000-8000-000000000001'::uuid;
  v_plat_suzuki uuid := 'e2e0f006-0000-4000-8000-000000000002'::uuid;
  v_plat_mazda uuid := 'e2e0f006-0000-4000-8000-000000000003'::uuid;
  v_plat_ford uuid := 'e2e0f006-0000-4000-8000-000000000004'::uuid;
  -- The Rush is a different car from the Roomy, so it gets its own body (never a twin).
  v_plat_toyota_rush uuid := 'e2e0f006-0000-4000-8000-000000000005'::uuid;
  v_eng uuid := 'e2000001-0000-4000-8000-000000000001'::uuid;
  v_roomy uuid := 'e2e0f005-0000-4000-8000-000000000010'::uuid;
  v_swift uuid := 'e2e0f005-0000-4000-8000-000000000011'::uuid;
  v_demio uuid := 'e2e0f005-0000-4000-8000-000000000012'::uuid;
  v_rush uuid := 'e2e0f005-0000-4000-8000-000000000013'::uuid;
  v_fiesta uuid := 'e2e0f005-0000-4000-8000-000000000014'::uuid;
  v_owner uuid := '10200001-0000-4000-8000-000000000001'::uuid;
  v_g uuid := 'e2e0f00f-0000-4000-8000-000000000001'::uuid;
  v_org text := 'cccccccc-cccc-4ccc-8ccc-0000000000f1';
  v_veh text := 'mm_f01_5179kz';
  v_kv text := 'mm_kv_5179kz';
  v_pm1 uuid := 'e2e0f00f-0000-4000-8000-000000000101'::uuid;
  v_pm2 uuid := 'e2e0f00f-0000-4000-8000-000000000102'::uuid;
  v_pm3 uuid := 'e2e0f00f-0000-4000-8000-000000000103'::uuid;
  v_pm4 uuid := 'e2e0f00f-0000-4000-8000-000000000104'::uuid;
  v_pm5 uuid := 'e2e0f00f-0000-4000-8000-000000000105'::uuid;
BEGIN
  SELECT id INTO v_brk_pads FROM public.maintenance_service_categories
  WHERE op_code = 'BRK-PADS' AND is_part IS TRUE LIMIT 1;
  IF v_brk_pads IS NULL THEN
    RAISE EXCEPTION 'roomy_brakes_fleet_seed: BRK-PADS missing';
  END IF;
  v_cat := public.guided_category_id('BRK-PADS');

  INSERT INTO public.vehicle_platform (id, code, maker, label)
  VALUES
    (v_plat_toyota, 'FX-FLEET-TOY', 'FxToyota', 'Fx fleet Toyota body'),
    (v_plat_suzuki, 'FX-FLEET-SUZ', 'FxSuzuki', 'Fx fleet Suzuki body'),
    (v_plat_mazda, 'FX-FLEET-MAZ', 'FxMazda', 'Fx fleet Mazda body'),
    (v_plat_ford, 'FX-FLEET-FRD', 'FxFord', 'Fx fleet Ford body'),
    (v_plat_toyota_rush, 'FX-FLEET-TOY-RUSH', 'FxToyota', 'Fx fleet Toyota Rush body')
  ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, maker = EXCLUDED.maker, label = EXCLUDED.label;

  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, engine_code, production_start_year, production_end_year,
    platform_id, engine_family_id, vehicle_class
  ) VALUES
    (v_roomy, 'FxToyota', 'FxRoomy', 'FX-M900A', 'FX-1KR', 2018, 2022, v_plat_toyota, v_eng, 'car'),
    (v_swift, 'FxSuzuki', 'FxSwift', 'FX-ZC33S', 'FX-K14C', 2017, 2023, v_plat_suzuki, v_eng, 'car'),
    (v_demio, 'FxMazda', 'FxDemio', 'FX-DE3FS', 'FX-ZJ-VE', 2007, 2014, v_plat_mazda, v_eng, 'car'),
    (v_rush, 'FxToyota', 'FxRush', 'FX-J210E', 'FX-3SZ', 2006, 2016, v_plat_toyota_rush, v_eng, 'car'),
    (v_fiesta, 'FxFord', 'FxFiesta', 'FX-B299', 'FX-1.6', 2008, 2017, v_plat_ford, v_eng, 'car')
  ON CONFLICT (id) DO UPDATE SET
    make = EXCLUDED.make, model = EXCLUDED.model, chassis_code = EXCLUDED.chassis_code,
    engine_code = EXCLUDED.engine_code, production_start_year = EXCLUDED.production_start_year,
    production_end_year = EXCLUDED.production_end_year, platform_id = EXCLUDED.platform_id,
    engine_family_id = EXCLUDED.engine_family_id;

  INSERT INTO public.part_interchange_group (id, code, label, fit_scope)
  VALUES (v_g, 'FX-RB-FLEET-PADS', 'Fx fleet pads group', 'body')
  ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, label = EXCLUDED.label;

  INSERT INTO public.part_master (id, category_id, name, oem_part_number, manufacturer, part_kind,
    interchange_group_id, maintenance_component_id, evidence_url, catalog_decision, source_type, updated_at)
  VALUES
    (v_pm1, v_cat, 'Fx front pad A', 'FX-PAD-A', 'FxBrandA', 'oem', v_g, v_brk_pads, 'https://fx-evidence.example/a', 'confirmed', 'part_maker_catalogue', now()),
    (v_pm2, v_cat, 'Fx front pad B', 'FX-PAD-B', 'FxBrandB', 'aftermarket', v_g, v_brk_pads, 'https://fx-evidence.example/b', 'confirmed', 'part_maker_catalogue', now()),
    (v_pm3, v_cat, 'Fx front pad C', 'FX-PAD-C', 'FxBrandC', 'aftermarket', v_g, v_brk_pads, 'https://fx-evidence.example/c', 'confirmed', 'part_maker_catalogue', now()),
    (v_pm4, v_cat, 'Fx front pad D', 'FX-PAD-D', 'FxBrandD', 'aftermarket', v_g, v_brk_pads, 'https://fx-evidence.example/d', 'confirmed', 'part_maker_catalogue', now()),
    (v_pm5, v_cat, 'Fx front pad E', 'FX-PAD-E', 'FxBrandE', 'aftermarket', v_g, v_brk_pads, 'https://fx-evidence.example/e', 'pending', 'other', now())
  ON CONFLICT (id) DO UPDATE SET
    interchange_group_id = EXCLUDED.interchange_group_id,
    maintenance_component_id = EXCLUDED.maintenance_component_id,
    catalog_decision = EXCLUDED.catalog_decision,
    manufacturer = EXCLUDED.manufacturer,
    oem_part_number = EXCLUDED.oem_part_number;

  DELETE FROM public.part_listing WHERE interchange_group_id = v_g;

  -- Keep only the Fx fleet pad group on the FxRoomy catalog (trust / other e2e seeds may add more).
  DELETE FROM public.part_listing
  WHERE vehicle_catalog_id = v_roomy
    AND interchange_group_id IS DISTINCT FROM v_g;

  INSERT INTO public.part_listing (
    id, interchange_group_id, vehicle_catalog_id, position, year_from, year_to,
    evidence_url, origin, trust, trust_reason, trust_set_by, trust_set_at
  ) VALUES
    ('e2e0f00f-0000-4000-8000-000000000201', v_g, v_roomy, 'front', 2018, 2022, 'https://fx-evidence.example/roomy', 'manual', 'confirmed', NULL, 'owner', now()),
    ('e2e0f00f-0000-4000-8000-000000000202', v_g, v_swift, 'front', NULL, NULL, 'https://fx-evidence.example/swift', 'manual', 'confirmed', NULL, 'owner', now()),
    ('e2e0f00f-0000-4000-8000-000000000203', v_g, v_demio, 'front', NULL, NULL, 'https://fx-evidence.example/demio', 'manual', 'needs_checking', 'Fx chassis note', 'owner', now()),
    ('e2e0f00f-0000-4000-8000-000000000204', v_g, v_fiesta, 'front', 2010, 2013, 'https://fx-evidence.example/fiesta', 'manual', 'needs_checking', 'Fx years only 2010-2013', 'owner', now())
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.vehicle_catalog SET
    front_brake_type = 'Ventilated disc',
    rear_brake_type = 'Drum',
    brake_size_mm = 255
  WHERE id = v_roomy;

  UPDATE public.vehicle_catalog SET
    front_brake_type = 'Ventilated disc',
    rear_brake_type = 'Disc',
    brake_size_mm = 266
  WHERE id = v_swift;

  UPDATE fleet.vehicles SET
    make = 'FxToyota',
    model = 'FxRoomy',
    year = 2019,
    vehicle_catalog_id = v_roomy::text,
    payload_json = jsonb_build_object(
      'vehicle_catalog_id', v_roomy::text,
      'catalogStatus', 'matched',
      'licensePlate', '5179KZ',
      'make', 'FxToyota',
      'model', 'FxRoomy',
      'year', 2019,
      'status', 'Active'
    )
  WHERE id = v_veh AND organization_id = v_org;

  UPDATE public.kv_store_37f42386 SET value = jsonb_set(
    jsonb_set(value, '{make}', '"FxToyota"'::jsonb),
    '{model}', '"FxRoomy"'::jsonb
  ) WHERE key = 'vehicle:' || v_veh;

  UPDATE public.kv_store_37f42386 SET value = jsonb_set(value, '{vehicle_catalog_id}', to_jsonb(v_roomy::text))
  WHERE key = 'vehicle:' || v_veh;

  UPDATE fleet.vehicles SET
    make = 'FxSuzuki',
    model = 'FxSwift',
    vehicle_catalog_id = v_swift::text,
    payload_json = jsonb_build_object(
      'vehicle_catalog_id', v_swift::text,
      'catalogStatus', 'matched',
      'licensePlate', '1505LM',
      'make', 'FxSuzuki',
      'model', 'FxSwift',
      'year', 2019,
      'status', 'Active'
    )
  WHERE id = 'mm_f01_1505lm' AND organization_id = v_org;

  UPDATE public.kv_store_37f42386 SET value = jsonb_set(
    jsonb_set(jsonb_set(value, '{make}', '"FxSuzuki"'::jsonb), '{model}', '"FxSwift"'::jsonb),
    '{vehicle_catalog_id}', to_jsonb(v_swift::text)
  ) WHERE key = 'vehicle:mm_f01_1505lm';
END $$;

COMMIT;

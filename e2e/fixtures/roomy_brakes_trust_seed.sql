-- Phase 3b e2e: Dominion trust (Fx-prefixed fake data only). Idempotent; COMMIT.
-- Main part: FxBrand FX-PAD-1 in group FX-RB-TRUST-MAIN, listings on FxRoomy + FxToyota FxYaris.
-- Empty part: FxBrand FX-PAD-EMPTY in group FX-RB-TRUST-EMPTY (no listings — "No car listing yet").

BEGIN;

DO $$
DECLARE
  v_brk_pads uuid;
  v_cat uuid;
  v_plat uuid := 'e2000002-0000-4000-8000-000000000010'::uuid;
  v_eng uuid := 'e2000001-0000-4000-8000-000000000001'::uuid;
  v_roomy uuid := 'e2000005-0000-4000-8000-000000000010'::uuid;
  v_second uuid := 'e2000005-0000-4000-8000-000000000011'::uuid;
  v_twin uuid := 'e2000005-0000-4000-8000-000000000012'::uuid;
  v_owner uuid := '10100003-0000-4000-8000-000000000003'::uuid;
  v_g_main uuid := 'e200000f-0000-4000-8000-000000000001'::uuid;
  v_pm_main uuid := 'e200000f-0000-4000-8000-000000000002'::uuid;
  v_g_empty uuid := 'e200000f-0000-4000-8000-000000000003'::uuid;
  v_pm_empty uuid := 'e200000f-0000-4000-8000-000000000004'::uuid;
  v_list_roomy uuid := 'e200000f-0000-4000-8000-000000000011'::uuid;
  v_list_second uuid := 'e200000f-0000-4000-8000-000000000012'::uuid;
BEGIN
  SELECT id INTO v_brk_pads
  FROM public.maintenance_service_categories
  WHERE op_code = 'BRK-PADS' AND is_part IS TRUE
  LIMIT 1;
  IF v_brk_pads IS NULL THEN
    RAISE EXCEPTION 'roomy_brakes_trust_seed: BRK-PADS row not found';
  END IF;

  v_cat := public.guided_category_id('BRK-PADS');
  IF v_cat IS NULL THEN
    RAISE EXCEPTION 'roomy_brakes_trust_seed: guided_category_id(BRK-PADS) is null';
  END IF;

  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year,
    platform_id, engine_family_id, vehicle_class
  ) VALUES
    (
      v_second, 'FxToyota', 'FxYaris', 'FX-YAR-TEST', 2019, 2023,
      v_plat, v_eng, 'car'
    ),
    (
      v_twin, 'FxToyota', 'FxTwin', 'FX-TWIN-TEST', 2018, 2022,
      v_plat, v_eng, 'car'
    )
  ON CONFLICT (id) DO UPDATE SET
    make = EXCLUDED.make,
    model = EXCLUDED.model,
    chassis_code = EXCLUDED.chassis_code,
    production_start_year = EXCLUDED.production_start_year,
    production_end_year = EXCLUDED.production_end_year,
    platform_id = EXCLUDED.platform_id,
    engine_family_id = EXCLUDED.engine_family_id,
    vehicle_class = EXCLUDED.vehicle_class;

  INSERT INTO public.part_interchange_group (id, code, label, fit_scope)
  VALUES
    (v_g_main, 'FX-RB-TRUST-MAIN', 'Fx RB trust main', 'body'),
    (v_g_empty, 'FX-RB-TRUST-EMPTY', 'Fx RB trust empty', 'body')
  ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    label = EXCLUDED.label,
    fit_scope = EXCLUDED.fit_scope;

  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind,
    interchange_group_id, maintenance_component_id, evidence_url,
    catalog_decision, source_type, verified_by, verified_at, updated_at
  ) VALUES (
    v_pm_main,
    v_cat,
    'Fx brake pad test',
    'FX-PAD-1',
    'FxBrand',
    'aftermarket',
    v_g_main,
    v_brk_pads,
    'https://fx-evidence.example/fx-pad-1',
    'confirmed',
    'other',
    v_owner,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    category_id = EXCLUDED.category_id,
    name = EXCLUDED.name,
    oem_part_number = EXCLUDED.oem_part_number,
    manufacturer = EXCLUDED.manufacturer,
    part_kind = EXCLUDED.part_kind,
    interchange_group_id = EXCLUDED.interchange_group_id,
    maintenance_component_id = EXCLUDED.maintenance_component_id,
    evidence_url = EXCLUDED.evidence_url,
    catalog_decision = EXCLUDED.catalog_decision,
    source_type = EXCLUDED.source_type,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    updated_at = now();

  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind,
    interchange_group_id, maintenance_component_id, evidence_url,
    catalog_decision, source_type, verified_by, verified_at, updated_at
  ) VALUES (
    v_pm_empty,
    v_cat,
    'Fx empty trust states',
    'FX-PAD-EMPTY',
    'FxBrand',
    'aftermarket',
    v_g_empty,
    v_brk_pads,
    'https://fx-evidence.example/fx-pad-empty',
    'confirmed',
    'other',
    v_owner,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    category_id = EXCLUDED.category_id,
    name = EXCLUDED.name,
    oem_part_number = EXCLUDED.oem_part_number,
    manufacturer = EXCLUDED.manufacturer,
    part_kind = EXCLUDED.part_kind,
    interchange_group_id = EXCLUDED.interchange_group_id,
    maintenance_component_id = EXCLUDED.maintenance_component_id,
    evidence_url = EXCLUDED.evidence_url,
    catalog_decision = EXCLUDED.catalog_decision,
    source_type = EXCLUDED.source_type,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    updated_at = now();

  DELETE FROM public.part_listing WHERE interchange_group_id = v_g_empty;

  INSERT INTO public.part_listing (
    id, interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    evidence_url, origin, verified_by, verified_at,
    trust, trust_reason, trust_set_by, trust_set_at
  ) VALUES (
    v_list_roomy, v_g_main, v_roomy, 'front', NULL, 2018, 2022,
    'https://fx-listing.example/fx-roomy', 'manual', v_owner, now(),
    'confirmed', NULL, 'owner', now()
  )
  ON CONFLICT (id) DO UPDATE SET
    interchange_group_id = EXCLUDED.interchange_group_id,
    vehicle_catalog_id = EXCLUDED.vehicle_catalog_id,
    position = EXCLUDED.position,
    side = EXCLUDED.side,
    year_from = EXCLUDED.year_from,
    year_to = EXCLUDED.year_to,
    evidence_url = EXCLUDED.evidence_url,
    origin = EXCLUDED.origin,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    trust = EXCLUDED.trust,
    trust_reason = EXCLUDED.trust_reason,
    trust_set_by = EXCLUDED.trust_set_by,
    trust_set_at = EXCLUDED.trust_set_at;

  INSERT INTO public.part_listing (
    id, interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    evidence_url, origin, verified_by, verified_at,
    trust, trust_reason, trust_set_by, trust_set_at
  ) VALUES (
    v_list_second, v_g_main, v_second, 'front', NULL, 2019, 2023,
    'https://fx-listing.example/fx-yaris', 'manual', v_owner, now(),
    'needs_checking', 'Fx note for automated trust check', 'owner', now()
  )
  ON CONFLICT (id) DO UPDATE SET
    interchange_group_id = EXCLUDED.interchange_group_id,
    vehicle_catalog_id = EXCLUDED.vehicle_catalog_id,
    position = EXCLUDED.position,
    side = EXCLUDED.side,
    year_from = EXCLUDED.year_from,
    year_to = EXCLUDED.year_to,
    evidence_url = EXCLUDED.evidence_url,
    origin = EXCLUDED.origin,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    trust = EXCLUDED.trust,
    trust_reason = EXCLUDED.trust_reason,
    trust_set_by = EXCLUDED.trust_set_by,
    trust_set_at = EXCLUDED.trust_set_at;
END $$;

COMMIT;

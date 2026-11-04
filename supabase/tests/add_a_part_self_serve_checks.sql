-- Add-a-part self-serve proofs (run after migrations)

DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*)::int INTO v_cnt
  FROM public.vehicle_catalog
  WHERE btrim(coalesce(engine_code, '')) <> '' AND engine_family_id IS NULL;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'AS-01 proof failed: % cars with engine_code but no engine_family_id', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*)::int INTO v_cnt
  FROM public.maintenance_service_categories c
  WHERE c.is_part IS TRUE AND c.part_type_status = 'active' AND c.position_scheme IS NULL;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'AS-04 proof failed: % active part types missing position_scheme', v_cnt;
  END IF;
END $$;

DO $$
BEGIN
  IF public.self_serve_catalog_decision('part_maker_catalogue') <> 'confirmed' THEN
    RAISE EXCEPTION 'AS-07 proof failed: part_maker_catalogue should be confirmed';
  END IF;
  IF public.self_serve_catalog_decision('other') <> 'pending' THEN
    RAISE EXCEPTION 'AS-07 proof failed: other source should be pending';
  END IF;
END $$;

DO $$
DECLARE v_found boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'FLD-COOLANT' AND is_part IS TRUE) INTO v_found;
  IF NOT v_found THEN
    RAISE EXCEPTION 'AS-03 proof failed: Coolant part type (FLD-COOLANT) missing';
  END IF;
END $$;

DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*)::int INTO v_cnt FROM public.vehicle_catalog
  WHERE btrim(coalesce(chassis_code, '')) <> '' AND platform_id IS NULL;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'AS-01 proof failed: % cars with chassis_code but no platform_id', v_cnt;
  END IF;

  SELECT count(*)::int INTO v_cnt FROM public.maintenance_service_categories c
  WHERE c.op_code IN ('FLD-ENG-OIL', 'FLD-COOLANT', 'FLD-WASH', 'LGT-FOG')
    AND (c.kind <> 'component' OR c.parent_id NOT IN (
      'b1000000-0000-4000-8000-000000000005'::uuid, 'b1000000-0000-4000-8000-000000000007'::uuid));
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'AS-03 proof failed: % new part types not under the Fluids/Lighting areas', v_cnt;
  END IF;

  SELECT count(*)::int INTO v_cnt FROM public.maintenance_service_categories c
  WHERE c.is_part IS TRUE AND c.kind = 'component' AND c.part_type_status = 'active' AND c.default_fit_mode IS NULL;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'AS-05 proof failed: % active part types have no fit mode', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*)::int INTO v_cnt
  FROM public.maintenance_service_categories c
  WHERE c.is_part IS TRUE AND c.kind = 'component' AND c.part_type_status = 'active'
    AND c.default_fit_mode = 'spec'
    AND NOT EXISTS (
      SELECT 1 FROM public.part_type_spec_field f WHERE f.part_type_id = c.id
    );
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'AP-07 proof failed: % spec-mode part types have no spec fields', v_cnt;
  END IF;

  SELECT count(*)::int INTO v_cnt
  FROM (VALUES ('washer_fluid'), ('tail_bulb'), ('indicator_bulb'), ('tire_size')) AS v(k)
  WHERE NOT EXISTS (SELECT 1 FROM public.spec_key sk WHERE sk.key = v.k);
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'AP-07 proof failed: % required spec_key rows missing', v_cnt;
  END IF;
END $$;

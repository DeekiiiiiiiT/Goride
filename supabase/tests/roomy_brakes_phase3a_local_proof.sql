-- Local proof (fake data only). Rolls back.

BEGIN;

INSERT INTO public.engine_family (id, code) VALUES
  ('f3a00001-0000-4000-8000-000000000001', 'RB3A-ENG')
ON CONFLICT DO NOTHING;

INSERT INTO public.vehicle_platform (id, code, maker, label) VALUES
  ('f3a00002-0000-4000-8000-000000000001', 'RB3A-PL', 'Testmaker', 'RB3A platform')
ON CONFLICT DO NOTHING;

INSERT INTO public.maintenance_service_categories (id, code, name, kind, op_code, parent_id, icon_key, sort_order, is_part, part_type_status)
VALUES
  ('f3a00003-0000-4000-8000-000000000001', 'rb3a-brakes', 'RB3A Brakes', 'system', 'BRK', NULL, 'brakes', 1, false, 'active'),
  ('f3a00003-0000-4000-8000-000000000002', 'rb3a-pad', 'RB3A pad', 'component', 'BRK-PAD', 'f3a00003-0000-4000-8000-000000000001', 'brakes', 2, true, 'active')
ON CONFLICT DO NOTHING;

INSERT INTO public.part_category (id, slug, label, sort_order)
VALUES ('f3a00004-0000-4000-8000-000000000001', 'rb3a-brakes', 'RB3A Brakes', 1)
ON CONFLICT DO NOTHING;

UPDATE public.part_category
SET area_id = 'f3a00003-0000-4000-8000-000000000001'
WHERE id = 'f3a00004-0000-4000-8000-000000000001'
  AND area_id IS DISTINCT FROM 'f3a00003-0000-4000-8000-000000000001';

INSERT INTO public.vehicle_catalog (
  id, make, model, chassis_code, production_start_year, production_end_year,
  platform_id, engine_family_id
) VALUES (
  'f3a00005-0000-4000-8000-000000000001',
  'Testmaker', 'Proofcar', 'RB3A-CH',
  2020, 2022,
  'f3a00002-0000-4000-8000-000000000001',
  'f3a00001-0000-4000-8000-000000000001'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.trusted_source (kind, maker, domain)
VALUES
  ('car_maker', 'Testmaker', 'test-car.example'),
  ('part_maker', 'Test Parts Co', 'test-pm.example'),
  ('part_maker', 'PmAlpha', 'test-pm-a.example'),
  ('part_maker', 'PmBeta', 'test-pm-b.example')
ON CONFLICT ON CONSTRAINT trusted_source_unique_triplet DO NOTHING;

INSERT INTO public.part_interchange_group (id, code, fit_scope) VALUES
  ('f3a00006-0000-4000-8000-000000000001', 'RB3A-GRP', 'body')
ON CONFLICT DO NOTHING;

DELETE FROM public.part_master
WHERE id = 'f3a00007-0000-4000-8000-000000000001';

INSERT INTO public.part_master (
  id, category_id, name, oem_part_number, manufacturer, part_kind,
  interchange_group_id, maintenance_component_id, evidence_url,
  catalog_decision, source_type, updated_at
) VALUES (
  'f3a00007-0000-4000-8000-000000000001',
  'f3a00004-0000-4000-8000-000000000001',
  'RB3A pad', '99RB3A001', 'Test Parts Co', 'aftermarket',
  'f3a00006-0000-4000-8000-000000000001',
  'f3a00003-0000-4000-8000-000000000002',
  'https://test-pm.example/pm',
  'confirmed',
  'part_maker_catalogue',
  now()
);

DO $$
DECLARE
  v_list uuid;
  v_oe uuid;
BEGIN
  IF to_regclass('public.trusted_source') IS NULL THEN
    RAISE NOTICE 'roomy_brakes_phase3a_local_proof: skip — trusted_source missing';
    RETURN;
  END IF;

  -- Car maker site → confirmed
  DELETE FROM public.part_listing
  WHERE interchange_group_id = 'f3a00006-0000-4000-8000-000000000001';

  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side,
    evidence_url, origin
  ) VALUES (
    'f3a00006-0000-4000-8000-000000000001',
    'f3a00005-0000-4000-8000-000000000001',
    'front', NULL,
    'https://test-car.example/car',
    'manual'
  )
  RETURNING id INTO v_list;

  IF (SELECT pl.trust FROM public.part_listing pl WHERE pl.id = v_list) IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'proof fail: car maker trusted listing';
  END IF;

  -- Fake shop → needs_checking
  UPDATE public.part_listing pl
  SET evidence_url = 'https://shop-fake.example/x'
  WHERE pl.id = v_list;

  IF (SELECT pl.trust FROM public.part_listing pl WHERE pl.id = v_list) IS DISTINCT FROM 'needs_checking' THEN
    RAISE EXCEPTION 'proof fail: shop listing';
  END IF;

  -- Part maker site on same row
  UPDATE public.part_listing pl
  SET evidence_url = 'https://test-pm.example/pm2'
  WHERE pl.id = v_list;

  IF (SELECT pl.trust FROM public.part_listing pl WHERE pl.id = v_list) IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'proof fail: part maker trusted listing';
  END IF;

  -- OE: two part maker domains
  DELETE FROM public.vehicle_oe_number
  WHERE id = 'f3a00008-0000-4000-8000-000000000001';

  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, norm_version,
    evidence_url, evidence_url_2, note
  ) VALUES (
    'f3a00008-0000-4000-8000-000000000001',
    'f3a00005-0000-4000-8000-000000000001',
    'f3a00003-0000-4000-8000-000000000002',
    'front', NULL,
    'OEM', '99-RB3A-OE', '99RB3AOE', 1,
    'https://test-pm-a.example/o1',
    'https://test-pm-b.example/o2',
    'proof'
  )
  RETURNING id INTO v_oe;

  IF (SELECT von.trust FROM public.vehicle_oe_number von WHERE von.id = v_oe) IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'proof fail: two part maker OE';
  END IF;

  -- One maker only
  UPDATE public.vehicle_oe_number
  SET evidence_url = 'https://test-pm-a.example/solo', evidence_url_2 = NULL
  WHERE id = v_oe;

  PERFORM public.trust_recompute_auto();

  IF (SELECT von.trust FROM public.vehicle_oe_number von WHERE von.id = v_oe) IS DISTINCT FROM 'needs_checking' THEN
    RAISE EXCEPTION 'proof fail: single PM OE';
  END IF;

  -- Owner override survives recompute
  UPDATE public.part_listing pl
  SET trust = 'needs_checking', trust_reason = 'owner said so', trust_set_by = 'owner', trust_set_at = now()
  WHERE pl.id = v_list;

  PERFORM public.trust_recompute_auto();

  IF (SELECT pl.trust_set_by FROM public.part_listing pl WHERE pl.id = v_list) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'proof fail: owner override';
  END IF;

  UPDATE public.part_listing pl
  SET evidence_url = 'https://test-car.example/only-car', trust_set_by = 'auto'
  WHERE pl.id = v_list;

  PERFORM public.trust_recompute_auto();

  IF (SELECT pl.trust FROM public.part_listing pl WHERE pl.id = v_list) IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'proof fail: expected car-only confirmed before delete';
  END IF;

  DELETE FROM public.trusted_source
  WHERE kind = 'car_maker' AND maker_norm = 'testmaker' AND domain = 'test-car.example';

  PERFORM public.trust_recompute_auto();

  IF (SELECT pl.trust FROM public.part_listing pl WHERE pl.id = v_list) IS DISTINCT FROM 'needs_checking' THEN
    RAISE EXCEPTION 'proof fail: site removal';
  END IF;

  RAISE NOTICE 'roomy_brakes_phase3a_local_proof: OK';
END $$;

ROLLBACK;

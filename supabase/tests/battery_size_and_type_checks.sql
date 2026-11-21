-- LC-19 batteries: right size (case key) and right type. Makes its own made-up rows; rolls everything back.

BEGIN;

DO $$
DECLARE
  v_car_efb uuid := 'b7a70001-0000-4000-8000-0000000000c1';
  v_car_none uuid := 'b7a70001-0000-4000-8000-0000000000c2';
  v_got text;
BEGIN
  INSERT INTO public.vehicle_catalog (id, make, model, production_start_year, production_end_year)
  VALUES (v_car_efb, 'BTTX', 'EcoIdle', 2019, 2020), (v_car_none, 'BTTX', 'NoType', 2019, 2020);

  INSERT INTO public.catalog_spec_value (spec_key, scope, vehicle_catalog_id, value, evidence_url) VALUES
    ('battery_jis', 'variant', v_car_efb, 'B24L', 'https://bttx.example/efb'),
    ('battery_type', 'variant', v_car_efb, 'EFB', 'https://bttx.example/efb'),
    ('battery_jis', 'variant', v_car_none, '46B24L', 'https://bttx.example/none');

  INSERT INTO public.universal_part (spec_key, spec_value, manufacturer, part_number, name, extra, evidence_url) VALUES
    ('battery_jis', 'N-55', 'BTTX-Yuasa', 'BTTX-EFB-N55', 'BTTX EFB N-55', '{"battery_type":"EFB"}', 'https://bttx.example/p1'),
    ('battery_jis', '46B24L', 'BTTX-Std', 'BTTX-STD-46B24L', 'BTTX Standard 46B24L', '{"battery_type":"Standard"}', 'https://bttx.example/p2'),
    ('battery_jis', '60B24L', 'BTTX-Agm', 'BTTX-AGM-60B24L', 'BTTX AGM 60B24L', '{"battery_type":"AGM"}', 'https://bttx.example/p3'),
    ('battery_jis', '40B20L', 'BTTX-Small', 'BTTX-STD-40B20L', 'BTTX Standard 40B20L', '{"battery_type":"Standard"}', 'https://bttx.example/p4'),
    ('battery_jis', 'B24L', 'BTTX-Untyped', 'BTTX-UNTYPED', 'BTTX untyped B24L', '{}', 'https://bttx.example/p5'),
    ('battery_jis', 'N-55R', 'BTTX-Right', 'BTTX-EFB-N55R', 'BTTX EFB N-55R', '{"battery_type":"EFB"}', 'https://bttx.example/p6');

  -- B1: EFB car (B24L) -> EFB N-55 + AGM 60B24L only (no Standard, no untyped, no right-terminal, no B20)
  SELECT string_agg(part_number, ',' ORDER BY part_number) INTO v_got
  FROM public.universal_parts_for_variant(v_car_efb, 2019) WHERE spec_key = 'battery_jis' AND universal_part_id IS NOT NULL;
  IF v_got IS DISTINCT FROM 'BTTX-AGM-60B24L,BTTX-EFB-N55' THEN RAISE EXCEPTION 'B1: got %', v_got; END IF;

  -- B2 + B3: car with no type (46B24L) -> every B24L battery whatever its type; never B20L or B24R
  SELECT string_agg(part_number, ',' ORDER BY part_number) INTO v_got
  FROM public.universal_parts_for_variant(v_car_none, 2019) WHERE spec_key = 'battery_jis' AND universal_part_id IS NOT NULL;
  IF v_got IS DISTINCT FROM 'BTTX-AGM-60B24L,BTTX-EFB-N55,BTTX-STD-46B24L,BTTX-UNTYPED' THEN RAISE EXCEPTION 'B2/B3: got %', v_got; END IF;

  -- B4: the form's battery type is kept on the part
  IF public.universal_part_extra_from_input('{"batteryType":"AGM"}'::jsonb, 'battery_jis') <> '{"battery_type":"AGM"}'::jsonb
     OR public.universal_part_extra_from_input('{"batteryType":"lithium"}'::jsonb, 'battery_jis') <> '{}'::jsonb THEN
    RAISE EXCEPTION 'B4: extra from input wrong';
  END IF;

  RAISE NOTICE 'battery_size_and_type_checks: ok';
END $$;

ROLLBACK;

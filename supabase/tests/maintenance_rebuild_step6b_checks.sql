-- Maintenance rebuild step 6b (database only) checks: DOC-02 … DOC-05, DOC-07 … DOC-12.
-- Fixture data only; every function and constraint is the real one.
-- Run with psql -v ON_ERROR_STOP=1 -f supabase/tests/maintenance_rebuild_step6b_checks.sql
-- Rolls back.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures: one model family, two catalogue versions in it, a car for each,
-- one other model's car, and one manual for the family.
-- ---------------------------------------------------------------------------
INSERT INTO public.engine_family (id, code)
VALUES ('b6000001-0000-4000-8000-000000000003'::uuid, 'STEP6B-ENG')
ON CONFLICT DO NOTHING;

INSERT INTO public.vehicle_platform (id, code, maker, label, parent_id, family_evidence_url)
VALUES
  ('b6000001-0000-4000-8000-000000000001'::uuid, 'STEP6B-FAMILY', 'StepSix', 'Step6b family', NULL, NULL),
  ('b6000001-0000-4000-8000-000000000002'::uuid, 'STEP6B-VARIANT', 'StepSix', 'Step6b variant',
   'b6000001-0000-4000-8000-000000000001'::uuid, 'https://example.com/step6b-family.png'),
  ('b6000001-0000-4000-8000-000000000010'::uuid, 'STEP6B-OTHER', 'OtherSix', 'Other6b family', NULL, NULL)
ON CONFLICT DO NOTHING;

INSERT INTO public.vehicle_catalog (
  id, make, model, chassis_code, production_start_year, production_end_year,
  platform_id, engine_family_id, vehicle_class, fuel_type, engine_type, fuel_category,
  powertrain, fuel, powertrain_status, engine_oil_capacity_l, coolant_capacity_l, fuel_tank_capacity
) VALUES
  ('b6000001-0000-4000-8000-000000000021'::uuid, 'StepSix', 'Step6b 2016-2020', 'S6B-A', 2016, 2020,
   'b6000001-0000-4000-8000-000000000002'::uuid, 'b6000001-0000-4000-8000-000000000003'::uuid,
   'car', 'Petrol', 'Naturally aspirated', 'Gas', 'ice', 'petrol', 'confirmed', 3.2, 4.5, 36),
  ('b6000001-0000-4000-8000-000000000022'::uuid, 'StepSix', 'Step6b 2021-2024', 'S6B-B', 2021, 2024,
   'b6000001-0000-4000-8000-000000000002'::uuid, 'b6000001-0000-4000-8000-000000000003'::uuid,
   'car', 'Petrol', 'Naturally aspirated', 'Gas', 'ice', 'petrol', 'confirmed', 3.2, 4.5, 36),
  ('b6000001-0000-4000-8000-000000000023'::uuid, 'OtherSix', 'Step6b other car', 'S6B-C', 2019, 2024,
   'b6000001-0000-4000-8000-000000000010'::uuid, 'b6000001-0000-4000-8000-000000000003'::uuid,
   'car', 'Petrol', 'Naturally aspirated', 'Gas', 'ice', 'petrol', 'confirmed', 4.1, 5.2, 40)
ON CONFLICT DO NOTHING;

INSERT INTO fleet.vehicles (id, organization_id, license_plate, legacy_kv_id, vehicle_catalog_id, year)
VALUES
  ('step6b_car_2019', 'step6b_org', 'step6b_plate_19', 'step6b_legacy_19',
   'b6000001-0000-4000-8000-000000000021'::uuid, 2019),
  ('step6b_car_2023', 'step6b_org', 'step6b_plate_23', 'step6b_legacy_23',
   'b6000001-0000-4000-8000-000000000022'::uuid, 2023)
ON CONFLICT (id) DO UPDATE SET vehicle_catalog_id = EXCLUDED.vehicle_catalog_id, year = EXCLUDED.year;

-- The Roomy's own manual id, because the 27 Nov fix is keyed on it.
INSERT INTO public.maintenance_manual (
  id, platform_id, market, title, file_key, file_sha256, page_count, page_from, page_to, pages,
  status, doc_type, page_offset, printed_date, year_from, year_to
) VALUES (
  '155b08f1-d9f7-43b1-98b5-8df29d2dcd31'::uuid, 'b6000001-0000-4000-8000-000000000001'::uuid,
  'JP', 'Step6b Japan sheet (June 2021)', 'manuals/step6b-jp.pdf', repeat('c', 64), 568,
  1, 5, ARRAY[1, 2, 3, 4, 5], 'checked', 'schedule', 0, DATE '2021-06-01', NULL, NULL
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. DOC-02/03/04: a document's shape — type, page list, printed page, years
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_doc_type text;
  v_offset int;
  v_from int;
  v_to int;
  v_pages int[];
  v_ok boolean := false;
BEGIN
  -- A page LIST sets the range, not the other way round.
  INSERT INTO public.maintenance_manual (
    id, platform_id, market, title, file_key, file_sha256, page_count, page_from, page_to, pages, status
  ) VALUES (
    'b6000001-0000-4000-8000-000000000031'::uuid, 'b6000001-0000-4000-8000-000000000001'::uuid,
    'JP', 'Step6b owners manual', 'manuals/step6b-om.pdf', repeat('d', 64), 568,
    1, 1, ARRAY[3, 406, 407, 408, 409, 410, 411, 416, 417, 524, 525, 526, 527, 528, 529, 530],
    'waiting_check'
  );

  SELECT doc_type, page_offset, page_from, page_to, pages
  INTO v_doc_type, v_offset, v_from, v_to, v_pages
  FROM public.maintenance_manual
  WHERE id = 'b6000001-0000-4000-8000-000000000031'::uuid;

  IF v_doc_type <> 'schedule' THEN
    RAISE EXCEPTION 'a new manual must default to the schedule kind, got %', v_doc_type;
  END IF;
  IF v_offset <> 0 THEN
    RAISE EXCEPTION 'a new manual must default to a zero page offset, got %', v_offset;
  END IF;
  IF v_from <> 3 OR v_to <> 530 THEN
    RAISE EXCEPTION 'the page list must set the range to 3..530, got %..%', v_from, v_to;
  END IF;
  IF cardinality(v_pages) <> 16 THEN
    RAISE EXCEPTION 'the list must keep 16 pages, got %', cardinality(v_pages);
  END IF;

  -- The owner's manual: printed page = PDF page - 4.
  UPDATE public.maintenance_manual
  SET doc_type = 'owners_manual', page_offset = 4, year_from = 2016, year_to = 2024
  WHERE id = 'b6000001-0000-4000-8000-000000000031'::uuid;

  SELECT doc_type, page_offset INTO v_doc_type, v_offset
  FROM public.maintenance_manual
  WHERE id = 'b6000001-0000-4000-8000-000000000031'::uuid;
  IF v_doc_type <> 'owners_manual' OR v_offset <> 4 THEN
    RAISE EXCEPTION 'the manual did not become an owner''s manual with a 4-page offset';
  END IF;

  -- An unknown document type is refused.
  BEGIN
    UPDATE public.maintenance_manual
    SET doc_type = 'receipt'
    WHERE id = 'b6000001-0000-4000-8000-000000000031'::uuid;
    RAISE EXCEPTION 'an unknown doc_type was accepted';
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'doc_type check did not fire'; END IF;

  -- A page that is not in the file is refused, not silently kept.
  v_ok := false;
  BEGIN
    UPDATE public.maintenance_manual
    SET pages = ARRAY[3, 406, 900]
    WHERE id = 'b6000001-0000-4000-8000-000000000031'::uuid;
    RAISE EXCEPTION 'a page past the end of the PDF was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%outside this PDF%' THEN RAISE; END IF;
    v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'the page bounds check did not fire'; END IF;

  -- A range with no start is not a range.
  v_ok := false;
  BEGIN
    UPDATE public.maintenance_manual
    SET year_from = NULL, year_to = 2020
    WHERE id = 'b6000001-0000-4000-8000-000000000031'::uuid;
    RAISE EXCEPTION 'a year range with no start was accepted';
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'the years check did not fire'; END IF;

  -- A backwards range is refused.
  v_ok := false;
  BEGIN
    UPDATE public.maintenance_manual
    SET year_from = 2024, year_to = 2016
    WHERE id = 'b6000001-0000-4000-8000-000000000031'::uuid;
    RAISE EXCEPTION 'a backwards year range was accepted';
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'the backwards years check did not fire'; END IF;

  RAISE NOTICE 'check_1_manual_shape: type, page list -> range, printed page, years';
END $$;

-- An old caller that still gives a range gets the list filled for it.
DO $$
DECLARE
  v_pages int[];
BEGIN
  INSERT INTO public.maintenance_manual (
    id, platform_id, market, title, file_key, file_sha256, page_count, page_from, page_to, status
  ) VALUES (
    'b6000001-0000-4000-8000-000000000032'::uuid, 'b6000001-0000-4000-8000-000000000001'::uuid,
    'JM', 'Step6b old-style range', 'manuals/step6b-range.pdf', repeat('e', 64), 50, 10, 12, 'reading'
  );

  SELECT pages INTO v_pages
  FROM public.maintenance_manual
  WHERE id = 'b6000001-0000-4000-8000-000000000032'::uuid;

  IF v_pages IS DISTINCT FROM ARRAY[10, 11, 12] THEN
    RAISE EXCEPTION 'a range must fill the page list, got %', v_pages;
  END IF;

  RAISE NOTICE 'check_2_range_fills_list: 10..12 -> {10,11,12}';
END $$;

-- ---------------------------------------------------------------------------
-- 3. The page queue reads only the listed pages (DOC-03)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_queued int;
  v_ok boolean := false;
BEGIN
  -- PDF 406 and 530 are on the list; PDF 5 is inside the range but is not a page of this manual.
  SELECT public.maintenance_manual_queue_pages(
    'b6000001-0000-4000-8000-000000000031'::uuid, ARRAY[406, 530]
  ) INTO v_queued;
  IF v_queued <> 2 THEN
    RAISE EXCEPTION 'expected 2 pages queued, got %', v_queued;
  END IF;

  BEGIN
    PERFORM public.maintenance_manual_queue_pages(
      'b6000001-0000-4000-8000-000000000031'::uuid, ARRAY[5]
    );
    RAISE EXCEPTION 'page 5 (inside the range, not on the list) was queued';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%page outside%' THEN RAISE; END IF;
    v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'the queue accepted a page that is not on the list'; END IF;

  RAISE NOTICE 'check_3_queue_listed_pages: 406 and 530 queued, 5 refused';
END $$;

-- ---------------------------------------------------------------------------
-- 4. DOC-05: every rule made from a dated manual copies its years
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rule uuid;
  v_yf int;
  v_yt int;
BEGIN
  UPDATE public.maintenance_manual
  SET year_from = 2020, year_to = NULL
  WHERE id = '155b08f1-d9f7-43b1-98b5-8df29d2dcd31'::uuid;

  INSERT INTO public.maintenance_task_templates (
    task_name, task_code, template_scope, platform_id, component_id, interval_km,
    status, source_type, confidence, manual_id, evidence_page, evidence_url
  ) VALUES (
    'Step6b year copy', 'step6b-year-copy', 'platform', 'b6000001-0000-4000-8000-000000000001'::uuid,
    (SELECT id FROM public.maintenance_service_categories WHERE code = 'oil'),
    15000, 'draft', 'maker_manual', 'likely', '155b08f1-d9f7-43b1-98b5-8df29d2dcd31'::uuid, 5,
    'r2:private/manuals/step6b-jp.pdf'
  ) RETURNING id INTO v_rule;

  SELECT year_from, year_to INTO v_yf, v_yt
  FROM public.maintenance_task_templates WHERE id = v_rule;

  IF v_yf IS DISTINCT FROM 2020 OR v_yt IS NOT NULL THEN
    RAISE EXCEPTION 'the rule did not copy the manual''s years: %..%', v_yf, v_yt;
  END IF;

  RAISE NOTICE 'check_4_years_copy: a rule from a 2020-on manual is 2020-on';
END $$;

-- ---------------------------------------------------------------------------
-- 5. DOC-05 / MDV-13: the 27 Nov Roomy fix, on eight live rules
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_manual uuid := '155b08f1-d9f7-43b1-98b5-8df29d2dcd31';
  v_codes text[] := ARRAY[
    'oil', 'brake_fluid', 'coolant_part', 'spark_plugs',
    'fuel_filter', 'timing_belt', 'air_filter', 'transmission'
  ];
  v_code text;
  v_bound int := 0;
  v_copied int := 0;
  r record;
  v_bad int;
  v_km int;
  v_rule uuid;
  v_maker_rule uuid;
BEGIN
  -- Eight rules approved on 27 Nov, one per part, all active and 2020-on.
  FOREACH v_code IN ARRAY v_codes LOOP
    INSERT INTO public.maintenance_task_templates (
      task_name, task_code, template_scope, platform_id, component_id, interval_km,
      status, source_type, confidence, manual_id, evidence_page, evidence_url
    ) VALUES (
      'Step6b ' || v_code, 'step6b-' || v_code, 'platform',
      'b6000001-0000-4000-8000-000000000001'::uuid,
      (SELECT id FROM public.maintenance_service_categories WHERE code = v_code),
      15000, 'active', 'maker_manual', 'confirmed', v_manual, 5,
      'r2:private/manuals/step6b-jp.pdf'
    );
  END LOOP;

  -- The fix itself.
  FOR r IN
    SELECT * FROM public.mm_manual_bind_years(
      v_manual, 2020, NULL, 2016, 2020,
      'Read from the June 2021 sheet. Confirm against a 2016–2020 document.'
    )
  LOOP
    IF r.action = 'rule_bound' THEN v_bound := v_bound + 1; END IF;
    IF r.action = 'copy_created' THEN v_copied := v_copied + 1; END IF;
  END LOOP;

  IF v_bound <> 8 THEN RAISE EXCEPTION 'expected 8 rules bound to 2020-on, got %', v_bound; END IF;
  IF v_copied <> 8 THEN RAISE EXCEPTION 'expected 8 draft copies for 2016-2020, got %', v_copied; END IF;

  -- The live rules are 2020-on.
  SELECT count(*) INTO v_bad
  FROM public.maintenance_task_templates t
  WHERE t.manual_id = v_manual AND t.status = 'active'
    AND (t.year_from IS DISTINCT FROM 2020 OR t.year_to IS NOT NULL);
  IF v_bad <> 0 THEN RAISE EXCEPTION '% live rule(s) are not 2020-on', v_bad; END IF;

  -- The copies are drafts, likely, 2016-2020, and say why.
  SELECT count(*) INTO v_bad
  FROM public.maintenance_task_templates t
  WHERE t.manual_id = v_manual AND t.status = 'draft'
    AND t.task_code LIKE '%-2016-2020'
    AND (
      t.confidence <> 'likely'
      OR t.year_from IS DISTINCT FROM 2016
      OR t.year_to IS DISTINCT FROM 2020
      OR t.draft_note IS DISTINCT FROM 'Read from the June 2021 sheet. Confirm against a 2016–2020 document.'
    );
  IF v_bad <> 0 THEN RAISE EXCEPTION '% draft copy/copies are not likely 2016-2020 with the note', v_bad; END IF;

  -- 2019 car: no maker rule covers it, so Roam's policy still gives it a number.
  SELECT (SELECT t.id FROM public.maintenance_task_templates t
           WHERE t.task_code = 'step6b-oil' LIMIT 1)
  INTO v_maker_rule;

  SELECT sr.interval_km, sr.rule_id INTO v_km, v_rule
  FROM public.schedule_rule_for_part(
    'step6b_org', 'step6b_car_2019',
    (SELECT id FROM public.maintenance_service_categories WHERE code = 'oil'), NULL
  ) sr
  LIMIT 1;

  IF v_km IS NULL THEN
    RAISE EXCEPTION 'the 2019 car has no rule at all';
  END IF;
  IF v_rule IS NOT DISTINCT FROM v_maker_rule THEN
    RAISE EXCEPTION 'the 2019 car took a rule that only covers 2020 onward';
  END IF;

  -- 2023 car: the maker's rule wins.
  SELECT sr.interval_km, sr.rule_id INTO v_km, v_rule
  FROM public.schedule_rule_for_part(
    'step6b_org', 'step6b_car_2023',
    (SELECT id FROM public.maintenance_service_categories WHERE code = 'oil'), NULL
  ) sr
  LIMIT 1;
  IF v_rule IS DISTINCT FROM v_maker_rule OR v_km IS DISTINCT FROM 15000 THEN
    RAISE EXCEPTION 'the 2023 car did not take the maker rule: km=% rule=%', v_km, v_rule;
  END IF;

  RAISE NOTICE 'check_5_roomy_years: 8 live rules 2020-on, 8 likely drafts 2016-2020, 2019 car still gets a number';
END $$;

-- ---------------------------------------------------------------------------
-- 6. DOC-07/08/09/11: the new homes exist, with the right parents and keys
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_parent text;
BEGIN
  SELECT p.code INTO v_parent
  FROM public.maintenance_service_categories c
  JOIN public.maintenance_service_categories p ON p.id = c.parent_id
  WHERE c.code = 'differential_oil';
  IF v_parent IS DISTINCT FROM 'sys_transmission' THEN
    RAISE EXCEPTION 'Differential oil must sit under the driveline group, got %', v_parent;
  END IF;

  SELECT p.code INTO v_parent
  FROM public.maintenance_service_categories c
  JOIN public.maintenance_service_categories p ON p.id = c.parent_id
  WHERE c.code = 'transfer_oil';
  IF v_parent IS DISTINCT FROM 'sys_transmission' THEN
    RAISE EXCEPTION 'Transfer oil must sit under the driveline group, got %', v_parent;
  END IF;

  SELECT p.code INTO v_parent
  FROM public.maintenance_service_categories c
  JOIN public.maintenance_service_categories p ON p.id = c.parent_id
  WHERE c.code = 'air_cleaner_element';
  IF v_parent IS DISTINCT FROM 'sys_filters' THEN
    RAISE EXCEPTION 'Air cleaner element must sit under the filters group, got %', v_parent;
  END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('transmission_fluid_capacity_l', 'number'),
      ('transfer_oil_grade', 'text'),
      ('transfer_oil_capacity_l', 'number'),
      ('differential_oil_grade', 'text'),
      ('differential_oil_capacity_l', 'number'),
      ('washer_capacity_l', 'number')
    ) AS want(k, t)
    LEFT JOIN public.spec_key sk ON sk.key = want.k
    WHERE sk.key IS NULL OR sk.value_type <> want.t
  ) THEN
    RAISE EXCEPTION 'one of the six fluid keys is missing or has the wrong type';
  END IF;

  RAISE NOTICE 'check_6_new_homes: driveline and filter part types, six spec keys';
END $$;

-- ---------------------------------------------------------------------------
-- 7. DOC-07/08 security: tyres, bulbs and spec rows are server-only
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['vehicle_tyre', 'vehicle_bulb', 'maintenance_manual_spec_row'] LOOP
    BEGIN
      SET LOCAL ROLE anon;
      EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', v_table);
      RAISE EXCEPTION 'anon could read %', v_table;
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
      WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%permission denied%' AND SQLERRM NOT LIKE '%Insufficient%' THEN RAISE; END IF;
    END;
    RESET ROLE;

    BEGIN
      SET LOCAL ROLE authenticated;
      EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', v_table);
      RAISE EXCEPTION 'authenticated could read %', v_table;
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
      WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%permission denied%' AND SQLERRM NOT LIKE '%Insufficient%' THEN RAISE; END IF;
    END;
    RESET ROLE;

    BEGIN
      SET LOCAL ROLE service_role;
      EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', v_table);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'service_role must be able to read %: %', v_table, SQLERRM;
    END;
    RESET ROLE;
  END LOOP;

  RAISE NOTICE 'check_7_spec_security: anon and authenticated refused, service_role allowed';
END $$;

-- ---------------------------------------------------------------------------
-- 8. DOC-06/10/12: one approved spec changes only its two versions, and logs it
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_manual uuid := 'b6000001-0000-4000-8000-000000000031'::uuid;
  v_v2016 uuid := 'b6000001-0000-4000-8000-000000000021'::uuid;
  v_v2021 uuid := 'b6000001-0000-4000-8000-000000000022'::uuid;
  v_other uuid := 'b6000001-0000-4000-8000-000000000023'::uuid;
  v_spec uuid;
  v_rows int;
  v_history int;
  v_printed int;
  v_value numeric;
  v_other_value numeric;
BEGIN
  -- The manual is the owner's manual with printed = PDF - 4.
  UPDATE public.maintenance_manual SET page_offset = 4 WHERE id = v_manual;

  INSERT INTO public.maintenance_manual_spec_row (
    manual_id, evidence_page, kind, key, value, applies_to, version_ids, confidence
  ) VALUES (
    v_manual, 525, 'fluid', 'engine_oil_capacity_l', '{"value": 2.9, "unit": "L"}'::jsonb,
    NULL, ARRAY[v_v2016, v_v2021], 'likely'
  ) RETURNING id INTO v_spec;

  SELECT count(*) INTO v_rows FROM public.maintenance_manual_spec_approve(v_spec, ARRAY[v_v2016, v_v2021], NULL);
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'expected two versions written, got %', v_rows;
  END IF;

  SELECT engine_oil_capacity_l INTO v_value FROM public.vehicle_catalog WHERE id = v_v2016;
  IF v_value IS DISTINCT FROM 2.9 THEN
    RAISE EXCEPTION 'the 2016-2020 version did not get 2.9, got %', v_value;
  END IF;

  SELECT engine_oil_capacity_l INTO v_value FROM public.vehicle_catalog WHERE id = v_v2021;
  IF v_value IS DISTINCT FROM 2.9 THEN
    RAISE EXCEPTION 'the 2021-2024 version did not get 2.9, got %', v_value;
  END IF;

  SELECT engine_oil_capacity_l INTO v_other_value FROM public.vehicle_catalog WHERE id = v_other;
  IF v_other_value IS DISTINCT FROM 4.1 THEN
    RAISE EXCEPTION 'another model''s car was changed to %', v_other_value;
  END IF;

  -- Two history lines, each carrying the manual and the PRINTED page (525 - 4 = 521).
  SELECT count(*) INTO v_history
  FROM public.dominion_audit_log a
  WHERE a.action = 'spec_approve'
    AND a.table_name = 'vehicle_catalog'
    AND a.row_id IN (v_v2016::text, v_v2021::text)
    AND (a.after ->> 'spec_key') = 'engine_oil_capacity_l';
  IF v_history <> 2 THEN
    RAISE EXCEPTION 'expected 2 history lines, got %', v_history;
  END IF;

  SELECT max((a.after ->> 'printed_page')::int) INTO v_printed
  FROM public.dominion_audit_log a
  WHERE a.action = 'spec_approve' AND a.table_name = 'vehicle_catalog';
  IF v_printed IS DISTINCT FROM 521 THEN
    RAISE EXCEPTION 'the history line must cite the printed page 521, got %', v_printed;
  END IF;

  -- The row is active now, and approving it again is refused.
  PERFORM 1 FROM public.maintenance_manual_spec_row WHERE id = v_spec AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'the spec row did not become active'; END IF;

  BEGIN
    PERFORM public.maintenance_manual_spec_approve(v_spec, ARRAY[v_v2016], NULL);
    RAISE EXCEPTION 'an approved value was approved twice';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%already active%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'check_8_spec_approve: two versions written, the third untouched, two history lines at printed page 521';
END $$;

-- A car outside the manual's family is refused.
DO $$
DECLARE
  v_manual uuid := 'b6000001-0000-4000-8000-000000000031'::uuid;
  v_spec uuid;
BEGIN
  INSERT INTO public.maintenance_manual_spec_row (
    manual_id, evidence_page, kind, key, value
  ) VALUES (
    v_manual, 523, 'fluid', 'coolant_capacity_l', '{"value": 4.4, "unit": "L"}'::jsonb
  ) RETURNING id INTO v_spec;

  BEGIN
    PERFORM public.maintenance_manual_spec_approve(
      v_spec, ARRAY['b6000001-0000-4000-8000-000000000023'::uuid], NULL
    );
    RAISE EXCEPTION 'a value was written to another model''s car';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%not one of this manual%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'check_9_spec_family_guard: another model''s car refused';
END $$;

-- ---------------------------------------------------------------------------
-- 10. DOC-06/10: tyres, bulbs, battery and a named spec value find their homes
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_manual uuid := 'b6000001-0000-4000-8000-000000000031'::uuid;
  v_v2021 uuid := 'b6000001-0000-4000-8000-000000000022'::uuid;
  v_tyre uuid;
  v_bulb uuid;
  v_battery uuid;
  v_spec uuid;
  v_val text;
  v_kpa int;
BEGIN
  INSERT INTO public.maintenance_manual_spec_row (manual_id, evidence_page, kind, key, value)
  VALUES (v_manual, 525, 'tyre', 'front',
    '{"size":"165/65R14","load_speed_index":"79S","wheel_size":"14x5J","pressure_kpa":260,"is_optional":false}'::jsonb)
  RETURNING id INTO v_tyre;
  PERFORM public.maintenance_manual_spec_approve(v_tyre, ARRAY[v_v2021], NULL);

  SELECT pressure_kpa INTO v_kpa FROM public.vehicle_tyre
  WHERE vehicle_catalog_id = v_v2021 AND position = 'front' AND size = '165/65R14';
  IF v_kpa IS DISTINCT FROM 260 THEN
    RAISE EXCEPTION 'the front tyre pressure did not land, got %', v_kpa;
  END IF;

  INSERT INTO public.maintenance_manual_spec_row (manual_id, evidence_page, kind, key, value)
  VALUES (v_manual, 525, 'bulb', 'Headlamp',
    '{"bulb_ref":"H4","wattage_w":"60/55","is_led":false}'::jsonb)
  RETURNING id INTO v_bulb;
  PERFORM public.maintenance_manual_spec_approve(v_bulb, ARRAY[v_v2021], NULL);

  PERFORM 1 FROM public.vehicle_bulb
  WHERE vehicle_catalog_id = v_v2021 AND position = 'Headlamp' AND bulb_ref = 'H4';
  IF NOT FOUND THEN RAISE EXCEPTION 'the headlamp bulb did not land'; END IF;

  INSERT INTO public.maintenance_manual_spec_row (manual_id, evidence_page, kind, key, value)
  VALUES (v_manual, 524, 'battery', 'battery_jis',
    '{"value":"M-42","note":"N-55 on cars with the electric parking brake"}'::jsonb)
  RETURNING id INTO v_battery;
  PERFORM public.maintenance_manual_spec_approve(v_battery, ARRAY[v_v2021], NULL);

  SELECT s.value INTO v_val FROM public.catalog_spec_value s
  WHERE s.scope = 'variant' AND s.spec_key = 'battery_jis' AND s.vehicle_catalog_id = v_v2021;
  IF v_val IS DISTINCT FROM 'M-42' THEN
    RAISE EXCEPTION 'the battery size did not land, got %', v_val;
  END IF;

  PERFORM 1 FROM public.catalog_spec_value s
  WHERE s.spec_key = 'battery_jis' AND s.vehicle_catalog_id = v_v2021
    AND s.trust_route = 'maker_document' AND s.trust = 'confirmed'
    AND s.source_note LIKE '%printed page 520%';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the battery row must be maker_document, confirmed and cite printed page 520';
  END IF;

  -- A named fluid value that has no catalogue column (CVT capacity).
  INSERT INTO public.maintenance_manual_spec_row (manual_id, evidence_page, kind, key, value, applies_to)
  VALUES (v_manual, 523, 'fluid', 'transmission_fluid_capacity_l',
    '{"value":5.8,"unit":"L"}'::jsonb, '1KR-FE')
  RETURNING id INTO v_spec;
  PERFORM public.maintenance_manual_spec_approve(v_spec, ARRAY[v_v2021], NULL);

  SELECT s.value INTO v_val FROM public.catalog_spec_value s
  WHERE s.scope = 'variant' AND s.spec_key = 'transmission_fluid_capacity_l'
    AND s.vehicle_catalog_id = v_v2021;
  IF v_val IS DISTINCT FROM '5.8' THEN
    RAISE EXCEPTION 'the CVT capacity did not land, got %', v_val;
  END IF;

  RAISE NOTICE 'check_10_spec_homes: tyre, bulb, battery and a named fluid value';
END $$;

-- ---------------------------------------------------------------------------
-- 11. DOC-12: "Now -> Manual" — the catalogue's current value per version
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_now text;
  v_seen int;
BEGIN
  SELECT count(*) INTO v_seen
  FROM public.maintenance_manual_spec_current('b6000001-0000-4000-8000-000000000031'::uuid);

  IF v_seen = 0 THEN
    RAISE EXCEPTION 'the current-value read returned nothing';
  END IF;

  SELECT now_value INTO v_now
  FROM public.maintenance_manual_spec_current('b6000001-0000-4000-8000-000000000031'::uuid)
  WHERE spec_key = 'engine_oil_capacity_l'
    AND vehicle_catalog_id = 'b6000001-0000-4000-8000-000000000022'::uuid;

  IF v_now IS DISTINCT FROM '2.9' THEN
    RAISE EXCEPTION 'the current oil capacity should read 2.9 after approval, got %', v_now;
  END IF;

  RAISE NOTICE 'check_11_spec_current: every listed spec has a current value per version';
END $$;

-- ---------------------------------------------------------------------------
-- 12. DOC-06/10: rejecting needs a reason, and a rejected row is not approved
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_manual uuid := 'b6000001-0000-4000-8000-000000000031'::uuid;
  v_spec uuid;
  v_ok boolean := false;
BEGIN
  INSERT INTO public.maintenance_manual_spec_row (manual_id, evidence_page, kind, key, value)
  VALUES (v_manual, 522, 'fluid', 'engine_oil_grade', '{"value":"0W-20"}'::jsonb)
  RETURNING id INTO v_spec;

  BEGIN
    PERFORM public.maintenance_manual_spec_reject(v_spec, 'too short', NULL);
    RAISE EXCEPTION 'a 9-character rejection reason was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%at least 10 characters%' THEN RAISE; END IF;
    v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'the rejection reason check did not fire'; END IF;

  PERFORM public.maintenance_manual_spec_reject(v_spec, 'the page prints two grades', NULL);

  PERFORM 1 FROM public.maintenance_manual_spec_row WHERE id = v_spec AND status = 'rejected';
  IF NOT FOUND THEN RAISE EXCEPTION 'the row was not rejected'; END IF;

  BEGIN
    PERFORM public.maintenance_manual_spec_approve(v_spec, ARRAY['b6000001-0000-4000-8000-000000000021'::uuid], NULL);
    RAISE EXCEPTION 'a rejected value was approved';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%already rejected%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'check_12_spec_reject: a reason of at least 10 characters, and a rejected row stays out';
END $$;

-- ---------------------------------------------------------------------------
-- 13. DOC-06: re-reading a page replaces that page's DRAFTS only
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_manual uuid := 'b6000001-0000-4000-8000-000000000031'::uuid;
  v_written int;
  v_active int;
  v_drafts int;
BEGIN
  -- Page 528 has no rows yet: a read writes two drafts.
  SELECT public.maintenance_manual_replace_page_specs(v_manual, 528, '[
    {"kind":"fluid","key":"washer_capacity_l","value":{"value":2.0,"unit":"L"},"confidence":"likely"},
    {"kind":"fluid","key":"transfer_oil_capacity_l","value":{"value":0.57,"unit":"L"},"confidence":"uncertain"}
  ]'::jsonb) INTO v_written;

  IF v_written <> 2 THEN
    RAISE EXCEPTION 'expected 2 spec drafts on page 528, got %', v_written;
  END IF;

  -- One of them is approved, so a re-read must keep it.
  UPDATE public.maintenance_manual_spec_row
  SET status = 'active', confidence = 'confirmed'
  WHERE manual_id = v_manual AND evidence_page = 528 AND key = 'washer_capacity_l';
  SELECT public.maintenance_manual_replace_page_specs(v_manual, 528, '[
    {"kind":"fluid","key":"washer_capacity_l","value":{"value":1.9,"unit":"L"},"confidence":"likely"}
  ]'::jsonb) INTO v_written;

  SELECT count(*) INTO v_active FROM public.maintenance_manual_spec_row
  WHERE manual_id = v_manual AND evidence_page = 528 AND status = 'active';
  IF v_active <> 1 THEN
    RAISE EXCEPTION 'the approved row must survive a re-read, % active', v_active;
  END IF;

  SELECT count(*) INTO v_drafts FROM public.maintenance_manual_spec_row
  WHERE manual_id = v_manual AND evidence_page = 528 AND status = 'draft';
  IF v_drafts <> 1 THEN
    RAISE EXCEPTION 'the re-read must leave exactly one draft on the page, % found', v_drafts;
  END IF;

  RAISE NOTICE 'check_13_spec_reread: drafts replaced, the approved row kept';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'maintenance_rebuild_step6b_checks: ok';
END $$;

ROLLBACK;

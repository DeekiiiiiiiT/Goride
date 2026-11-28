-- Maintenance rebuild step 3 checks: the manual reader's queue, its security, and the approve path.
-- Made-up fixture data; every function is the real one. Rolls back.
-- Run with psql -v ON_ERROR_STOP=1 -f supabase/tests/maintenance_rebuild_step3_checks.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures: one model family, one car of that family, two part types, one manual
-- ---------------------------------------------------------------------------
INSERT INTO public.engine_family (id, code)
VALUES ('b6000001-0000-4000-8000-000000000003'::uuid, 'STEP3-ENG')
ON CONFLICT DO NOTHING;

INSERT INTO public.vehicle_platform (id, code, maker, label, parent_id, family_evidence_url)
VALUES
  ('b6000001-0000-4000-8000-000000000001'::uuid, 'STEP3-FAMILY', 'StepThree', 'Step3 family', NULL, NULL),
  ('b6000001-0000-4000-8000-000000000002'::uuid, 'STEP3-VARIANT', 'StepThree', 'Step3 variant',
   'b6000001-0000-4000-8000-000000000001'::uuid, 'https://example.com/step3-family')
ON CONFLICT DO NOTHING;

INSERT INTO public.vehicle_catalog (
  id, make, model, chassis_code, production_start_year, production_end_year,
  platform_id, engine_family_id, vehicle_class, fuel_type, engine_type, fuel_category,
  powertrain, fuel, powertrain_status
) VALUES (
  'b6000001-0000-4000-8000-000000000004'::uuid, 'StepThree', 'Step3Car', 'STEP3-CHASSIS', 2018, 2022,
  'b6000001-0000-4000-8000-000000000002'::uuid,
  'b6000001-0000-4000-8000-000000000003'::uuid,
  'car', 'Petrol', 'Turbo', 'Gas', 'ice', 'petrol', 'confirmed'
)
ON CONFLICT DO NOTHING;

INSERT INTO fleet.vehicles (id, organization_id, license_plate, legacy_kv_id, vehicle_catalog_id, year)
VALUES (
  'step3_car', 'step3_org', 'step3_plate', 'step3_legacy',
  'b6000001-0000-4000-8000-000000000004', 2020
)
ON CONFLICT (id) DO UPDATE SET vehicle_catalog_id = EXCLUDED.vehicle_catalog_id;

INSERT INTO public.maintenance_manual (
  id, platform_id, market, title, file_key, file_sha256, page_count, page_from, page_to, status
) VALUES (
  'b6000001-0000-4000-8000-000000000010'::uuid,
  'b6000001-0000-4000-8000-000000000001'::uuid,
  'JM', 'Step3 Jamaica manual', 'maintenance-manuals/step3.pdf', repeat('e', 64), 232, 210, 212, 'reading'
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. The queue table's own rules
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_manual uuid := 'b6000001-0000-4000-8000-000000000010'::uuid;
BEGIN
  INSERT INTO public.maintenance_manual_page_job (manual_id, page_no, status)
  VALUES (v_manual, 210, 'queued');

  -- One row per page.
  BEGIN
    INSERT INTO public.maintenance_manual_page_job (manual_id, page_no, status)
    VALUES (v_manual, 210, 'queued');
    RAISE EXCEPTION 'a second row for the same page was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- A status nobody can act on is refused.
  BEGIN
    INSERT INTO public.maintenance_manual_page_job (manual_id, page_no, status)
    VALUES (v_manual, 211, 'banana');
    RAISE EXCEPTION 'an unknown page status was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- A page number below 1 is refused.
  BEGIN
    INSERT INTO public.maintenance_manual_page_job (manual_id, page_no, status)
    VALUES (v_manual, 0, 'queued');
    RAISE EXCEPTION 'page 0 was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- A failed page has to say why.
  BEGIN
    UPDATE public.maintenance_manual_page_job SET status = 'failed'
    WHERE manual_id = v_manual AND page_no = 210;
    RAISE EXCEPTION 'a failed page with no reason was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'check_1_page_queue_shape: one row per page, known statuses, a reason on a failure';
END $$;

-- ---------------------------------------------------------------------------
-- 2. The queue is server-only
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.maintenance_manual_page_job'::regclass) THEN
    RAISE EXCEPTION 'row level security is off on the page queue';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('maintenance_manual_page_job', 'maintenance_manual_worker_lock')
      AND grantee IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'anon or authenticated holds a grant on a manual queue table';
  END IF;

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM 1 FROM public.maintenance_manual_page_job LIMIT 1;
    RAISE EXCEPTION 'anon could read the page queue';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%permission denied%' AND SQLERRM NOT LIKE '%Insufficient%' THEN RAISE; END IF;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM 1 FROM public.maintenance_manual_page_job LIMIT 1;
    RAISE EXCEPTION 'authenticated could read the page queue';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%permission denied%' AND SQLERRM NOT LIKE '%Insufficient%' THEN RAISE; END IF;
  END;

  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM 1 FROM public.maintenance_manual_page_job LIMIT 1;
  EXCEPTION
    WHEN OTHERS THEN RAISE EXCEPTION 'service_role must read the page queue: %', SQLERRM;
  END;

  RAISE NOTICE 'check_2_page_queue_access: anon and authenticated refused, service_role allowed';
END $$;

-- ---------------------------------------------------------------------------
-- 3. Rejecting a manual needs a real reason
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_manual uuid := 'b6000001-0000-4000-8000-000000000010'::uuid;
BEGIN
  BEGIN
    PERFORM public.maintenance_manual_reject(v_manual, 'bad', NULL);
    RAISE EXCEPTION 'a short reject reason was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%at least 10 characters%' THEN RAISE; END IF;
  END;

  -- The table's own check refuses it too, whatever writes the row.
  BEGIN
    UPDATE public.maintenance_manual
    SET status = 'rejected', reject_reason = 'too short'
    WHERE id = v_manual;
    RAISE EXCEPTION 'a short reject reason was written straight to the table';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'check_3_reject_reason: a rejection needs at least 10 characters';
END $$;

-- ---------------------------------------------------------------------------
-- 4. Re-reading a page replaces that page's drafts and never touches an approved rule
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_manual uuid := 'b6000001-0000-4000-8000-000000000010'::uuid;
  v_inserted int;
  v_old_draft uuid;
  v_active_before uuid;
  v_active_after text;
  v_remaining int;
BEGIN
  -- Two rows on page 210.
  v_inserted := public.maintenance_manual_replace_page_drafts(
    v_manual,
    210,
    jsonb_build_array(
      jsonb_build_object('task_name', 'Step3 engine oil', 'task_code', 'step3-p210-oil',
        'interval_km', 7000, 'interval_months', 6, 'confidence', 'likely'),
      jsonb_build_object('task_name', 'Step3 oil filter', 'task_code', 'step3-p210-filter',
        'interval_km', 10000, 'interval_months', 12, 'confidence', 'likely')
    )
  );
  IF v_inserted <> 2 THEN RAISE EXCEPTION 'expected 2 drafts, got %', v_inserted; END IF;

  SELECT id INTO v_old_draft
  FROM public.maintenance_task_templates
  WHERE manual_id = v_manual AND evidence_page = 210 AND task_code = 'step3-p210-filter';

  -- One of them is approved (the owner said yes to it).
  UPDATE public.maintenance_task_templates SET status = 'active', confidence = 'confirmed'
  WHERE id = v_old_draft;

  SELECT id INTO v_active_before
  FROM public.maintenance_task_templates
  WHERE manual_id = v_manual AND status = 'active';

  -- Reading page 210 again writes it afresh.
  v_inserted := public.maintenance_manual_replace_page_drafts(
    v_manual,
    210,
    jsonb_build_array(
      jsonb_build_object('task_name', 'Step3 engine oil again', 'task_code', 'step3-p210-oil',
        'interval_km', 8000, 'interval_months', 6, 'confidence', 'likely')
    )
  );
  IF v_inserted <> 1 THEN RAISE EXCEPTION 'expected 1 draft after re-reading, got %', v_inserted; END IF;

  SELECT status INTO v_active_after FROM public.maintenance_task_templates WHERE id = v_active_before;
  IF v_active_after <> 'active' THEN
    RAISE EXCEPTION 're-reading a page changed an approved rule (now %)', v_active_after;
  END IF;

  SELECT count(*) INTO v_remaining
  FROM public.maintenance_task_templates
  WHERE manual_id = v_manual AND status = 'draft';
  IF v_remaining <> 1 THEN
    RAISE EXCEPTION 'expected the page to hold exactly one draft after re-reading, got %', v_remaining;
  END IF;

  -- The old draft for that page is gone, not doubled.
  IF EXISTS (
    SELECT 1 FROM public.maintenance_task_templates
    WHERE manual_id = v_manual AND task_code = 'step3-p210-filter' AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'the replaced draft is still there';
  END IF;

  RAISE NOTICE 'check_4_reread: the page is replaced, the approved rule is untouched';
END $$;

-- ---------------------------------------------------------------------------
-- 5. Approving makes the rule live and the family's car switches to it
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_manual uuid := 'b6000001-0000-4000-8000-000000000010'::uuid;
  v_oil uuid;
  v_before numeric;
  v_after numeric;
  v_rule uuid;
  v_approved int;
  v_rule_row uuid;
BEGIN
  SELECT id INTO v_oil FROM public.maintenance_service_categories WHERE code = 'oil' AND kind = 'component';
  IF v_oil IS NULL THEN RAISE EXCEPTION 'the oil part type is missing'; END IF;

  -- Before approval the car follows the everyone (Roam policy) rule.
  DELETE FROM public.vehicle_component_schedule WHERE vehicle_id = 'step3_car';
  PERFORM public.recompute_component_schedules_for_car('step3_org', 'step3_car');
  SELECT interval_km_used INTO v_before
  FROM public.vehicle_component_schedule
  WHERE vehicle_id = 'step3_car' AND category_id = v_oil;
  IF v_before IS DISTINCT FROM 5000 THEN
    RAISE EXCEPTION 'expected the everyone rule (5000) before approval, got %', v_before;
  END IF;

  -- A draft read from page 211 for the same part, at the family level, from the JM manual.
  PERFORM public.maintenance_manual_replace_page_drafts(
    v_manual,
    211,
    jsonb_build_array(jsonb_build_object(
      'component_id', v_oil,
      'task_name', 'Step3 manual engine oil',
      'task_code', 'step3-p211-oil',
      'interval_km', 7000,
      'interval_months', 6,
      'confidence', 'likely'
    ))
  );

  SELECT id INTO v_rule
  FROM public.maintenance_task_templates
  WHERE manual_id = v_manual AND evidence_page = 211 AND status = 'draft';

  SELECT count(*) INTO v_approved
  FROM public.maintenance_manual_approve(v_manual, ARRAY[v_rule], NULL);

  IF v_approved <> 1 THEN RAISE EXCEPTION 'expected one approved rule, got %', v_approved; END IF;

  SELECT t.id INTO v_rule_row
  FROM public.maintenance_task_templates t
  WHERE t.id = v_rule AND t.status = 'active' AND t.confidence = 'confirmed';
  IF v_rule_row IS NULL THEN RAISE EXCEPTION 'the approved rule is not active and confirmed'; END IF;

  IF (SELECT market FROM public.maintenance_task_templates WHERE id = v_rule) <> 'JM' THEN
    RAISE EXCEPTION 'the rule did not take the manual''s market';
  END IF;
  IF (SELECT evidence_page FROM public.maintenance_task_templates WHERE id = v_rule) IS DISTINCT FROM 211 THEN
    RAISE EXCEPTION 'the approved rule lost its page';
  END IF;

  PERFORM public.recompute_component_schedules_for_rule(v_rule);

  SELECT interval_km_used INTO v_after
  FROM public.vehicle_component_schedule
  WHERE vehicle_id = 'step3_car' AND category_id = v_oil;
  IF v_after IS DISTINCT FROM 7000 THEN
    RAISE EXCEPTION 'the car did not switch to the manual''s numbers (got %)', v_after;
  END IF;

  IF (SELECT rule_id FROM public.vehicle_component_schedule
      WHERE vehicle_id = 'step3_car' AND category_id = v_oil) IS DISTINCT FROM v_rule THEN
    RAISE EXCEPTION 'the car is not on the approved rule';
  END IF;

  RAISE NOTICE 'check_5_approve: everyone rule 5000 -> JM family rule 7000 on the car';
END $$;

-- ---------------------------------------------------------------------------
-- 6. "All" leaves needs-checking rows alone and says how many
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_manual uuid := 'b6000001-0000-4000-8000-000000000010'::uuid;
  v_certain uuid;
  v_uncertain uuid;
  v_approved int;
BEGIN
  PERFORM public.maintenance_manual_replace_page_drafts(
    v_manual,
    212,
    jsonb_build_array(
      jsonb_build_object('task_name', 'Step3 certain row', 'task_code', 'step3-p212-certain',
        'interval_km', 12000, 'interval_months', 12, 'confidence', 'likely'),
      jsonb_build_object('task_name', 'Step3 uncertain row', 'task_code', 'step3-p212-uncertain',
        'interval_km', 20000, 'interval_months', 24, 'confidence', 'uncertain',
        'draft_note', 'No Roam part type matched')
    )
  );

  SELECT id INTO v_certain FROM public.maintenance_task_templates
  WHERE manual_id = v_manual AND task_code = 'step3-p212-certain';
  SELECT id INTO v_uncertain FROM public.maintenance_task_templates
  WHERE manual_id = v_manual AND task_code = 'step3-p212-uncertain';

  SELECT count(*) INTO v_approved FROM public.maintenance_manual_approve(v_manual, NULL, NULL);
  IF v_approved < 1 THEN RAISE EXCEPTION 'all approved nothing'; END IF;

  IF (SELECT status FROM public.maintenance_task_templates WHERE id = v_certain) <> 'active' THEN
    RAISE EXCEPTION 'the certain row was not approved by all';
  END IF;
  IF (SELECT status FROM public.maintenance_task_templates WHERE id = v_uncertain) <> 'draft' THEN
    RAISE EXCEPTION 'all approved a needs-checking row';
  END IF;

  RAISE NOTICE 'check_6_approve_all: the certain row went live, the needs-checking row stayed a draft';
END $$;

-- ---------------------------------------------------------------------------
-- 7. Progress, waiting_check, and stop
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_manual uuid := 'b6000001-0000-4000-8000-000000000010'::uuid;
  v_job uuid;
  v_status text;
  v_progress int;
  v_skipped int;
BEGIN
  DELETE FROM public.maintenance_manual_page_job WHERE manual_id = v_manual;
  PERFORM public.maintenance_manual_queue_pages(v_manual, ARRAY[210, 211, 212]);

  SELECT id INTO v_job FROM public.maintenance_manual_page_job
  WHERE manual_id = v_manual AND page_no = 210;

  PERFORM public.maintenance_manual_finish_page(v_job, 'done', 2, NULL);

  SELECT status, progress_page INTO v_status, v_progress
  FROM public.maintenance_manual WHERE id = v_manual;
  IF v_status <> 'reading' THEN RAISE EXCEPTION 'one page of three must leave it reading, got %', v_status; END IF;
  IF v_progress <> 210 THEN RAISE EXCEPTION 'progress should be page 210, got %', v_progress; END IF;

  -- A page that keeps failing is failed with its reason, and the progress keeps moving.
  SELECT id INTO v_job FROM public.maintenance_manual_page_job
  WHERE manual_id = v_manual AND page_no = 211;
  PERFORM public.maintenance_manual_finish_page(v_job, 'failed', NULL, 'The page could not be read.');

  -- Stopping skips what has not started and closes the manual.
  v_skipped := public.maintenance_manual_stop(v_manual, 'Wrong manual, sorry.', NULL);
  IF v_skipped <> 1 THEN RAISE EXCEPTION 'expected one page skipped, got %', v_skipped; END IF;

  SELECT status INTO v_status FROM public.maintenance_manual WHERE id = v_manual;
  IF v_status <> 'stopped' THEN RAISE EXCEPTION 'stop did not close the manual, got %', v_status; END IF;

  -- The rows read before the stop are kept.
  IF NOT EXISTS (
    SELECT 1 FROM public.maintenance_task_templates WHERE manual_id = v_manual AND evidence_page = 212
  ) THEN
    RAISE EXCEPTION 'stopping threw away the rows already read';
  END IF;

  RAISE NOTICE 'check_7_progress_and_stop: page N of M moves, stop closes it and keeps the rows';
END $$;

-- ---------------------------------------------------------------------------
-- 8. A finished read says waiting_check
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_manual uuid := 'b6000001-0000-4000-8000-000000000010'::uuid;
  v_job record;
  v_status text;
BEGIN
  UPDATE public.maintenance_manual SET status = 'reading', stop_reason = NULL WHERE id = v_manual;
  UPDATE public.maintenance_manual_page_job SET status = 'queued', finished_at = NULL, error = NULL
  WHERE manual_id = v_manual;

  FOR v_job IN SELECT id FROM public.maintenance_manual_page_job WHERE manual_id = v_manual LOOP
    PERFORM public.maintenance_manual_finish_page(v_job.id, 'done', 0, NULL);
  END LOOP;

  SELECT status INTO v_status FROM public.maintenance_manual WHERE id = v_manual;
  IF v_status <> 'waiting_check' THEN
    RAISE EXCEPTION 'a fully read manual must be waiting_check, got %', v_status;
  END IF;

  RAISE NOTICE 'check_8_waiting_check: every page finished sets waiting_check';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'maintenance_rebuild_step3_checks: ok';
END $$;

ROLLBACK;

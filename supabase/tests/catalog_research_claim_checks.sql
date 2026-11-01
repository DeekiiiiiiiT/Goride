-- Catalog research claim / promote B5 checks (local replay DB only).
BEGIN;

DO $$
DECLARE
  v_vc uuid := '33333333-3333-4333-8333-333333333333';
  v_comp uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8';
  v_job_id uuid;
  v_job_b uuid;
  v_claim jsonb;
  v_msg bigint;
  v_prop uuid;
  v_part uuid;
  v_promote jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vehicle_catalog WHERE id = v_vc) THEN
    RAISE EXCEPTION 'fixture vehicle_catalog missing — run parts_rev2_checks seed first';
  END IF;

  UPDATE public.catalog_research_settings SET enabled = true, paused = false, daily_job_limit = 500 WHERE id = 1;

  INSERT INTO public.catalog_research_job (
    id, job_type, group_key, vehicle_catalog_id, maintenance_component_id,
    fit_descriptor, match_type, fleet_count, state, pgmq_read_ct
  ) VALUES (
    'c1111111-1111-4111-8111-111111111111',
    'part',
    'claim-test-a:serpentine:OEM',
    v_vc, v_comp, 'front', 'OEM', 1, 'queued', 0
  ) ON CONFLICT (id) DO UPDATE SET state = 'queued', pgmq_msg_id = NULL, pgmq_queue = NULL, pgmq_read_ct = 0, updated_at = now();

  SELECT public.catalog_research_enqueue_job('c1111111-1111-4111-8111-111111111111'::uuid) INTO v_msg;

  v_claim := public.catalog_research_claim();
  IF coalesce(v_claim->>'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'expected claim success, got %', v_claim;
  END IF;

  UPDATE public.catalog_research_job SET state = 'queued', pgmq_msg_id = NULL, pgmq_queue = NULL, pgmq_read_ct = 0, updated_at = now()
  WHERE id = 'c1111111-1111-4111-8111-111111111111';
  PERFORM pgmq.archive('catalog_research', v_msg);

  INSERT INTO public.catalog_research_job (
    id, job_type, group_key, vehicle_catalog_id, maintenance_component_id,
    fit_descriptor, match_type, fleet_count, state, pgmq_read_ct, updated_at
  ) VALUES (
    'c2222222-2222-4222-8222-222222222222',
    'part',
    'claim-test-busy:serpentine:OEM',
    v_vc, v_comp, 'front', 'OEM', 1, 'researching', 0, now()
  ) ON CONFLICT (id) DO UPDATE SET state = 'researching', updated_at = now();

  v_claim := public.catalog_research_claim();
  IF v_claim->>'reason' IS DISTINCT FROM 'busy' THEN
    RAISE EXCEPTION 'expected busy while researching, got %', v_claim;
  END IF;

  DELETE FROM public.catalog_research_job WHERE id = 'c2222222-2222-4222-8222-222222222222';

  INSERT INTO public.catalog_research_job (
    id, job_type, group_key, vehicle_catalog_id, maintenance_component_id,
    fit_descriptor, match_type, fleet_count, state, pgmq_read_ct
  ) VALUES (
    'c3333333-3333-4333-8333-333333333333',
    'part',
    'claim-test-priority:serpentine:OEM',
    v_vc, v_comp, 'front', 'OEM', 1, 'queued', 0
  ) ON CONFLICT (id) DO UPDATE SET state = 'queued', pgmq_msg_id = NULL, pgmq_queue = NULL, pgmq_read_ct = 0;

  PERFORM public.catalog_research_enqueue_job('c3333333-3333-4333-8333-333333333333'::uuid);

  INSERT INTO public.catalog_research_job (
    id, job_type, group_key, vehicle_catalog_id, maintenance_component_id,
    fit_descriptor, match_type, fleet_count, state, pgmq_read_ct
  ) VALUES (
    'c4444444-4444-4444-8444-444444444444',
    'part',
    'claim-test-priority-b:serpentine:OEM',
    v_vc, v_comp, 'rear', 'OEM', 1, 'queued', 0
  ) ON CONFLICT (id) DO UPDATE SET state = 'queued', pgmq_msg_id = NULL, pgmq_queue = NULL, pgmq_read_ct = 0;

  PERFORM public.catalog_research_priority_enqueue('c4444444-4444-4444-8444-444444444444'::uuid);

  v_claim := public.catalog_research_claim();
  IF (v_claim->>'jobId')::uuid IS DISTINCT FROM 'c4444444-4444-4444-8444-444444444444'::uuid THEN
    RAISE EXCEPTION 'Research next: expected priority job, got %', v_claim;
  END IF;

  UPDATE public.catalog_research_settings SET daily_job_limit = 0 WHERE id = 1;
  v_claim := public.catalog_research_claim();
  IF v_claim->>'reason' IS DISTINCT FROM 'daily_limit' THEN
    RAISE EXCEPTION 'expected daily_limit, got %', v_claim;
  END IF;
  UPDATE public.catalog_research_settings SET daily_job_limit = 500 WHERE id = 1;

  INSERT INTO public.catalog_research_job (
    id, job_type, group_key, vehicle_catalog_id, maintenance_component_id,
    fit_descriptor, match_type, fleet_count, state, pgmq_read_ct
  ) VALUES (
    'c5555555-5555-4555-8555-555555555555',
    'part',
    'promote-test:serpentine:OEM',
    v_vc, v_comp, 'front', 'OEM', 1, 'needs_review', 0
  ) ON CONFLICT (id) DO UPDATE SET state = 'needs_review';

  v_prop := gen_random_uuid();
  INSERT INTO public.catalog_part_proposal (
    id, job_id, brand, part_number, part_number_norm, part_name, match_type, route
  ) VALUES (
    v_prop, 'c5555555-5555-4555-8555-555555555555', 'Toyota', 'TEST-123', 'TEST123', 'Test belt', 'OEM', 'review'
  );

  v_promote := public.promote_part_proposal(v_prop, NULL);
  v_part := (v_promote->>'partId')::uuid;
  v_promote := public.promote_part_proposal(v_prop, NULL);
  IF coalesce(v_promote->>'idempotent', 'false') <> 'true' THEN
    RAISE EXCEPTION 'expected idempotent second promote, got %', v_promote;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_research_job
    WHERE id = 'c5555555-5555-4555-8555-555555555555' AND state = 'queued'
  ) THEN
    NULL;
  END IF;

  -- R22: complete_msg archives with explicit queue
  INSERT INTO public.catalog_research_job (
    id, job_type, group_key, vehicle_catalog_id, maintenance_component_id,
    fit_descriptor, match_type, fleet_count, state, pgmq_read_ct
  ) VALUES (
    'c6666666-6666-4666-8666-666666666666',
    'part',
    'archive-test:serpentine:OEM',
    v_vc, v_comp, 'front', 'OEM', 1, 'queued', 0
  ) ON CONFLICT (id) DO UPDATE SET state = 'queued', pgmq_msg_id = NULL, pgmq_queue = NULL, pgmq_read_ct = 0;

  SELECT public.catalog_research_enqueue_job('c6666666-6666-4666-8666-666666666666'::uuid) INTO v_msg;
  v_claim := public.catalog_research_claim();
  IF coalesce(v_claim->>'claimed', 'false') <> 'true' THEN
    RAISE EXCEPTION 'archive test: expected claim, got %', v_claim;
  END IF;
  UPDATE public.catalog_research_job SET state = 'needs_review', updated_at = now() WHERE id = 'c6666666-6666-4666-8666-666666666666';
  PERFORM public.catalog_research_complete_msg(v_msg, 'catalog_research');
  v_claim := public.catalog_research_claim();
  IF v_claim->>'reason' IS DISTINCT FROM 'empty' THEN
    RAISE EXCEPTION 'archive test: expected empty queue after complete_msg, got %', v_claim;
  END IF;

  -- R22: stale message for needs_review must not fail job
  INSERT INTO public.catalog_research_job (
    id, job_type, group_key, vehicle_catalog_id, maintenance_component_id,
    fit_descriptor, match_type, fleet_count, state, pgmq_read_ct
  ) VALUES (
    'c7777777-7777-4777-8777-777777777777',
    'part',
    'stale-test:serpentine:OEM',
    v_vc, v_comp, 'front', 'OEM', 1, 'needs_review', 0
  ) ON CONFLICT (id) DO UPDATE SET state = 'needs_review', last_error = NULL, updated_at = now();

  PERFORM pgmq.send(
    'catalog_research',
    jsonb_build_object('jobId', 'c7777777-7777-4777-8777-777777777777'),
    0
  );
  FOR i IN 1..4 LOOP
    PERFORM pgmq.read('catalog_research', 600, 1);
  END LOOP;
  v_claim := public.catalog_research_claim();
  IF coalesce(v_claim->>'claimed', 'false') = 'true' THEN
    RAISE EXCEPTION 'stale test: expected no claim, got %', v_claim;
  END IF;
  IF v_claim->>'reason' IS DISTINCT FROM 'stale_job' THEN
    RAISE EXCEPTION 'stale test: expected stale_job, got %', v_claim;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_research_job
    WHERE id = 'c7777777-7777-4777-8777-777777777777' AND state = 'needs_review'
  ) THEN
    RAISE EXCEPTION 'stale test: job state changed from needs_review';
  END IF;
END $$;

ROLLBACK;

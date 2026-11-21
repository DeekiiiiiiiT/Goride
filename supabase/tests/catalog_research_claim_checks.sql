-- Catalog research claim checks (local replay DB only). Rewritten for the research engine layer 2 claim
-- (docs/research-engine-audit.md RE-10 / RE-28): spend cap instead of a job count, fleet and fill take turns,
-- single-flight per job. Seeds its own car + part type, so it runs on a schema-only replay.
BEGIN;

DO $$
DECLARE
  v_vc uuid;
  v_comp uuid := 'e2000000-0000-4000-8000-0000000000c2';
  v_claim jsonb;
  v_msg bigint;
  i integer;
BEGIN
  INSERT INTO public.vehicle_catalog (make, model, powertrain_status, chassis_code)
  VALUES ('Claimmake', 'Claimmodel', 'needs_check', 'CLM900') RETURNING id INTO v_vc;
  INSERT INTO public.maintenance_service_categories (id, code, name, kind, icon_key, sort_order)
  VALUES ('e2000000-0000-4000-8000-0000000000c1', 'chk-claim-area', 'Claim area', 'system', 'wrench', 980)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.maintenance_service_categories (id, code, name, kind, op_code, parent_id, icon_key, sort_order,
                                                     is_part, part_type_status, position_scheme)
  VALUES (v_comp, 'chk-claim-belt', 'Claim belt', 'component', 'CHK-CLAIM-BELT',
          'e2000000-0000-4000-8000-0000000000c1', 'wrench', 981, true, 'active', 'none')
  ON CONFLICT (id) DO NOTHING;

  -- Start from empty queues so earlier rows can't interfere.
  PERFORM pgmq.purge_queue(q) FROM unnest(ARRAY['catalog_research', 'catalog_research_fill', 'catalog_research_priority']) q;
  UPDATE public.catalog_research_settings
  SET enabled = true, paused = false, auto_resume_at = NULL, daily_spend_usd = 1000, claim_share_fleet = 0.5,
      last_claim_side = NULL
  WHERE id = 1;

  -- 1. Fleet and fill take turns; an empty side gives its turn away.
  INSERT INTO public.catalog_research_job (id, job_type, group_key, vehicle_catalog_id, maintenance_component_id, state, origin)
  VALUES
    ('c1111111-1111-4111-8111-111111111111', 'part', 'claim-fleet-1', v_vc, v_comp, 'queued', 'fleet'),
    ('c1111111-1111-4111-8111-111111111112', 'part', 'claim-fleet-2', v_vc, v_comp, 'queued', 'fleet'),
    ('c2222222-2222-4222-8222-222222222221', 'part', 'claim-fill-1', v_vc, v_comp, 'queued', 'owner_fill'),
    ('c2222222-2222-4222-8222-222222222222', 'part', 'claim-fill-2', v_vc, v_comp, 'queued', 'sweep');
  PERFORM public.catalog_research_enqueue_job(id) FROM public.catalog_research_job
  WHERE id IN ('c1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111112',
               'c2222222-2222-4222-8222-222222222221', 'c2222222-2222-4222-8222-222222222222')
  ORDER BY group_key;

  IF (SELECT pgmq_queue FROM public.catalog_research_job WHERE id = 'c2222222-2222-4222-8222-222222222221') <> 'catalog_research_fill'
     OR (SELECT pgmq_queue FROM public.catalog_research_job WHERE id = 'c1111111-1111-4111-8111-111111111111') <> 'catalog_research' THEN
    RAISE EXCEPTION 'enqueue should route fleet jobs and fill jobs to their own queues';
  END IF;

  v_claim := public.catalog_research_claim();
  IF v_claim->>'side' <> 'fleet' THEN RAISE EXCEPTION 'turn 1 should be fleet, got %', v_claim; END IF;
  v_claim := public.catalog_research_claim();
  IF v_claim->>'side' <> 'fill' THEN RAISE EXCEPTION 'turn 2 should be fill, got %', v_claim; END IF;
  v_claim := public.catalog_research_claim();
  IF v_claim->>'side' <> 'fleet' THEN RAISE EXCEPTION 'turn 3 should be fleet, got %', v_claim; END IF;
  v_claim := public.catalog_research_claim();
  IF v_claim->>'side' <> 'fill' THEN RAISE EXCEPTION 'turn 4 should be fill, got %', v_claim; END IF;

  -- 2. A job being worked on is not handed out again (its message is hidden), and another job still runs.
  v_claim := public.catalog_research_claim();
  IF v_claim->>'reason' IS DISTINCT FROM 'empty' THEN
    RAISE EXCEPTION 'claimed jobs must not be handed out twice, got %', v_claim;
  END IF;
  INSERT INTO public.catalog_research_job (id, job_type, group_key, vehicle_catalog_id, maintenance_component_id, state, origin)
  VALUES ('c3333333-3333-4333-8333-333333333333', 'part', 'claim-fleet-3', v_vc, v_comp, 'queued', 'fleet');
  PERFORM public.catalog_research_enqueue_job('c3333333-3333-4333-8333-333333333333'::uuid);
  v_claim := public.catalog_research_claim();
  IF (v_claim->>'jobId')::uuid IS DISTINCT FROM 'c3333333-3333-4333-8333-333333333333'::uuid THEN
    RAISE EXCEPTION 'a running job must not block a different job, got %', v_claim;
  END IF;

  -- 3. "Research next" goes first.
  INSERT INTO public.catalog_research_job (id, job_type, group_key, vehicle_catalog_id, maintenance_component_id, state, origin)
  VALUES
    ('c4444444-4444-4444-8444-444444444441', 'part', 'claim-fleet-4', v_vc, v_comp, 'queued', 'fleet'),
    ('c4444444-4444-4444-8444-444444444442', 'part', 'claim-priority', v_vc, v_comp, 'queued', 'sweep');
  PERFORM public.catalog_research_enqueue_job('c4444444-4444-4444-8444-444444444441'::uuid);
  PERFORM public.catalog_research_priority_enqueue('c4444444-4444-4444-8444-444444444442'::uuid);
  v_claim := public.catalog_research_claim();
  IF (v_claim->>'jobId')::uuid IS DISTINCT FROM 'c4444444-4444-4444-8444-444444444442'::uuid THEN
    RAISE EXCEPTION 'Research next: expected the priority job, got %', v_claim;
  END IF;

  -- 4. The daily limit is spend: at the cap nothing new starts.
  INSERT INTO private.api_usage_events (occurred_at, provider, service, route, model, status, requests, cost_usd)
  VALUES (now(), 'gemini', 'grounding', 'catalog_research/runCatalogPartResearch/search', 'gemini-3.8-flash', 'success', 5, 2.00);
  UPDATE public.catalog_research_settings SET daily_spend_usd = 1.35 WHERE id = 1;
  v_claim := public.catalog_research_claim();
  IF v_claim->>'reason' IS DISTINCT FROM 'spend_cap' THEN
    RAISE EXCEPTION 'expected spend_cap, got %', v_claim;
  END IF;
  UPDATE public.catalog_research_settings SET daily_spend_usd = 1000 WHERE id = 1;

  -- 5. complete_msg archives with the explicit queue.
  v_claim := public.catalog_research_claim();
  IF coalesce(v_claim->>'claimed', 'false') <> 'true' THEN RAISE EXCEPTION 'expected a claim, got %', v_claim; END IF;
  PERFORM public.catalog_research_complete_msg((v_claim->>'msgId')::bigint, v_claim->>'queue');
  UPDATE public.catalog_research_job SET state = 'needs_review' WHERE id = (v_claim->>'jobId')::uuid;
  v_claim := public.catalog_research_claim();
  IF v_claim->>'reason' IS DISTINCT FROM 'empty' THEN
    RAISE EXCEPTION 'expected an empty queue after complete_msg, got %', v_claim;
  END IF;

  -- 6. A stale message for a job already in review is dropped and never fails the job.
  INSERT INTO public.catalog_research_job (id, job_type, group_key, vehicle_catalog_id, maintenance_component_id, state, origin)
  VALUES ('c7777777-7777-4777-8777-777777777777', 'part', 'claim-stale', v_vc, v_comp, 'needs_review', 'fleet');
  PERFORM pgmq.send('catalog_research', jsonb_build_object('jobId', 'c7777777-7777-4777-8777-777777777777'), 0);
  FOR i IN 1..4 LOOP
    PERFORM pgmq.read('catalog_research', 0, 1);
  END LOOP;
  v_claim := public.catalog_research_claim();
  IF v_claim->>'reason' IS DISTINCT FROM 'stale_job' THEN
    RAISE EXCEPTION 'stale test: expected stale_job, got %', v_claim;
  END IF;
  IF (SELECT state FROM public.catalog_research_job WHERE id = 'c7777777-7777-4777-8777-777777777777') <> 'needs_review' THEN
    RAISE EXCEPTION 'stale test: job state changed from needs_review';
  END IF;

  RAISE NOTICE 'catalog_research_claim_checks: all passed';
END $$;

ROLLBACK;

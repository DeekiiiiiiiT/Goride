-- Saved catalogue pages → parts — database checks (docs/saved-page-parts-audit.md Rev 4, §3 D5).
-- One transaction, rolled back. Safe on the local copy and in CI's migration replay.
BEGIN;

DO $$
DECLARE
  v_car uuid;
  v_comp uuid;
  v_saved uuid;
  v_read uuid;
  v_job uuid;
  v_job2 uuid;
  v_res jsonb;
  v_n integer;
  v_text text;
  v_state text;
  v_stamp timestamptz;
  v_ok boolean;
  v_priv text;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. D1 + D3: RLS on, deny-all, no anon/authenticated grants, service_role only.
  -- -------------------------------------------------------------------------
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.research_saved_page'::regclass) THEN
    RAISE EXCEPTION 'RLS is off on research_saved_page';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'research_saved_page'
                   AND policyname = 'research_saved_page_deny_all') THEN
    RAISE EXCEPTION 'research_saved_page has no deny-all policy';
  END IF;
  FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF has_table_privilege('anon', 'public.research_saved_page', v_priv)
       OR has_table_privilege('authenticated', 'public.research_saved_page', v_priv) THEN
      RAISE EXCEPTION 'anon/authenticated can still % research_saved_page', v_priv;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.research_saved_page', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.research_saved_page', 'INSERT') THEN
    RAISE EXCEPTION 'service_role cannot use research_saved_page';
  END IF;
  IF has_function_privilege('anon', 'public.research_saved_page_job(uuid,uuid,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.research_saved_page_job(uuid,uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon/authenticated can still execute research_saved_page_job';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.research_saved_page_job(uuid,uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute research_saved_page_job';
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. D2: saved_page_id must point to a real saved page; deleting the page keeps the evidence.
  -- -------------------------------------------------------------------------
  INSERT INTO public.vehicle_catalog (make, model, powertrain_status, chassis_code)
  VALUES ('Savedpage', 'Checkmodel', 'needs_check', 'SPC900')
  RETURNING id INTO v_car;

  -- domain is plain text (no link to trusted_site): a stopped row may name a site that is not trusted.
  INSERT INTO public.research_saved_page (vehicle_catalog_id, domain, source_url, file_name, file_sha256, line_count,
                                          status, stop_reason, result, ai_cost_usd, uploaded_by)
  VALUES (v_car, 'not-trusted.example', 'https://not-trusted.example/page', 'page.html', repeat('a', 64), 310,
          'stopped', 'untrusted_site', jsonb_build_object('saved', 0), 0.0012, gen_random_uuid())
  RETURNING id INTO v_saved;

  INSERT INTO public.research_page_read (path, domain, url, checked_by, block_text, saved_page_id)
  VALUES ('owner_browser', 'parts.example', 'https://parts.example/car', gen_random_uuid(), 'PN-1 11.2016', v_saved)
  RETURNING id INTO v_read;

  -- Still append-only: only the FK cascade above may change a column, never an edit or a new saved page.
  v_ok := false;
  BEGIN
    UPDATE public.research_page_read SET block_text = 'changed' WHERE id = v_read;
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'research_page_read accepted an UPDATE'; END IF;
  v_ok := false;
  BEGIN
    UPDATE public.research_page_read SET saved_page_id = gen_random_uuid() WHERE id = v_read;
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'research_page_read accepted a new saved_page_id'; END IF;

  v_ok := false;
  BEGIN
    INSERT INTO public.research_page_read (path, domain, url, checked_by, block_text, saved_page_id)
    VALUES ('owner_browser', 'parts.example', 'https://parts.example/car', gen_random_uuid(), 'PN-2', gen_random_uuid());
  EXCEPTION WHEN foreign_key_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'research_page_read accepted a made-up saved_page_id'; END IF;

  DELETE FROM public.research_saved_page WHERE id = v_saved;
  IF NOT EXISTS (SELECT 1 FROM public.research_page_read WHERE id = v_read AND saved_page_id IS NULL) THEN
    RAISE EXCEPTION 'deleting a saved page must keep its evidence row and clear saved_page_id';
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. D3: never a second open job for the same car, part type and axle, whatever the fit text.
  -- -------------------------------------------------------------------------
  INSERT INTO public.maintenance_service_categories (code, name, kind, op_code, is_part, part_type_status,
                                                     position_scheme)
  VALUES ('saved-page-check-shock', 'Saved page shock', 'component', 'SP-CHK-SHOCK', true, 'active', 'four_corners')
  RETURNING id INTO v_comp;

  -- 'front' behind a 'fill:' key is reused, and a queued job is opened for the owner.
  INSERT INTO public.catalog_research_job (job_type, group_key, vehicle_catalog_id, maintenance_component_id,
                                           fit_descriptor, state, origin)
  VALUES ('part', format('fill:%s:%s:front', v_car, v_comp), v_car, v_comp, 'front', 'queued', 'fleet')
  RETURNING id INTO v_job;
  v_res := public.research_saved_page_job(v_car, v_comp, 'front', NULL);
  IF (v_res->>'jobId')::uuid IS DISTINCT FROM v_job OR v_res->>'state' <> 'browser_check' THEN
    RAISE EXCEPTION 'D3 should reuse and open the queued front job, got %', v_res;
  END IF;
  v_res := public.research_saved_page_job(v_car, v_comp, 'front', NULL);
  IF (v_res->>'jobId')::uuid IS DISTINCT FROM v_job THEN
    RAISE EXCEPTION 'D3 made a second open job for the same axle: %', v_res;
  END IF;

  -- 'front:both' behind a 'v2|' key is the same axle: still one open job, moved from needs_review.
  UPDATE public.catalog_research_job SET state = 'added' WHERE id = v_job;
  INSERT INTO public.catalog_research_job (job_type, group_key, vehicle_catalog_id, maintenance_component_id,
                                           fit_descriptor, state, origin)
  VALUES ('part', 'v2|' || gen_random_uuid()::text, v_car, v_comp, 'front:both', 'needs_review', 'fleet')
  RETURNING id INTO v_job2;
  v_res := public.research_saved_page_job(v_car, v_comp, 'front', NULL);
  IF (v_res->>'jobId')::uuid IS DISTINCT FROM v_job2 OR v_res->>'state' <> 'browser_check' THEN
    RAISE EXCEPTION 'D3 should open the needs_review front:both job, got %', v_res;
  END IF;
  SELECT count(*) INTO v_n
  FROM public.catalog_research_job j
  WHERE j.vehicle_catalog_id = v_car AND j.maintenance_component_id = v_comp
    AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check',
                    'browser_check_queued')
    AND (CASE WHEN lower(coalesce(j.fit_descriptor, '')) LIKE '%rear%' THEN 'rear'
              WHEN lower(coalesce(j.fit_descriptor, '')) LIKE '%front%' THEN 'front'
              ELSE '' END) = 'front';
  IF v_n <> 1 THEN RAISE EXCEPTION 'expected one open front job, found %', v_n; END IF;

  -- Empty fit text is the "none" axle, not the front one.
  UPDATE public.catalog_research_job SET state = 'added' WHERE id = v_job2;
  INSERT INTO public.catalog_research_job (job_type, group_key, vehicle_catalog_id, maintenance_component_id,
                                           fit_descriptor, state, origin)
  VALUES ('part', format('fill:%s:%s:', v_car, v_comp), v_car, v_comp, NULL, 'queued', 'fleet')
  RETURNING id INTO v_job;
  v_res := public.research_saved_page_job(v_car, v_comp, NULL, NULL);
  IF (v_res->>'jobId')::uuid IS DISTINCT FROM v_job OR v_res->>'state' <> 'browser_check' THEN
    RAISE EXCEPTION 'D3 should reuse the no-axle job, got %', v_res;
  END IF;

  -- No open rear job: D3 opens it as the browser check the owner would have opened by hand.
  UPDATE public.catalog_research_job SET state = 'added' WHERE id = v_job;
  v_res := public.research_saved_page_job(v_car, v_comp, 'rear', NULL);
  v_job := (v_res->>'jobId')::uuid;
  IF v_job IS NULL OR v_res->>'state' <> 'browser_check' THEN
    RAISE EXCEPTION 'D3 did not open a rear browser check: %', v_res;
  END IF;
  SELECT origin || '/' || browser_check_allowed || '/' || state || '/' || coalesce(fit_descriptor, '<null>') || '/'
         || group_key
    INTO v_text
  FROM public.catalog_research_job WHERE id = v_job;
  IF v_text <> 'owner_fill/true/browser_check/rear/' || format('fill:%s:%s:rear', v_car, v_comp) THEN
    RAISE EXCEPTION 'D3 opened % instead of an owner fill browser check for the rear axle', v_text;
  END IF;

  -- The live rear wording 'rear:both' is still the rear axle, and a finished auto_added job still owns the axle.
  UPDATE public.catalog_research_job SET fit_descriptor = 'rear:both', state = 'needs_review' WHERE id = v_job;
  v_res := public.research_saved_page_job(v_car, v_comp, 'rear', NULL);
  IF (v_res->>'jobId')::uuid IS DISTINCT FROM v_job OR v_res->>'state' <> 'browser_check' THEN
    RAISE EXCEPTION 'D3 should match rear:both as the rear axle, got %', v_res;
  END IF;
  UPDATE public.catalog_research_job SET state = 'auto_added' WHERE id = v_job;
  v_res := public.research_saved_page_job(v_car, v_comp, 'rear', NULL);
  IF (v_res->>'jobId')::uuid IS DISTINCT FROM v_job THEN
    RAISE EXCEPTION 'D3 duplicated an auto_added job: %', v_res;
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. D3: a researching job comes back busy and unchanged.
  -- -------------------------------------------------------------------------
  UPDATE public.catalog_research_job
  SET state = 'researching', updated_at = now() - interval '5 minutes'
  WHERE id = v_job;
  SELECT updated_at INTO v_stamp FROM public.catalog_research_job WHERE id = v_job;
  v_res := public.research_saved_page_job(v_car, v_comp, 'rear', NULL);
  IF coalesce((v_res->>'busy')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'a researching job should come back busy, got %', v_res;
  END IF;
  SELECT state INTO v_state FROM public.catalog_research_job WHERE id = v_job;
  IF v_state <> 'researching'
     OR (SELECT updated_at FROM public.catalog_research_job WHERE id = v_job) <> v_stamp THEN
    RAISE EXCEPTION 'a researching job was changed';
  END IF;
  SELECT count(*) INTO v_n
  FROM public.catalog_research_job j
  WHERE j.vehicle_catalog_id = v_car AND j.maintenance_component_id = v_comp
    AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check',
                    'browser_check_queued')
    AND (CASE WHEN lower(coalesce(j.fit_descriptor, '')) LIKE '%rear%' THEN 'rear'
              WHEN lower(coalesce(j.fit_descriptor, '')) LIKE '%front%' THEN 'front'
              ELSE '' END) = 'rear';
  IF v_n <> 1 THEN RAISE EXCEPTION 'expected one open rear job while researching, found %', v_n; END IF;

  RAISE NOTICE 'saved_page_parts_checks: all passed';
END;
$$;

ROLLBACK;

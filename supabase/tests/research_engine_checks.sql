-- Research engine — database checks (docs/research-engine-audit.md §4 / §7).
-- Layer 1a part. Runs inside one transaction and rolls back; safe on the local copy.
BEGIN;

DO $$
DECLARE
  t text;
  v_vc uuid;
  v_group uuid;
  v_cat uuid;
  v_read uuid;
  v_job uuid;
  v_listing uuid;
  v_oe uuid;
  v_pending uuid;
  v_n integer;
  v_text text;
  v_ok boolean;
BEGIN
  -- 1. Every new table: RLS on, deny-all policy, no anon/authenticated privileges (RE-26).
  FOREACH t IN ARRAY ARRAY[
    'trusted_site', 'research_lookup_recipe', 'research_page_read', 'dominion_system_notice',
    'dominion_audit_log', 'brand_alias', 'catalog_spec_proposal', 'research_number_conflict',
    'spec_column_key_map'
  ] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', t)::regclass) THEN
      RAISE EXCEPTION 'RLS is off on %', t;
    END IF;
    IF has_table_privilege('anon', format('public.%I', t), 'SELECT')
       OR has_table_privilege('authenticated', format('public.%I', t), 'SELECT')
       OR has_table_privilege('anon', format('public.%I', t), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', t), 'INSERT') THEN
      RAISE EXCEPTION 'anon/authenticated can still reach %', t;
    END IF;
  END LOOP;

  -- 2. One trusted list: every trusted_source domain has a trusted_site row with a reading verdict;
  --    Spike 0 verdicts are in.
  SELECT count(*) INTO v_n FROM public.trusted_source s
  LEFT JOIN public.trusted_site ts ON ts.domain = s.domain WHERE ts.domain IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION '% trusted_source rows have no trusted_site', v_n; END IF;
  IF (SELECT automated_read FROM public.trusted_site WHERE domain = 'megazip.net') <> 'blocked'
     OR (SELECT automated_read FROM public.trusted_site WHERE domain = 'jnbk-brakes.com') <> 'allowed' THEN
    RAISE EXCEPTION 'Spike 0 reading verdicts missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trusted_source WHERE domain = 'rockauto.com' AND kind = 'reference') THEN
    RAISE EXCEPTION 'rockauto.com should be a reference source';
  END IF;

  -- 3. research_page_read is append-only.
  INSERT INTO public.research_page_read (purpose, path, domain, url, http_status, block_text)
  VALUES ('recipe_test', 'direct', 'jnbk-brakes.com', 'https://www.jnbk-brakes.com/x', 200, 'PN-1 M900A')
  RETURNING id INTO v_read;
  v_ok := false;
  BEGIN
    UPDATE public.research_page_read SET block_text = 'changed' WHERE id = v_read;
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'research_page_read accepted an UPDATE'; END IF;
  v_ok := false;
  BEGIN
    DELETE FROM public.research_page_read WHERE id = v_read;
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'research_page_read accepted a DELETE'; END IF;

  -- An owner browser check must name who checked it.
  v_ok := false;
  BEGIN
    INSERT INTO public.research_page_read (path, url) VALUES ('owner_browser', 'https://amayama.com/x');
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'owner browser check without checked_by was accepted'; END IF;

  -- 4. Engine verdict survives the trust trigger on part_listing and vehicle_oe_number (RE-19).
  INSERT INTO public.vehicle_catalog (make, model, powertrain_status, chassis_code)
  VALUES ('Checkmake', 'Checkmodel', 'needs_check', 'CHK900')
  RETURNING id INTO v_vc;
  INSERT INTO public.part_interchange_group (code, fit_scope)
  VALUES ('CHK-RE-GROUP', 'chassis') RETURNING id INTO v_group;

  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, evidence_url, trust, trust_set_by,
                                   trust_route, evidence_read_ids)
  VALUES (v_group, v_vc, 'https://www.jnbk-brakes.com/x', 'confirmed', 'engine', 'c', ARRAY[v_read, v_read])
  RETURNING id INTO v_listing;
  SELECT trust || '/' || trust_set_by INTO v_text FROM public.part_listing WHERE id = v_listing;
  IF v_text <> 'confirmed/engine' THEN
    RAISE EXCEPTION 'engine verdict on part_listing was overwritten: %', v_text;
  END IF;
  IF (SELECT cardinality(evidence_read_ids) FROM public.part_listing WHERE id = v_listing) <> 2 THEN
    RAISE EXCEPTION 'route c must keep both evidence reads';
  END IF;

  -- Without evidence reads an "engine" row falls back to the automatic rule.
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, evidence_url, trust, trust_set_by, position)
  VALUES (v_group, v_vc, 'https://example.com/x', 'confirmed', 'engine', 'rear')
  RETURNING id INTO v_listing;
  IF (SELECT trust_set_by FROM public.part_listing WHERE id = v_listing) <> 'auto' THEN
    RAISE EXCEPTION 'engine row without evidence reads should fall back to auto';
  END IF;

  SELECT id INTO v_cat FROM public.maintenance_service_categories LIMIT 1;
  IF v_cat IS NOT NULL THEN
    INSERT INTO public.vehicle_oe_number (vehicle_catalog_id, maintenance_component_id, oe_brand, oe_number,
                                          oe_number_norm, evidence_url, trust, trust_set_by, evidence_read_ids)
    VALUES (v_vc, v_cat, 'Toyota', '04465-CHK', '04465CHK', 'https://amayama.com/x', 'confirmed', 'engine',
            ARRAY[v_read])
    RETURNING id INTO v_oe;
    SELECT trust || '/' || trust_set_by INTO v_text FROM public.vehicle_oe_number WHERE id = v_oe;
    IF v_text <> 'confirmed/engine' THEN
      RAISE EXCEPTION 'engine verdict on vehicle_oe_number was overwritten: %', v_text;
    END IF;
  ELSE
    RAISE NOTICE 'skipped vehicle_oe_number check: no maintenance_service_categories row';
  END IF;

  -- 5. A spec without a source link is allowed only as Needs checking (RE-05).
  v_ok := false;
  BEGIN
    INSERT INTO public.catalog_spec_value (spec_key, scope, vehicle_catalog_id, value, evidence_url, trust)
    VALUES ('tire_size', 'variant', v_vc, '165/65R14', NULL, 'confirmed');
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'confirmed spec without a source was accepted'; END IF;
  INSERT INTO public.catalog_spec_value (spec_key, scope, vehicle_catalog_id, value, evidence_url, trust,
                                         trust_set_by, source_note)
  VALUES ('tire_size', 'variant', v_vc, '165/65R14', NULL, 'needs_checking', 'import', 'CSV import CHK');

  -- 6. Vehicle research job: no organisation id in the key, origin + browser flag set (RE-07 / RE-28).
  INSERT INTO public.vehicle_catalog_pending_requests (organization_id, fleet_vehicle_id, proposed_make,
                                                       proposed_model, proposed_year, status)
  VALUES ('org-check-1', 'fv-check-1', 'Checkmake', 'Newmodel', 2021, 'pending')
  RETURNING id INTO v_pending;
  SELECT id INTO v_job FROM public.catalog_research_job WHERE pending_request_id = v_pending;
  IF v_job IS NULL THEN RAISE EXCEPTION 'pending vehicle request created no job'; END IF;
  SELECT group_key INTO v_text FROM public.catalog_research_job WHERE id = v_job;
  IF v_text <> 'vehicle:Checkmake:Newmodel:2021' OR v_text LIKE '%org-check-1%' THEN
    RAISE EXCEPTION 'vehicle job key wrong or leaks the organisation: %', v_text;
  END IF;
  IF (SELECT origin || '/' || browser_check_allowed FROM public.catalog_research_job WHERE id = v_job) <> 'fleet/true' THEN
    RAISE EXCEPTION 'vehicle job should be origin fleet with browser checks allowed';
  END IF;
  -- A second request for the same car from another company joins the same job.
  INSERT INTO public.vehicle_catalog_pending_requests (organization_id, fleet_vehicle_id, proposed_make,
                                                       proposed_model, proposed_year, status)
  VALUES ('org-check-2', 'fv-check-2', 'Checkmake', 'Newmodel', 2021, 'pending');
  SELECT count(*) INTO v_n FROM public.catalog_research_job WHERE group_key = 'vehicle:Checkmake:Newmodel:2021';
  IF v_n <> 1 THEN RAISE EXCEPTION 'expected one job per car, found %', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.catalog_research_job WHERE job_type = 'vehicle'
             AND array_length(string_to_array(group_key, ':'), 1) > 4) THEN
    RAISE EXCEPTION 'a vehicle job key still has a fifth (organisation) segment';
  END IF;

  -- 7. Duplicate proposal for the same job + number + position is refused (RE-22).
  INSERT INTO public.catalog_part_proposal (job_id, brand, part_number, part_number_norm, part_name, position_key)
  VALUES (v_job, 'NiBK', 'PN-1', 'PN1', 'Brake pads', 'front');
  v_ok := false;
  BEGIN
    INSERT INTO public.catalog_part_proposal (job_id, brand, part_number, part_number_norm, part_name, position_key)
    VALUES (v_job, 'NiBK', 'PN-1', 'PN1', 'Brake pads', 'front');
  EXCEPTION WHEN unique_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'duplicate proposal was accepted'; END IF;

  -- 8. Streak counts only would-auto proposals; reject resets it (RE-14).
  UPDATE public.catalog_research_settings SET shadow_approve_streak = 3 WHERE id = 1;
  IF public.catalog_research_streak_bump(false, 'approved') <> 3 THEN RAISE EXCEPTION 'review-only proposal moved the streak'; END IF;
  IF public.catalog_research_streak_bump(true, 'approved') <> 4 THEN RAISE EXCEPTION 'approval did not add one'; END IF;
  IF public.catalog_research_streak_bump(true, 'rejected') <> 0 THEN RAISE EXCEPTION 'reject did not reset'; END IF;

  -- 9. Health is read-only; unstick resets; notices open for a blocked site (RE-17).
  IF (SELECT provolatile FROM pg_proc WHERE oid = 'public.catalog_research_health()'::regprocedure) <> 's' THEN
    RAISE EXCEPTION 'catalog_research_health should be STABLE';
  END IF;
  UPDATE public.catalog_research_job SET state = 'researching', updated_at = now() - interval '2 hours' WHERE id = v_job;
  PERFORM public.catalog_research_health();
  IF (SELECT state FROM public.catalog_research_job WHERE id = v_job) <> 'researching' THEN
    RAISE EXCEPTION 'health changed a job';
  END IF;
  PERFORM public.catalog_research_unstick();
  IF (SELECT state FROM public.catalog_research_job WHERE id = v_job) <> 'queued' THEN
    RAISE EXCEPTION 'unstick did not reset a stuck job';
  END IF;
  UPDATE public.trusted_site SET blocked_at = now() WHERE domain = 'partsouq.com';
  PERFORM public.catalog_research_raise_notices();
  IF NOT EXISTS (SELECT 1 FROM public.dominion_system_notice
                 WHERE kind = 'site_blocked' AND subject = 'partsouq.com' AND closed_at IS NULL) THEN
    RAISE EXCEPTION 'no notice for a blocked site';
  END IF;
  PERFORM public.catalog_research_raise_notices();
  SELECT count(*) INTO v_n FROM public.dominion_system_notice WHERE kind = 'site_blocked' AND subject = 'partsouq.com';
  IF v_n <> 1 THEN RAISE EXCEPTION 'notices duplicated (%)', v_n; END IF;

  -- 10. The audit log is append-only.
  INSERT INTO public.dominion_audit_log (action, table_name, row_id) VALUES ('check', 'trusted_site', 'x');
  v_ok := false;
  BEGIN
    DELETE FROM public.dominion_audit_log WHERE table_name = 'trusted_site' AND row_id = 'x';
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'dominion_audit_log accepted a DELETE'; END IF;

  RAISE NOTICE 'research_engine_checks (layer 1a): all passed';
END;
$$;

-- Layer 1b part: spec trust gating, readiness, engine verdict through the Add-parts save, promote rewrite.
DO $$
DECLARE
  v_vc uuid;
  v_type uuid;
  v_job uuid;
  v_r1 uuid;
  v_r2 uuid;
  v_prop uuid;
  v_res jsonb;
  v_res2 jsonb;
  v_n integer;
  v_text text;
  v_fitment_before integer;
BEGIN
  -- Any active part type with no position scheme (local fixture: Brake pads).
  SELECT c.id INTO v_type FROM public.maintenance_service_categories c
  WHERE c.is_part IS TRUE AND c.kind = 'component' AND c.part_type_status = 'active'
    AND c.parent_id IS NOT NULL AND c.position_scheme = 'none'
  ORDER BY c.name LIMIT 1;
  IF v_type IS NULL THEN
    -- Schema-only CI has no garage seed: make one area + one part type inside this rolled-back transaction.
    INSERT INTO public.maintenance_service_categories (id, code, name, kind, icon_key, sort_order)
    VALUES ('e1000000-0000-4000-8000-0000000000e1', 'chk-re-area', 'Check area', 'system', 'wrench', 990)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.maintenance_service_categories (id, code, name, kind, op_code, parent_id, icon_key, sort_order,
                                                       is_part, part_type_status, position_scheme)
    VALUES ('e1000000-0000-4000-8000-0000000000e2', 'chk-re-pads', 'Check pads', 'component', 'CHK-RE-PADS',
            'e1000000-0000-4000-8000-0000000000e1', 'wrench', 991, true, 'active', 'none')
    ON CONFLICT (id) DO NOTHING;
    v_type := 'e1000000-0000-4000-8000-0000000000e2';
  END IF;

  -- 1. Backfill: every car with a tyre size column value has a tire_size spec row (none lost).
  SELECT count(*) INTO v_n FROM public.vehicle_catalog vc
  WHERE nullif(btrim(vc.tire_size), '') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.catalog_spec_value sv
                    WHERE sv.scope = 'variant' AND sv.vehicle_catalog_id = vc.id AND sv.spec_key = 'tire_size');
  IF v_n <> 0 THEN RAISE EXCEPTION '% cars with a tyre size have no tire_size spec row', v_n; END IF;

  -- 2. A Needs-checking spec is not "sourced" and feeds no fits-by-size match; Confirmed does.
  INSERT INTO public.vehicle_catalog (make, model, powertrain_status, chassis_code, tire_size)
  VALUES ('Checkmake', 'Specmodel', 'needs_check', 'CHKSPEC', '155/65R14')
  RETURNING id INTO v_vc;
  INSERT INTO public.catalog_spec_value (spec_key, scope, vehicle_catalog_id, value, trust, trust_set_by, source_note)
  VALUES ('tire_size', 'variant', v_vc, '155/65R14', 'needs_checking', 'import', 'CSV import');
  INSERT INTO public.universal_part (spec_key, spec_value, manufacturer, part_number, name)
  VALUES ('tire_size', '155/65R14', 'Checktyre', 'CT-1', 'Check tyre');

  SELECT trust || '/' || sourced INTO v_text FROM public.specs_for_variant(v_vc) WHERE spec_key = 'tire_size';
  IF v_text IS DISTINCT FROM 'needs_checking/false' THEN
    RAISE EXCEPTION 'needs-checking spec reported as %', v_text;
  END IF;
  IF EXISTS (SELECT 1 FROM public.specs_for_variant(v_vc) WHERE scope = 'catalog_note') THEN
    RAISE EXCEPTION 'specs_for_variant still builds catalog_note rows';
  END IF;
  SELECT count(*) INTO v_n FROM public.universal_parts_for_variant(v_vc) WHERE universal_part_id IS NOT NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'a needs-checking spec matched a universal part'; END IF;

  UPDATE public.catalog_spec_value SET trust = 'confirmed', evidence_url = 'https://example.com/spec'
  WHERE vehicle_catalog_id = v_vc AND spec_key = 'tire_size';
  SELECT count(*) INTO v_n FROM public.universal_parts_for_variant(v_vc) WHERE universal_part_id IS NOT NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'a confirmed spec should match the universal part (got %)', v_n; END IF;

  -- 3. Readiness: the Confirmed-only rule is held back (layer 1b section 3). Until then a Needs-checking CSV spec
  --    has no evidence link, so today's rule (evidence link set) still leaves it out.
  IF EXISTS (SELECT 1 FROM public.catalog_spec_value
             WHERE trust_set_by = 'import' AND trust = 'needs_checking' AND btrim(coalesce(evidence_url, '')) <> '') THEN
    RAISE EXCEPTION 'a CSV spec carries an evidence link — readiness would count it';
  END IF;

  -- 4. Promote: route c with two reads goes through the Add-parts save, keeps the engine verdict and both reads,
  --    writes the fitment rule, never part_fitment, and returns a batch id.
  INSERT INTO public.catalog_research_job (job_type, group_key, vehicle_catalog_id, maintenance_component_id, state, origin)
  VALUES ('part', 'check-1b:pads', v_vc, v_type, 'needs_review', 'owner_fill')
  RETURNING id INTO v_job;
  INSERT INTO public.research_page_read (job_id, path, domain, url, http_status, block_text)
  VALUES (v_job, 'direct', 'sbparts.jp', 'https://sbparts.jp/check', 200, 'CHK-PAD-1 CHKSPEC')
  RETURNING id INTO v_r1;
  INSERT INTO public.research_page_read (job_id, path, domain, url, http_status, block_text)
  VALUES (v_job, 'direct', 'jnbk-brakes.com', 'https://www.jnbk-brakes.com/check', 200, 'CHK-PAD-1 CHKSPEC')
  RETURNING id INTO v_r2;
  INSERT INTO public.catalog_part_proposal (job_id, brand, part_number, part_number_norm, part_name, match_kind,
                                            trust_route, evidence_read_ids, fits)
  VALUES (v_job, 'Checkbrand', 'CHK-PAD-1', 'CHKPAD1', 'Check brake pads', 'aftermarket', 'c',
          ARRAY[v_r1, v_r2], jsonb_build_object('listings', jsonb_build_array(jsonb_build_object('vehicleId', v_vc))))
  RETURNING id INTO v_prop;

  SELECT count(*) INTO v_fitment_before FROM public.part_fitment;
  v_res := public.promote_part_proposal(v_prop, NULL);
  IF v_res->>'batchId' IS NULL OR v_res->>'partId' IS NULL THEN
    RAISE EXCEPTION 'promote should return a part id and a batch id, got %', v_res;
  END IF;
  SELECT pl.trust || '/' || pl.trust_set_by || '/' || pl.trust_route || '/' || cardinality(pl.evidence_read_ids) INTO v_text
  FROM public.part_listing pl
  JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
  WHERE pl.vehicle_catalog_id = v_vc AND pm.id = (v_res->>'partId')::uuid;
  IF v_text IS DISTINCT FROM 'confirmed/engine/c/2' THEN
    RAISE EXCEPTION 'promoted listing should be confirmed/engine/c/2 reads, got %', v_text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.interchange_fitment_rule r
                 JOIN public.part_master pm ON pm.interchange_group_id = r.interchange_group_id
                 WHERE pm.id = (v_res->>'partId')::uuid AND r.vehicle_catalog_id = v_vc AND r.source = 'listing') THEN
    RAISE EXCEPTION 'the listing trigger did not write the fitment rule';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parts_for_vehicle(v_vc, v_type, NULL) p WHERE p.part_id = (v_res->>'partId')::uuid) THEN
    RAISE EXCEPTION 'parts_for_vehicle does not return the promoted part';
  END IF;
  IF (SELECT count(*) FROM public.part_fitment) <> v_fitment_before THEN
    RAISE EXCEPTION 'promote still writes part_fitment';
  END IF;
  IF (SELECT status FROM public.catalog_part_proposal WHERE id = v_prop) <> 'promoted'
     OR (SELECT state FROM public.catalog_research_job WHERE id = v_job) <> 'auto_added' THEN
    RAISE EXCEPTION 'proposal / job state not updated';
  END IF;
  v_res2 := public.promote_part_proposal(v_prop, NULL);
  IF coalesce((v_res2->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'second promote should be idempotent, got %', v_res2;
  END IF;

  -- 5. A made-up evidence read id is not an engine verdict.
  INSERT INTO public.catalog_part_proposal (job_id, brand, part_number, part_number_norm, part_name, trust_route,
                                            evidence_read_ids, sources, fits)
  VALUES (v_job, 'Checkbrand', 'CHK-PAD-2', 'CHKPAD2', 'Check brake pads 2', 'b',
          ARRAY[gen_random_uuid()], jsonb_build_array(jsonb_build_object('url', 'https://sbparts.jp/check2')),
          jsonb_build_object('listings', jsonb_build_array(jsonb_build_object('vehicleId', v_vc))))
  RETURNING id INTO v_prop;
  UPDATE public.catalog_research_job SET state = 'needs_review' WHERE id = v_job;
  v_res := public.promote_part_proposal(v_prop, NULL);
  SELECT pl.trust_set_by INTO v_text
  FROM public.part_listing pl
  JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
  WHERE pl.vehicle_catalog_id = v_vc AND pm.id = (v_res->>'partId')::uuid;
  IF v_text = 'engine' THEN RAISE EXCEPTION 'fake evidence read ids produced an engine verdict'; END IF;

  RAISE NOTICE 'research_engine_checks (layer 1b): all passed';
END;
$$;

-- Layer 2 part: fill planner, identity first, browser-check expiry, spec + vehicle approval.
DO $$
DECLARE
  v_car uuid;
  v_nochassis uuid;
  v_pads uuid;
  v_r jsonb;
  v_n integer;
  v_job uuid;
  v_read uuid;
  v_prop uuid;
  v_actor uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_pads FROM public.maintenance_service_categories WHERE kind = 'component' AND op_code = 'BRK-PADS' LIMIT 1;
  IF v_pads IS NULL THEN
    INSERT INTO public.maintenance_service_categories (id, code, name, kind, op_code, icon_key, sort_order)
    VALUES ('e3000000-0000-4000-8000-0000000000d1', 'chk-l2-pads', 'Brake pads', 'component', 'BRK-PADS', 'brakes', 992)
    RETURNING id INTO v_pads;
  END IF;
  INSERT INTO public.vehicle_catalog (make, model, powertrain_status, chassis_code, production_start_year, production_end_year)
  VALUES ('Fillmake', 'Fillmodel', 'needs_check', 'FIL900', 2016, 2020) RETURNING id INTO v_car;
  INSERT INTO public.vehicle_catalog (make, model, powertrain_status, production_start_year)
  VALUES ('Fillmake', 'Fillmodel', 'needs_check', 2021) RETURNING id INTO v_nochassis;

  -- 1. Fill this car: part + spec jobs, origin owner_fill, browser checks allowed; a second press adds nothing.
  v_r := public.catalog_research_fill_car(v_car);
  IF (v_r->>'newJobs')::int < 1 OR (v_r->>'identityFirst')::boolean THEN RAISE EXCEPTION 'fill car queued nothing: %', v_r; END IF;
  IF EXISTS (SELECT 1 FROM public.catalog_research_job WHERE vehicle_catalog_id = v_car AND (origin <> 'owner_fill' OR NOT browser_check_allowed)) THEN
    RAISE EXCEPTION 'fill jobs must be owner_fill with browser checks allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalog_research_job WHERE vehicle_catalog_id = v_car AND job_type = 'spec' AND spec_key = 'tire_size') THEN
    RAISE EXCEPTION 'fill car did not queue the tyre size spec';
  END IF;
  SELECT count(*) INTO v_n FROM public.catalog_research_job WHERE vehicle_catalog_id = v_car;
  v_r := public.catalog_research_fill_car(v_car);
  IF (v_r->>'newJobs')::int <> 0 OR (SELECT count(*) FROM public.catalog_research_job WHERE vehicle_catalog_id = v_car) <> v_n THEN
    RAISE EXCEPTION 'a second Fill this car must not duplicate jobs: %', v_r;
  END IF;
  IF (SELECT pgmq_queue FROM public.catalog_research_job WHERE vehicle_catalog_id = v_car LIMIT 1) <> 'catalog_research_fill' THEN
    RAISE EXCEPTION 'owner fill jobs belong on the fill queue';
  END IF;

  -- 2. No frame code → identity first, nothing else queued (RE-04).
  v_r := public.catalog_research_fill_car(v_nochassis);
  IF NOT (v_r->>'identityFirst')::boolean
     OR NOT EXISTS (SELECT 1 FROM public.catalog_research_job WHERE vehicle_catalog_id = v_nochassis AND job_type = 'vehicle_identity')
     OR EXISTS (SELECT 1 FROM public.catalog_research_job WHERE vehicle_catalog_id = v_nochassis AND job_type IN ('part', 'spec')) THEN
    RAISE EXCEPTION 'a car with no frame code should queue only its identity: %', v_r;
  END IF;

  -- 3. A sweep job may not open browser checks until the owner asks for the same item (RE-28).
  v_r := public.catalog_research_queue_item(v_car, NULL, 'coolant_capacity_l', NULL, 'sweep');
  v_job := (v_r->>'jobId')::uuid;
  IF (SELECT browser_check_allowed FROM public.catalog_research_job WHERE id = v_job) THEN
    RAISE EXCEPTION 'a sweep job must not allow browser checks';
  END IF;
  PERFORM public.catalog_research_queue_item(v_car, NULL, 'coolant_capacity_l', NULL, 'owner_fill');
  IF NOT (SELECT browser_check_allowed FROM public.catalog_research_job WHERE id = v_job) THEN
    RAISE EXCEPTION 'owner asking for the same item should allow browser checks';
  END IF;

  -- 4. A browser check left 30 days closes as Couldn't find and the next queued one opens.
  UPDATE public.catalog_research_settings SET max_open_browser_checks = 1 WHERE id = 1;
  UPDATE public.catalog_research_job SET state = 'browser_check_queued' WHERE state = 'browser_check';
  UPDATE public.catalog_research_job SET state = 'browser_check', updated_at = now() - interval '31 days' WHERE id = v_job;
  UPDATE public.catalog_research_job SET state = 'browser_check_queued'
  WHERE vehicle_catalog_id = v_car AND job_type = 'spec' AND spec_key = 'tire_size';
  v_r := public.catalog_research_expire_browser_checks();
  IF (SELECT state FROM public.catalog_research_job WHERE id = v_job) <> 'not_found' THEN
    RAISE EXCEPTION 'an old browser check should close as not_found';
  END IF;
  IF (SELECT state FROM public.catalog_research_job WHERE vehicle_catalog_id = v_car AND spec_key = 'tire_size' AND job_type = 'spec') <> 'browser_check' THEN
    RAISE EXCEPTION 'the freed slot should open the next queued browser check: %', v_r;
  END IF;

  -- 5. Approving a spec proposal writes a Confirmed spec with its evidence.
  SELECT id INTO v_job FROM public.catalog_research_job WHERE vehicle_catalog_id = v_car AND job_type = 'spec' AND spec_key = 'tire_size';
  INSERT INTO public.research_page_read (job_id, path, url, checked_by, block_text)
  VALUES (v_job, 'owner_browser', 'https://amayama.com/roomy', v_actor, 'FIL900 165/65R14') RETURNING id INTO v_read;
  INSERT INTO public.catalog_spec_proposal (job_id, vehicle_catalog_id, spec_key, value, evidence_read_ids, trust_route)
  VALUES (v_job, v_car, 'tire_size', '165/65R14', ARRAY[v_read], 'owner_browser') RETURNING id INTO v_prop;
  PERFORM public.promote_spec_proposal(v_prop, v_actor);
  IF NOT EXISTS (SELECT 1 FROM public.specs_for_variant(v_car) WHERE spec_key = 'tire_size' AND sourced AND value = '165/65R14') THEN
    RAISE EXCEPTION 'approved spec is not Confirmed on the car';
  END IF;

  -- 6. Vehicle proposals: a new version is added once; the same car again updates it instead of duplicating.
  v_r := public.catalog_research_queue_model('Fillmake', 'Fillmodel');
  v_job := (v_r->>'jobId')::uuid;
  INSERT INTO public.catalog_vehicle_proposal (job_id, make, model, production_start_year, production_end_year, chassis_code, engine_code)
  VALUES (v_job, 'Fillmake', 'Fillmodel', 2022, NULL, 'FIL910', 'E-1') RETURNING id INTO v_prop;
  v_r := public.approve_vehicle_proposal(v_prop, v_actor);
  IF v_r->>'action' <> 'new' THEN RAISE EXCEPTION 'expected a new version: %', v_r; END IF;
  INSERT INTO public.catalog_vehicle_proposal (job_id, make, model, production_start_year, chassis_code, engine_code, transmission)
  VALUES (v_job, 'Fillmake', 'Fillmodel', 2023, 'FIL910', 'E-1', 'CVT') RETURNING id INTO v_prop;
  v_r := public.approve_vehicle_proposal(v_prop, v_actor);
  IF v_r->>'action' <> 'update' THEN RAISE EXCEPTION 'the same car should be updated, not duplicated: %', v_r; END IF;
  IF (SELECT count(*) FROM public.vehicle_catalog WHERE make = 'Fillmake' AND chassis_code = 'FIL910') <> 1 THEN
    RAISE EXCEPTION 'duplicate vehicle version created';
  END IF;

  RAISE NOTICE 'research_engine_checks (layer 2): all passed';
END;
$$;

ROLLBACK;

-- Code review fixes (21 Nov): #2 one job per key during a browser check, #1 single flight, #8 stuck checking.
BEGIN;
DO $$
DECLARE
  v_job uuid;
  v_r jsonb;
  v_msg bigint;
BEGIN
  -- #2: an open browser check blocks a second job with the same key.
  INSERT INTO public.catalog_research_job (job_type, group_key, state) VALUES ('part', 'review-test-key', 'browser_check')
  RETURNING id INTO v_job;
  v_r := public.catalog_research_join_or_create_job('review-test-key', NULL, NULL, NULL, NULL, NULL, NULL, 'fleet');
  IF (v_r->>'newJob')::boolean OR (v_r->>'jobId')::uuid <> v_job THEN
    RAISE EXCEPTION 'review #2 failed: %', v_r;
  END IF;

  -- #1: a job running under one message is not started again by another.
  UPDATE public.catalog_research_settings SET enabled = true, paused = false, daily_spend_usd = 0 WHERE id = 1;
  UPDATE public.catalog_research_job SET state = 'researching', pgmq_msg_id = -1, pgmq_queue = 'catalog_research', updated_at = now()
  WHERE id = v_job;
  PERFORM pgmq.purge_queue('catalog_research'); PERFORM pgmq.purge_queue('catalog_research_fill'); PERFORM pgmq.purge_queue('catalog_research_priority');
  SELECT pgmq.send('catalog_research', jsonb_build_object('jobId', v_job)) INTO v_msg;
  v_r := public.catalog_research_claim();
  IF (v_r->>'claimed')::boolean OR v_r->>'reason' <> 'duplicate_running' THEN
    RAISE EXCEPTION 'review #1 failed: %', v_r;
  END IF;

  -- #8: a job stuck in checking for 30+ minutes goes back to the queue.
  UPDATE public.catalog_research_job SET state = 'checking', updated_at = now() - interval '45 minutes' WHERE id = v_job;
  PERFORM public.catalog_research_unstick();
  IF (SELECT state FROM public.catalog_research_job WHERE id = v_job) <> 'queued' THEN
    RAISE EXCEPTION 'review #8 failed';
  END IF;
  RAISE NOTICE 'review checks passed';
END;
$$;
ROLLBACK;

-- Rev 4.2 (§9 RE-30): form recipes must say what they post; other kinds never post.
BEGIN;
DO $$
DECLARE
  v_ok boolean;
BEGIN
  INSERT INTO public.research_lookup_recipe (domain, name, kind, search_url_template, form_body_template)
  VALUES ('jnbk-brakes.com', 'Form check', 'form_then_page', 'https://www.jnbk-brakes.com/catalogue/cars',
          'txtPartNo={number}&txtClass=1');

  v_ok := false;
  BEGIN
    INSERT INTO public.research_lookup_recipe (domain, name, kind, search_url_template)
    VALUES ('jnbk-brakes.com', 'No fields', 'form_then_page', 'https://www.jnbk-brakes.com/catalogue/cars');
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'form recipe without form fields was accepted'; END IF;

  v_ok := false;
  BEGIN
    INSERT INTO public.research_lookup_recipe (domain, name, kind, search_url_template, form_body_template)
    VALUES ('jnbk-brakes.com', 'Link with fields', 'by_part_number', 'https://www.jnbk-brakes.com/s?q={number}', 'a=1');
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'a link recipe with form fields was accepted'; END IF;
  RAISE NOTICE 'form recipe checks passed';
END;
$$;
ROLLBACK;

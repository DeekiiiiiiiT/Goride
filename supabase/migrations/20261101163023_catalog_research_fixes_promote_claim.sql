-- applied from 20261102120000 lines 82-344
CREATE OR REPLACE FUNCTION public.promote_part_proposal(
  p_proposal_id uuid,
  p_actor uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prop record;
  v_job record;
  v_part_id uuid;
  v_existing record;
  v_decision text;
  v_job_state text;
  v_org record;
  v_part_label text;
  v_car_label text;
  v_kind text;
BEGIN
  SELECT * INTO v_prop FROM public.catalog_part_proposal WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  SELECT * INTO v_job FROM public.catalog_research_job WHERE id = v_prop.job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found'; END IF;
  IF v_prop.promoted_part_id IS NOT NULL THEN
    RETURN jsonb_build_object('partId', v_prop.promoted_part_id, 'idempotent', true);
  END IF;
  v_kind := public.catalog_research_part_kind_from_match(v_prop.match_type);
  v_decision := CASE WHEN p_actor IS NULL THEN 'auto_confirmed' ELSE 'confirmed' END;
  v_job_state := CASE WHEN p_actor IS NULL THEN 'auto_added' ELSE 'added' END;
  SELECT id, catalog_decision, verified_by, verified_at INTO v_existing FROM public.part_master
  WHERE upper(coalesce(manufacturer, '')) = upper(v_prop.brand) AND oem_part_number_norm = v_prop.part_number_norm LIMIT 1;
  v_part_id := v_existing.id;
  IF v_part_id IS NULL THEN
    INSERT INTO public.part_master (category_id, name, oem_part_number, manufacturer, maintenance_component_id, evidence_url, metadata, catalog_decision, verified_by, verified_at, part_kind)
    SELECT coalesce((SELECT pc.id FROM public.part_category pc WHERE pc.slug = 'general' LIMIT 1), (SELECT pc.id FROM public.part_category pc ORDER BY pc.sort_order, pc.label LIMIT 1)),
      v_prop.part_name, v_prop.part_number, v_prop.brand, v_job.maintenance_component_id, coalesce((v_prop.sources->0->>'url'), ''),
      jsonb_build_object('sources', v_prop.sources, 'specs', coalesce(v_prop.checks->'specs', '{}'::jsonb)), v_decision, p_actor, CASE WHEN p_actor IS NULL THEN NULL ELSE now() END, v_kind
    RETURNING id INTO v_part_id;
  ELSE
    UPDATE public.part_master SET name = v_prop.part_name, maintenance_component_id = coalesce(maintenance_component_id, v_job.maintenance_component_id),
      evidence_url = coalesce(nullif(coalesce((v_prop.sources->0->>'url'), ''), ''), evidence_url),
      metadata = metadata || jsonb_build_object('sources', v_prop.sources, 'specs', coalesce(v_prop.checks->'specs', '{}'::jsonb)),
      catalog_decision = CASE WHEN v_existing.catalog_decision = 'confirmed' THEN 'confirmed' ELSE v_decision END,
      verified_by = CASE WHEN p_actor IS NOT NULL THEN p_actor ELSE verified_by END,
      verified_at = CASE WHEN p_actor IS NOT NULL THEN now() ELSE verified_at END,
      part_kind = coalesce(part_kind, v_kind) WHERE id = v_part_id;
  END IF;
  IF v_job.vehicle_catalog_id IS NOT NULL THEN
    INSERT INTO public.part_fitment (part_id, vehicle_catalog_id) VALUES (v_part_id, v_job.vehicle_catalog_id) ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.catalog_part_proposal SET promoted_part_id = v_part_id WHERE id = p_proposal_id;
  UPDATE public.parts_sourcing_requests r SET status = 'resolved', resolved_part_id = v_part_id, added_at = now(), resolution_note = coalesce(r.resolution_note, 'Added to catalog')
  WHERE r.catalog_research_job_id = v_job.id AND r.kind = 'add_part_info' AND r.status IN ('open', 'in_progress');
  SELECT coalesce(c.name, v_prop.part_name) INTO v_part_label FROM public.maintenance_service_categories c WHERE c.id = v_job.maintenance_component_id;
  SELECT concat_ws(' ', vc.make, vc.model, vc.production_start_year::text) INTO v_car_label FROM public.vehicle_catalog vc WHERE vc.id = v_job.vehicle_catalog_id;
  FOR v_org IN SELECT DISTINCT organization_id FROM public.parts_sourcing_requests WHERE catalog_research_job_id = v_job.id AND kind = 'add_part_info' LOOP
    INSERT INTO public.fleet_parts_notices (organization_id, kind, title, body) VALUES (v_org.organization_id, 'catalog_added', 'Part on file',
      format('%s for your %s is now on file.', coalesce(v_part_label, v_prop.part_name), coalesce(v_car_label, 'vehicle')));
  END LOOP;
  UPDATE public.catalog_research_job SET state = v_job_state, updated_at = now() WHERE id = v_job.id;
  PERFORM public.catalog_research_log_event(v_job.id, 'promote', v_job_state, jsonb_build_object('proposalId', p_proposal_id, 'partId', v_part_id), p_actor);
  RETURN jsonb_build_object('partId', v_part_id, 'idempotent', false, 'jobState', v_job_state);
END;
$$;

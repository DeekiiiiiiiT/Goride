-- Prod: vehicle pending research trigger (20261101163028 body never applied) + REVOKE gap after 20261105030000 removal.

CREATE OR REPLACE FUNCTION public.catalog_research_enqueue_vehicle_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_key text;
  v_job_id uuid;
BEGIN
  IF NEW.status NOT IN ('pending', 'needs_info') THEN
    RETURN NEW;
  END IF;

  v_group_key := concat_ws(
    ':',
    'vehicle',
    coalesce(NEW.proposed_make, ''),
    coalesce(NEW.proposed_model, ''),
    coalesce(NEW.proposed_production_start_year::text, ''),
    coalesce(NEW.organization_id, '')
  );

  SELECT j.id INTO v_job_id
  FROM public.catalog_research_job j
  WHERE j.group_key = v_group_key
    AND j.job_type = 'vehicle'
    AND j.state IN ('queued', 'researching', 'checking', 'needs_review')
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.catalog_research_job (job_type, group_key, fleet_count, state, market)
  VALUES ('vehicle', v_group_key, 1, 'queued', 'JM')
  RETURNING id INTO v_job_id;

  PERFORM public.catalog_research_enqueue_job(v_job_id);
  PERFORM public.catalog_research_log_event(v_job_id, 'enqueue', 'vehicle', jsonb_build_object('pendingRequestId', NEW.id));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehicle_catalog_pending_research_job ON public.vehicle_catalog_pending_requests;
CREATE TRIGGER vehicle_catalog_pending_research_job
  AFTER INSERT ON public.vehicle_catalog_pending_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_research_enqueue_vehicle_job();

REVOKE ALL ON FUNCTION public.admin_parts_overview() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_research_enqueue_vehicle_job() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_research_part_kind_from_match(p_match_type text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_research_research_group_key(p_vehicle_catalog_id uuid, p_component_id uuid, p_fit_descriptor text, p_install_side text, p_match_type text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_adjust(p_org_id text, p_item_id uuid, p_location_id uuid, p_bin_id uuid, p_qty_delta numeric, p_unit_cost numeric, p_reason text, p_idempotency_key text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_import_items(p_org_id text, p_file jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_issue_to_vehicles(p_org_id text, p_source_location_id uuid, p_lines jsonb, p_vehicle_ids text[], p_issue_available_only boolean, p_dry_run boolean, p_idempotency_key text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_opening_balance(p_org_id text, p_lines jsonb, p_idempotency_key text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_pair_scanner(p_org_id text, p_pairing_code text, p_device_label text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_publish_kit_version(p_org_id text, p_template_id uuid, p_version_id uuid, p_idempotency_key text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_receive(p_org_id text, p_receipt jsonb, p_lines jsonb, p_costs jsonb, p_idempotency_key text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_recompute_reorder(p_org_id text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_return_from_vehicle(p_org_id text, p_item_id uuid, p_vehicle_id text, p_to_location_id uuid, p_qty numeric, p_idempotency_key text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_reverse(p_org_id text, p_movement_id uuid, p_reason text, p_idempotency_key text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_transfer(p_org_id text, p_item_id uuid, p_from_location_id uuid, p_to_location_id uuid, p_bin_from uuid, p_bin_to uuid, p_qty numeric, p_idempotency_key text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_verify_chain(p_org_id text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_write_off(p_org_id text, p_item_id uuid, p_location_id uuid, p_asset_id uuid, p_qty numeric, p_reason text, p_memo text, p_idempotency_key text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_legacy_inventory_draw(p_inventory_id text, p_org_id text, p_draw numeric, p_expected_qty numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_integrity_report(p_organization_id text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_maintenance_log_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parts_sourcing_research_group_key(p_vehicle_catalog_id uuid, p_component_id uuid, p_fit_descriptor text, p_install_side text, p_match_type text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_maintenance_events(p_batch_size integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_part_proposal(p_proposal_id uuid, p_actor uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_maintenance_schedule(p_vehicle_id text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_maintenance_nightly_check(p_organization_id text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.universal_section_for_variant(p_catalog_id uuid, p_vehicle_year integer, p_component_id uuid) FROM PUBLIC, anon, authenticated;

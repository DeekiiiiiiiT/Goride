CREATE OR REPLACE FUNCTION public.admin_parts_overview() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'vehicles', (SELECT count(*) FROM public.vehicle_catalog),
    'partsOnFile', (SELECT count(*) FROM public.part_master WHERE catalog_decision IS DISTINCT FROM 'rejected'),
    'vehiclesWithParts', (SELECT count(DISTINCT vehicle_catalog_id) FROM public.part_listing),
    'waiting', ((SELECT count(*) FROM public.part_master WHERE catalog_decision = 'pending') + (SELECT count(*) FROM public.vehicle_catalog_pending_requests WHERE status IN ('pending', 'needs_info')))
  );
$$;
CREATE OR REPLACE FUNCTION public.admin_exclude_listing(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group uuid := NULLIF(p_input->>'groupId', '')::uuid; v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid; v_reason text := NULLIF(btrim(coalesce(p_input->>'reason', '')), ''); v_evidence text := NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
BEGIN
  IF v_group IS NULL OR v_variant IS NULL OR v_reason IS NULL OR v_evidence IS NULL THEN RAISE EXCEPTION 'An exclusion needs the part, the vehicle, a reason, and a source link'; END IF;
  INSERT INTO public.part_listing_exclusion (interchange_group_id, vehicle_catalog_id, reason, evidence_url) VALUES (v_group, v_variant, v_reason, v_evidence)
  ON CONFLICT (interchange_group_id, vehicle_catalog_id) DO UPDATE SET reason = EXCLUDED.reason, evidence_url = EXCLUDED.evidence_url;
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.admin_parts_overview() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_exclude_listing(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_parts_overview() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_exclude_listing(jsonb) TO service_role;

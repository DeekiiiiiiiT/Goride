-- admin_exclude_listing: ON CONFLICT targeted (interchange_group_id, vehicle_catalog_id), but the only
-- unique key is part_listing_exclusion_scoped_key (group, car, position, side, year_from, year_to,
-- NULLS NOT DISTINCT) since 20261102210000. Every call failed with 42P10. Target the scoped key.

CREATE OR REPLACE FUNCTION public.admin_exclude_listing(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_group uuid := NULLIF(p_input->>'groupId', '')::uuid;
  v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid;
  v_reason text := NULLIF(btrim(coalesce(p_input->>'reason', '')), '');
  v_evidence text := NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
BEGIN
  IF v_group IS NULL OR v_variant IS NULL OR v_reason IS NULL OR v_evidence IS NULL THEN
    RAISE EXCEPTION 'An exclusion needs the part, the vehicle, a reason, and a source link';
  END IF;
  INSERT INTO public.part_listing_exclusion (interchange_group_id, vehicle_catalog_id, reason, evidence_url)
  VALUES (v_group, v_variant, v_reason, v_evidence)
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, "position", side, year_from, year_to)
  DO UPDATE SET reason = EXCLUDED.reason, evidence_url = EXCLUDED.evidence_url;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

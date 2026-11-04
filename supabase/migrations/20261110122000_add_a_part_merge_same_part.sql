-- AM-01: merge oe_ambiguous groups when both brands are the same physical part.

CREATE OR REPLACE FUNCTION public.part_match_conflict_merge_same_part(
  p_conflict_id uuid,
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.part_match_conflict%ROWTYPE;
  v_survivor uuid;
  v_other uuid;
  v_part uuid;
  v_groups uuid[] := '{}'::uuid[];
  v_g uuid;
BEGIN
  SELECT * INTO c FROM public.part_match_conflict WHERE id = p_conflict_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'open' THEN
    RAISE EXCEPTION 'Conflict not open';
  END IF;
  IF c.conflict_type <> 'oe_ambiguous' THEN
    RAISE EXCEPTION 'Same-part merge applies to oe_ambiguous only';
  END IF;
  IF nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Resolution note is required for this conflict type';
  END IF;
  IF NOT c.detail ? 'group_ids' THEN
    RAISE EXCEPTION 'Conflict missing group_ids detail';
  END IF;

  v_survivor := c.interchange_group_id;

  FOR v_other IN
    SELECT value::uuid FROM jsonb_array_elements_text(c.detail->'group_ids') AS value
  LOOP
    IF v_other = v_survivor THEN
      CONTINUE;
    END IF;
    FOR v_part IN
      SELECT pm.id FROM public.part_master pm WHERE pm.interchange_group_id = v_other
    LOOP
      UPDATE public.part_master pm
      SET interchange_group_id = v_survivor
      WHERE pm.id = v_part
        AND pm.interchange_group_id IS DISTINCT FROM v_survivor;
      IF FOUND THEN
        INSERT INTO public.interchange_group_merge_log (
          part_id, from_group, to_group, rule, matched_key, conflict_id, created_by
        ) VALUES (
          v_part, v_other, v_survivor, 'oe_same_part', c.matched_key, c.id, p_actor
        );
      END IF;
    END LOOP;
    IF NOT v_other = ANY (v_groups) THEN
      v_groups := array_append(v_groups, v_other);
    END IF;
  END LOOP;

  IF NOT v_survivor = ANY (v_groups) THEN
    v_groups := array_append(v_groups, v_survivor);
  END IF;

  UPDATE public.part_match_conflict oc
  SET status = 'superseded',
      resolution_note = format('Merged into survivor group via same-part merge: %s', coalesce(p_note, '')),
      resolved_at = now(),
      resolved_by = p_actor
  WHERE oc.status = 'open'
    AND oc.conflict_type = 'oe_ambiguous'
    AND oc.vehicle_catalog_id = c.vehicle_catalog_id
    AND oc.vehicle_oe_number_id IS NOT DISTINCT FROM c.vehicle_oe_number_id
    AND oc.id <> c.id
    AND oc.interchange_group_id = ANY (v_groups);

  UPDATE public.part_match_conflict
  SET status = 'kept',
      resolution_note = p_note,
      resolved_by = p_actor,
      resolved_at = now()
  WHERE id = p_conflict_id;

  FOREACH v_g IN ARRAY v_groups
  LOOP
    PERFORM public.part_match_recompute(v_g, c.vehicle_catalog_id);
  END LOOP;
  PERFORM public.part_match_recompute(NULL, c.vehicle_catalog_id);
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_conflict_merge_same_part(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_conflict_merge_same_part(uuid, uuid, text) TO service_role;
